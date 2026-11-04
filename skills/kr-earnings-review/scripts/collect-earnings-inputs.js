#!/usr/bin/env node
// Collects the raw inputs of a KRX post-earnings review into one folder, so every review starts from the same evidence.
// Facts only: it downloads and tabulates, it never scores or writes the memo.
//
// Usage:
//   node skills/kr-earnings-review/scripts/collect-earnings-inputs.js --ticker 089590 --period 2026-Q3 \
//     [--out .tmp/earnings/089590-2026-Q3] [--since 2024-07-01] [--skip pdf]
//
// Writes (under --out):
//   filings.json            OpenDART list.json rows since --since (all filing types)
//   prelim/<rcept>.txt      text of every 영업(잠정)실적 filing (tables flattened to "a | b | c" rows)
//   fs/<year>-<code>-<CFS|OFS>.json  fnlttSinglAcntAll per periodic report
//   cashflow.json           quarterly OCF / capex (유형+무형 취득) per basis, cumulative values differenced
//   balance.json            latest periodic report: borrowing, lease, cash rows (CFS) for net debt, plus NCI
//   shares.json             stockTotqySttus of the latest periodic report
//   consensus-history.json  FnGuide weekly history (IFRSL 연결 / IFRSS 별도) for 매출·영업이익·순이익
//   consensus-annual.json   WiseReport annual table (연결): actuals and E years
//   reports.json (+ pdf/)   Naver research list for the ticker with goal price, opinion, PDF text
//   prices.json             Naver daily closes since 60 days before --since's quarter end
//   SUMMARY.md              one-screen digest of all of the above, with gaps listed
// Needs OPENDART_API_KEY (env or repo-root .env). PDF text needs python3 + pypdf.
"use strict";
const fs = require("fs"), path = require("path"), https = require("https"), zlib = require("zlib");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..", "..", "..");
const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : fallback; };
const ticker = arg("ticker"), period = arg("period");
if (!/^\d{6}$/.test(ticker || "") || !/^\d{4}-Q[1-4]$/.test(period || "")) {
  console.error("Usage: collect-earnings-inputs.js --ticker 089590 --period 2026-Q3 [--out dir] [--since YYYY-MM-DD] [--skip pdf]");
  process.exit(2);
}
const [year, q] = [Number(period.slice(0, 4)), Number(period.slice(-1))];
const since = arg("since", `${year - 2}-${String(q * 3).padStart(2, "0")}-01`);
const out = path.resolve(arg("out", path.join(ROOT, ".tmp", "earnings", `${ticker}-${period}`)));
const skip = new Set((arg("skip", "") || "").split(",").filter(Boolean));
const gaps = [];
const mkdir = dir => fs.mkdirSync(dir, { recursive: true });
const save = (name, data) => { const p = path.join(out, name); mkdir(path.dirname(p)); fs.writeFileSync(p, typeof data === "string" ? data : JSON.stringify(data, null, 2)); return p; };
const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const ymd = d => d.replace(/-/g, "");
const eok = won => won === null || won === undefined || won === "" ? null : Math.round(Number(String(won).replace(/,/g, "")) / 1e8);

function apiKey() {
  let key = (process.env.OPENDART_API_KEY || "").trim();
  if (!key && fs.existsSync(path.join(ROOT, ".env"))) key = (fs.readFileSync(path.join(ROOT, ".env"), "utf8").match(/^OPENDART_API_KEY\s*=\s*"?([^"\n]+)"?/m) || [])[1] || "";
  if (key.length < 30) throw new Error("OPENDART_API_KEY missing (env or .env)");
  return key.trim();
}

function get(url, { headers = {}, binary = false } = {}, hops = 0) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { "User-Agent": "Mozilla/5.0 (Macintosh) stock-analysis-skill", ...headers }, timeout: 30000 }, res => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && hops < 5) {
        res.resume(); return resolve(get(new URL(res.headers.location, url).toString(), { headers, binary }, hops + 1));
      }
      const chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end", () => {
        const body = Buffer.concat(chunks);
        if (res.statusCode >= 400) return reject(new Error(`${res.statusCode} ${url}`));
        resolve({ body: binary ? body : body.toString("utf8"), raw: body, headers: res.headers });
      });
    });
    req.on("timeout", () => req.destroy(new Error(`timeout ${url}`)));
    req.on("error", reject);
  });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
let dartAt = 0;
async function dart(endpoint, params, { binary = false } = {}) {
  const wait = dartAt + 150 - Date.now(); if (wait > 0) await sleep(wait); dartAt = Date.now();
  const url = `https://opendart.fss.or.kr/api/${endpoint}?${new URLSearchParams({ crtfc_key: KEY, ...params })}`;
  const res = await get(url, { binary });
  return binary ? res.body : JSON.parse(res.body);
}

// Minimal ZIP reader (central directory + inflateRaw) for OpenDART document.xml archives.
function unzip(buf) {
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error("not a zip");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const files = [];
  for (let i = 0; i < count; i++) {
    const method = buf.readUInt16LE(p + 10), size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28), extra = buf.readUInt16LE(p + 30), comment = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42), name = buf.slice(p + 46, p + 46 + nameLen).toString("latin1");
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const data = buf.slice(start, start + size);
    files.push({ name, data: method === 8 ? zlib.inflateRawSync(data) : data });
    p += 46 + nameLen + extra + comment;
  }
  return files;
}

// DART XML/HTML → readable text. Table rows become "cell | cell" lines so numbers keep their labels.
function docText(xml) {
  const ent = s => s.replace(/&nbsp;|&#160;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/&quot;/g, '"');
  return ent(xml
    .replace(/<(style|STYLE|script|SCRIPT)[^>]*>[\s\S]*?<\/(style|STYLE|script|SCRIPT)>/g, "")
    .replace(/<(TR|tr)[^>]*>([\s\S]*?)<\/(TR|tr)>/g, (_, a, row) => "\n" + row.replace(/<\/(TD|TH|TE|TU|td|th)>/g, " | ").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim().replace(/\|\s*$/, ""))
    .replace(/<\/(P|p|TITLE|SECTION-\d|TABLE|table)>/g, "\n")
    .replace(/<[^>]+>/g, ""))
    .split("\n").map(l => l.replace(/[ \t]+/g, " ").trim()).filter(Boolean).join("\n");
}

const REPORTS = [["11013", 1], ["11012", 2], ["11014", 3], ["11011", 4]];
let KEY;

async function main() {
  KEY = apiKey();
  mkdir(out);
  const corpXml = path.join(ROOT, ".tmp", "opendart-cache", "CORPCODE.xml");
  if (!fs.existsSync(corpXml)) {
    const zip = unzip(await dart("corpCode.xml", {}, { binary: true }));
    mkdir(path.dirname(corpXml)); fs.writeFileSync(corpXml, zip.find(f => /\.xml$/i.test(f.name)).data);
  }
  const block = fs.readFileSync(corpXml, "utf8").split("<list>").find(b => b.includes(`<stock_code>${ticker}</stock_code>`));
  if (!block) throw new Error(`ticker ${ticker} not in CORPCODE.xml`);
  const corp = block.match(/<corp_code>(\d+)/)[1], name = block.match(/<corp_name>([^<]+)/)[1];
  console.log(`${name} ${ticker} corp_code ${corp} · ${period} · since ${since} → ${path.relative(ROOT, out)}`);

  // 1. Filing list (paged).
  const filings = [];
  for (let page = 1; page < 20; page++) {
    const r = await dart("list.json", { corp_code: corp, bgn_de: ymd(since), end_de: ymd(today), page_no: page, page_count: 100 });
    if (r.status !== "000") break;
    filings.push(...r.list);
    if (page >= r.total_page) break;
  }
  save("filings.json", filings);
  const prelims = filings.filter(f => /잠정\)?실적/.test(f.report_nm) && !/예고/.test(f.report_nm));
  const periodic = filings.filter(f => /^(\[[^\]]+\])?\s*(분기보고서|반기보고서|사업보고서)/.test(f.report_nm.trim()));
  const ir = filings.filter(f => /기업설명회|IR/.test(f.report_nm));

  // 2. Preliminary filings as text.
  for (const f of prelims) {
    const file = path.join(out, "prelim", `${f.rcept_no}.txt`);
    if (fs.existsSync(file)) continue;
    try {
      const files = unzip(await dart("document.xml", { rcept_no: f.rcept_no }, { binary: true }));
      save(`prelim/${f.rcept_no}.txt`, `${f.report_nm.trim()} · 접수 ${f.rcept_dt} · https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${f.rcept_no}\n\n` + files.map(x => docText(x.data.toString("utf8"))).join("\n\n"));
    } catch (e) { gaps.push(`잠정실적 원문 ${f.rcept_no}: ${e.message}`); }
  }

  // 3. Periodic financial statements, both bases.
  const statements = [];
  for (let y = Number(since.slice(0, 4)); y <= year; y++) for (const [code, qq] of REPORTS) {
    if (y === year && qq >= q) continue; // the reviewed quarter's report is not out yet at review time
    for (const div of ["CFS", "OFS"]) {
      const name_ = `fs/${y}-${code}-${div}.json`, p = path.join(out, name_);
      let r = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : await dart("fnlttSinglAcntAll.json", { corp_code: corp, bsns_year: y, reprt_code: code, fs_div: div });
      if (!fs.existsSync(p)) save(name_, r);
      if (r.status === "000") statements.push({ year: y, q: qq, code, div, rows: r.list, rcept_no: r.list[0]?.rcept_no });
    }
  }
  const pick = (rows, test) => rows.find(row => row.sj_div === "CF" && test(row));
  const ocfRow = rows => pick(rows, r => r.account_id === "ifrs-full_CashFlowsFromUsedInOperatingActivities" || /^영업활동(으로 인한|으로인한)?\s*현금흐름$/.test(r.account_nm.replace(/\s/g, " ").trim()));
  const capexRows = rows => rows.filter(r => r.sj_div === "CF" && /(유형자산|무형자산).*(취득)/.test(r.account_nm) && !/처분|감소/.test(r.account_nm));
  const cashflow = {};
  for (const div of ["CFS", "OFS"]) {
    const series = [];
    const cum = s => { const o = ocfRow(s.rows), cx = capexRows(s.rows);
      return { ocf: o ? eok(o.thstrm_amount) : null, capex: cx.length ? cx.reduce((a, r) => a + Math.abs(eok(r.thstrm_amount) || 0), 0) : null, capexAccounts: cx.map(r => r.account_nm), rcept_no: s.rcept_no }; };
    const byKey = Object.fromEntries(statements.filter(s => s.div === div).map(s => [`${s.year}-${s.q}`, cum(s)]));
    for (const key of Object.keys(byKey).sort()) {
      const [y, qq] = key.split("-").map(Number), cur = byKey[key], prev = qq > 1 ? byKey[`${y}-${qq - 1}`] : { ocf: 0, capex: 0 };
      const diff = (a, b) => a === null || !b || b[a === cur.ocf ? "ocf" : "capex"] === null ? null : a - b[a === cur.ocf ? "ocf" : "capex"];
      series.push({ period: `${y}-Q${qq}`, report: `${y}-${REPORTS[qq - 1][0]}`, rcept_no: cur.rcept_no,
        cumulative: { ocf: cur.ocf, capex: cur.capex }, operatingCashFlow: prev ? diff(cur.ocf, prev) : null,
        capex: prev && cur.capex !== null && prev.capex !== null ? cur.capex - prev.capex : null, capexAccounts: cur.capexAccounts,
        note: prev ? (qq === 4 ? "연간 − 9개월 누적" : qq === 1 ? "1분기 누적 그대로" : "누적 − 직전 누적") : "직전 누적 없음" });
    }
    cashflow[div] = series;
  }
  save("cashflow.json", { method: "OpenDART fnlttSinglAcntAll 당기 누적값을 직전 누적과 차감. 4분기 = 연간 − 9개월. 투자지출 = 유형·무형자산 취득 합.", unit: "억원", ...cashflow });

  // 4. Latest balance sheet rows for net debt (CFS, fall back to OFS) and shares.
  const latest = [...statements].sort((a, b) => b.year - a.year || b.q - a.q).find(s => s.div === "CFS") || [...statements].sort((a, b) => b.year - a.year || b.q - a.q)[0];
  if (latest) {
    const bs = latest.rows.filter(r => r.sj_div === "BS");
    const debtRe = /(차입금|사채|유동성장기부채|리스부채|금융리스)/, cashRe = /^(현금및현금성자산|단기금융상품|단기투자자산)$/;
    const rows = bs.filter(r => (debtRe.test(r.account_nm) && !/(이자|상환|충당|파생)/.test(r.account_nm)) || cashRe.test(r.account_nm.replace(/\s/g, "")) || /비지배지분/.test(r.account_nm))
      .map(r => ({ account: r.account_nm, id: r.account_id, value: eok(r.thstrm_amount), kind: cashRe.test(r.account_nm.replace(/\s/g, "")) ? "cash" : /비지배/.test(r.account_nm) ? "nci" : "debt" }));
    // Totals and sub-rows can both match; keep every row and let the author check the table before summing.
    const debt = rows.filter(r => r.kind === "debt").reduce((a, r) => a + (r.value || 0), 0), cash = rows.filter(r => r.kind === "cash").reduce((a, r) => a + (r.value || 0), 0);
    save("balance.json", { asOf: `${latest.year}-Q${latest.q}`, basis: latest.div, rcept_no: latest.rcept_no, unit: "억원", rows, naiveNetDebt: debt - cash,
      warning: "naiveNetDebt sums every matching row. Remove subtotal rows (예: 차입금 합계) and confirm 리스부채 is included once before using it." });
    try {
      const st = await dart("stockTotqySttus.json", { corp_code: corp, bsns_year: latest.year, reprt_code: latest.code });
      save("shares.json", { report: `${latest.year}-${latest.code}`, rcept_no: latest.rcept_no, rows: st.list || [], status: st.status });
    } catch (e) { gaps.push(`주식 총수: ${e.message}`); }
  } else gaps.push("정기보고서 재무제표 없음");

  // 5. FnGuide consensus history (weekly), both bases.
  const consensus = {};
  for (const [basis, label] of [["IFRSL", "연결"], ["IFRSS", "별도"]]) for (const [acc, metric] of [["121000", "revenue"], ["121500", "operatingProfit"], ["122700", "netIncome"]]) {
    const url = `https://comp.wisereport.co.kr/company/ajax/c1050001_data.aspx?flag=5&cmp_cd=${ticker}&finGubun=${basis}&frq=1&sDT=${ymd(today)}&acc_cd=${acc}`;
    try {
      const r = await get(url, { headers: { Referer: `https://comp.wisereport.co.kr/company/c1050001.aspx?cmp_cd=${ticker}` } });
      const j = JSON.parse(r.body);
      save(`fng/${basis}-${acc}.json`, j);
      // chartData holds parallel arrays; the reviewed quarter is whichever CNS_* column chartHeader labels "YYYY/MM(E)".
      const target = `${year}/${String(q * 3).padStart(2, "0")}(E)`, header = (j.chartHeader || [])[0] || {};
      const col = Object.keys(header).find(k => k.startsWith("CNS_") && header[k] === target), c = j.chartData || {};
      const table = (j.tableData?.tableData || []).map(row => ({ row: row.QTR, value: col ? row[col.replace("CNS_", "")] : null }));
      (consensus[label] ||= {})[metric] = { url, column: col || null, target, sha256: require("crypto").createHash("sha256").update(r.raw).digest("hex"),
        points: col ? (c.TRD_DT || []).map((date, i) => ({ date: date.replace(/\//g, "-"), value: c[col][i] })) : [], preRelease: table };
      if (!col) gaps.push(`FnGuide ${label} ${metric}: ${target} 열 없음 (header ${JSON.stringify(header)})`);
    } catch (e) { gaps.push(`FnGuide ${label} ${metric}: ${e.message}`); }
  }
  save("consensus-history.json", consensus);

  // 6. WiseReport annual consolidated table (needs encparam/id from the main page plus its cookie).
  try {
    const page = await get(`https://comp.wisereport.co.kr/company/c1010001.aspx?cmp_cd=${ticker}`);
    const enc = page.body.match(/encparam\s*:\s*'([^']*)'/)?.[1], id = page.body.match(/\bid\s*:\s*'([^']*)'/)?.[1];
    const cookie = (page.headers["set-cookie"] || []).map(c => c.split(";")[0]).join("; ");
    const r = await get(`https://comp.wisereport.co.kr/company/ajax/cF1001.aspx?cmp_cd=${ticker}&fin_typ=4&freq_typ=Y&extY=0&extQ=0&encparam=${enc}&id=${id}`,
      { headers: { Referer: `https://comp.wisereport.co.kr/company/c1010001.aspx?cmp_cd=${ticker}`, Cookie: cookie, "X-Requested-With": "XMLHttpRequest" } });
    save("wisereport-cF1001.html", r.body);
    const heads = [...r.body.matchAll(/<th[^>]*>\s*(\d{4}\/\d{2})(?:\s*\(([^)]*)\))?/g)].map(m => m[1] + (m[2] ? `(${m[2]})` : ""));
    const rows = {};
    for (const tr of r.body.split(/<tr/).slice(1)) {
      const label = (tr.match(/<th[^>]*>([\s\S]*?)<\/th>/)?.[1] || "").replace(/<[^>]+>/g, "").trim();
      if (!/^(매출액|영업이익|당기순이익|지배주주순이익|EBITDA)/.test(label)) continue;
      rows[label] = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(m => m[1].replace(/<[^>]+>/g, "").replace(/,/g, "").trim()).map(v => v === "" ? null : Number(v));
    }
    save("consensus-annual.json", { source: `https://comp.wisereport.co.kr/company/c1010001.aspx?cmp_cd=${ticker}`, basis: "연결 (fin_typ=4)", unit: "억원", retrievedAt: today, columns: heads.slice(0, Math.max(...Object.values(rows).map(v => v.length), 0)), rows });
  } catch (e) { gaps.push(`WiseReport 연간 컨센서스: ${e.message}`); }

  // 7. Naver research list → detail (goal price, opinion) → PDF text.
  const reports = [];
  try {
    for (let pageNo = 1; pageNo <= 3; pageNo++) {
      const r = await get(`https://finance.naver.com/research/company_list.naver?searchType=itemCode&itemCode=${ticker}&page=${pageNo}`, { binary: true });
      const html = new TextDecoder("euc-kr").decode(r.body);
      let added = 0;
      for (const row of html.split("<tr>").slice(1)) {
        const nid = row.match(/company_read\.naver\?nid=(\d+)/)?.[1];
        if (!nid) continue;
        const tds = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(m => m[1].replace(/<[^>]+>/g, "").trim());
        const date = (tds.find(t => /^\d{2}\.\d{2}\.\d{2}$/.test(t)) || "").replace(/^(\d{2})\.(\d{2})\.(\d{2})$/, "20$1-$2-$3");
        if (date && date < since) continue;
        reports.push({ nid, title: row.match(/company_read\.naver\?nid=\d+[^>]*>([^<]+)/)?.[1].trim(), broker: tds[2], date, pdf: row.match(/href="(https:\/\/stock\.pstatic\.net[^"]+\.pdf)"/)?.[1] || null });
        added++;
      }
      if (!added) break;
    }
    // The PC list misses some brokers; the mobile feed is complete but not filterable, so scan it back to --since.
    for (let pageNo = 1; pageNo <= 60; pageNo++) {
      const page = JSON.parse((await get(`https://m.stock.naver.com/api/research/company?page=${pageNo}&pageSize=100`)).body);
      if (!Array.isArray(page) || !page.length) break;
      for (const x of page) if (x.itemCode === ticker && !reports.some(r => r.nid === String(x.researchId)))
        reports.push({ nid: String(x.researchId), title: x.title, broker: x.brokerName, date: x.writeDate, pdf: null });
      if (page.at(-1).writeDate < since) break;
    }
    reports.sort((a, b) => b.date.localeCompare(a.date));
    for (const rep of reports) {
      try {
        const d = JSON.parse((await get(`https://m.stock.naver.com/api/research/company/${rep.nid}`)).body).researchContent || {};
        Object.assign(rep, { goalPrice: d.goalPrice ?? null, opinion: d.opinion ?? d.investOpinion ?? null, pdf: rep.pdf || d.attachUrl || null });
      } catch (e) { rep.detailError = e.message; }
      if (skip.has("pdf") || !rep.pdf) continue;
      const pdf = path.join(out, "pdf", `${rep.nid}.pdf`), txt = pdf.replace(/\.pdf$/, ".txt");
      try {
        if (!fs.existsSync(pdf)) { mkdir(path.dirname(pdf)); fs.writeFileSync(pdf, (await get(rep.pdf, { binary: true })).body); }
        if (!fs.existsSync(txt)) execFileSync("python3", [path.join(ROOT, "skills/kr-stock-dart-analysis/scripts/extract-pdf-text.py"), "--input", pdf, "--output", txt], { stdio: "ignore" });
        rep.textChars = fs.readFileSync(txt, "utf8").trim().length;
        if (rep.textChars < 500) rep.note = "PDF 텍스트 거의 없음(이미지 PDF일 수 있음) — 눈으로 확인";
      } catch (e) { rep.pdfError = e.message; }
    }
  } catch (e) { gaps.push(`네이버 리서치: ${e.message}`); }
  save("reports.json", reports);

  // 8. Daily closes from a quarter before the reviewed quarter to today.
  try {
    const from = new Date(Date.UTC(year, q * 3 - 6, 1)).toISOString().slice(0, 10);
    const r = await get(`https://api.finance.naver.com/siseJson.naver?symbol=${ticker}&requestType=1&startTime=${ymd(from)}&endTime=${ymd(today)}&timeframe=day`);
    const rows = JSON.parse(r.body.replace(/'/g, '"').trim()).slice(1).map(([d, o, h, l, c, v]) => ({ date: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`, open: o, high: h, low: l, close: c, volume: v }));
    save("prices.json", { source: `https://finance.naver.com/item/sise_day.naver?code=${ticker}`, rows });
  } catch (e) { gaps.push(`네이버 시세: ${e.message}`); }

  // SUMMARY.md
  const L = [`# ${name} (${ticker}) ${period} 실적 리뷰 입력 자료`, "", `수집일 ${today} · corp_code ${corp} · 출력 ${path.relative(ROOT, out)}`, ""];
  L.push("## 잠정실적 공시", "", "| 접수일 | 접수번호 | 공시명 |", "| --- | --- | --- |", ...prelims.map(f => `| ${f.rcept_dt} | ${f.rcept_no} | ${f.report_nm.trim()} |`), "");
  L.push("## 정기보고서", "", "| 접수일 | 접수번호 | 보고서 |", "| --- | --- | --- |", ...periodic.map(f => `| ${f.rcept_dt} | ${f.rcept_no} | ${f.report_nm.trim()} |`), "");
  if (ir.length) L.push("## IR 안내", "", ...ir.map(f => `- ${f.rcept_dt} ${f.rcept_no} ${f.report_nm.trim()}`), "");
  for (const div of ["CFS", "OFS"]) if (cashflow[div]?.length) L.push(`## 분기 현금흐름 (${div === "CFS" ? "연결" : "별도"}, 억원)`, "", "| 분기 | 영업현금흐름 | 투자지출 | 차이 | 계산 |", "| --- | ---: | ---: | ---: | --- |",
    ...cashflow[div].map(s => `| ${s.period} | ${s.operatingCashFlow ?? "—"} | ${s.capex ?? "—"} | ${s.operatingCashFlow !== null && s.capex !== null ? s.operatingCashFlow - s.capex : "—"} | ${s.note} |`), "");
  for (const [label, metrics] of Object.entries(consensus)) {
    L.push(`## 컨센서스 이력 (FnGuide ${label}, 최근 6개 관측)`, "");
    for (const [metric, m] of Object.entries(metrics)) L.push(`- ${metric}: ${m.points.slice(-6).map(p => `${p.date} ${p.value ?? "—"}`).join(" · ") || "관측 없음"}`);
    L.push("");
  }
  L.push("## 증권사 보고서 (네이버)", "", "| 날짜 | 증권사 | 의견 | 목표가 | 제목 | 텍스트 |", "| --- | --- | --- | ---: | --- | ---: |",
    ...reports.map(r => `| ${r.date} | ${r.broker || ""} | ${r.opinion || ""} | ${r.goalPrice || ""} | ${(r.title || "").slice(0, 30)} | ${r.textChars ?? r.pdfError ?? "—"} |`), "");
  L.push("## 빈 자료", "", ...(gaps.length ? gaps.map(g => `- ${g}`) : ["- 없음"]), "");
  save("SUMMARY.md", L.join("\n"));
  console.log(L.join("\n"));
}
main().catch(e => { console.error(e.stack || e.message); process.exit(1); });
