#!/usr/bin/env node
'use strict';

// Collect annual cash dividend-per-share for a universe from OpenDART
// (alotMatter, 배당에 관한 사항). Used to convert the split-only marcap price
// cache into a dividend-inclusive total-return series (the largest gap between
// the split-only ~8% CAGR diagnostic and a true total return).
//
// OpenDART REQUIRES a User-Agent header (otherwise 302 -> error1.html).
// Each alotMatter call returns three business years (thstrm/frmtrm/lwfr), so we
// only query every third year to cover a range with ~1/3 the calls. Responses
// are cached per (corp,year) so re-runs are cheap and resumable.
//
// Ex-date approximation: Korean annual dividends record at fiscal year-end;
// this tool tags each dividend to the business year and leaves ex-date handling
// (default = last session of the year) to the total-return builder. Interim/
// quarterly dividends are NOT captured here (annual reprt_code 11011 only) — a
// stated limitation; names paying large interim dividends (e.g. current Samsung)
// are slightly understated.

const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const read = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const sleep = ms => new Promise(r => setTimeout(r, ms));

function loadCorpMap(corpXmlPath) {
  const xml = fs.readFileSync(corpXmlPath, 'utf8');
  const map = new Map();
  const re = /<corp_code>(\d+)<\/corp_code>\s*<corp_name>([^<]*)<\/corp_name>\s*<corp_eng_name>[^<]*<\/corp_eng_name>\s*<stock_code>\s*(\d{6})\s*<\/stock_code>/g;
  let m; while ((m = re.exec(xml))) map.set(m[3], { corp: m[1], name: m[2] });
  return map;
}
function httpsJson(url) {
  return new Promise((res, rej) => {
    const u = new URL(url);
    https.get({ hostname: u.hostname, path: u.pathname + u.search, headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' } }, r => {
      let d = ''; r.on('data', c => d += c); r.on('end', () => { try { res(JSON.parse(d)); } catch { res(null); } });
    }).on('error', () => res(null));
  });
}
const num = v => { const n = Number(String(v == null ? '' : v).replace(/[,\s]/g, '')); return Number.isFinite(n) ? n : null; };
// Extract common-share cash dividend-per-share for thstrm/frmtrm/lwfr.
function extractDividends(list) {
  const row = (list || []).find(r => /주당.*현금.*배당금/.test(r.se || '') && (r.stock_knd === '보통주' || r.stock_knd === '-' || !r.stock_knd));
  if (!row) return null;
  return { thstrm: num(row.thstrm), frmtrm: num(row.frmtrm), lwfr: num(row.lwfr) };
}

async function main() {
  const key = (process.env.OPENDART_API_KEY || '').trim();
  if (key.length < 20) throw new Error('OPENDART_API_KEY missing/short; source .env first');
  const universeFile = arg('--universe-file', path.join(ROOT, 'analysis-example/kr-market/strategies/annual-top300/universe-ledger-2015-2025.json'));
  const corpXml = arg('--corpcode', path.join(ROOT, '.tmp/opendart-cache/CORPCODE.xml'));
  const cacheDir = arg('--cache-dir', path.join(ROOT, '.tmp/kr-strategy-backtest/dart-dividends'));
  const out = arg('--out', path.join(ROOT, 'analysis-example/kr-market/strategies/annual-top300/dividends-annual.json'));
  const minYear = Number(arg('--min-year', '2014')), maxYear = Number(arg('--max-year', '2025'));
  const delayMs = Number(arg('--delay-ms', '160'));
  fs.mkdirSync(cacheDir, { recursive: true });

  const corpMap = loadCorpMap(corpXml);
  const uni = read(universeFile);
  const tickers = [...new Set((uni.snapshots || []).flatMap(s => (s.constituents || []).map(c => c.ticker)))];
  // Query years spaced by 3 (each call yields that year + 2 prior).
  const queryYears = []; for (let y = maxYear; y >= minYear + 0; y -= 3) queryYears.push(y);

  const dividends = {}; let calls = 0, hits = 0, missing = 0, unresolved = 0;
  for (let ti = 0; ti < tickers.length; ti++) {
    const tk = tickers[ti]; const c = corpMap.get(tk);
    if (!c) { unresolved++; continue; }
    dividends[tk] = dividends[tk] || {};
    for (const qy of queryYears) {
      const cacheFile = path.join(cacheDir, `${c.corp}-${qy}.json`);
      let j;
      if (fs.existsSync(cacheFile)) j = read(cacheFile);
      else {
        j = await httpsJson(`https://opendart.fss.or.kr/api/alotMatter.json?crtfc_key=${key}&corp_code=${c.corp}&bsns_year=${qy}&reprt_code=11011`);
        calls++; if (j) fs.writeFileSync(cacheFile, JSON.stringify(j)); await sleep(delayMs);
      }
      if (!j || j.status !== '000') { missing++; continue; }
      const d = extractDividends(j.list); if (!d) continue;
      const assign = (yr, val) => { if (yr >= minYear && yr <= maxYear && val != null) { dividends[tk][yr] = val; hits++; } };
      assign(qy, d.thstrm); assign(qy - 1, d.frmtrm); assign(qy - 2, d.lwfr);
    }
    if ((ti + 1) % 50 === 0) console.error(`  ${ti + 1}/${tickers.length} tickers | calls ${calls} | dividend-year hits ${hits}`);
  }
  const payload = { generatedAt: new Date().toISOString(), source: 'OpenDART alotMatter (annual reprt_code 11011); common-share cash dividend-per-share; interim/quarterly not captured', universeFile, minYear, maxYear, queryYears, tickerCount: tickers.length, unresolvedCorpCode: unresolved, apiCalls: calls, missingReports: missing, dividendYearHits: hits, dividends };
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(payload, null, 2) + '\n');
  console.log(JSON.stringify({ out, tickers: tickers.length, unresolved, apiCalls: calls, dividendYearHits: hits, missingReports: missing, sample: Object.fromEntries(Object.entries(dividends).slice(0, 3)) }, null, 2));
}
main();
