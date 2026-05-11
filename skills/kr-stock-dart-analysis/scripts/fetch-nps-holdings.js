#!/usr/bin/env node

// fetch-nps-holdings.js
//
// OpenDART → 국민연금공단(NPS) 지분공시(5%룰 + 임원·주요주주) 일괄 수집.
//
// Pipeline per run:
//   1. list.json(pblntf_ty=D, bgn_de..end_de) 페이지네이션으로 지분공시 전체 조회
//   2. flr_nm includes '국민연금' AND report_nm includes '대량보유' OR '주요주주' OR '임원' 만 필터
//   3. 매치된 corp_code별로 majorstock.json / elestock.json 각 1회 호출 (구조화 데이터)
//   4. rcept_no 매칭으로 보유주식수·보유비율·증감·보유목적 enrich
//   5. nps-holdings.json (인덱스) + nps-holdings.md (날짜 desc 표) 출력
//
// Reads OPENDART_API_KEY from env. Auto-loads .env at repo root if present.
//
// 캐시 .tmp/opendart-cache/ 공유 (fetch-opendart.js와 동일).

"use strict";

const fs = require("fs");
const path = require("path");
const https = require("https");
const { URL, URLSearchParams } = require("url");

const SCRIPT_DIR = __dirname;
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..", "..", "..");
const CACHE_ROOT = path.resolve(REPO_ROOT, ".tmp", "opendart-cache");

const API_BASE = "https://opendart.fss.or.kr/api";
const RATE_LIMIT_DELAY_MS = 150;
const MAX_LIST_PAGES = 200;
// OpenDART list.json without corp_code rejects ranges > 3 months. Stay safely under.
const LIST_CHUNK_DAYS = 80;

let lastRequestAt = 0;

// --- .env autoloader (repo root) ----------------------------------------

function loadEnvFile() {
  const envPath = path.resolve(REPO_ROOT, ".env");
  if (!fs.existsSync(envPath)) return;
  const text = fs.readFileSync(envPath, "utf8");
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const name = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(name in process.env)) process.env[name] = value;
  }
}

// --- CLI ----------------------------------------------------------------

function parseArgs(argv) {
  const out = { lookbackDays: 90, withDetail: true };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    switch (arg) {
      case "--bgn-de":
        out.bgnDe = next;
        i += 1;
        break;
      case "--end-de":
        out.endDe = next;
        i += 1;
        break;
      case "--lookback-days":
        out.lookbackDays = parseInt(next, 10);
        if (!Number.isFinite(out.lookbackDays) || out.lookbackDays <= 0) {
          throw new Error("--lookback-days must be a positive integer");
        }
        i += 1;
        break;
      case "--output":
        out.output = next;
        i += 1;
        break;
      case "--no-detail":
        out.withDetail = false;
        break;
      case "--cache-dir":
        out.cacheDir = next;
        i += 1;
        break;
      case "--help":
      case "-h":
        out.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return out;
}

function usage() {
  return [
    "Usage:",
    "  node fetch-nps-holdings.js [--lookback-days 90] [--output <dir>]",
    "  node fetch-nps-holdings.js --bgn-de 20260201 --end-de 20260511 [--no-detail]",
    "",
    "Required env (or in .env at repo root):",
    "  OPENDART_API_KEY  — your OpenDART API key (https://opendart.fss.or.kr)",
    "",
    "Options:",
    "  --bgn-de YYYYMMDD       Start date (default: today minus --lookback-days).",
    "  --end-de YYYYMMDD       End date (default: today).",
    "  --lookback-days <N>     Days back from today (default 90).",
    "  --output <dir>          Output directory. Default .tmp/nps-holdings/<YYYY-MM-DD>/.",
    "  --no-detail             Skip majorstock/elestock enrichment (list only, faster).",
    "  --cache-dir <dir>       Override cache root (default .tmp/opendart-cache).",
    "",
    "Outputs:",
    "  <output-dir>/nps-holdings.json   structured index",
    "  <output-dir>/nps-holdings.md     date-desc Markdown table",
  ].join("\n");
}

// --- env / API key ------------------------------------------------------

function loadApiKey() {
  const key = (process.env.OPENDART_API_KEY || "").trim();
  if (!key) {
    throw new Error(
      "OPENDART_API_KEY env var is required. Put it in repo-root .env or export it."
    );
  }
  if (key.length < 30) {
    throw new Error("OPENDART_API_KEY looks too short. Re-check the value.");
  }
  return key;
}

// --- Date helpers -------------------------------------------------------

function fmtYmd(d) {
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

function fmtIso(d) {
  return d.toISOString().slice(0, 10);
}

function rceptDtToIso(s) {
  // OpenDART rcept_dt is 'YYYYMMDD'
  if (!s || s.length !== 8) return s || "";
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

function parseYmd(s) {
  // 'YYYYMMDD' → Date (UTC midnight)
  return new Date(Date.UTC(
    parseInt(s.slice(0, 4), 10),
    parseInt(s.slice(4, 6), 10) - 1,
    parseInt(s.slice(6, 8), 10)
  ));
}

function chunkDateRange(bgnDe, endDe, chunkDays) {
  // Split [bgnDe, endDe] (YYYYMMDD strings) into chunks of ≤chunkDays each.
  const chunks = [];
  const endMs = parseYmd(endDe).getTime();
  let cursor = parseYmd(bgnDe);
  while (cursor.getTime() <= endMs) {
    const chunkEnd = new Date(cursor.getTime() + (chunkDays - 1) * 86_400_000);
    const actualEnd = chunkEnd.getTime() > endMs ? new Date(endMs) : chunkEnd;
    chunks.push({ bgn_de: fmtYmd(cursor), end_de: fmtYmd(actualEnd) });
    cursor = new Date(actualEnd.getTime() + 86_400_000);
  }
  return chunks;
}

// --- Throttled HTTPS GET -----------------------------------------------

function sleep(ms) {
  const target = Date.now() + ms;
  while (Date.now() < target) {
    // busy-wait — keep stdlib-only
  }
}

function enforceDelay() {
  const elapsed = Date.now() - lastRequestAt;
  if (elapsed < RATE_LIMIT_DELAY_MS) {
    sleep(RATE_LIMIT_DELAY_MS - elapsed);
  }
  lastRequestAt = Date.now();
}

function httpsGetBuffer(urlString, opts = {}) {
  enforceDelay();
  const timeoutMs = opts.timeoutMs || 60_000;
  return new Promise((resolve, reject) => {
    const url = new URL(urlString);
    const req = https.request(
      {
        hostname: url.hostname,
        path: url.pathname + url.search,
        method: "GET",
        headers: {
          "User-Agent":
            "stock-analysis-skill/1.0 (kr-stock-dart-analysis fetch-nps-holdings)",
          Accept: "*/*",
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode} for ${url.host}${url.pathname}`));
            return;
          }
          resolve({ buffer: Buffer.concat(chunks), statusCode: res.statusCode || 0 });
        });
      }
    );
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`Timeout after ${timeoutMs}ms for ${url.host}`));
    });
    req.on("error", (err) => reject(err));
    req.end();
  });
}

async function httpsGetJson(urlString) {
  const { buffer } = await httpsGetBuffer(urlString);
  const text = buffer.toString("utf8");
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(
      `Expected JSON from ${urlString.replace(/crtfc_key=[^&]+/, "crtfc_key=REDACTED")} but got: ${text.slice(0, 200)}`
    );
  }
}

function buildApiUrl(endpoint, params, key) {
  const usp = new URLSearchParams({ crtfc_key: key, ...params });
  return `${API_BASE}/${endpoint}?${usp.toString()}`;
}

// --- list.json paginated -----------------------------------------------

async function fetchFilingListPaginated(params, key) {
  const all = [];
  for (let page = 1; page <= MAX_LIST_PAGES; page += 1) {
    const url = buildApiUrl(
      "list.json",
      { ...params, page_no: String(page), page_count: "100" },
      key
    );
    const json = await httpsGetJson(url);
    if (json.status === "013") {
      // 조회된 데이터 없음
      break;
    }
    if (json.status !== "000") {
      throw new Error(
        `OpenDART list.json error status=${json.status} message=${json.message || "unknown"}`
      );
    }
    const list = Array.isArray(json.list) ? json.list : [];
    all.push(...list);
    const totalPage = parseInt(json.total_page || "1", 10);
    if (!Number.isFinite(totalPage) || page >= totalPage) break;
  }
  return all;
}

// --- NPS filter --------------------------------------------------------

function isNpsFiling(row) {
  const flr = row.flr_nm || "";
  if (!flr.includes("국민연금")) return false;
  const reportName = row.report_nm || "";
  return (
    reportName.includes("대량보유") ||
    reportName.includes("주요주주") ||
    reportName.includes("임원")
  );
}

function classifyReport(reportName) {
  if (reportName.includes("대량보유")) return "대량보유(5%룰)";
  if (reportName.includes("임원") || reportName.includes("주요주주")) return "임원·주요주주";
  return "기타지분";
}

// --- Structured enrichment: majorstock / elestock ----------------------

async function fetchMajorStock(corpCode, key) {
  const url = buildApiUrl("majorstock.json", { corp_code: corpCode }, key);
  const json = await httpsGetJson(url);
  if (json.status === "013") return [];
  if (json.status !== "000") {
    throw new Error(
      `majorstock.json error corp_code=${corpCode} status=${json.status} message=${json.message || "unknown"}`
    );
  }
  return Array.isArray(json.list) ? json.list : [];
}

async function fetchEleStock(corpCode, key) {
  const url = buildApiUrl("elestock.json", { corp_code: corpCode }, key);
  const json = await httpsGetJson(url);
  if (json.status === "013") return [];
  if (json.status !== "000") {
    throw new Error(
      `elestock.json error corp_code=${corpCode} status=${json.status} message=${json.message || "unknown"}`
    );
  }
  return Array.isArray(json.list) ? json.list : [];
}

function toNumberOrNull(value) {
  if (value === undefined || value === null || value === "") return null;
  const cleaned = String(value).replace(/[, ]/g, "");
  if (cleaned === "-" || cleaned === "") return null;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

function enrichWithMajorStock(item, rows) {
  // majorstock.json fields (per OpenDART spec):
  //   rcept_no, rcept_dt, corp_code, corp_name,
  //   report_tp (신규/변동/변경),
  //   repror (보고자명),
  //   stkqy        (보유주식등의 수, 본 보고서)
  //   stkqy_irds   (보유주식등의 수 증감)
  //   stkrt        (보유비율, 본 보고서)
  //   stkrt_irds   (보유비율 증감)
  //   ctr_stkqy / ctr_stkrt  (주요계약 보유분)
  //   report_resn  (보고사유)
  const match = rows.find((r) => r.rcept_no === item.rceptNo);
  if (!match) return false;
  item.reportKind = (match.report_tp || "").trim() || null;
  item.repror = (match.repror || "").trim() || null;
  item.currShares = toNumberOrNull(match.stkqy);
  item.deltaShares = toNumberOrNull(match.stkqy_irds);
  item.currPct = toNumberOrNull(match.stkrt);
  item.deltaPct = toNumberOrNull(match.stkrt_irds);
  if (item.currShares !== null && item.deltaShares !== null) {
    item.prevShares = item.currShares - item.deltaShares;
  }
  if (item.currPct !== null && item.deltaPct !== null) {
    item.prevPct = Math.round((item.currPct - item.deltaPct) * 100) / 100;
  }
  item.reportReason = (match.report_resn || "").trim() || null;
  return true;
}

function enrichWithEleStock(item, rows) {
  // elestock.json fields:
  //   rcept_no, rcept_dt, corp_code, corp_name,
  //   repror     (보고자명)
  //   isu_exctv_rgist_at  (등기/미등기)
  //   isu_exctv_ofcps     (직위)
  //   isu_main_shrholdr   (주요주주 구분)
  //   sp_stock_lmp_cnt    (특정증권등 소유주식수, 당기)
  //   sp_stock_lmp_irds_cnt  (증감)
  //   sp_stock_lmp_rate   (소유비율, 당기)
  //   sp_stock_lmp_irds_rate (증감)
  const match = rows.find((r) => r.rcept_no === item.rceptNo);
  if (!match) return false;
  item.repror = (match.repror || "").trim() || null;
  item.executivePosition = (match.isu_exctv_ofcps || "").trim() || null;
  item.executiveRegistered = (match.isu_exctv_rgist_at || "").trim() || null;
  item.shareholderKind = (match.isu_main_shrholdr || "").trim() || null;
  item.currShares = toNumberOrNull(match.sp_stock_lmp_cnt);
  item.deltaShares = toNumberOrNull(match.sp_stock_lmp_irds_cnt);
  item.currPct = toNumberOrNull(match.sp_stock_lmp_rate);
  item.deltaPct = toNumberOrNull(match.sp_stock_lmp_irds_rate);
  if (item.currShares !== null && item.deltaShares !== null) {
    item.prevShares = item.currShares - item.deltaShares;
  }
  if (item.currPct !== null && item.deltaPct !== null) {
    item.prevPct = Math.round((item.currPct - item.deltaPct) * 100) / 100;
  }
  return true;
}

// --- Output: JSON + Markdown -------------------------------------------

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
  return dirPath;
}

function defaultOutputDir(today) {
  return path.resolve(REPO_ROOT, ".tmp", "nps-holdings", fmtIso(today));
}

function writeJsonOutput(payload, outDir) {
  const file = path.join(outDir, "nps-holdings.json");
  fs.writeFileSync(file, JSON.stringify(payload, null, 2) + "\n", "utf8");
  return file;
}

function fmtPct(value) {
  if (value === null || value === undefined) return "-";
  const n = Number(value);
  if (!Number.isFinite(n)) return "-";
  return `${n.toFixed(2)}%`;
}

function fmtDeltaPct(value) {
  if (value === null || value === undefined) return "-";
  const n = Number(value);
  if (!Number.isFinite(n)) return "-";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%p`;
}

function writeMarkdownOutput(payload, outDir) {
  const lines = [];
  lines.push(`# 국민연금공단 지분공시 — ${payload.range.bgnDe}–${payload.range.endDe}`);
  lines.push("");
  lines.push(`- 기준일: ${payload.asOf}`);
  lines.push(`- 조회 범위: ${payload.range.bgnDe} ~ ${payload.range.endDe} (지분공시 pblntf_ty=D)`);
  lines.push(`- NPS 매치 건수: ${payload.items.length}`);
  lines.push(`- 출처: OpenDART list.json + majorstock.json + elestock.json`);
  lines.push("");

  if (payload.items.length === 0) {
    lines.push("_매치된 NPS 공시가 없습니다._");
  } else {
    lines.push(
      "| 접수일 | 회사 | 보고종류 | 구분 | 직전 % | 현재 % | Δ%p | 사유/목적 | 링크 |"
    );
    lines.push(
      "| --- | --- | --- | --- | --- | --- | --- | --- | --- |"
    );
    for (const it of payload.items) {
      const reason =
        it.reportReason ||
        it.shareholderKind ||
        it.executivePosition ||
        (it.parseStatus === "error" ? `(parse error)` : "-");
      const reasonShort = String(reason).replace(/\s+/g, " ").slice(0, 40);
      lines.push(
        `| ${it.rceptDt} | ${it.corpName} | ${it.reportType} | ${it.reportKind || "-"} | ${fmtPct(it.prevPct)} | ${fmtPct(it.currPct)} | ${fmtDeltaPct(it.deltaPct)} | ${reasonShort} | [원문](${it.url}) |`
      );
    }
  }

  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push(
    "_Markdown은 사람 검토용. 자동화는 같은 디렉터리의 `nps-holdings.json` 사용._"
  );

  const file = path.join(outDir, "nps-holdings.md");
  fs.writeFileSync(file, lines.join("\n") + "\n", "utf8");
  return file;
}

// --- main --------------------------------------------------------------

async function run(args) {
  if (args.help) {
    console.log(usage());
    return 0;
  }

  loadEnvFile();
  const key = loadApiKey();
  const cacheRoot = args.cacheDir ? path.resolve(args.cacheDir) : CACHE_ROOT;
  ensureDir(cacheRoot);

  const today = new Date();
  const bgnDe = args.bgnDe || (() => {
    const d = new Date(today);
    d.setDate(d.getDate() - args.lookbackDays);
    return fmtYmd(d);
  })();
  const endDe = args.endDe || fmtYmd(today);

  process.stderr.write(`[nps] window: ${bgnDe}..${endDe}\n`);
  const chunks = chunkDateRange(bgnDe, endDe, LIST_CHUNK_DAYS);
  process.stderr.write(
    `[nps] fetching 지분공시 list (pblntf_ty=D) in ${chunks.length} chunk(s)...\n`
  );

  const seen = new Set();
  const allDFilings = [];
  for (const chunk of chunks) {
    process.stderr.write(`[nps]   chunk ${chunk.bgn_de}..${chunk.end_de}\n`);
    const rows = await fetchFilingListPaginated(
      { pblntf_ty: "D", bgn_de: chunk.bgn_de, end_de: chunk.end_de },
      key
    );
    for (const row of rows) {
      const rno = row.rcept_no;
      if (rno && !seen.has(rno)) {
        seen.add(rno);
        allDFilings.push(row);
      }
    }
  }
  process.stderr.write(`[nps] total 지분공시 fetched (dedup'd): ${allDFilings.length}\n`);

  const npsFilings = allDFilings.filter(isNpsFiling);
  process.stderr.write(`[nps] NPS matches: ${npsFilings.length}\n`);

  // Build base items
  const items = npsFilings.map((f) => ({
    rceptNo: f.rcept_no,
    rceptDt: rceptDtToIso(f.rcept_dt),
    corpCode: f.corp_code,
    corpName: (f.corp_name || "").trim(),
    stockCode: (f.stock_code || "").trim() || null,
    reportName: (f.report_nm || "").trim(),
    filerName: (f.flr_nm || "").trim(),
    reportType: classifyReport(f.report_nm || ""),
    url: `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${f.rcept_no}`,
    reportKind: null,
    prevShares: null,
    currShares: null,
    prevPct: null,
    currPct: null,
    deltaShares: null,
    deltaPct: null,
    reportReason: null,
    parseStatus: args.withDetail ? "pending" : "skipped",
  }));

  // Enrich with structured endpoints (per unique corp_code)
  if (args.withDetail && items.length > 0) {
    const corpCodes = [...new Set(items.map((it) => it.corpCode))];
    process.stderr.write(
      `[nps] enriching ${corpCodes.length} unique corp_codes via majorstock/elestock...\n`
    );
    // Per-corp_code endpoint cache
    const majorByCorp = new Map();
    const eleByCorp = new Map();
    let enrichedCount = 0;
    for (const corpCode of corpCodes) {
      try {
        majorByCorp.set(corpCode, await fetchMajorStock(corpCode, key));
      } catch (err) {
        process.stderr.write(
          `[nps] majorstock.json failed corp_code=${corpCode}: ${err.message}\n`
        );
        majorByCorp.set(corpCode, []);
      }
      try {
        eleByCorp.set(corpCode, await fetchEleStock(corpCode, key));
      } catch (err) {
        process.stderr.write(
          `[nps] elestock.json failed corp_code=${corpCode}: ${err.message}\n`
        );
        eleByCorp.set(corpCode, []);
      }
    }
    for (const it of items) {
      let matched = false;
      if (it.reportType.startsWith("대량보유")) {
        matched = enrichWithMajorStock(it, majorByCorp.get(it.corpCode) || []);
      } else if (it.reportType.startsWith("임원")) {
        matched = enrichWithEleStock(it, eleByCorp.get(it.corpCode) || []);
      } else {
        // 기타: try both
        matched =
          enrichWithMajorStock(it, majorByCorp.get(it.corpCode) || []) ||
          enrichWithEleStock(it, eleByCorp.get(it.corpCode) || []);
      }
      it.parseStatus = matched ? (it.currPct !== null ? "ok" : "partial") : "no-match";
      if (matched) enrichedCount += 1;
    }
    process.stderr.write(
      `[nps] enrichment: matched=${enrichedCount}/${items.length}\n`
    );
  }

  // Sort by rcept_dt desc, then by rcept_no desc
  items.sort((a, b) => {
    const d = (b.rceptDt || "").localeCompare(a.rceptDt || "");
    return d !== 0 ? d : (b.rceptNo || "").localeCompare(a.rceptNo || "");
  });

  const outDir = ensureDir(
    args.output ? path.resolve(args.output) : defaultOutputDir(today)
  );

  const payload = {
    asOf: fmtIso(today),
    range: { bgnDe, endDe },
    totalDFilings: allDFilings.length,
    totalNps: items.length,
    items,
  };

  const jsonFile = writeJsonOutput(payload, outDir);
  const mdFile = writeMarkdownOutput(payload, outDir);
  process.stderr.write(`[nps] wrote ${jsonFile}\n`);
  process.stderr.write(`[nps] wrote ${mdFile}\n`);
  return 0;
}

(async () => {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`Error: ${err.message}`);
    console.log(usage());
    process.exit(1);
  }
  try {
    const code = await run(args);
    process.exit(code);
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
})();
