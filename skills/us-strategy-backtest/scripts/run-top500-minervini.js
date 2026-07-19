#!/usr/bin/env node
'use strict';

/*
 * Point-in-time CRSP/Compustat backtest.  This deliberately has no network
 * fallback: mixing current listings, Yahoo history, or current fundamentals
 * with WRDS data would invalidate the point-in-time claim.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const childProcess = require('child_process');

const DAY = 86400000;
const sha256 = value => crypto.createHash('sha256').update(Buffer.isBuffer(value) ? value : (typeof value === 'string' ? value : JSON.stringify(value))).digest('hex');
const die = message => { throw new Error(message); };
const num = value => value == null || value === '' ? null : Number(value);
const date = value => value == null || value === '' ? null : String(value).slice(0, 10);
const mean = values => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
const std = values => values.length > 1 ? Math.sqrt(values.reduce((a, b) => a + (b - mean(values)) ** 2, 0) / (values.length - 1)) : null;
const pct = value => value == null || !Number.isFinite(value) ? 'N/A' : `${(value * 100).toFixed(2)}%`;
const fmtNumber = value => value == null || !Number.isFinite(value) ? 'N/A' : value.toLocaleString('en-US', { maximumFractionDigits: 0 });
const cli = name => { const i = process.argv.indexOf(name); return i < 0 ? undefined : process.argv[i + 1]; };
const required = (value, label) => value || die(`Missing ${label}. See references/pit-wrds-data-contract.md.`);

function parseCsv(text) {
  const rows = []; let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') { if (quoted && text[i + 1] === '"') { cell += '"'; i++; } else quoted = !quoted; }
    else if (ch === ',' && !quoted) { row.push(cell); cell = ''; }
    else if ((ch === '\n' || ch === '\r') && !quoted) {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some(x => x !== '')) rows.push(row);
      row = [];
    } else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  if (!rows.length) return [];
  const header = rows.shift().map(x => x.trim().toLowerCase());
  return rows.map((values, index) => Object.fromEntries(header.map((key, i) => [key, (values[i] || '').trim()])))
    .map(x => ({ ...x, __row: index + 2 }));
}

function readRows(file) {
  required(file, 'an input file');
  if (!fs.existsSync(file)) die(`Input file not found: ${file}`);
  if (/\.parquet$/i.test(file)) {
    // pyarrow is intentionally invoked only for decoding a user-supplied file.
    // It keeps Node dependency-free while accepting the two promised formats.
    const program = 'import json,sys\ntry:\n import pyarrow.parquet as pq\nexcept ImportError:\n raise SystemExit("Parquet input requires Python package pyarrow (pip install pyarrow), or export WRDS data as CSV.")\nprint(json.dumps(pq.read_table(sys.argv[1]).to_pylist(), default=str))';
    const result = childProcess.spawnSync('python3', ['-c', program, file], { encoding: 'utf8' });
    if (result.status !== 0) die(`Unable to read Parquet ${file}: ${(result.stderr || result.stdout).trim()}`);
    return JSON.parse(result.stdout).map((row, index) => Object.fromEntries(Object.entries(row).map(([k, v]) => [k.toLowerCase(), v == null ? '' : String(v)]).concat([['__row', index + 1]])));
  }
  if (/\.json$/i.test(file)) {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    const records = Array.isArray(parsed) ? parsed : parsed.data;
    if (!Array.isArray(records)) die(`JSON input must be an array or {data: []}: ${file}`);
    return records.map((row, index) => Object.fromEntries(Object.entries(row).map(([k, v]) => [k.toLowerCase(), v == null ? '' : String(v)]).concat([['__row', index + 1]])));
  }
  return parseCsv(fs.readFileSync(file, 'utf8'));
}

function value(row, aliases, label, requiredValue = true) {
  const found = aliases.find(key => Object.prototype.hasOwnProperty.call(row, key));
  if (!found) { if (requiredValue) die(`Missing required column '${label}' (accepted: ${aliases.join(', ')})`); return null; }
  return row[found];
}
function normalizeDaily(rows, source, requireIdentifiers, requireReturn = requireIdentifiers) {
  const seen = new Set();
  return rows.map(row => {
    const permno = requireIdentifiers ? String(value(row, ['permno'], 'permno')) : 'SPY';
    const d = date(value(row, ['date', 'caldt'], 'date'));
    const prc = num(value(row, ['prc', 'price', 'close'], 'prc'));
    const open = num(value(row, ['openprc', 'open', 'open_price'], 'openprc', requireIdentifiers));
    const ret = num(value(row, ['ret', 'return'], 'ret', requireReturn));
    const dlret = num(value(row, ['dlret', 'delisting_return'], 'dlret', false));
    const shrout = num(value(row, ['shrout', 'shares_outstanding'], 'shrout', false));
    const exchcd = num(value(row, ['exchcd', 'exchange_code'], 'exchcd', false));
    const shrcd = num(value(row, ['shrcd', 'share_code'], 'shrcd', false));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d || '')) die(`${source} row ${row.__row}: invalid date`);
    if (prc == null || !Number.isFinite(prc) || prc === 0) die(`${source} row ${row.__row}: prc must be non-zero`);
    if (open != null && !Number.isFinite(open)) die(`${source} row ${row.__row}: openprc must be numeric when supplied`);
    if (requireIdentifiers && (shrout == null || !Number.isFinite(shrout) || shrout <= 0)) die(`${source} row ${row.__row}: shrout must be positive`);
    if (requireReturn && !Number.isFinite(ret)) die(`${source} row ${row.__row}: ret must be numeric`);
    if (dlret != null && !Number.isFinite(dlret)) die(`${source} row ${row.__row}: dlret must be numeric when supplied`);
    const key = `${permno}|${d}`; if (seen.has(key)) die(`${source}: duplicate PERMNO/date ${key}`); seen.add(key);
    return { permno, date: d, prc: Math.abs(prc), open: open == null ? null : Math.abs(open), ret, dlret, shrout, exchcd, shrcd, sourceRow: row.__row };
  }).sort((a, b) => a.permno.localeCompare(b.permno) || a.date.localeCompare(b.date));
}
function normalizeNames(rows) {
  const seen = new Set();
  return rows.map(row => {
    const permno = String(value(row, ['permno'], 'permno')), start = date(value(row, ['namedt', 'start_date'], 'namedt')),
      end = date(value(row, ['nameendt', 'end_date'], 'nameendt', false)) || '9999-12-31', ticker = String(value(row, ['ticker', 'tsymbol'], 'ticker', false) || '').toUpperCase(),
      permco = String(value(row, ['permco'], 'permco', false) || '');
    if (!start || end < start) die(`names row ${row.__row}: invalid name-history range`);
    const key = `${permno}|${start}|${end}|${ticker}`; if (seen.has(key)) die(`names: duplicate history record ${key}`); seen.add(key);
    return { permno, start, end, ticker, permco };
  }).sort((a, b) => a.permno.localeCompare(b.permno) || a.start.localeCompare(b.start));
}
function normalizeLinks(rows) {
  const seen = new Set();
  return rows.map(row => {
    const permno = String(value(row, ['lpermno', 'permno'], 'lpermno/permno')), gvkey = String(value(row, ['gvkey'], 'gvkey')),
      start = date(value(row, ['linkdt', 'start_date'], 'linkdt')), end = date(value(row, ['linkenddt', 'end_date'], 'linkenddt', false)) || '9999-12-31',
      linktype = String(value(row, ['linktype'], 'linktype', false) || ''), linkprim = String(value(row, ['linkprim'], 'linkprim', false) || '');
    if (!start || end < start) die(`ccm row ${row.__row}: invalid link range`);
    const key = `${permno}|${gvkey}|${start}|${end}`; if (seen.has(key)) die(`ccm: duplicate link record ${key}`); seen.add(key);
    return { permno, gvkey, start, end, linktype, linkprim };
  }).sort((a, b) => a.permno.localeCompare(b.permno) || a.start.localeCompare(b.start));
}
function normalizeFundamentals(rows) {
  const seen = new Set();
  return rows.map(row => {
    const gvkey = String(value(row, ['gvkey'], 'gvkey')), datadate = date(value(row, ['datadate', 'fiscal_period_end'], 'datadate')),
      rdq = date(value(row, ['rdq', 'filing_date', 'announcement_date'], 'rdq')), saleq = num(value(row, ['saleq', 'revenue', 'sales'], 'saleq')),
      eps = num(value(row, ['epsfxq', 'epsfiq', 'epspxq', 'diluted_eps'], 'epsfxq/epsfiq/epspxq/diluted_eps'));
    if (!datadate || !rdq || rdq < datadate || !Number.isFinite(saleq) || !Number.isFinite(eps)) die(`fundamentals row ${row.__row}: invalid fiscal period, RDQ, revenue, or diluted EPS`);
    const key = `${gvkey}|${datadate}|${rdq}`; if (seen.has(key)) die(`fundamentals: duplicate record ${key}`); seen.add(key);
    return { gvkey, datadate, rdq, saleq, eps, sourceRow: row.__row };
  }).sort((a, b) => a.gvkey.localeCompare(b.gvkey) || a.datadate.localeCompare(b.datadate) || a.rdq.localeCompare(b.rdq));
}

function indexBy(rows, key) { const map = new Map(); for (const row of rows) { const id = row[key]; if (!map.has(id)) map.set(id, []); map.get(id).push(row); } return map; }
function attachTotalReturnPrices(rows) {
  const byPermno = indexBy(rows, 'permno');
  for (const series of byPermno.values()) {
    series.forEach((bar, index) => {
      if (!index) { bar.trPrc = bar.prc; bar.trOpen = bar.open == null ? null : bar.open; return; }
      const prior = series[index - 1], ordinaryReturn = Number.isFinite(bar.ret) ? bar.ret : bar.prc / prior.prc - 1;
      bar.trPrc = prior.trPrc * (1 + ordinaryReturn);
      bar.trOpen = bar.open == null ? null : bar.trPrc * bar.open / bar.prc;
    });
  }
  return rows;
}
function effective(rows, on) { return (rows || []).filter(row => row.start <= on && on <= row.end); }
function uniqueEffective(rows, on, label, identity) {
  const matches = effective(rows, on); const distinct = new Set(matches.map(identity));
  if (distinct.size > 1) die(`${label}: ambiguous effective history on ${on}: ${[...distinct].join(', ')}`);
  return matches[0] || null;
}
function nextSession(sessions, on, lag) { const i = sessions.findIndex(d => d > on); return i < 0 || i + lag - 1 >= sessions.length ? null : sessions[i + lag - 1]; }
function rankPercentile(items, key, out) {
  const sorted = [...items].sort((a, b) => a[key] - b[key] || a.permno.localeCompare(b.permno));
  sorted.forEach((item, index) => { item[out] = sorted.length < 2 ? 1 : index / (sorted.length - 1); });
}
function equityMetrics(points) {
  if (points.length < 2) return null;
  const returns = points.slice(1).map((x, i) => x.equity / points[i].equity - 1), years = Math.max((Date.parse(points.at(-1).date) - Date.parse(points[0].date)) / (365.25 * DAY), 1 / 252);
  let peak = -Infinity, mdd = 0; for (const point of points) { peak = Math.max(peak, point.equity); mdd = Math.min(mdd, point.equity / peak - 1); }
  const deviation = std(returns);
  return { startEquity: points[0].equity, endEquity: points.at(-1).equity, totalReturn: points.at(-1).equity / points[0].equity - 1,
    cagr: (points.at(-1).equity / points[0].equity) ** (1 / years) - 1, annualizedVolatility: deviation && deviation * Math.sqrt(252),
    sharpeZeroRf: deviation ? mean(returns) / deviation * Math.sqrt(252) : null, maxDrawdown: mdd, sessions: points.length };
}
function annualReturns(points) {
  const years = new Map(); for (const point of points) { const year = point.date.slice(0, 4); if (!years.has(year)) years.set(year, { start: point.equity, end: point.equity }); else years.get(year).end = point.equity; }
  return [...years].map(([year, p]) => ({ year, return: p.end / p.start - 1 }));
}

function validateAndPrepare(input, config) {
  const prices = attachTotalReturnPrices(normalizeDaily(readRows(input.prices), 'prices', true)), names = normalizeNames(readRows(input.names)), links = normalizeLinks(readRows(input.ccm)),
    fundamentals = normalizeFundamentals(readRows(input.fundamentals)), spy = normalizeDaily(readRows(input.spy), 'spy', false, true);
  const priceByPermno = indexBy(prices, 'permno'), namesByPermno = indexBy(names, 'permno'), linksByPermno = indexBy(links, 'permno'), factsByGvkey = indexBy(fundamentals, 'gvkey');
  const priceAtByPermno = new Map(), priceIndexByPermno = new Map();
  for (const [permno, series] of priceByPermno) {
    priceAtByPermno.set(permno, new Map(series.map(row => [row.date, row])));
    priceIndexByPermno.set(permno, new Map(series.map((row, index) => [row.date, index])));
  }
  const sessions = [...new Set(spy.map(x => x.date))].sort();
  if (!sessions.includes(config.startDate) || !sessions.includes(config.endDate)) die(`SPY benchmark must contain startDate ${config.startDate} and endDate ${config.endDate}`);
  if (sessions.filter(d => d <= config.startDate).length < 253) die('SPY input lacks the required 252-session price warm-up before startDate');
  for (const [permno, series] of priceByPermno) {
    for (let i = 1; i < series.length; i++) if (series[i].date <= series[i - 1].date) die(`prices: non-increasing date series for PERMNO ${permno}`);
    if (!namesByPermno.has(permno)) die(`prices: PERMNO ${permno} has no CRSP names history`);
  }
  for (const link of links) if (!factsByGvkey.has(link.gvkey)) { /* valid: not all CRSP securities have Compustat coverage */ }
  const manifests = Object.entries(input).map(([name, file]) => ({ name, file, sha256: sha256(fs.readFileSync(file)), rows: ({ prices, names, ccm: links, fundamentals, spy })[name].length }));
  return { prices, names, links, fundamentals, spy, priceByPermno, priceAtByPermno, priceIndexByPermno, namesByPermno, linksByPermno, factsByGvkey, sessions, manifests };
}

function runPitBacktest(prepared, rawConfig) {
  const config = { startDate: '2016-07-18', endDate: '2026-07-16', outOfSampleStart: '2024-07-17', initialCapital: 1000000,
    tradingCostBps: 10, topUniverse: 500, topHoldings: 10, sharesOutstandingScale: 1000, targetAnnualVolatility: 0.18,
    fundamentalAvailabilityLagSessions: 1, ...rawConfig };
  if (!['weekly', 'monthly'].includes(config.cadence)) die("config.cadence must be 'weekly' or 'monthly'");
  if (!Number.isInteger(config.topUniverse) || config.topUniverse < 1 || !Number.isInteger(config.topHoldings) || config.topHoldings < 1 || config.topHoldings > config.topUniverse) die('topUniverse/topHoldings must be positive integers with topHoldings <= topUniverse');
  if (!(config.initialCapital > 0) || !(config.tradingCostBps >= 0) || !(config.targetAnnualVolatility > 0) || !Number.isInteger(config.fundamentalAvailabilityLagSessions) || config.fundamentalAvailabilityLagSessions < 1) die('Invalid capital, cost, volatility target, or fundamental availability lag');
  const cadence = config.cadence === 'weekly' ? 5 : 21, cost = config.tradingCostBps / 10000;
  const { priceByPermno, priceAtByPermno, priceIndexByPermno, namesByPermno, linksByPermno, factsByGvkey, sessions, spy } = prepared;
  const spyByDate = new Map(spy.map(x => [x.date, x]));
  const sessionIndex = new Map(sessions.map((d, i) => [d, i]));
  const delistingsByDate = new Map();
  for (const bar of prepared.prices.filter(x => Number.isFinite(x.dlret))) {
    if (!delistingsByDate.has(bar.date)) delistingsByDate.set(bar.date, []);
    delistingsByDate.get(bar.date).push(bar.permno);
  }
  const startIndex = sessionIndex.get(config.startDate), endIndex = sessionIndex.get(config.endDate);
  if (startIndex == null || endIndex == null || !sessionIndex.has(config.outOfSampleStart) || startIndex >= endIndex || config.outOfSampleStart < config.startDate || config.outOfSampleStart > config.endDate) die('Start, end, and OOS dates must be ordered sessions in the supplied SPY file');
  const signalIndices = [];
  for (let i = startIndex; i < endIndex; i += cadence) if (i + 1 <= endIndex) signalIndices.push(i);
  const priceAt = (permno, d) => priceAtByPermno.get(permno)?.get(d) || null;
  const historyThrough = (permno, d) => {
    const index = priceIndexByPermno.get(permno)?.get(d);
    if (index == null) return [];
    const series = priceByPermno.get(permno);
    return series.slice(Math.max(0, index - 252), index + 1);
  };
  const factsFor = (permno, signalDate) => {
    const link = uniqueEffective(linksByPermno.get(permno), signalDate, `CCM link for PERMNO ${permno}`, x => x.gvkey);
    if (!link) return { reason: 'no-effective-ccm-link' };
    const available = (factsByGvkey.get(link.gvkey) || []).map(f => ({ ...f, availableDate: nextSession(sessions, f.rdq, config.fundamentalAvailabilityLagSessions) }))
      .filter(f => f.availableDate && f.availableDate <= signalDate && link.start <= f.availableDate && f.availableDate <= link.end)
      .sort((a, b) => a.datadate.localeCompare(b.datadate) || a.rdq.localeCompare(b.rdq));
    const current = available.at(-1); if (!current) return { reason: 'no-available-fundamental' };
    const earlier = n => available.filter(x => x.datadate < current.datadate).at(-n);
    const previous = earlier(1), yearAgo = earlier(4);
    if (!previous || !yearAgo) return { reason: 'insufficient-fundamental-history', current };
    const change = (now, then) => Math.abs(then) < 1e-12 ? null : now / Math.abs(then) - Math.sign(then);
    const revQoq = change(current.saleq, previous.saleq), revYoy = change(current.saleq, yearAgo.saleq), epsQoq = change(current.eps, previous.eps), epsYoy = change(current.eps, yearAgo.eps);
    if (![revQoq, revYoy, epsQoq, epsYoy].every(Number.isFinite)) return { reason: 'invalid-fundamental-comparison', current };
    return { current, revQoq, revYoy, epsQoq, epsYoy };
  };
  const ledger = [], warnings = [], trades = [], delistings = [], equity = [], delistedPermnos = new Set();
  let cash = config.initialCapital, holdings = new Map(), regime = false, turnover = 0, pending = null;
  function holdingsValue(on, field) {
    let total = cash;
    for (const [permno, position] of holdings) {
      const bar = priceAt(permno, on);
      if (bar) { const mark = field === 'open' ? (bar.trOpen || bar.trPrc) : bar.trPrc; position.lastPrice = mark; total += position.shares * mark; }
      else { total += position.shares * position.lastPrice; warnings.push(`${on}: PERMNO ${permno} has no CRSP bar; held at last price`); }
    }
    return total;
  }
  function targetExposure() {
    const returns = equity.slice(-60).map((point, i, arr) => i ? point.equity / arr[i - 1].equity - 1 : null).filter(Number.isFinite);
    const vol = std(returns); return vol ? Math.min(1, config.targetAnnualVolatility / (vol * Math.sqrt(252))) : 1;
  }
  function rebalance(on, instruction) {
    const before = holdingsValue(on, 'open'), target = instruction.regime ? instruction.selected : [], exposure = instruction.regime ? targetExposure() : 0,
      allocation = target.length ? before * exposure / target.length / (1 + 2 * cost) : 0, universe = new Set([...holdings.keys(), ...target]);
    for (const permno of universe) {
      const bar = priceAt(permno, on); if (!bar || !bar.trOpen) { warnings.push(`${on}: PERMNO ${permno} unavailable for next-open execution`); continue; }
      const oldShares = holdings.get(permno)?.shares || 0, desired = target.includes(permno) ? allocation / (bar.trOpen * (1 + cost)) : 0,
        delta = desired - oldShares; if (Math.abs(delta) < 1e-12) continue;
      const notional = Math.abs(delta) * bar.trOpen, fee = notional * cost; cash -= delta * bar.trOpen + fee; turnover += notional / Math.max(before, 1);
      if (desired > 0) holdings.set(permno, { shares: desired, lastPrice: bar.trPrc }); else holdings.delete(permno);
      trades.push({ date: on, signalDate: instruction.signalDate, permno, ticker: instruction.tickers[permno] || '', side: delta > 0 ? 'BUY' : 'SELL', shares: Math.abs(delta), open: bar.trOpen, notional, cost: fee, targetExposure: exposure });
    }
    if (cash < -1e-5) die(`Cash became negative on ${on}; check target calculation`);
  }
  for (let i = startIndex; i <= endIndex; i++) {
    const on = sessions[i];
    if (pending) { rebalance(on, pending); pending = null; }
    for (const permno of delistingsByDate.get(on) || []) delistedPermnos.add(permno);
    // CRSP RET excludes DLRET. Liquidate at close × (1 + DLRET) precisely once.
    for (const [permno, position] of [...holdings]) {
      const bar = priceAt(permno, on);
      if (bar && Number.isFinite(bar.dlret)) {
        const proceeds = position.shares * bar.trPrc * (1 + bar.dlret); cash += proceeds; holdings.delete(permno);
        delistings.push({ date: on, permno, dlret: bar.dlret, close: bar.trPrc, proceeds, action: 'close-liquidation-after-dlret' });
      }
    }
    const closeEquity = holdingsValue(on, 'prc');
    equity.push({ date: on, equity: closeEquity, cash, holdings: [...holdings].map(([permno, p]) => ({ permno, shares: p.shares, lastPrice: p.lastPrice })) });
    if (!signalIndices.includes(i)) continue;
    const previousSpy = spyByDate.get(sessions[i - 1]);
    const spyWindow = spy.slice(Math.max(0, i - 200), i); // strictly through prior session
    if (previousSpy && spyWindow.length === 200) {
      const ma200 = mean(spyWindow.map(x => x.prc));
      if (previousSpy.prc > ma200 * 1.03) regime = true;
      else if (previousSpy.prc < ma200 * 0.97) regime = false;
    }
    const snapshots = [], tickers = {};
    for (const [permno] of priceByPermno) {
      const bar = priceAt(permno, on), name = uniqueEffective(namesByPermno.get(permno), on, `CRSP name for PERMNO ${permno}`, x => `${x.ticker}|${x.permco}`);
      if (!bar) continue;
      const entry = { permno, ticker: name?.ticker || '', marketCap: bar.prc * bar.shrout * config.sharesOutstandingScale, excluded: null };
      tickers[permno] = entry.ticker;
      if (delistedPermnos.has(permno)) entry.excluded = 'delisted';
      else if (!name) entry.excluded = 'missing-name-history';
      else if (![1, 2, 3].includes(bar.exchcd)) entry.excluded = 'exchange';
      else if (![10, 11].includes(bar.shrcd)) entry.excluded = 'share-code';
      else if (!(entry.marketCap > 0)) entry.excluded = 'invalid-market-cap';
      snapshots.push(entry);
    }
    const top500 = snapshots.filter(x => !x.excluded).sort((a, b) => b.marketCap - a.marketCap || a.permno.localeCompare(b.permno)).slice(0, config.topUniverse);
    top500.forEach((x, index) => { x.marketCapRank = index + 1; });
    const eligible = [];
    for (const entry of top500) {
      const history = historyThrough(entry.permno, on);
      if (history.length < 253) { entry.excluded = 'insufficient-price-history'; continue; }
      const close = history.at(-1).trPrc, sma = n => mean(history.slice(-n).map(x => x.trPrc)), sma50 = sma(50), sma150 = sma(150), sma200 = sma(200), oldSma200 = mean(history.slice(-220, -20).map(x => x.trPrc)), window252 = history.slice(-253);
      if (!(close > sma50 && close > sma150 && close > sma200 && sma50 > sma150 && sma150 > sma200 && sma200 > oldSma200 && close >= Math.min(...window252.map(x => x.trPrc)) * 1.3 && close >= Math.max(...window252.map(x => x.trPrc)) * .75)) { entry.excluded = 'minervini-template'; continue; }
      const rs = .4 * (close / history.at(-64).trPrc - 1) + .3 * (close / history.at(-127).trPrc - 1) + .3 * (close / history.at(-253).trPrc - 1);
      const fundamentals = factsFor(entry.permno, on);
      if (fundamentals.reason) { entry.excluded = fundamentals.reason; if (fundamentals.current) entry.fundamentalAvailableDate = fundamentals.current.availableDate; continue; }
      Object.assign(entry, fundamentals, { rs }); eligible.push(entry);
    }
    rankPercentile(eligible, 'rs', 'priceScore');
    for (const key of ['revYoy', 'revQoq', 'epsYoy', 'epsQoq']) rankPercentile(eligible, key, `${key}Rank`);
    eligible.forEach(x => { x.fundamentalScore = mean(['revYoyRank', 'revQoqRank', 'epsYoyRank', 'epsQoqRank'].map(key => x[key])); x.combinedScore = .5 * x.priceScore + .5 * x.fundamentalScore; });
    const selected = regime ? eligible.sort((a, b) => b.combinedScore - a.combinedScore || a.permno.localeCompare(b.permno)).slice(0, config.topHoldings) : [];
    const selectedSet = new Set(selected.map(x => x.permno));
    const normalizedLedger = top500.map(x => ({ ...x, status: selectedSet.has(x.permno) ? 'selected' : !x.excluded ? 'eligible-not-selected' : 'excluded' }));
    ledger.push({ signalDate: on, executionDate: sessions[i + 1], regime, priorSpyClose: previousSpy?.prc ?? null, priorSpySma200: spyWindow.length === 200 ? mean(spyWindow.map(x => x.prc)) : null,
      top500Permnos: top500.map(x => x.permno), selectedPermnos: selected.map(x => x.permno), entries: normalizedLedger });
    pending = { signalDate: on, regime, selected: selected.map(x => x.permno), tickers };
  }
  const spyEquity = []; let benchmark = config.initialCapital;
  for (let i = startIndex; i <= endIndex; i++) { const bar = spyByDate.get(sessions[i]); if (i > startIndex) benchmark *= (1 + (bar.ret ?? (bar.prc / spyByDate.get(sessions[i - 1]).prc - 1))) * (1 + (bar.dlret || 0)); spyEquity.push({ date: sessions[i], equity: benchmark }); }
  const oosStrategy = equity.filter(x => x.date >= config.outOfSampleStart), oosSpy = spyEquity.filter(x => x.date >= config.outOfSampleStart);
  return { config, dataManifest: prepared.manifests, universeLedger: ledger, dailyEquity: equity, spyDailyEquity: spyEquity, trades, delistings, warnings: [...new Set(warnings)],
    fullPeriod: { ...equityMetrics(equity), turnover, annualReturns: annualReturns(equity) }, outOfSample: { ...equityMetrics(oosStrategy), annualReturns: annualReturns(oosStrategy) },
    spyFullPeriod: equityMetrics(spyEquity), spyOutOfSample: equityMetrics(oosSpy), coverage: { priceRows: prepared.prices.length, securities: prepared.priceByPermno.size, nameRows: prepared.names.length, ccmRows: prepared.links.length, fundamentalRows: prepared.fundamentals.length, spyRows: prepared.spy.length, signalCount: ledger.length } };
}

function markdown(result, ledgerPath) {
  const compare = (strategy, spy) => `|CAGR|${pct(strategy?.cagr)}|${pct(spy?.cagr)}|\n|연환산 변동성|${pct(strategy?.annualizedVolatility)}|${pct(spy?.annualizedVolatility)}|\n|Sharpe (무위험 0%)|${strategy?.sharpeZeroRf?.toFixed(2) ?? 'N/A'}|${spy?.sharpeZeroRf?.toFixed(2) ?? 'N/A'}|\n|최대 낙폭|${pct(strategy?.maxDrawdown)}|${pct(spy?.maxDrawdown)}|\n|누적 수익률|${pct(strategy?.totalReturn)}|${pct(spy?.totalReturn)}|`;
  const annual = result.fullPeriod.annualReturns.map(x => `|${x.year}|${pct(x.return)}|`).join('\n');
  const sampleTrades = result.trades.slice(0, 10).map(x => `|${x.date}|${x.side}|${x.ticker || x.permno}|${fmtNumber(x.notional)}|${fmtNumber(x.cost)}|`).join('\n') || '|—|—|—|—|—|';
  const monthly = result.universeLedger.filter((x, i, a) => !i || x.signalDate.slice(0, 7) !== a[i - 1].signalDate.slice(0, 7)).map(x => `|${x.signalDate}|${x.regime ? 'ON' : 'OFF'}|${x.selectedPermnos.join(', ') || '현금'}|`).join('\n');
  return `# Point-in-Time 미국 상위 500 Minervini·실적·레짐 백테스트 (${result.config.cadence === 'weekly' ? '주간' : '월간'})\n\n> CRSP/Compustat WRDS 추출을 사용한 과거 시뮬레이션이며 투자 권유가 아닙니다. 모든 종목 범위, 공시 이용 가능일, 상장폐지 처리는 JSON 원장으로 감사할 수 있습니다.\n\n## 규칙\n\n- 신호 기간 ${result.config.startDate}~${result.config.endDate}, OOS ${result.config.outOfSampleStart}~${result.config.endDate}. ${result.config.cadence === 'weekly' ? '5' : '21'}거래일마다 유니버스를 다시 구성한다.\n- 각 신호일 종가의 CRSP |PRC| × SHROUT × ${result.config.sharesOutstandingScale}로 NYSE/NYSE American/NASDAQ(EXCHCD 1/2/3), 보통주(SHRCD 10/11) 상위 ${result.config.topUniverse}개를 선택한다.\n- Minervini Trend Template, 3/6/12개월 RS(40/30/30), RDQ 뒤 ${result.config.fundamentalAvailabilityLagSessions}개 거래일 후 이용 가능한 분기 매출·희석 EPS의 YoY/QoQ 개선을 각 50:50으로 합산해 상위 ${result.config.topHoldings}개를 동일비중 보유한다.\n- 신호일 종가 판단 후 다음 거래일 CRSP 시가 체결, 편도 ${result.config.tradingCostBps}bp. SPY 전일 종가가 200일선 +3% 초과면 risk-on, -3% 미만이면 risk-off(그 외 상태 유지)다. 60일 실현 변동성으로 연 ${pct(result.config.targetAnnualVolatility)} 상한만큼 익스포저를 축소한다.\n\n## 성과와 SPY 총수익 비교\n\n|지표|전략|SPY|\n|---|---:|---:|\n${compare(result.fullPeriod, result.spyFullPeriod)}\n|거래 수|${result.trades.length}|—|\n|누적 회전율|${result.fullPeriod.turnover.toFixed(2)}x|—|\n\n## OOS (${result.config.outOfSampleStart} 이후)\n\n|지표|전략|SPY|\n|---|---:|---:|\n${compare(result.outOfSample, result.spyOutOfSample)}\n\n## 연도별 성과\n\n|연도|전략|\n|---|---:|\n${annual}\n\n## 월별 신호 상위 10\n\n|첫 신호일|레짐|선정 PERMNO|\n|---|---|---|\n${monthly}\n\n## 거래 표본\n\n|체결일|방향|종목|거래대금|비용|\n|---|---|---|---:|---:|\n${sampleTrades}\n\n## 상장폐지·데이터 커버리지\n\n- 상장폐지 처리: ${result.delistings.length}건. CRSP 일별 DLRET는 마지막 보유일에 (1+RET)×(1+DLRET)-1 규약으로 반영하고 종가 후 현금화했다.\n- 커버리지: 가격 ${fmtNumber(result.coverage.priceRows)}행 / ${fmtNumber(result.coverage.securities)} PERMNO, CCM ${fmtNumber(result.coverage.ccmRows)}행, 분기 재무 ${fmtNumber(result.coverage.fundamentalRows)}행, 신호 ${result.coverage.signalCount}회.\n- 유니버스·제외 사유·시가총액 순위·선정 결과·각 사용 재무의 공시 이용 가능일은 [별도 JSON 원장](${path.basename(ledgerPath)})에 보존했다.\n\n## 한계\n\n- 결과는 사용 허가된 WRDS 추출 범위와 필드 품질에 의존한다. RDQ가 실시간 공시 시각을 대체하므로, 기본 1거래일 지연은 장 마감 후 공시의 당일 누수를 피하기 위한 보수적 가정이다.\n- 세금, bid-ask 스프레드의 시간변화, 시장충격·용량, 거래정지 중 체결 불가, 기업행사 세부 처리와 현금 배당 재투자는 별도로 모델링하지 않았다. SPY는 동일 CRSP 수익률 규약으로 비교했다.\n`;
}

function writeArtifacts(result, outDir) {
  fs.mkdirSync(outDir, { recursive: true }); const suffix = `${result.config.cadence}-backtest-${result.config.endDate}`;
  const jsonPath = path.join(outDir, `${suffix}.json`), ledgerPath = path.join(outDir, `${result.config.cadence}-universe-ledger-${result.config.endDate}.json`), mdPath = path.join(outDir, `${suffix}.md`);
  const artifact = { schemaVersion: 2, generatedAt: new Date().toISOString(), ...result, universeLedgerPath: ledgerPath };
  fs.writeFileSync(jsonPath, JSON.stringify(artifact, null, 2)); fs.writeFileSync(ledgerPath, JSON.stringify({ schemaVersion: 1, cadence: result.config.cadence, entries: result.universeLedger }, null, 2)); fs.writeFileSync(mdPath, markdown(result, ledgerPath));
  return { jsonPath, ledgerPath, mdPath };
}
function main() {
  const configFile = cli('--config');
  const rawConfig = configFile ? JSON.parse(fs.readFileSync(configFile, 'utf8')) : {};
  const input = { prices: required(cli('--prices'), '--prices'), names: required(cli('--names'), '--names'), ccm: required(cli('--ccm'), '--ccm'), fundamentals: required(cli('--fundamentals'), '--fundamentals'), spy: required(cli('--spy'), '--spy') };
  const outDir = required(cli('--out-dir'), '--out-dir');
  const prepared = validateAndPrepare(input, { startDate: rawConfig.startDate || '2016-07-18', endDate: rawConfig.endDate || '2026-07-16' });
  const cadences = rawConfig.cadence ? [rawConfig.cadence] : ['weekly', 'monthly'];
  const paths = cadences.map(cadence => writeArtifacts(runPitBacktest(prepared, { ...rawConfig, cadence }), outDir));
  console.log(JSON.stringify({ artifacts: paths }, null, 2));
}
if (require.main === module) main();
module.exports = { parseCsv, readRows, validateAndPrepare, runPitBacktest, writeArtifacts, equityMetrics };
