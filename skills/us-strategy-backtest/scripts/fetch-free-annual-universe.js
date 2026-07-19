#!/usr/bin/env node
'use strict';

// Fetch only the missing free-data cache needed by the annual-ranking proxy.
// The ranking CSV itself is the universe authority; Yahoo/SEC never decide membership.
const fs = require('fs');
const path = require('path');
const https = require('https');
const arg = name => { const i = process.argv.indexOf(name); return i < 0 ? null : process.argv[i + 1]; };
const die = message => { throw new Error(message); };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
function csv(text) { return text.trim().split(/\r?\n/).slice(1).map(line => { const x = line.split(','); return { year: x[0], rank: +x[1], ticker: x[2] }; }); }
function get(url, headers = {}) { return new Promise((resolve, reject) => https.get(url, { headers }, response => { let body = ''; response.setEncoding('utf8'); response.on('data', x => body += x); response.on('end', () => response.statusCode === 200 ? resolve(body) : reject(new Error(`HTTP ${response.statusCode}`))); }).on('error', reject)); }
async function pool(items, limit, task) { let cursor = 0; const workers = Array.from({ length: limit }, async () => { while (cursor < items.length) { const item = items[cursor++]; await task(item); } }); await Promise.all(workers); }
async function main() {
  const ranking = arg('--ranking'), cache = arg('--cache-dir'), dryRun = process.argv.includes('--dry-run');
  if (!ranking || !cache) die('Usage: --ranking us_marketcap_rankings.csv --cache-dir .tmp/free-annual [--dry-run]');
  const rows = csv(fs.readFileSync(ranking, 'utf8')), years = new Set(['2020', '2021', '2022', '2023', '2024']);
  const tickers = [...new Set(rows.filter(x => years.has(x.year) && x.rank <= 500).map(x => x.ticker))].sort();
  const yahooDir = path.join(cache, 'yahoo'), secDir = path.join(cache, 'sec'); fs.mkdirSync(yahooDir, { recursive: true }); fs.mkdirSync(secDir, { recursive: true });
  const missingYahoo = tickers.filter(t => !fs.existsSync(path.join(yahooDir, `${t}.json`))), missingSec = tickers.filter(t => !fs.existsSync(path.join(secDir, `${t}.json`)));
  console.log(JSON.stringify({ candidates: tickers.length, missingYahoo: missingYahoo.length, missingSec: missingSec.length, dryRun }, null, 2));
  if (dryRun) return;
  const start = Math.floor(Date.parse('2019-01-01') / 1000), end = Math.floor(Date.parse('2026-01-02') / 1000), failures = [];
  await pool(missingYahoo, 4, async ticker => {
    const file = path.join(yahooDir, `${ticker}.json`), url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?period1=${start}&period2=${end}&interval=1d&events=history&includeAdjustedClose=true`;
    try { fs.writeFileSync(file, await get(url, { 'User-Agent': 'Mozilla/5.0 annual-universe-research' })); } catch (error) { failures.push({ provider: 'Yahoo', ticker, error: error.message }); }
    await sleep(80);
  });
  let mapping = {};
  try { mapping = JSON.parse(await get('https://www.sec.gov/files/company_tickers.json', { 'User-Agent': process.env.SEC_USER_AGENT || 'KrResearchKit research contact@example.com', Accept: 'application/json' })); } catch (error) { failures.push({ provider: 'SEC', ticker: '*', error: `company_tickers: ${error.message}` }); }
  const ciks = new Map(Object.values(mapping).map(x => [x.ticker, String(x.cik_str).padStart(10, '0')]));
  await pool(missingSec, 2, async ticker => {
    const cik = ciks.get(ticker); if (!cik) { failures.push({ provider: 'SEC', ticker, error: 'ticker not in current SEC map' }); return; }
    try { fs.writeFileSync(path.join(secDir, `${ticker}.json`), await get(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`, { 'User-Agent': process.env.SEC_USER_AGENT || 'KrResearchKit research contact@example.com', Accept: 'application/json' })); } catch (error) { failures.push({ provider: 'SEC', ticker, error: error.message }); }
    await sleep(130);
  });
  fs.writeFileSync(path.join(cache, 'fetch-manifest.json'), JSON.stringify({ generatedAt: new Date().toISOString(), candidates: tickers, failures }, null, 2));
  console.log(JSON.stringify({ downloadedYahoo: missingYahoo.length - failures.filter(x => x.provider === 'Yahoo').length, downloadedSec: missingSec.length - failures.filter(x => x.provider === 'SEC').length, failures: failures.length }, null, 2));
}
main().catch(error => { console.error(`Fetch failed: ${error.message}`); process.exitCode = 1; });
