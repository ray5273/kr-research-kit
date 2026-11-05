#!/usr/bin/env node
// Collects the raw inputs of a U.S. post-earnings review into one folder, so every review starts from the same evidence.
// Facts only: it downloads and tabulates, it never scores or writes the memo. The readiness table in SUMMARY.md is a
// pre-check of what exists, not the author's gate decision.
//
// Usage:
//   node skills/us-earnings-review/scripts/collect-us-earnings-inputs.js --ticker CRCL --period 2026-Q3 [--out dir] [--quarters 8]
//   node skills/us-earnings-review/scripts/collect-us-earnings-inputs.js snapshot --ticker CRCL
//
// --period is the FISCAL quarter as the 10-Q labels it (Apple's quarter ending Dec 2025 is 2026-Q1).
// `snapshot` stores today's Yahoo consensus under .tmp/earnings/consensus-snapshots/<TICKER>/<date>.json. Run it before
// a release (daily or weekly, locally): the collector then has a dated pre-release observation for every metric.
//
// Writes (under --out, default .tmp/earnings/us-<TICKER>-<period>/):
//   filings.json          SEC submissions rows (8-K, 10-Q, 10-K) with acceptance time
//   release/<accn>.txt    text of the review quarter's 8-K Item 2.02 exhibit 99.x (press release)
//   facts.json            discrete quarterly revenue / operating income / net income / diluted EPS / OCF / capex from XBRL
//   balance.json          latest balance-sheet rows for net debt (cash, investments, debt, leases, NCI)
//   shares.json           share-count candidates (cover page, diluted weighted average, Yahoo)
//   consensus.json        Yahoo quarter and annual consensus, EPS trend points dated relative to retrieval, history
//   analysts.json         Yahoo rating / price-target actions around the release, and the current target spread
//   prices.json           Yahoo daily closes from two quarters before the review quarter to today
//   SUMMARY.md            one-screen digest with the R1–R6 readiness pre-check and gaps
// SEC asks for a contact in the User-Agent: set SEC_USER_AGENT="Name contact@example.com" (env or repo-root .env).
"use strict";
const fs = require("fs"), path = require("path"), https = require("https"), crypto = require("crypto");

const ROOT = path.resolve(__dirname, "..", "..", "..");
const argv = process.argv.slice(2), mode = argv[0] === "snapshot" ? "snapshot" : "collect";
const arg = (name, fallback) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : fallback; };
const ticker = (arg("ticker") || "").toUpperCase(), period = arg("period");
if (!/^[A-Z][A-Z0-9.-]{0,9}$/.test(ticker) || (mode === "collect" && !/^\d{4}-Q[1-4]$/.test(period || ""))) {
  console.error("Usage: collect-us-earnings-inputs.js --ticker CRCL --period 2026-Q3 [--out dir] [--quarters 8]\n       collect-us-earnings-inputs.js snapshot --ticker CRCL");
  process.exit(2);
}
const today = new Date().toISOString().slice(0, 10);
const SNAPSHOTS = path.join(ROOT, ".tmp", "earnings", "consensus-snapshots", ticker);
const mkdir = dir => fs.mkdirSync(dir, { recursive: true });
const addDays = (d, n) => new Date(Date.parse(d) + n * 864e5).toISOString().slice(0, 10);
const days = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
const musd = v => v === null || v === undefined ? null : Math.round(v / 1e3) / 1e3; // dollars → 백만 달러, 3 decimals

function envValue(name) {
  if (process.env[name]) return process.env[name].trim();
  const env = path.join(ROOT, ".env");
  return fs.existsSync(env) ? ((fs.readFileSync(env, "utf8").match(new RegExp(`^${name}\\s*=\\s*"?([^"\\n]+)"?`, "m")) || [])[1] || "").trim() : "";
}
const SEC_UA = envValue("SEC_USER_AGENT") || "KrResearchKit AdminContact@example.com";

function get(url, { headers = {}, allowError = false } = {}, hops = 0) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { "User-Agent": "Mozilla/5.0 (Macintosh) stock-analysis-skill", ...headers }, timeout: 30000 }, res => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && hops < 5) {
        res.resume(); return resolve(get(new URL(res.headers.location, url).toString(), { headers, allowError }, hops + 1));
      }
      const chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end", () => {
        const raw = Buffer.concat(chunks);
        if (res.statusCode >= 400 && !allowError) return reject(new Error(`${res.statusCode} ${url}`));
        resolve({ body: raw.toString("utf8"), raw, headers: res.headers });
      });
    });
    req.on("timeout", () => req.destroy(new Error(`timeout ${url}`)));
    req.on("error", reject);
  });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
let secAt = 0;
async function sec(url) {
  const wait = secAt + 150 - Date.now(); if (wait > 0) await sleep(wait); secAt = Date.now(); // SEC fair-access limit
  return get(url, { headers: { "User-Agent": SEC_UA, "Accept-Encoding": "identity" } });
}

// Yahoo needs a session cookie and a crumb for quoteSummary.
let yahooSession;
async function yahoo(pathAndQuery) {
  if (!yahooSession) {
    const page = await get("https://fc.yahoo.com", { allowError: true }); // answers 404 but sets the session cookie
    const cookie = (page.headers["set-cookie"] || []).map(c => c.split(";")[0]).join("; ");
    const crumb = (await get("https://query1.finance.yahoo.com/v1/test/getcrumb", { headers: { Cookie: cookie } })).body.trim();
    yahooSession = { cookie, crumb };
  }
  const sep = pathAndQuery.includes("?") ? "&" : "?";
  const r = await get(`https://query1.finance.yahoo.com${pathAndQuery}${sep}crumb=${encodeURIComponent(yahooSession.crumb)}`, { headers: { Cookie: yahooSession.cookie } });
  return JSON.parse(r.body);
}
const raw = v => v && typeof v === "object" ? (v.raw ?? null) : (v ?? null);

async function quoteSummary() {
  const modules = "calendarEvents,earningsTrend,earningsHistory,upgradeDowngradeHistory,financialData,defaultKeyStatistics,price";
  const j = await yahoo(`/v10/finance/quoteSummary/${ticker}?modules=${modules}`);
  const r = j.quoteSummary?.result?.[0];
  if (!r) throw new Error(`Yahoo quoteSummary empty: ${JSON.stringify(j.quoteSummary?.error || j).slice(0, 200)}`);
  return r;
}

// One consensus record per Yahoo trend period (0q, +1q, 0y, +1y), plus the EPS trend dated relative to retrieval.
function consensusFrom(qs, retrievedAt) {
  const ev = qs.calendarEvents?.earnings || {};
  const trend = (qs.earningsTrend?.trend || []).map(t => ({
    period: t.period, endDate: t.endDate,
    eps: { avg: raw(t.earningsEstimate?.avg), low: raw(t.earningsEstimate?.low), high: raw(t.earningsEstimate?.high), analysts: raw(t.earningsEstimate?.numberOfAnalysts) },
    revenue: { avg: musd(raw(t.revenueEstimate?.avg)), low: musd(raw(t.revenueEstimate?.low)), high: musd(raw(t.revenueEstimate?.high)), analysts: raw(t.revenueEstimate?.numberOfAnalysts) },
    // Yahoo reports these as "N days ago" from its own update time; the date is retrieval − N, so treat it as approximate.
    epsTrend: [["current", 0], ["7daysAgo", 7], ["30daysAgo", 30], ["60daysAgo", 60], ["90daysAgo", 90]]
      .map(([k, n]) => ({ observedAt: addDays(retrievedAt, -n), daysAgo: n, value: raw(t.epsTrend?.[k]) })).filter(p => p.value !== null),
    revisions: Object.fromEntries(Object.entries(t.epsRevisions || {}).filter(([k]) => k !== "epsRevisionsCurrency").map(([k, v]) => [k, raw(v)])),
  }));
  return {
    retrievedAt, source: `https://finance.yahoo.com/quote/${ticker}/analysis/`, unit: { eps: "USD/share", revenue: "백만 달러" },
    nextEarnings: { date: ev.earningsDate?.[0]?.fmt || null, at: ev.earningsDate?.[0]?.raw ? new Date(ev.earningsDate[0].raw * 1000).toISOString() : null, eps: raw(ev.earningsAverage), revenue: musd(raw(ev.revenueAverage)) },
    trend,
    history: (qs.earningsHistory?.history || []).map(h => ({ quarterEnd: h.quarter?.fmt || null, epsEstimate: raw(h.epsEstimate), epsActual: raw(h.epsActual) })),
  };
}

async function snapshot() {
  const c = consensusFrom(await quoteSummary(), today);
  mkdir(SNAPSHOTS);
  const file = path.join(SNAPSHOTS, `${today}.json`);
  fs.writeFileSync(file, JSON.stringify(c, null, 2));
  console.log(`${ticker} consensus snapshot ${today} → ${path.relative(ROOT, file)}`);
  for (const t of c.trend) console.log(`  ${t.period} ${t.endDate} EPS ${t.eps.avg ?? "—"} (${t.eps.analysts ?? "?"}) · revenue ${t.revenue.avg ?? "—"} (${t.revenue.analysts ?? "?"})`);
}

// Fiscal labels from the company's fiscal-year end ("1231", "0927"…). 52/53-week years end a few days off the month end.
function fiscalLabeler(fyEnd) {
  const endMonth = Number(fyEnd.slice(0, 2));
  return end => {
    const d = new Date(end + "T00:00:00Z");
    if (d.getUTCDate() < 15) d.setUTCDate(0); // e.g. 2026-01-03 belongs to December
    const m = d.getUTCMonth() + 1, y = d.getUTCFullYear(), k = (m - endMonth + 12) % 12;
    if (k % 3) return null;
    const q = k === 0 ? 4 : k / 3;
    return `${m > endMonth ? y + 1 : y}-Q${q}`;
  };
}

// XBRL duration facts → discrete fiscal quarters. Income items are reported per quarter (Q4 = year − 9 months);
// cash-flow items are year-to-date, so each quarter is its YTD minus the previous YTD with the same start.
function quarterly(facts, concepts, label, { ytd = false, additive = true } = {}) {
  for (const concept of concepts) {
    const units = facts["us-gaap"]?.[concept]?.units;
    const rows = units && (units.USD || units["USD/shares"]);
    if (!rows) continue;
    const latest = new Map();
    for (const f of rows) {
      if (!f.start || !/^10-[QK]/.test(f.form)) continue;
      const key = `${f.start}|${f.end}`, prev = latest.get(key);
      if (!prev || f.filed > prev.filed) latest.set(key, f);
    }
    const all = [...latest.values()], out = new Map();
    const put = (end, value, how, f, from) => {
      const p = label(end);
      if (p && !out.has(p)) out.set(p, { period: p, end, value, how, form: f.form, accn: f.accn, filed: f.filed, ...(from ? { from } : {}) });
    };
    for (const f of all) {
      const len = days(f.start, f.end);
      if (len >= 80 && len <= 100) put(f.end, f.val, ytd ? "YTD 1분기 그대로" : "분기 원값", f);
    }
    for (const f of all) {
      const len = days(f.start, f.end);
      if (len < 170 || !additive) continue; // per-share values do not subtract: Q4 EPS ≠ year − 9 months
      // Previous cumulative with the same start, about one quarter shorter.
      const prev = all.find(g => g.start === f.start && days(g.end, f.end) >= 80 && days(g.end, f.end) <= 100);
      if (prev && !out.has(label(f.end))) put(f.end, f.val - prev.val, `${len > 300 ? "연간" : "누적"} − 직전 누적`, f, { cumulative: f.val, previous: prev.val, previousEnd: prev.end });
    }
    if (out.size) return { concept, quarters: [...out.values()].sort((a, b) => a.end.localeCompare(b.end)) };
  }
  return { concept: null, quarters: [] };
}

const BALANCE = [
  ["cash", ["CashAndCashEquivalentsAtCarryingValue", "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents"]],
  ["investments", ["ShortTermInvestments", "MarketableSecuritiesCurrent", "AvailableForSaleSecuritiesDebtSecuritiesCurrent"]],
  ["debt", ["LongTermDebt", "LongTermDebtCurrent", "LongTermDebtNoncurrent", "ConvertibleNotesPayable", "ConvertibleDebtNoncurrent", "ShortTermBorrowings", "DebtCurrent"]],
  ["lease", ["OperatingLeaseLiability", "FinanceLeaseLiability", "OperatingLeaseLiabilityCurrent", "OperatingLeaseLiabilityNoncurrent"]],
  ["nci", ["MinorityInterest"]],
];

function htmlText(html) {
  const ent = s => s.replace(/&nbsp;|&#160;|&#xa0;/gi, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#8217;|&rsquo;/g, "'").replace(/&#8220;|&#8221;/g, '"').replace(/&#822[01];/g, '"').replace(/&#8212;/g, "—").replace(/&#\d+;/g, " ");
  return ent(html
    .replace(/<(style|script)[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<tr[^>]*>([\s\S]*?)<\/tr>/gi, (_, row) => "\n" + row.replace(/<\/t[dh]>/gi, " | ").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim().replace(/(\|\s*)+$/, ""))
    .replace(/<\/(p|div|h\d|li|table)>|<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, ""))
    .split("\n").map(l => l.replace(/[ \t]+/g, " ").replace(/^(\|\s*)+/, "").trim()).filter(l => l && !/^(\|\s*)+$/.test(l)).join("\n");
}

async function collect() {
  const [fy, fq] = [Number(period.slice(0, 4)), Number(period.slice(-1))];
  const quarterCount = Number(arg("quarters", 8));
  const out = path.resolve(arg("out", path.join(ROOT, ".tmp", "earnings", `us-${ticker}-${period}`)));
  mkdir(out);
  const gaps = [];
  const save = (name, data) => { const p = path.join(out, name); mkdir(path.dirname(p)); fs.writeFileSync(p, typeof data === "string" ? data : JSON.stringify(data, null, 2)); return p; };

  // 1. CIK, fiscal calendar, filings.
  const tickers = JSON.parse((await sec("https://www.sec.gov/files/company_tickers.json")).body);
  const hit = Object.values(tickers).find(t => t.ticker === ticker);
  if (!hit) throw new Error(`${ticker} not in SEC company_tickers.json`);
  const cik = String(hit.cik_str).padStart(10, "0"), cikNum = String(hit.cik_str);
  const sub = JSON.parse((await sec(`https://data.sec.gov/submissions/CIK${cik}.json`)).body);
  const label = fiscalLabeler(sub.fiscalYearEnd || "1231");
  const r = sub.filings.recent;
  const filings = r.form.map((form, i) => ({ form, filingDate: r.filingDate[i], acceptance: r.acceptanceDateTime[i], reportDate: r.reportDate[i], items: r.items[i], accn: r.accessionNumber[i], primary: r.primaryDocument[i] }))
    .filter(f => /^(8-K|10-Q|10-K)(\/A)?$/.test(f.form));
  const docUrl = f => `https://www.sec.gov/Archives/edgar/data/${cikNum}/${f.accn.replace(/-/g, "")}/${f.primary}`;
  filings.forEach(f => { f.url = docUrl(f); f.fiscalPeriod = /^10-/.test(f.form) && f.reportDate ? label(f.reportDate) : null; });
  save("filings.json", { company: sub.name, cik, fiscalYearEnd: sub.fiscalYearEnd, filings });
  console.log(`${sub.name} (${ticker}) CIK ${cik} · FY end ${sub.fiscalYearEnd} · ${period} → ${path.relative(ROOT, out)}`);

  // 2. XBRL quarterly facts.
  const facts = JSON.parse((await sec(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`)).body).facts;
  const series = {
    revenue: quarterly(facts, ["Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax", "RevenuesNetOfInterestExpense", "SalesRevenueNet"], label),
    operatingIncome: quarterly(facts, ["OperatingIncomeLoss"], label),
    netIncome: quarterly(facts, ["NetIncomeLoss", "ProfitLoss"], label),
    epsDiluted: quarterly(facts, ["EarningsPerShareDiluted"], label, { additive: false }),
    operatingCashFlow: quarterly(facts, ["NetCashProvidedByUsedInOperatingActivities", "NetCashProvidedByUsedInOperatingActivitiesContinuingOperations"], label, { ytd: true }),
  };
  // Capex is the sum of every acquisition line the issuer uses; each line is reported with its own concept.
  const capexParts = ["PaymentsToAcquirePropertyPlantAndEquipment", "PaymentsToDevelopSoftware", "PaymentsToAcquireIntangibleAssets", "PaymentsToAcquireProductiveAssets"]
    .map(c => quarterly(facts, [c], label, { ytd: true })).filter(s => s.quarters.length);
  const periods = [...new Set(capexParts.flatMap(s => s.quarters.map(q => q.period)))].sort();
  series.capex = { concept: capexParts.map(s => s.concept).join(" + ") || null, quarters: periods.map(p => {
    const parts = capexParts.map(s => s.quarters.find(q => q.period === p));
    // A line missing in one quarter is treated as zero only when the issuer reported it in other quarters; record which.
    const latest = parts.filter(Boolean).sort((a, b) => b.filed.localeCompare(a.filed))[0];
    return { period: p, end: latest.end, value: parts.reduce((a, q) => a + (q ? q.value : 0), 0), how: "취득 항목 합", parts: capexParts.map((s, i) => ({ concept: s.concept, value: parts[i]?.value ?? null })), form: latest.form, accn: latest.accn, filed: latest.filed };
  }) };
  const wanted = []; for (let i = quarterCount - 1; i >= 0; i--) { const n = fy * 4 + fq - 1 - i; wanted.push(`${Math.floor(n / 4)}-Q${n % 4 + 1}`); }
  const table = Object.fromEntries(Object.entries(series).map(([k, s]) => [k, { concept: s.concept, unit: k === "epsDiluted" ? "USD/share" : "백만 달러",
    quarters: wanted.map(p => { const q = s.quarters.find(x => x.period === p); return q ? { ...q, value: k === "epsDiluted" ? Math.round(q.value * 1e4) / 1e4 : musd(q.value), ...(q.parts ? { parts: q.parts.map(x => ({ ...x, value: musd(x.value) })) } : {}), ...(q.cumulative !== undefined ? { cumulative: musd(q.cumulative), previous: musd(q.previous) } : {}), url: docUrl(filings.find(f => f.accn === q.accn) || { accn: q.accn, primary: "" }) } : { period: p, value: null, reason: "XBRL 분기값 없음" }; }) }]));
  save("facts.json", { method: "SEC companyfacts. 손익: 3개월 값, 없으면 누적 − 직전 누적(4분기 = 연간 − 9개월). 현금흐름: YTD 차감. 같은 기간 값은 가장 최근 제출본(재작성 반영).", ...table });
  for (const [k, s] of Object.entries(table)) { const miss = s.quarters.filter(q => q.value === null).map(q => q.period); if (miss.length) gaps.push(`XBRL ${k}: ${miss.join(", ")} 없음${k === "capex" && !s.concept ? " (취득 항목 태그 없음)" : ""}`); }

  // 3. Review-quarter release: the first 8-K with Item 2.02 filed after the quarter end.
  const quarterEnd = table.revenue.quarters.at(-1)?.end || filings.find(f => f.fiscalPeriod === period)?.reportDate || null;
  const tenQ = filings.find(f => f.fiscalPeriod === period && /^10-[QK]/.test(f.form));
  const approxEnd = quarterEnd || tenQ?.reportDate;
  const release = filings.filter(f => f.form === "8-K" && /2\.02/.test(f.items || "") && (!approxEnd || (f.filingDate > approxEnd && days(approxEnd, f.filingDate) <= 100)))
    .sort((a, b) => a.filingDate.localeCompare(b.filingDate))[0] || null;
  let releaseText = null;
  if (release) {
    try {
      const base = `https://www.sec.gov/Archives/edgar/data/${cikNum}/${release.accn.replace(/-/g, "")}/`;
      // Exhibit file names are free-form (Circle: finalq3epr-110326.htm), so read the document type from the filing index.
      const index = (await sec(`${base}${release.accn}-index.htm`)).body;
      const exhibits = [...index.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map(m => m[1]).filter(row => /<td[^>]*>\s*EX-99/i.test(row))
        .map(row => row.match(/href="([^"]+\.html?)"/i)?.[1]).filter(Boolean).map(h => h.replace(/^.*\//, "").replace(/^ix\?doc=/, ""));
      const docs = exhibits.length ? exhibits : [release.primary];
      if (!exhibits.length) gaps.push(`8-K ${release.accn}: EX-99 첨부 없음 — 본문만 저장`);
      const parts = [];
      for (const name of docs) { const h = await sec(base + name); parts.push(`--- ${name} · ${base + name}\n\n${htmlText(h.body)}`); release.exhibits = [...(release.exhibits || []), base + name]; }
      releaseText = `${sub.name} 8-K Item 2.02 · 제출 ${release.filingDate} · 접수 ${release.acceptance} · ${release.url}\n\n${parts.join("\n\n")}`;
      save(`release/${release.accn}.txt`, releaseText);
    } catch (e) { gaps.push(`보도자료 원문 ${release.accn}: ${e.message}`); }
  } else gaps.push(`${period} 실적 8-K(Item 2.02) 없음 — 아직 발표 전이거나 회사가 8-K 없이 발표`);
  const releaseDate = release?.filingDate || null;

  // 4. Balance rows at the latest instant, plus share-count candidates.
  const instants = BALANCE.flatMap(([kind, concepts]) => concepts.map(c => {
    const rows = facts["us-gaap"]?.[c]?.units?.USD?.filter(f => !f.start && /^10-[QK]/.test(f.form)) || [];
    const f = rows.sort((a, b) => b.end.localeCompare(a.end) || b.filed.localeCompare(a.filed))[0];
    return f && { kind, concept: c, end: f.end, value: musd(f.val), accn: f.accn, filed: f.filed, form: f.form };
  }).filter(Boolean));
  const asOf = instants.map(x => x.end).sort().at(-1) || null;
  const rows = instants.filter(x => x.end === asOf);
  save("balance.json", { asOf, unit: "백만 달러", rows, stale: instants.filter(x => x.end !== asOf),
    warning: "합계·세부 태그가 함께 잡힐 수 있다(예: LongTermDebt와 Current/Noncurrent, OperatingLeaseLiability와 Current/Noncurrent). 중복을 지운 뒤 순차입금 = 차입·리스 − 현금 − 단기투자를 직접 합산한다. 고객 예치금·준비자산처럼 영업 자산인 현금은 빼지 않는다." });
  const dei = facts.dei?.EntityCommonStockSharesOutstanding?.units?.shares || [];
  const coverDate = dei.map(f => f.end).sort().at(-1);
  const diluted = quarterly(facts, ["WeightedAverageNumberOfDilutedSharesOutstanding"], label).quarters.at(-1) || null;

  // 5. Yahoo consensus, analyst actions, prices.
  let qs = null;
  try { qs = await quoteSummary(); } catch (e) { gaps.push(`Yahoo quoteSummary: ${e.message}`); }
  const consensus = qs ? consensusFrom(qs, today) : null;
  // The first trading session that can react: Yahoo's event time when it is this release, in New York time.
  // EDGAR's acceptance time is printed with "Z" but is Eastern time, and the 8-K often follows the wire release by hours.
  const etHour = iso => { const [h, m] = new Intl.DateTimeFormat("en-GB", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso)).split(":").map(Number); return h + m / 60; };
  const event = consensus?.nextEarnings.at && consensus.nextEarnings.at.slice(0, 10) === releaseDate ? consensus.nextEarnings.at : null;
  const timing = !release ? null : event ? (etHour(event) < 9.5 ? "장 전 발표 (당일 반응)" : etHour(event) >= 16 ? "장 마감 후 발표 (다음 거래일 반응)" : "장중 발표") + ` · Yahoo 이벤트 ${event}` : `발표 시각 미확인 · EDGAR 접수 ${release.acceptance.slice(11, 16)} 동부시간 표기`;
  if (release) release.timing = timing;
  const snapshots = fs.existsSync(SNAPSHOTS) ? fs.readdirSync(SNAPSHOTS).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().map(f => JSON.parse(fs.readFileSync(path.join(SNAPSHOTS, f), "utf8"))) : [];
  // Pre-release observations for the review quarter: snapshots taken before the release day, then Yahoo's relative EPS trend.
  const preRelease = [];
  if (quarterEnd) {
    for (const s of snapshots) {
      const t = s.trend.find(x => x.endDate === quarterEnd && /q$/.test(x.period));
      if (t && (!releaseDate || s.retrievedAt < releaseDate)) preRelease.push({ observedAt: s.retrievedAt, kind: "snapshot", eps: t.eps.avg, revenue: t.revenue.avg, analysts: { eps: t.eps.analysts, revenue: t.revenue.analysts }, file: path.relative(ROOT, path.join(SNAPSHOTS, `${s.retrievedAt}.json`)) });
    }
    const t = consensus?.trend.find(x => x.endDate === quarterEnd && /q$/.test(x.period));
    if (t) for (const p of t.epsTrend) if (!releaseDate || p.observedAt < releaseDate) preRelease.push({ observedAt: p.observedAt, kind: `yahoo-epsTrend-${p.daysAgo}d`, eps: p.value, revenue: null, approximate: true });
    if (t && t.revenue.avg !== null) preRelease.push({ observedAt: today, kind: "yahoo-current-quarter", eps: t.eps.avg, revenue: t.revenue.avg, note: releaseDate && today >= releaseDate ? "발표 후 조회값: 발표 전 예상으로 쓰려면 같은 값의 발표 전 관측(스냅샷·기사)이 필요" : "발표 전 조회" });
    if (!t) gaps.push(`Yahoo 0q가 ${quarterEnd} 분기가 아님 — 이미 다음 분기로 넘어감. 발표 전 스냅샷·기사·증권사 자료에서 예상치를 찾아야 함`);
  }
  if (consensus) save("consensus.json", { ...consensus, reviewQuarterEnd: quarterEnd, releaseDate, releaseTiming: timing, preRelease, snapshotsUsed: snapshots.length });

  const actions = (qs?.upgradeDowngradeHistory?.history || []).map(h => ({ date: new Date(h.epochGradeDate * 1000).toISOString().slice(0, 10), firm: h.firm, action: h.action, fromGrade: h.fromGrade || null, toGrade: h.toGrade || null, priorTarget: h.priorPriceTarget || null, target: h.currentPriceTarget || null, targetAction: h.priceTargetAction || null }))
    .filter(a => !quarterEnd || a.date >= addDays(quarterEnd, -30));
  const post = releaseDate ? actions.filter(a => a.date >= releaseDate) : [];
  const fd = qs?.financialData || {};
  const analysts = { retrievedAt: today, source: `https://finance.yahoo.com/quote/${ticker}/analysis/`, releaseDate,
    current: { price: raw(fd.currentPrice), targetMean: raw(fd.targetMeanPrice), targetMedian: raw(fd.targetMedianPrice), targetLow: raw(fd.targetLowPrice), targetHigh: raw(fd.targetHighPrice), analysts: raw(fd.numberOfAnalystOpinions), recommendation: fd.recommendationKey || null },
    postRelease: { count: post.length, raised: post.filter(a => a.target && a.priorTarget && a.target > a.priorTarget).length, lowered: post.filter(a => a.target && a.priorTarget && a.target < a.priorTarget).length, upgrades: post.filter(a => a.action === "up").length, downgrades: post.filter(a => a.action === "down").length },
    actions };
  save("analysts.json", analysts);

  const shares = { cover: coverDate ? { asOf: coverDate, value: dei.filter(f => f.end === coverDate).reduce((a, f) => a + f.val, 0), classes: dei.filter(f => f.end === coverDate).length, accn: dei.find(f => f.end === coverDate).accn } : null,
    dilutedWeighted: diluted && { period: diluted.period, value: diluted.value, accn: diluted.accn, filed: diluted.filed },
    yahoo: qs ? { sharesOutstanding: raw(qs.defaultKeyStatistics?.sharesOutstanding), impliedSharesOutstanding: raw(qs.defaultKeyStatistics?.impliedSharesOutstanding), retrievedAt: today } : null,
    note: "목표가 주식 수는 최근 10-Q 표지의 클래스 합계(전 클래스)가 기준. 표지 값이 XBRL에 없으면 10-Q 표지를 직접 읽는다. 희석 가중평균은 EPS 검산용." };
  save("shares.json", shares);

  let prices = null;
  try {
    const from = Math.floor(Date.UTC(fy, fq * 3 - 7, 1) / 1000), to = Math.floor(Date.now() / 1000) + 86400;
    const j = await yahoo(`/v8/finance/chart/${ticker}?period1=${from}&period2=${to}&interval=1d`);
    const c = j.chart.result[0], q = c.indicators.quote[0];
    const tz = c.meta.exchangeTimezoneName || "America/New_York";
    const day = ts => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ts * 1000));
    prices = { source: `https://finance.yahoo.com/quote/${ticker}/history/`, currency: c.meta.currency, rows: c.timestamp.map((ts, i) => ({ date: day(ts), open: q.open[i], high: q.high[i], low: q.low[i], close: q.close[i], volume: q.volume[i] })).filter(x => x.close !== null) };
    save("prices.json", prices);
  } catch (e) { gaps.push(`Yahoo 시세: ${e.message}`); }

  // Readiness pre-check: what exists. The author still judges whether it is enough (SKILL.md §2).
  const prevQuarter = wanted.at(-2);
  const lastClose = prices?.rows.at(-1) || null;
  const next = consensus?.trend.find(t => t.period === "+1y"), cur = consensus?.trend.find(t => t.period === "0y");
  const R = [
    ["R1", "이번 분기 실적 보도자료 원문 (8-K Item 2.02)", releaseText ? "있음" : "없음", release ? `${release.filingDate} ${release.accn} · ${timing}` : "—"],
    ["R2", "발표 전 컨센서스 관측점 (날짜 있음)", preRelease.some(p => p.kind !== "yahoo-current-quarter") ? "있음" : "없음", preRelease.filter(p => p.kind !== "yahoo-current-quarter").map(p => `${p.observedAt} ${p.kind} EPS ${p.eps ?? "—"}${p.revenue !== null ? ` 매출 ${p.revenue}` : ""}`).join(" · ") || "스냅샷 없음, Yahoo 추세도 대상 분기 아님"],
    ["R3", "실적 차이 원인 근거 (보도자료·콜·발표 후 리뷰)", releaseText ? "확인 필요" : "없음", "보도자료는 수집됨. 콜 원문·발표 후 리뷰는 직접 찾는다"],
    ["R4", "전망 변화 근거: 발표 후 증권사 2건 이상", post.length >= 2 ? "있음" : "없음", releaseDate ? `발표 후 ${post.length}건 (목표가 상향 ${analysts.postRelease.raised} · 하향 ${analysts.postRelease.lowered})` : "발표일 미확인"],
    ["R5", "가격 축: 종가·주식 수·순차입금·다음 해 EPS 컨센서스", lastClose && (shares.cover || shares.yahoo?.impliedSharesOutstanding) && rows.length && next?.eps.avg != null ? "있음" : "없음", `종가 ${lastClose ? `${lastClose.date} $${lastClose.close.toFixed(2)}` : "—"} · 주식 수 ${shares.cover?.value ?? shares.yahoo?.impliedSharesOutstanding ?? "—"} · 재무상태표 ${asOf || "—"} · ${next ? `${next.endDate.slice(0, 4)} EPS ${next.eps.avg}` : "+1y 없음"}`],
    ["R6", "직전 분기까지 분기 현금흐름", table.operatingCashFlow.quarters.find(q => q.period === prevQuarter)?.value != null ? "있음" : "없음", `${prevQuarter} OCF ${table.operatingCashFlow.quarters.find(q => q.period === prevQuarter)?.value ?? "—"}`],
  ];

  const L = [`# ${sub.name} (${ticker}) ${period} 실적 리뷰 입력 자료`, "", `수집일 ${today} · CIK ${cik} · 회계연도 말 ${sub.fiscalYearEnd} · 출력 ${path.relative(ROOT, out)}`, ""];
  L.push("## 준비도 사전 점검", "", "자료 존재 여부만 본다. 충분한지는 작성자가 SKILL.md §2 기준으로 판정한다.", "", "| # | 항목 | 상태 | 내용 |", "| --- | --- | --- | --- |", ...R.map(x => `| ${x.join(" | ")} |`), "");
  L.push(`## 분기 실적 (XBRL, 백만 달러 · EPS는 달러)`, "", `| 지표 | ${wanted.join(" | ")} |`, `| --- |${wanted.map(() => " ---: |").join("")}`,
    ...Object.entries(table).map(([k, s]) => `| ${k}${s.concept ? ` <small>${s.concept}</small>` : ""} | ${s.quarters.map(q => q.value ?? "—").join(" | ")} |`), "");
  L.push(`## 재무상태표 (${asOf || "—"}, 백만 달러)`, "", "| 구분 | 태그 | 값 |", "| --- | --- | ---: |", ...rows.map(x => `| ${x.kind} | ${x.concept} | ${x.value} |`), "");
  if (consensus) {
    L.push(`## 컨센서스 (Yahoo, ${today} 조회)`, "", "| 기간 | 종료 | EPS 평균 (n) | 매출 평균 (n) | EPS 추세 |", "| --- | --- | ---: | ---: | --- |",
      ...consensus.trend.map(t => `| ${t.period} | ${t.endDate} | ${t.eps.avg ?? "—"} (${t.eps.analysts ?? "?"}) | ${t.revenue.avg ?? "—"} (${t.revenue.analysts ?? "?"}) | ${t.epsTrend.map(p => `${p.observedAt} ${p.value.toFixed(3)}`).join(" · ")} |`), "");
    if (cur) L.push(`0y 수정 수(상향/하향): 7일 ${cur.revisions.upLast7days ?? 0}/${cur.revisions.downLast7Days ?? 0} · 30일 ${cur.revisions.upLast30days ?? 0}/${cur.revisions.downLast30days ?? 0}`, "");
  }
  L.push("## 투자의견·목표가 변경 (Yahoo)", "", `현재 목표가 평균 ${analysts.current.targetMean ?? "—"} · 중앙값 ${analysts.current.targetMedian ?? "—"} · 범위 ${analysts.current.targetLow ?? "—"}~${analysts.current.targetHigh ?? "—"} · ${analysts.current.analysts ?? "?"}명`, "",
    "| 날짜 | 증권사 | 의견 | 목표가 |", "| --- | --- | --- | --- |", ...actions.slice(0, 20).map(a => `| ${a.date}${releaseDate && a.date >= releaseDate ? " · 발표 후" : ""} | ${a.firm} | ${a.fromGrade && a.fromGrade !== a.toGrade ? `${a.fromGrade} → ` : ""}${a.toGrade || ""} | ${a.priorTarget ? `${a.priorTarget} → ` : ""}${a.target ?? ""} |`), "");
  if (prices) {
    const around = releaseDate ? prices.rows.filter(x => x.date >= addDays(releaseDate, -3) && x.date <= addDays(releaseDate, 5)) : [];
    L.push("## 발표 전후 종가", "", ...(around.length ? ["| 날짜 | 종가 |", "| --- | ---: |", ...around.map(x => `| ${x.date} | ${x.close.toFixed(2)} |`)] : ["- 발표일 미확인"]), "");
  }
  L.push("## 빈 자료", "", ...(gaps.length ? gaps.map(g => `- ${g}`) : ["- 없음"]), "");
  save("SUMMARY.md", L.join("\n"));
  save("readiness.json", R.map(([id, item, status, detail]) => ({ id, item, status, detail })));
  console.log(L.join("\n"));
}

(mode === "snapshot" ? snapshot() : collect()).catch(e => { console.error(e.stack || e.message); process.exit(1); });
