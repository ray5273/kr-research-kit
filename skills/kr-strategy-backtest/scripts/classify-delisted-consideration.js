#!/usr/bin/env node
'use strict';

// Hybrid A2 step: classify each in-sample delisted/terminated name by its
// OpenDART disclosures around the termination date, to separate the cases where
// the backtest's "carry last close then sell" assumption is roughly fair from
// the cases where it materially overstates.
//
//   MERGER / SHARE_EXCHANGE / HOLDCO / GOING_PRIVATE(tender)
//        -> shareholder received successor shares or cash near market value;
//           carry ~ deal value; NO hybrid correction needed.
//   BANKRUPTCY / LIQUIDATION / FORCED_DELISTING (파산/회생폐지/정리매매/실질심사)
//        -> value went to ~0; carry-at-last-close OVERSTATES; consideration ~ 0.
//           THESE are the survivorship corrections that matter.
//
// Exact merger exchange ratios (for a strict official ledger) still need manual
// document reading; this tool produces the classification + disclosure refs and
// flags the total-loss subset with an assumed consideration of ~0.

const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const read = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const sleep = ms => new Promise(r => setTimeout(r, ms));

function loadCorpMap(p) {
  const xml = fs.readFileSync(p, 'utf8'); const map = new Map();
  const re = /<corp_code>(\d+)<\/corp_code>\s*<corp_name>([^<]*)<\/corp_name>\s*<corp_eng_name>[^<]*<\/corp_eng_name>\s*<stock_code>\s*(\d{6})\s*<\/stock_code>/g;
  let m; while ((m = re.exec(xml))) map.set(m[3], { corp: m[1], name: m[2] });
  return map;
}
function getJson(url) {
  return new Promise(res => { const u = new URL(url); https.get({ hostname: u.hostname, path: u.pathname + u.search, headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' } }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => { try { res(JSON.parse(d)); } catch { res(null); } }); }).on('error', () => res(null)); });
}
const shift = (yyyymmdd, months) => { const y = +yyyymmdd.slice(0, 4), m = +yyyymmdd.slice(4, 6); const t = (y * 12 + (m - 1)) + months; return `${Math.floor(t / 12)}${String((t % 12) + 1).padStart(2, '0')}01`; };

// Classify from disclosure titles. Merger/succession signals win over a bare
// "상장폐지" (a holdco transfer also files a delisting notice).
function classify(titles) {
  const t = titles.join(' | ');
  if (/합병|주식교환|주식의\s*포괄적|주식이전|피흡수|지주회사|분할/.test(t)) return 'MERGER_OR_SUCCESSION';
  if (/파산|회생절차\s*폐지|정리매매|상장폐지\s*실질심사|감사의견\s*(거절|부적정)|자본전액잠식|부도|해산/.test(t)) return 'BANKRUPTCY_TOTAL_LOSS';
  if (/공개매수|자진\s*상장폐지|상장폐지\s*신청/.test(t)) return 'GOING_PRIVATE_TENDER';
  if (/상장폐지|매매거래정지/.test(t)) return 'DELISTING_UNSPECIFIED';
  return 'UNKNOWN';
}

async function main() {
  const key = (process.env.OPENDART_API_KEY || '').trim();
  if (key.length < 20) throw new Error('OPENDART_API_KEY missing/short; source .env first');
  const input = arg('--input', path.join(ROOT, 'analysis-example/kr-market/strategies/official-total-return/delisted-candidates-cap300b.json'));
  const corpXml = arg('--corpcode', path.join(ROOT, '.tmp/opendart-cache/CORPCODE.xml'));
  const out = arg('--out', path.join(ROOT, 'analysis-example/kr-market/strategies/official-total-return/delisted-consideration-classified.json'));
  const delayMs = Number(arg('--delay-ms', '200'));
  const corpMap = loadCorpMap(corpXml);
  const names = read(input).cap300b || read(input);

  const results = [];
  for (const rec of names) {
    const c = corpMap.get(rec.ticker);
    if (!c) { results.push({ ...rec, classification: 'NO_CORP_CODE' }); continue; }
    const end = rec.lastDate.replace(/-/g, ''), bgn = shift(end, -4);
    const j = await getJson(`https://opendart.fss.or.kr/api/list.json?crtfc_key=${key}&corp_code=${c.corp}&bgn_de=${bgn}&end_de=${end}&page_count=100`);
    await sleep(delayMs);
    const rows = (j && j.list) || [];
    const relevant = rows.filter(r => /합병|분할|상장폐지|정리매매|주식교환|주식의\s*포괄적|주식이전|공개매수|파산|회생|감자|매매거래정지|해산|부도|감사의견/.test(r.report_nm || ''));
    const cls = classify(relevant.map(r => r.report_nm));
    results.push({ ticker: rec.ticker, name: rec.name, lastDate: rec.lastDate, classification: cls, assumedConsideration: cls === 'BANKRUPTCY_TOTAL_LOSS' ? 0 : null, keyDisclosures: relevant.slice(0, 5).map(r => ({ date: r.rcept_dt, title: r.report_nm, rcept_no: r.rcept_no })) });
  }

  const counts = {}; for (const r of results) counts[r.classification] = (counts[r.classification] || 0) + 1;
  const totalLoss = results.filter(r => r.classification === 'BANKRUPTCY_TOTAL_LOSS');
  const payload = { generatedAt: new Date().toISOString(), source: 'OpenDART list.json disclosure-title classification around termination date', input, counts, totalLossTickers: totalLoss.map(r => r.ticker), note: 'BANKRUPTCY_TOTAL_LOSS => consideration ~0 (carry-at-last-close overstates). MERGER/GOING_PRIVATE => carry ~ deal value, no hybrid correction. UNSPECIFIED/UNKNOWN need manual review. Exact merger exchange ratios still require document reading for a strict official ledger.', results };
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(payload, null, 2) + '\n');
  console.log(JSON.stringify({ out, counts, totalLossCount: totalLoss.length, totalLoss: totalLoss.map(r => `${r.ticker} ${r.name}`) }, null, 2));
}
main();
