#!/usr/bin/env node
'use strict';

// Download the complete quarterly DART panel for a point-in-time universe.
// A successful response is either data (000) or a *verified* no-data response
// from both CFS and OFS (013).  Network/API failures are never a valid result.

const fs = require('fs');
const path = require('path');
const https = require('https');
const AnnualUniverse = require('./lib/annual-top300-universe.js');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const DEFAULT_TOP = path.join(ROOT, 'analysis-example/kr-market/strategies/trend-following-10y/largecap-momentum-backtest-2026-07-10.json');
const DEFAULT_CORP = path.join(ROOT, '.tmp/opendart-cache/CORPCODE.xml');
const DEFAULT_OUT = path.join(ROOT, '.tmp/kr-strategy-backtest/dart-quarterly-panel');
const REPORTS = ['11013', '11012', '11014', '11011'];

function arg(name, fallback = null) { const i = process.argv.indexOf(name); return i < 0 ? fallback : process.argv[i + 1]; }
function integer(name, fallback) { const value = arg(name); return value === null ? fallback : Number(value); }
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function writeJson(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); }
function corpCodeMap(file) {
  const xml = fs.readFileSync(file, 'utf8');
  return new Map([...xml.matchAll(/<list>\s*<corp_code>(.*?)<\/corp_code>[\s\S]*?<stock_code>(.*?)<\/stock_code>[\s\S]*?<\/list>/g)].map(match => [match[2].trim(), match[1].trim()]));
}
function httpJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'kr-research-kit/1.0' } }, response => {
      let body = ''; response.setEncoding('utf8'); response.on('data', chunk => { body += chunk; });
      response.on('end', () => { try { resolve(JSON.parse(body)); } catch (error) { reject(new Error(`invalid JSON: ${error.message}`)); } });
    });
    req.setTimeout(30000, () => req.destroy(new Error('request timeout')));
    req.on('error', reject);
  });
}
function expectedJobs({ tickers, codes, startYear, endYear }) {
  const jobs = [], missingCorpCodes = [];
  for (const ticker of tickers) {
    const corpCode = codes.get(ticker);
    if (!corpCode) { missingCorpCodes.push(ticker); continue; }
    for (let year = startYear; year <= endYear; year++) for (const report of REPORTS) jobs.push({ ticker, corpCode, year, report });
  }
  return { jobs, missingCorpCodes };
}
function recordStatus(record) {
  const responses = record?.attempts || (record?.response ? [{ fsDiv: record.fsDiv || 'CFS', response: record.response }] : []);
  const statuses = new Map(responses.map(attempt => [attempt.fsDiv, attempt.response?.status || 'error']));
  if ([...statuses.values()].includes('000')) return 'complete-data';
  if (statuses.get('CFS') === '013' && statuses.get('OFS') === '013') return 'complete-no-data';
  if ([...statuses.values()].some(status => status === 'error')) return 'error';
  return 'incomplete';
}
function completionReport({ jobs, missingCorpCodes, outDir }) {
  const unresolved = [], complete = { data: 0, noData: 0 };
  for (const job of jobs) {
    const file = path.join(outDir, `${job.ticker}-${job.year}-${job.report}.json`);
    if (!fs.existsSync(file)) { unresolved.push({ ...job, reason: 'missing-file' }); continue; }
    let record; try { record = readJson(file); } catch (error) { unresolved.push({ ...job, reason: `invalid-json: ${error.message}` }); continue; }
    const status = recordStatus(record);
    if (status === 'complete-data') complete.data++;
    else if (status === 'complete-no-data') complete.noData++;
    else unresolved.push({ ...job, reason: status, attempts: record.attempts || [] });
  }
  for (const ticker of missingCorpCodes) unresolved.push({ ticker, reason: 'missing-corp-code' });
  return { expected: jobs.length + missingCorpCodes.length, complete, unresolved, completePass: unresolved.length === 0 };
}
function concise(report, limit = 100) {
  return { ...report, unresolvedCount: report.unresolved.length, unresolved: report.unresolved.slice(0, limit) };
}

async function requestWithRetry(job, fsDiv, key, retries, delayMs) {
  let lastError = null;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const url = `https://opendart.fss.or.kr/api/fnlttSinglAcntAll.json?crtfc_key=${encodeURIComponent(key)}&corp_code=${job.corpCode}&bsns_year=${job.year}&reprt_code=${job.report}&fs_div=${fsDiv}`;
      const response = await httpJson(url);
      // OpenDART's status replies are valid API responses.  Retry only a
      // transport/parse failure; a 013 is handled by the CFS -> OFS policy.
      return { fsDiv, attemptedAt: new Date().toISOString(), attempt, response };
    } catch (error) {
      lastError = error;
      if (attempt < retries) await sleep(delayMs * (2 ** (attempt - 1)));
    }
  }
  return { fsDiv, attemptedAt: new Date().toISOString(), error: lastError?.message || 'unknown request error' };
}
async function fetchJob(job, opts) {
  const cfs = await requestWithRetry(job, 'CFS', opts.key, opts.retries, opts.delayMs);
  const attempts = [cfs];
  if (cfs.response?.status === '013') attempts.push(await requestWithRetry(job, 'OFS', opts.key, opts.retries, opts.delayMs));
  return { schemaVersion: 2, ticker: job.ticker, corpCode: job.corpCode, year: job.year, report: job.report, fetchedAt: new Date().toISOString(), attempts };
}

async function main() {
  const startYear = integer('--start-year', 2015), endYear = integer('--end-year', 2026), retries = integer('--retries', 3), delayMs = integer('--delay-ms', 170), concurrency = integer('--concurrency', 2), maxNew = arg('--max-new') === null ? null : integer('--max-new');
  const annualUniverseFile = arg('--annual-universe-file');
  const outDir = arg('--out-dir', DEFAULT_OUT), corpFile = arg('--corp-code-file', DEFAULT_CORP), topFile = arg('--top-file', DEFAULT_TOP);
  if (!Number.isInteger(startYear) || !Number.isInteger(endYear) || startYear > endYear || !Number.isInteger(retries) || retries < 1 || !Number.isInteger(delayMs) || delayMs < 0 || !Number.isInteger(concurrency) || concurrency < 1 || (maxNew !== null && (!Number.isInteger(maxNew) || maxNew < 1))) throw new Error('Usage: collect-dart-quarterly-panel.js [--annual-universe-file ledger.json] [--out-dir dir] [--start-year YYYY] [--end-year YYYY] [--retries 3] [--delay-ms 170] [--concurrency 2] [--verify-only]');
  const universe = annualUniverseFile ? AnnualUniverse.loadAnnualUniverse(annualUniverseFile) : null;
  const tickers = universe ? [...AnnualUniverse.universeUnion(universe)] : readJson(topFile).universe.top300.map(row => row.ticker);
  const { jobs, missingCorpCodes } = expectedJobs({ tickers, codes: corpCodeMap(corpFile), startYear, endYear });
  if (process.argv.includes('--verify-only')) {
    const report = completionReport({ jobs, missingCorpCodes, outDir });
    console.log(JSON.stringify({ outDir, annualUniverseFile: annualUniverseFile || null, ...concise(report, integer('--max-unresolved', 100)) }, null, 2));
    if (!report.completePass) process.exitCode = 1;
    return;
  }
  const key = process.env.OPENDART_API_KEY; if (!key) throw new Error('OPENDART_API_KEY required unless --verify-only is used');
  fs.mkdirSync(outDir, { recursive: true });
  // Retry every non-terminal record.  A previous transport/API error is no
  // more final than a CFS-only 013; excluding it here left holes permanently
  // stranded after an interrupted run.
  const queue = jobs.filter(job => {
    const file = path.join(outDir, `${job.ticker}-${job.year}-${job.report}.json`);
    const status = recordStatus(fs.existsSync(file) ? readJson(file) : null);
    return status !== 'complete-data' && status !== 'complete-no-data';
  });
  let written = 0;
  async function worker() {
    while (queue.length && (maxNew === null || written < maxNew)) {
      const job = queue.shift(); if (!job) return;
      const record = await fetchJob(job, { key, retries, delayMs });
      writeJson(path.join(outDir, `${job.ticker}-${job.year}-${job.report}.json`), record); written++;
      if (delayMs) await sleep(delayMs);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  const report = completionReport({ jobs, missingCorpCodes, outDir });
  writeJson(path.join(outDir, 'completion-manifest.json'), { generatedAt: new Date().toISOString(), startYear, endYear, annualUniverseFile: annualUniverseFile || null, retries, ...report });
  console.log(JSON.stringify({ written, outDir, ...concise(report, integer('--max-unresolved', 100)) }, null, 2));
  if (!report.completePass) process.exitCode = 1;
}

if (require.main === module) main().catch(error => { console.error(error.stack || error.message); process.exit(1); });
module.exports = { recordStatus, completionReport, expectedJobs, fetchJob, concise };
