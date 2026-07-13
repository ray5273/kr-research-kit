'use strict';

// Shared backtest core for the alternative-factor studies
// (low-volatility, value+momentum, Piotroski F-score, short-term reversal).
//
// This module intentionally duplicates the simulate/metrics pattern already
// proven in backtest-kr-alternative-indicators.js and backtest-kr-factor-matrix.js
// so those files stay untouched. It centralizes the pieces the four new
// alternative-factor scripts share: the fixed 10-year frame constants, the
// top-300 ordinary-share universe loader, the point-in-time DART quarterly
// panel reader (extended with net income / CFO / total & current liabilities /
// current assets for Piotroski and value work), the percentile ranker, and the
// next-open binary-search position sizer.
//
// Every consuming script must keep the survivorship-bias + omitted-friction
// disclaimer in its written report (report-contract.md).

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const DATA = path.join(ROOT, '.tmp/kr-strategy-backtest/2026-07-10');
const PANEL = path.join(ROOT, '.tmp/kr-strategy-backtest/dart-quarterly-panel');
const OUT = path.join(ROOT, 'analysis-example/kr-market/strategies/trend-following-10y');
const TOP_FILE = path.join(OUT, 'largecap-momentum-backtest-2026-07-10.json');
const BASE_FILE = path.join(OUT, 'backtest-2026-07-10.json');

// Fixed comparison frame — identical to every existing trend-following-10y study.
const START = '2016-07-11';
const CUTOFF = '2026-07-10';
const OOS_START = '2023-07-11'; // out-of-sample cut reported separately
const COST = 0.0025; // 25bp one-way
const INITIAL = 100000000;
const MAX_HOLDINGS = 10;

const read = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const write = (f, x) => fs.writeFileSync(f, JSON.stringify(x, null, 2) + '\n');
const num = v => { if (v === undefined || v === null || v === '') return null; const n = Number(String(v).replace(/,/g, '')); return Number.isFinite(n) ? n : null; };
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const sha = x => crypto.createHash('sha256').update(x).digest('hex');
const pctText = x => `${(x * 100).toFixed(2)}%`;

// ---- Universe -------------------------------------------------------------

function ordinaryShare(x) {
  const n = x.name || '';
  if (!/^\d{6}$/.test(x.ticker)) return false;
  if (/(^|\s)(KODEX|TIGER|ACE|RISE|ARIRANG|HANARO|KBSTAR|SOL|PLUS|TIME|KOSEF|KIWOOM)\b/i.test(n)) return false;
  if (/(ETF|ETN|SPAC|스팩|레버리지|인버스|커버드콜|머니마켓|채권|금현물|CD금리|KOFR|MSCI|S&P|나스닥|혼합|액티브)/i.test(n)) return false;
  if (/(^|\s)리츠$|REIT/i.test(n)) return false;
  if (/(우선|[1-3]?우(?:B|C)?$)/.test(n)) return false;
  return x.market === 'KOSPI' || x.market === 'KOSDAQ';
}
function quality(bars) { return bars.length >= 273 && !bars.some((x, i) => i && (x.close / bars[i - 1].close < 0.6 || x.close / bars[i - 1].close > 1.4)); }

// Load top-300 ordinary shares that have a usable local price cache.
function loadPriceStates(limit) {
  let top = read(TOP_FILE).universe.top300.filter(ordinaryShare);
  if (limit) top = top.slice(0, limit);
  const states = new Map();
  for (const u of top) {
    const f = path.join(DATA, 'normalized', `${u.ticker}.json`);
    if (!fs.existsSync(f)) continue;
    const x = read(f);
    if (quality(x.bars)) states.set(u.ticker, { ...u, bars: x.bars, rawSha256: x.rawSha256 || '' });
  }
  return { top, states };
}

// Trading calendar comes from the benchmark daily series (same as prior studies).
function loadCalendar() {
  const base = read(BASE_FILE);
  return { base, calendar: base.benchmark.dailyEquity.map(x => x.date).filter(d => d >= START && d <= CUTOFF) };
}
function monthEnds(calendar) { return calendar.filter((d, i) => !calendar[i + 1] || calendar[i + 1].slice(0, 7) !== d.slice(0, 7)); }

// ---- Price helpers --------------------------------------------------------

function lastIndex(bars, date) { let lo = 0, hi = bars.length - 1, out = -1; while (lo <= hi) { const mid = (lo + hi) >> 1; if (bars[mid].date <= date) { out = mid; lo = mid + 1; } else hi = mid - 1; } return out; }
function exactPrice(s, d, f) { const i = lastIndex(s.bars, d); return i >= 0 && s.bars[i].date === d ? s.bars[i][f] : null; }
function closePrice(s, d) { const i = lastIndex(s.bars, d); return i >= 0 ? s.bars[i].close : null; }
function stddev(xs) { const m = xs.reduce((s, x) => s + x, 0) / xs.length; return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, xs.length - 1)); }
// Trailing annualized realized volatility over `window` sessions ending at bar i.
function realizedVol(bars, i, window) {
  if (i < window) return null;
  const rets = [];
  for (let j = i - window + 1; j <= i; j++) { if (j < 1) return null; rets.push(bars[j].close / bars[j - 1].close - 1); }
  if (rets.length < window) return null;
  return stddev(rets) * Math.sqrt(252);
}
function trailingReturn(bars, i, window) { if (i < window) return null; return bars[i].close / bars[i - window].close - 1; }

// Assign an ascending percentile [0,1] for `key`; set `descending` to true when
// a LOWER raw value should rank HIGHER (low-vol, cheap value, reversal loser).
function percentile(rows, key, descending) {
  const valid = rows.filter(x => x[key] !== null && x[key] !== undefined && Number.isFinite(x[key]))
    .sort((a, b) => descending ? b[key] - a[key] : a[key] - b[key]);
  const n = valid.length;
  valid.forEach((x, i) => { x[`${key}Pct`] = n <= 1 ? 1 : i / (n - 1); });
}

// ---- Metrics --------------------------------------------------------------

function stats(e) {
  if (e.length < 2) return { startEquity: e[0]?.equity || INITIAL, endEquity: e.at(-1)?.equity || INITIAL, totalReturn: 0, cagr: 0, annualizedVolatility: 0, sharpeZeroRf: 0, maxDrawdown: 0, calmar: 0, monthWinRate: 0, sessions: e.length };
  const r = e.slice(1).map((x, i) => x.equity / e[i].equity - 1), m = r.reduce((s, x) => s + x, 0) / r.length, v = stddev(r), years = (Date.parse(e.at(-1).date) - Date.parse(e[0].date)) / 86400000 / 365.25;
  let peak = 0, mdd = 0; for (const x of e) { peak = Math.max(peak, x.equity); mdd = Math.min(mdd, x.equity / peak - 1); }
  const mv = new Map(); e.forEach(x => mv.set(x.date.slice(0, 7), x.equity)); const vals = [...mv.values()], mr = vals.slice(1).map((x, i) => x / vals[i] - 1);
  const cagr = (e.at(-1).equity / e[0].equity) ** (1 / years) - 1;
  return { startEquity: e[0].equity, endEquity: e.at(-1).equity, totalReturn: e.at(-1).equity / e[0].equity - 1, cagr, annualizedVolatility: v * Math.sqrt(252), sharpeZeroRf: v ? m / v * Math.sqrt(252) : 0, maxDrawdown: mdd, calmar: mdd ? cagr / Math.abs(mdd) : 0, monthWinRate: mr.length ? mr.filter(x => x > 0).length / mr.length : 0, sessions: e.length };
}
function annual(e) { const out = {}; for (let y = 2016; y <= 2026; y++) { const a = e.filter(x => x.date.startsWith(String(y))); if (a.length > 1) out[y] = a.at(-1).equity / a[0].equity - 1; } return out; }

// ---- Simulation -----------------------------------------------------------
// Signals are computed at each month-end close; orders execute at the next
// session's open. Equal-weight target within the stock sleeve, cash residual,
// 25bp on every traded notional. (Identical mechanics to the prior studies.)
function runBacktest(states, calendar, orders) {
  const pos = new Map(), trades = [], equity = []; let cash = INITIAL, turnover = 0;
  const value = (d, f) => { let v = cash; for (const [t, q] of pos) { const p = f === 'close' ? closePrice(states.get(t), d) : exactPrice(states.get(t), d, f); if (p !== null) v += q * p; } return v; };
  for (const d of calendar) {
    const o = orders.get(d);
    if (o) {
      const before = value(d, 'open'), names = o.tickers.filter(t => exactPrice(states.get(t), d, 'open') !== null), all = new Set([...pos.keys(), ...names]);
      let lo = 0, hi = before;
      for (let z = 0; z < 32; z++) { let c = cash, invest = (lo + hi) / 2; for (const t of all) { const p = exactPrice(states.get(t), d, 'open'); if (p === null) continue; const target = names.includes(t) ? invest / names.length / p : 0, delta = target - (pos.get(t) || 0); c -= delta * p + Math.abs(delta) * p * COST; } if (c >= 0) lo = invest; else hi = invest; }
      for (const t of all) { const p = exactPrice(states.get(t), d, 'open'); if (p === null) continue; const target = names.includes(t) ? lo / names.length / p : 0, delta = target - (pos.get(t) || 0); if (Math.abs(delta) < 1e-8) continue; const n = Math.abs(delta) * p, fee = n * COST; cash -= delta * p + fee; turnover += n / Math.max(before, 1); if (target) pos.set(t, target); else pos.delete(t); trades.push({ date: d, signalDate: o.signalDate, ticker: t, side: delta > 0 ? 'BUY' : 'SELL', notional: n, estimatedCost: fee }); }
    }
    equity.push({ date: d, equity: value(d, 'close'), cash, holdings: pos.size });
  }
  return { equity, trades, turnover };
}

// ---- DART point-in-time quarterly panel -----------------------------------
// Extends the alternative-indicators account set with net income, CFO, total
// liabilities, current assets, and current liabilities so Piotroski and value
// signals can be built from the same cache. Flow accounts (revenue, gross, net,
// cfo, eps) are cumulative YTD in quarterly filings and de-cumulated into
// standalone quarters; balance-sheet accounts are point-in-time snapshots.

const FLOW_KINDS = ['revenue', 'gross', 'net', 'cfo', 'eps'];
const SNAP_KINDS = ['assets', 'liab', 'currentAssets', 'currentLiabilities'];

function chooseAccount(list, kind) {
  const c = list.filter(a => {
    const id = a.account_id || '', nm = a.account_nm || '';
    if (kind === 'revenue') { if (/CostOfSales|OtherRevenue|InvestmentIncome|기타수익|매출원가/.test(id + '|' + nm)) return false; return id === 'ifrs-full_Revenue' || id === 'ifrs_Revenue' || /^(매출액|수익\(매출액\)|영업수익|매출)$/.test(nm); }
    if (kind === 'eps') return (/BasicEarningsLossPerShare/.test(id) || /기본.*주당.*이익/.test(nm)) && !/Preferred|FromContinuing|FromDiscontinued|우선|희석|중단|계속/.test(id + '|' + nm);
    if (kind === 'gross') return id === 'ifrs-full_GrossProfit' || id === 'ifrs_GrossProfit' || /^매출총이익/.test(nm);
    if (kind === 'net') return id === 'ifrs-full_ProfitLoss' || id === 'ifrs_ProfitLoss' || /^(당기순이익|당기순이익\(손실\)|분기순이익)$/.test(nm);
    if (kind === 'cfo') return /CashFlowsFromUsedInOperatingActivities/.test(id) || /영업활동.*현금흐름/.test(nm);
    if (kind === 'assets') return id === 'ifrs-full_Assets' || id === 'ifrs_Assets' || /^자산총계$/.test(nm);
    if (kind === 'liab') return id === 'ifrs-full_Liabilities' || id === 'ifrs_Liabilities' || /^부채총계$/.test(nm);
    if (kind === 'currentAssets') return id === 'ifrs-full_CurrentAssets' || id === 'ifrs_CurrentAssets' || /^유동자산$/.test(nm);
    if (kind === 'currentLiabilities') return id === 'ifrs-full_CurrentLiabilities' || id === 'ifrs_CurrentLiabilities' || /^유동부채$/.test(nm);
    return false;
  });
  const rank = a => { const id = a.account_id || ''; return id.startsWith('ifrs-full_') ? 0 : id.startsWith('ifrs_') ? 1 : 2; };
  return c.sort((a, b) => rank(a) - rank(b))[0] || null;
}

function loadRawReports() {
  const raw = new Map(), files = fs.readdirSync(PANEL).filter(f => f.endsWith('.json'));
  const manifest = [];
  for (const f of files) {
    const m = f.match(/^(\d+)-(\d+)-(\d+)\.json$/); if (!m) continue;
    const x = read(path.join(PANEL, f));
    const status = x.response?.status || 'error'; manifest.push(`${f}|${status}|${x.fsDiv || 'CFS'}|${x.fetchedAt || ''}`);
    if (status !== '000') continue;
    const list = x.response.list || [];
    const accounts = {}; for (const k of [...FLOW_KINDS, ...SNAP_KINDS]) accounts[k] = chooseAccount(list, k);
    if (!Object.values(accounts).some(Boolean)) continue;
    const receipts = list.map(a => a.rcept_no).filter(Boolean).map(String).sort(); const filingRaw = (receipts.at(-1) || '').slice(0, 8); if (!/^\d{8}$/.test(filingRaw)) continue;
    const filing = `${filingRaw.slice(0, 4)}-${filingRaw.slice(4, 6)}-${filingRaw.slice(6, 8)}`;
    const metric = a => a ? { direct: num(a.thstrm_amount), cumulative: num(a.thstrm_add_amount) ?? num(a.thstrm_amount) } : { direct: null, cumulative: null };
    const point = a => a ? (num(a.thstrm_amount) ?? num(a.thstrm_add_amount)) : null;
    const entry = { filing, fsDiv: x.fsDiv || 'CFS' };
    for (const k of FLOW_KINDS) entry[k] = metric(accounts[k]);
    for (const k of SNAP_KINDS) entry[k] = point(accounts[k]);
    const ticker = m[1], year = Number(m[2]), report = m[3];
    if (!raw.has(ticker)) raw.set(ticker, new Map());
    if (!raw.get(ticker).has(year)) raw.get(ticker).set(year, new Map());
    raw.get(ticker).get(year).set(report, entry);
  }
  return { raw, manifestHash: sha(manifest.sort().join('\n')), files: files.length };
}

// Build a per-ticker time-ordered quarterly series. Flow fields carry standalone
// quarter values; snapshot fields carry the reported balance at quarter end.
function buildSeries(years) {
  const out = [];
  for (let y = 2015; y <= 2026; y++) {
    const q = [years.get(y)?.get('11013'), years.get(y)?.get('11012'), years.get(y)?.get('11014')]; const annualRep = years.get(y)?.get('11011');
    const prior = {}; for (const k of FLOW_KINDS) prior[k] = null;
    for (let i = 0; i < q.length; i++) {
      const r = q[i]; if (!r) continue;
      const flow = k => r[k].direct ?? (r[k].cumulative !== null && prior[k] !== null ? r[k].cumulative - prior[k] : r[k].cumulative);
      const row = { year: y, quarter: i + 1, filing: r.filing };
      for (const k of FLOW_KINDS) row[k] = flow(k);
      for (const k of SNAP_KINDS) row[k] = r[k];
      out.push(row);
      for (const k of FLOW_KINDS) if (r[k].cumulative !== null) prior[k] = r[k].cumulative;
    }
    if (annualRep) {
      const row = { year: y, quarter: 4, filing: annualRep.filing };
      for (const k of FLOW_KINDS) { const v = annualRep[k].direct !== null && prior[k] !== null ? annualRep[k].direct - prior[k] : annualRep[k].direct; row[k] = v; }
      for (const k of SNAP_KINDS) row[k] = annualRep[k];
      out.push(row);
    }
  }
  return out.sort((a, b) => (a.year - b.year) || (a.quarter - b.quarter));
}

function loadSeriesByTicker() {
  const loaded = loadRawReports();
  return { series: new Map([...loaded.raw].map(([t, years]) => [t, buildSeries(years)])), manifestHash: loaded.manifestHash, files: loaded.files };
}

function improvement(cur, prev) { if (cur === null || prev === null || !Number.isFinite(cur) || !Number.isFinite(prev) || prev === 0) return null; return clamp((cur - prev) / Math.abs(prev), -5, 5); }

// EPS/revenue improvement percentiles — the fundamental sleeve reused by the
// low-vol / reversal combo variants (identical definition to the baseline).
function fundamentalAt(series, date) {
  const reports = series.filter(x => x.filing <= date && x.revenue !== null && x.eps !== null).sort((a, b) => b.filing.localeCompare(a.filing));
  for (const r of reports) {
    const same = series.find(x => x.year === r.year - 1 && x.quarter === r.quarter && x.revenue !== null && x.eps !== null);
    const idx = series.indexOf(r), prev = idx > 0 ? series[idx - 1] : null;
    const metrics = { revenueYoY: improvement(r.revenue, same?.revenue ?? null), revenueQoQ: improvement(r.revenue, prev?.revenue ?? null), epsYoY: improvement(r.eps, same?.eps ?? null), epsQoQ: improvement(r.eps, prev?.eps ?? null) };
    if (Object.values(metrics).filter(x => x !== null).length >= 3) return { report: r, metrics };
  }
  return null;
}

// Attach an EPS/revenue composite percentile (0..1) to each row that carries a
// `.fundamental` object, matching the baseline's four-metric average.
function attachFundamentalComposite(rows) {
  for (const k of ['revenueYoY', 'revenueQoQ', 'epsYoY', 'epsQoQ']) {
    const proxy = rows.map(r => ({ r, value: r.fundamental ? r.fundamental.metrics[k] : null })).filter(x => x.value !== null).sort((a, b) => a.value - b.value);
    const n = proxy.length; proxy.forEach((x, i) => { x.r[`${k}Pct`] = n <= 1 ? 1 : i / (n - 1); });
  }
  for (const r of rows) { const p = ['revenueYoYPct', 'revenueQoQPct', 'epsYoYPct', 'epsQoQPct'].filter(k => r[k] !== undefined); r.fundamentalScore = p.length >= 3 ? p.reduce((s, k) => s + r[k], 0) / p.length : null; }
}

// Trailing-twelve-month sum of a standalone flow field from the latest reports
// filed on/before `date`. Returns { value, report, quarters } or null.
function ttmFlow(series, date, key, minQuarters = 4) {
  const reports = series.filter(x => x.filing <= date && x[key] !== null && Number.isFinite(x[key])).sort((a, b) => a.filing.localeCompare(b.filing));
  if (reports.length < minQuarters) return null;
  const last4 = reports.slice(-4);
  return { value: last4.reduce((s, x) => s + x[key], 0), report: last4.at(-1), quarters: last4.map(x => `${x.year}Q${x.quarter}`) };
}

// Latest reported balance-sheet snapshot on/before `date`.
function latestSnapshot(series, date, key) {
  const reports = series.filter(x => x.filing <= date && x[key] !== null && Number.isFinite(x[key])).sort((a, b) => a.filing.localeCompare(b.filing));
  return reports.length ? { value: reports.at(-1)[key], report: reports.at(-1) } : null;
}

// Panel status summary + price manifest hash for report reproduction blocks.
function panelStatus() {
  const panelFiles = fs.readdirSync(PANEL).filter(f => f.endsWith('.json')), out = { total: panelFiles.length, ok: 0, ofs: 0, noData: 0 };
  for (const f of panelFiles) { const x = read(path.join(PANEL, f)); if (x.response?.status === '000') { out.ok++; if (x.fsDiv === 'OFS') out.ofs++; } else if (x.response?.status === '013') out.noData++; }
  return out;
}
function priceManifestHash(states) { return sha([...states].map(([t, s]) => `${t}:${s.rawSha256 || ''}`).sort().join('\n')); }

// Standard disclaimer every report must carry.
const DISCLAIMER = [
  'Current market-cap universe applied historically; survivorship bias remains.',
  '거래정지·상장폐지·호가·시장충격·세금·배당·유상증자는 반영하지 않는다.',
];

module.exports = {
  fs, path,
  ROOT, DATA, PANEL, OUT, TOP_FILE, BASE_FILE,
  START, CUTOFF, OOS_START, COST, INITIAL, MAX_HOLDINGS,
  read, write, num, clamp, sha, pctText,
  ordinaryShare, quality, loadPriceStates, loadCalendar, monthEnds,
  lastIndex, exactPrice, closePrice, stddev, realizedVol, trailingReturn, percentile,
  stats, annual, runBacktest,
  chooseAccount, loadRawReports, buildSeries, loadSeriesByTicker,
  improvement, fundamentalAt, attachFundamentalComposite, ttmFlow, latestSnapshot,
  panelStatus, priceManifestHash, DISCLAIMER,
};
