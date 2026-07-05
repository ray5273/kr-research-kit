#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const os = require("os");
const https = require("https");
const http = require("http");
const { spawnSync } = require("child_process");

const web = require("../../kr-web-browse/scripts/browse-web.js");
const hankyung = require("../../kr-analyst-report-discover/scripts/lib/hankyung.js");
const naver = require("../../kr-analyst-report-discover/scripts/lib/naver-research.js");

const SKILL = "kr-analyst-report-watch";
const DEFAULT_ARTIFACT_DIR = "analysis-example/kr-reports";
const DEFAULT_TMP_DIR = ".tmp/kr-analyst-report-watch";
const MAX_PAGES = 8;

function parseArgs(argv) {
  const args = {
    mode: "daily",
    date: todayKstIso(),
    maxReports: null,
    lookbackDays: null,
    output: null,
    jsonOutput: null,
    mdOutput: null,
    artifactDir: DEFAULT_ARTIFACT_DIR,
    tmpDir: DEFAULT_TMP_DIR,
    fixture: null,
    noArtifacts: false,
    noPdf: false,
    verbose: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    const next = () => argv[++i];
    switch (token) {
      case "--mode": args.mode = next(); break;
      case "--date": args.date = next(); break;
      case "--max-reports": args.maxReports = parseInt(next(), 10); break;
      case "--lookback-days": args.lookbackDays = parseInt(next(), 10); break;
      case "--output": args.output = next(); break;
      case "--json-output": args.jsonOutput = next(); break;
      case "--md-output": args.mdOutput = next(); break;
      case "--artifact-dir": args.artifactDir = next(); break;
      case "--tmp-dir": args.tmpDir = next(); break;
      case "--fixture": args.fixture = next(); break;
      case "--no-artifacts": args.noArtifacts = true; break;
      case "--no-pdf": args.noPdf = true; break;
      case "--verbose": args.verbose = true; break;
      case "--help":
      case "-h": printHelp(); process.exit(0); break;
      default:
        console.error(`Unknown argument: ${token}`);
        process.exit(1);
    }
  }
  if (!["daily", "weekly"].includes(args.mode)) throw new Error("--mode must be daily or weekly");
  if (!/^20\d{2}-\d{2}-\d{2}$/.test(args.date)) throw new Error("--date must be YYYY-MM-DD");
  if (args.maxReports == null) args.maxReports = args.mode === "weekly" ? 30 : 10;
  if (args.lookbackDays == null) args.lookbackDays = args.mode === "weekly" ? 7 : 1;
  return args;
}

function printHelp() {
  console.log(`Usage: node discover-watch-reports.js --mode daily|weekly --date YYYY-MM-DD [options]\n\n` +
    `Options:\n` +
    `  --max-reports <N>      daily default 10, weekly default 30\n` +
    `  --output <path>        write raw/enriched collection JSON\n` +
    `  --json-output <path>   final JSON artifact path\n` +
    `  --md-output <path>     final Markdown artifact path\n` +
    `  --artifact-dir <path>  default analysis-example/kr-reports\n` +
    `  --fixture <path>       test/offline fixture of raw reports\n` +
    `  --no-artifacts         only write --output when supplied\n` +
    `  --no-pdf               skip PDF download/text extraction\n`);
}

function todayKstIso() {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60_000;
  const kst = new Date(utc + 9 * 60 * 60_000);
  return kst.toISOString().slice(0, 10);
}

function subtractDaysIso(iso, days) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) - days * 86400_000).toISOString().slice(0, 10);
}

function ensureDirFor(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
}

function normalizeSpaces(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeDedupePart(value) {
  return normalizeSpaces(value).toLowerCase().replace(/[\[\](){}'"“”‘’.,:;|/\\_-]+/g, "");
}

function dedupeKey(report) {
  return [report.broker, report.publishedDate, report.title].map(normalizeDedupePart).join("|");
}

function dedupeReports(reports) {
  const map = new Map();
  for (const report of reports) {
    if (!report || !report.title) continue;
    const key = dedupeKey(report);
    const existing = map.get(key);
    if (!existing) {
      map.set(key, { ...report, sourceSites: [report.sourceSite].filter(Boolean) });
      continue;
    }
    existing.sourceSites = Array.from(new Set([...(existing.sourceSites || []), report.sourceSite].filter(Boolean)));
    existing.pdfUrl = existing.pdfUrl || report.pdfUrl;
    existing.landingUrl = existing.landingUrl || report.landingUrl;
    existing.rating = existing.rating || report.rating;
    existing.ratingRaw = existing.ratingRaw || report.ratingRaw;
    existing.targetPrice = existing.targetPrice || report.targetPrice;
    existing.analyst = existing.analyst || report.analyst;
  }
  return Array.from(map.values());
}

function parseTickerFromTitle(title) {
  const match = normalizeSpaces(title).match(/\((\d{5,7})\)/);
  return match ? match[1] : null;
}

function parseCompanyFromTitle(title) {
  const text = normalizeSpaces(title);
  const match = text.match(/^([^()\s]{2,30})\((\d{5,7})\)/);
  if (match) return match[1];
  const leading = text.match(/^([A-Za-z0-9가-힣&.\- ]{2,30})[:：-]/);
  return leading ? normalizeSpaces(leading[1]) : null;
}

function slug(value) {
  return normalizeSpaces(value)
    .replace(/[+&/]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/[^\p{L}\p{N}-]/gu, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "misc";
}

const SECTOR_KEYWORDS = [
  ["semiconductor", /반도체|HBM|DRAM|NAND|파운드리|소부장|AI\s*반도체/i],
  ["battery", /2차전지|배터리|양극재|음극재|전해액|리튬|LFP|NCM/i],
  ["shipbuilding", /조선|선박|해양플랜트|LNG선|탱커|방산함정/i],
  ["bio-healthcare", /바이오|제약|헬스케어|신약|임상|CDMO/i],
  ["auto", /자동차|전기차|EV|부품|타이어|완성차/i],
  ["internet-game", /인터넷|플랫폼|게임|웹툰|커머스|광고/i],
  ["finance", /은행|보험|증권|금융|카드|지주/i],
  ["energy-chemical", /정유|화학|에너지|태양광|풍력|수소|전력/i],
  ["construction-machinery", /건설|기계|인프라|플랜트|굴삭기/i],
  ["consumer", /유통|화장품|음식료|소비재|면세|여행|레저/i],
];

function classifyTopic(report) {
  const title = normalizeSpaces(report.title);
  const ticker = report.ticker || parseTickerFromTitle(title);
  const company = report.company || parseCompanyFromTitle(title);
  if (ticker) return { topicKey: `company:${ticker}`, topicType: "company", company: company || null, ticker };
  for (const [key, rx] of SECTOR_KEYWORDS) {
    if (rx.test(title)) return { topicKey: `sector:${key}`, topicType: "sector", company: null, ticker: null };
  }
  if (company && !/산업|업종|전망|전략|시황|주간|월간|이슈|테마/i.test(company)) {
    return { topicKey: `company:${slug(company)}`, topicType: "company", company, ticker: null };
  }
  const themeSeed = title.split(/[,:：-]/)[0] || title;
  return { topicKey: `theme:${slug(themeSeed)}`, topicType: "theme", company: null, ticker: null };
}

function narrativeFromReport(report, extractedText) {
  const text = normalizeSpaces([report.title, extractedText || ""].join(" "));
  const fields = {
    industryTrend: pickSentence(text, /업황|사이클|수요|가격|마진|회복|둔화|성장|피크|바닥/),
    demandSupply: pickSentence(text, /수요|공급|재고|가동률|주문|출하|ASP|가격/),
    policy: pickSentence(text, /정책|규제|보조금|관세|정부|금리|환율/),
    competition: pickSentence(text, /경쟁|점유율|경쟁사|중국|미국|Peer|피어/),
    risk: pickSentence(text, /리스크|위험|하향|부진|지연|우려|불확실|적자/),
    catalyst: pickSentence(text, /모멘텀|촉매|Catalyst|수주|실적|신제품|승인|증설|런칭/),
  };
  return fields;
}

function pickSentence(text, rx) {
  const sentences = normalizeSpaces(text).split(/(?<=[.!?。]|다\.|요\.)\s+|\s*[|]\s*/).filter(Boolean);
  return sentences.find((s) => rx.test(s)) || null;
}

function buildSummary(report, narrative) {
  const parts = [];
  if (narrative.industryTrend) parts.push(narrative.industryTrend);
  if (narrative.demandSupply && narrative.demandSupply !== narrative.industryTrend) parts.push(narrative.demandSupply);
  if (narrative.catalyst) parts.push(`Catalyst: ${narrative.catalyst}`);
  if (narrative.risk) parts.push(`Risk: ${narrative.risk}`);
  if (parts.length === 0) parts.push(normalizeSpaces(report.title));
  return parts.join(" ").slice(0, 700);
}

function reportScore(report) {
  let score = 0;
  if (report.publishedDate) score += Date.parse(report.publishedDate) / 86400_000 / 100000;
  if ((report.sourceSites || [report.sourceSite]).includes("hankyung")) score += 5;
  if (report.pdfUrl) score += 4;
  if (report.broker) score += 2;
  if (report.rating || report.targetPrice) score += 2;
  if (/전망|변화|상향|하향|회복|둔화|리스크|정책|수요|공급|경쟁|촉매|모멘텀|실적/i.test(report.title || "")) score += 5;
  return score;
}

function selectTopReports(reports, maxReports) {
  return [...reports].sort((a, b) => reportScore(b) - reportScore(a)).slice(0, maxReports);
}

function compareNarrative(current, prior) {
  if (!prior) {
    return { priorArtifact: null, priorReportId: null, labels: ["new-topic"], summary: "No prior same-topic watch item found." };
  }
  const labels = ["same-topic-refresh"];
  const cur = current.narrative || {};
  const old = prior.narrative || {};
  if (changed(cur.risk, old.risk)) labels.push("risk-framing-changed");
  if (changed(cur.catalyst, old.catalyst)) labels.push("catalyst-changed");
  const curTone = tone(`${cur.industryTrend || ""} ${cur.demandSupply || ""} ${current.summary || ""}`);
  const oldTone = tone(`${old.industryTrend || ""} ${old.demandSupply || ""} ${prior.summary || ""}`);
  if (curTone > oldTone) labels.push("tone-shift-positive");
  if (curTone < oldTone) labels.push("tone-shift-negative");
  if (labels.length === 1 && !prior.summary) labels.push("insufficient-prior");
  return {
    priorArtifact: prior.__artifact || null,
    priorReportId: prior.reportId || null,
    labels,
    summary: `Compared with ${prior.publishedDate || "prior"} ${prior.broker || "unknown broker"} item for ${current.topicKey}.`,
  };
}

function changed(a, b) {
  const aa = normalizeDedupePart(a);
  const bb = normalizeDedupePart(b);
  if (!aa && !bb) return false;
  if (!aa || !bb) return true;
  return aa !== bb;
}

function tone(text) {
  let score = 0;
  if (/상향|개선|회복|호조|강세|성장|확대|수혜|기대|긍정/i.test(text)) score += 1;
  if (/하향|둔화|부진|우려|리스크|약세|축소|악화|지연|부정/i.test(text)) score -= 1;
  return score;
}

function loadPriorReports({ artifactDir, asOfDate }) {
  if (!fs.existsSync(artifactDir)) return [];
  const files = fs.readdirSync(artifactDir)
    .filter((name) => /^report-watch-(daily|weekly)-20\d{2}-\d{2}-\d{2}\.json$/.test(name))
    .filter((name) => name.slice(-15, -5) < asOfDate)
    .sort()
    .reverse();
  const out = [];
  for (const name of files) {
    try {
      const full = path.join(artifactDir, name);
      const data = JSON.parse(fs.readFileSync(full, "utf8"));
      for (const report of data.reports || []) out.push({ ...report, __artifact: full, __artifactDate: data.asOfDate });
    } catch {
      // Ignore malformed prior artifacts; current run records only its own warnings.
    }
  }
  return out;
}

function findPriorForTopic(topicKey, priorReports) {
  return priorReports.find((report) => report.topicKey === topicKey) || null;
}

function buildFinalArtifact({ mode, asOfDate, lookbackDays, maxReports, rawReports, dedupedReports, selectedReports, priorReports, warnings }) {
  const reports = selectedReports.map((report) => {
    const topic = classifyTopic(report);
    const narrative = narrativeFromReport(report, report.extractedText);
    const enriched = {
      reportId: report.reportId || `${topic.topicKey}:${dedupeKey(report)}`,
      broker: report.broker || null,
      analyst: report.analyst || null,
      publishedDate: report.publishedDate || null,
      title: normalizeSpaces(report.title),
      rating: report.rating || null,
      ratingRaw: report.ratingRaw || null,
      targetPrice: report.targetPrice || null,
      currency: report.currency || "KRW",
      sourceSite: report.sourceSite || null,
      sourceSites: report.sourceSites || [report.sourceSite].filter(Boolean),
      landingUrl: report.landingUrl || null,
      pdfUrl: report.pdfUrl || null,
      requiresAuth: Boolean(report.requiresAuth),
      accessiblePdf: Boolean(report.accessiblePdf),
      extractedTextPath: report.extractedTextPath || null,
      topicKey: topic.topicKey,
      topicType: topic.topicType,
      company: topic.company,
      ticker: topic.ticker,
      narrative,
    };
    enriched.summary = buildSummary(enriched, narrative);
    enriched.priorComparison = compareNarrative(enriched, findPriorForTopic(enriched.topicKey, priorReports));
    enriched.narrativeDeltaLabels = enriched.priorComparison.labels;
    return enriched;
  });

  const topicMap = new Map();
  for (const report of reports) {
    const entry = topicMap.get(report.topicKey) || { topicKey: report.topicKey, topicType: report.topicType, reports: [], labels: new Set() };
    entry.reports.push(report.reportId);
    for (const label of report.narrativeDeltaLabels) entry.labels.add(label);
    topicMap.set(report.topicKey, entry);
  }

  return {
    schemaVersion: 1,
    skill: SKILL,
    mode,
    asOfDate,
    generatedAt: new Date().toISOString(),
    sourceScope: "Korean securities reports",
    collection: {
      lookbackDays,
      maxReports,
      sources: ["hankyung", "naver"],
      rawReportCount: rawReports.length,
      dedupedReportCount: dedupedReports.length,
    },
    reports,
    topicChanges: Array.from(topicMap.values()).map((entry) => ({
      topicKey: entry.topicKey,
      topicType: entry.topicType,
      reportIds: entry.reports,
      narrativeDeltaLabels: Array.from(entry.labels),
    })),
    sourceQuality: {
      accessiblePdfCount: reports.filter((r) => r.accessiblePdf).length,
      loginGatedCount: reports.filter((r) => r.requiresAuth).length,
      extractedTextCount: reports.filter((r) => r.extractedTextPath).length,
      warnings,
    },
  };
}

function renderMarkdown(data) {
  const lines = [];
  lines.push(`# Korean Analyst Report Watch - ${data.mode} - ${data.asOfDate}`);
  lines.push("");
  lines.push("## 기준일 / 모드 / 수집 범위");
  lines.push(`- 기준일: ${data.asOfDate}`);
  lines.push(`- 모드: ${data.mode}`);
  lines.push(`- 수집 범위: ${data.sourceScope}`);
  lines.push(`- 수집 결과: raw ${data.collection.rawReportCount}건 / deduped ${data.collection.dedupedReportCount}건 / digest ${data.reports.length}건`);
  lines.push("");
  lines.push("## Executive Brief");
  if (data.reports.length === 0) lines.push("- 기준 조건에 맞는 공개 리포트를 확인하지 못했습니다.");
  for (const report of data.reports.slice(0, 5)) {
    lines.push(`- ${report.topicKey}: ${report.narrativeDeltaLabels.join(", ")} - ${report.summary}`);
  }
  lines.push("");
  lines.push("## Top Narrative Changes");
  for (const change of data.topicChanges.slice(0, 10)) {
    lines.push(`- ${change.topicKey}: ${change.narrativeDeltaLabels.join(", ")} (${change.reportIds.length} report${change.reportIds.length === 1 ? "" : "s"})`);
  }
  lines.push("");
  lines.push("## Report Digest");
  for (const report of data.reports) {
    lines.push(`### ${report.title}`);
    lines.push(`- Broker/date: ${report.broker || "N/A"} / ${report.publishedDate || "N/A"}`);
    lines.push(`- Topic: ${report.topicKey}`);
    lines.push(`- Delta: ${report.narrativeDeltaLabels.join(", ")}`);
    lines.push(`- Summary: ${report.summary}`);
    lines.push("");
  }
  lines.push("## Topic-by-Topic Changes");
  for (const report of data.reports) {
    lines.push(`- ${report.topicKey}: ${report.priorComparison.summary}`);
  }
  lines.push("");
  lines.push("## Source Quality / Gaps");
  lines.push(`- Accessible PDFs: ${data.sourceQuality.accessiblePdfCount}`);
  lines.push(`- Login-gated reports: ${data.sourceQuality.loginGatedCount}`);
  lines.push(`- Extracted texts: ${data.sourceQuality.extractedTextCount}`);
  for (const warning of data.sourceQuality.warnings) lines.push(`- ${warning}`);
  lines.push("");
  lines.push("## Sources");
  for (const report of data.reports) {
    const url = report.pdfUrl || report.landingUrl;
    if (url) lines.push(`- ${report.broker || "Unknown"} / ${report.publishedDate || "N/A"} / ${report.title}: ${url}`);
  }
  lines.push("");
  lines.push("투자 권유가 아닌 공개 리서치 흐름 모니터링용 요약입니다. 원문 리포트 내용은 저작권 보호를 위해 요약·재구성했습니다.");
  return lines.join("\n");
}

function parseHankyungBroadPage(linksText, plainText, reportType) {
  return hankyung.parseListPage(linksText || "", plainText || "").map((report) => ({ ...report, reportType }));
}

async function scrapeHankyungBroad({ startDate, endDate, verbose }) {
  const reports = [];
  for (const reportType of ["CO", "IN"]) {
    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const url = hankyung.buildListUrl({ company: "", startDate, endDate, page, reportType });
      if (verbose) console.error(`[hankyung:${reportType}] ${url}`);
      const linksText = web.browseLinks(url, { verbose });
      const plainText = web.browseText(url, { verbose });
      const pageReports = parseHankyungBroadPage(linksText, plainText, reportType);
      if (pageReports.length === 0) break;
      reports.push(...pageReports);
      if (pageReports.some((r) => r.publishedDate && r.publishedDate < startDate)) break;
    }
  }
  return reports.filter((r) => !r.publishedDate || (r.publishedDate >= startDate && r.publishedDate <= endDate));
}

async function scrapeNaverBroad({ startDate, endDate, verbose }) {
  const reports = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const url = naver.LIST_URL_BASE + "?" + new URLSearchParams({ writeFromDate: startDate, writeToDate: endDate, page: String(page) }).toString();
    if (verbose) console.error(`[naver] ${url}`);
    const linksText = web.browseLinks(url, { verbose });
    const plainText = web.browseText(url, { verbose });
    const pageReports = naver.parseListPage(linksText || "", plainText || "");
    if (pageReports.length === 0) break;
    reports.push(...pageReports);
    if (pageReports.some((r) => r.publishedDate && r.publishedDate < startDate)) break;
  }
  return reports.filter((r) => !r.publishedDate || (r.publishedDate >= startDate && r.publishedDate <= endDate));
}

function probePdf(url) {
  if (!url) return Promise.resolve({ accessiblePdf: false, requiresAuth: false });
  return new Promise((resolve) => {
    let parsed;
    try { parsed = new URL(url); } catch { resolve({ accessiblePdf: false, requiresAuth: false }); return; }
    const lib = parsed.protocol === "http:" ? http : https;
    const req = lib.request({ method: "GET", hostname: parsed.hostname, path: parsed.pathname + parsed.search, headers: { Range: "bytes=0-2047", "User-Agent": "Mozilla/5.0" }, timeout: 15000 }, (res) => {
      const status = res.statusCode || 0;
      const contentType = String(res.headers["content-type"] || "").toLowerCase();
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { if (body.length < 1024) body += chunk; });
      res.on("end", () => {
        if (status === 401 || status === 403 || /login|로그인/i.test(body)) resolve({ accessiblePdf: false, requiresAuth: true });
        else resolve({ accessiblePdf: status < 400 && !contentType.includes("text/html"), requiresAuth: false });
      });
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", () => resolve({ accessiblePdf: false, requiresAuth: false }));
    req.end();
  });
}

function downloadFile(url, outPath) {
  return new Promise((resolve) => {
    let parsed;
    try { parsed = new URL(url); } catch { resolve(false); return; }
    ensureDirFor(outPath);
    const file = fs.createWriteStream(outPath);
    const lib = parsed.protocol === "http:" ? http : https;
    const req = lib.get(url, { headers: { "User-Agent": "Mozilla/5.0" }, timeout: 30000 }, (res) => {
      if ((res.statusCode || 0) >= 400) { file.close(); resolve(false); return; }
      res.pipe(file);
      file.on("finish", () => file.close(() => resolve(true)));
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", () => { file.close(); resolve(false); });
  });
}

async function enrichPdfAccess(reports, { tmpDir, date, noPdf, warnings }) {
  const out = [];
  for (const report of reports) {
    const enriched = { ...report };
    const probe = await probePdf(report.pdfUrl);
    enriched.accessiblePdf = probe.accessiblePdf;
    enriched.requiresAuth = Boolean(report.requiresAuth || probe.requiresAuth);
    if (!noPdf && enriched.accessiblePdf && report.pdfUrl) {
      const pdfPath = path.join(tmpDir, "pdf", date, `${slug(report.reportId || report.title)}.pdf`);
      const txtPath = path.join(tmpDir, "text", date, `${slug(report.reportId || report.title)}.txt`);
      if (await downloadFile(report.pdfUrl, pdfPath)) {
        const extracted = extractPdfText(pdfPath, txtPath);
        if (extracted) {
          enriched.extractedTextPath = txtPath;
          enriched.extractedText = fs.readFileSync(txtPath, "utf8").slice(0, 12000);
        } else {
          warnings.push(`PDF text extraction failed: ${report.title}`);
        }
      }
    }
    out.push(enriched);
  }
  return out;
}

function extractPdfText(pdfPath, txtPath) {
  ensureDirFor(txtPath);
  const helper = path.resolve(__dirname, "../../kr-stock-dart-analysis/scripts/extract-pdf-text.py");
  const result = spawnSync("python3", [helper, pdfPath, txtPath], { encoding: "utf8" });
  return result.status === 0 && fs.existsSync(txtPath) && fs.statSync(txtPath).size > 0;
}

async function collectRawReports(args, warnings) {
  if (args.fixture) {
    const fixture = JSON.parse(fs.readFileSync(args.fixture, "utf8"));
    return Array.isArray(fixture) ? fixture : (fixture.reports || []);
  }
  const startDate = subtractDaysIso(args.date, args.lookbackDays - 1);
  const raw = [];
  try { raw.push(...await scrapeHankyungBroad({ startDate, endDate: args.date, verbose: args.verbose })); }
  catch (error) { warnings.push(`Hankyung collection failed: ${error.message}`); }
  try { raw.push(...await scrapeNaverBroad({ startDate, endDate: args.date, verbose: args.verbose })); }
  catch (error) { warnings.push(`Naver collection failed: ${error.message}`); }
  return raw;
}

function defaultArtifactPath(args, ext) {
  return path.join(args.artifactDir, `report-watch-${args.mode}-${args.date}.${ext}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const warnings = [];
  const rawReports = await collectRawReports(args, warnings);
  const withPdf = args.fixture ? rawReports : await enrichPdfAccess(rawReports, { tmpDir: args.tmpDir, date: args.date, noPdf: args.noPdf, warnings });
  const dedupedReports = dedupeReports(withPdf);
  const selectedReports = selectTopReports(dedupedReports, args.maxReports);
  const priorReports = loadPriorReports({ artifactDir: args.artifactDir, asOfDate: args.date });
  const artifact = buildFinalArtifact({ mode: args.mode, asOfDate: args.date, lookbackDays: args.lookbackDays, maxReports: args.maxReports, rawReports, dedupedReports, selectedReports, priorReports, warnings });

  if (args.output) {
    ensureDirFor(args.output);
    fs.writeFileSync(args.output, JSON.stringify({ ...artifact, rawReports: withPdf }, null, 2));
  }
  if (!args.noArtifacts) {
    const jsonOut = args.jsonOutput || defaultArtifactPath(args, "json");
    const mdOut = args.mdOutput || defaultArtifactPath(args, "md");
    ensureDirFor(jsonOut);
    ensureDirFor(mdOut);
    fs.writeFileSync(jsonOut, JSON.stringify(artifact, null, 2));
    fs.writeFileSync(mdOut, renderMarkdown(artifact));
    console.log(`${mdOut}\n${jsonOut}`);
  } else if (args.output) {
    console.log(args.output);
  } else {
    console.log(JSON.stringify(artifact, null, 2));
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
}

module.exports = {
  buildFinalArtifact,
  classifyTopic,
  compareNarrative,
  dedupeReports,
  loadPriorReports,
  narrativeFromReport,
  parseArgs,
  parseCompanyFromTitle,
  parseTickerFromTitle,
  renderMarkdown,
  selectTopReports,
  tone,
};
