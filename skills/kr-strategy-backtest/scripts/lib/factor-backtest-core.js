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
const COST = 0.0025; // 25bp one-way (commission + slippage)
const SELL_TAX = 0.0018; // Korea securities transaction tax on sells (~0.18%), buys exempt
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
      // Sells pay commission+slippage AND Korea transaction tax; buys pay commission+slippage only.
      const rateFor = delta => delta > 0 ? COST : COST + SELL_TAX;
      let lo = 0, hi = before;
      for (let z = 0; z < 32; z++) { let c = cash, invest = (lo + hi) / 2; for (const t of all) { const p = exactPrice(states.get(t), d, 'open'); if (p === null) continue; const target = names.includes(t) ? invest / names.length / p : 0, delta = target - (pos.get(t) || 0); c -= delta * p + Math.abs(delta) * p * rateFor(delta); } if (c >= 0) lo = invest; else hi = invest; }
      for (const t of all) { const p = exactPrice(states.get(t), d, 'open'); if (p === null) continue; const target = names.includes(t) ? lo / names.length / p : 0, delta = target - (pos.get(t) || 0); if (Math.abs(delta) < 1e-8) continue; const n = Math.abs(delta) * p, fee = n * rateFor(delta); cash -= delta * p + fee; turnover += n / Math.max(before, 1); if (target) pos.set(t, target); else pos.delete(t); trades.push({ date: d, signalDate: o.signalDate, ticker: t, side: delta > 0 ? 'BUY' : 'SELL', notional: n, estimatedCost: fee }); }
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

// ---- Benchmarks -----------------------------------------------------------

// Equal-weight, daily-rebalanced, costless total-return benchmark built from the
// SAME dividend/split-adjusted top-300 prices the strategies trade. Apples-to-
// apples on the dividend dimension, unlike the ^KS11/^KQ11 price index (which
// excludes dividends while the strategy legs are total-return) — fixes C2.
function equalWeightUniverseBenchmark(states, calendar) {
  const names = [...states.keys()].filter(t => closePrice(states.get(t), calendar[0]) !== null);
  const base = new Map(names.map(t => [t, closePrice(states.get(t), calendar[0])]));
  const equity = calendar.map(d => {
    let sum = 0, cnt = 0;
    for (const t of names) { const p = closePrice(states.get(t), d); if (p !== null) { sum += p / base.get(t); cnt++; } }
    return { date: d, equity: INITIAL * (cnt ? sum / cnt : 1) };
  });
  return { name: '동일가중 유니버스(총수익)', summary: stats(equity), dailyEquity: equity, constituents: names.length };
}

// Order stream for the current recommended baseline: 252-day price momentum 50%
// + EPS/revenue improvement 50%, top-10. Runs through runBacktest so the
// baseline pays the SAME sell tax as the factor strategies — an apples-to-apples
// comparison row (fixes the "baseline pulled from a pre-tax artifact" gap in C3).
function momentumEpsOrders(states, series, calendar) {
  const orders = new Map();
  for (const signalDate of monthEnds(calendar)) {
    const rows = [];
    for (const [ticker, state] of states) {
      const i = lastIndex(state.bars, signalDate);
      if (i < 252 || state.bars[i].date !== signalDate) continue;
      const fundamental = fundamentalAt(series.get(ticker) || [], signalDate);
      if (!fundamental) continue;
      rows.push({ ticker, ret252: state.bars[i].close / state.bars[i - 252].close - 1, fundamental });
    }
    if (!rows.length) continue;
    percentile(rows, 'ret252');
    attachFundamentalComposite(rows);
    for (const r of rows) r.score = r.fundamentalScore === null ? null : 0.5 * r.ret252Pct + 0.5 * r.fundamentalScore;
    const ranked = rows.filter(r => r.score !== null).sort((a, b) => b.score - a.score || b.ret252 - a.ret252);
    const next = calendar[calendar.indexOf(signalDate) + 1];
    if (next && next <= CUTOFF) orders.set(next, { signalDate, tickers: ranked.slice(0, MAX_HOLDINGS).map(r => r.ticker) });
  }
  return orders;
}
function taxedMomentumBaseline(states, series, calendar) {
  const run = runBacktest(states, calendar, momentumEpsOrders(states, series, calendar));
  return { summary: { ...stats(run.equity), tradeCount: run.trades.length, turnover: run.turnover }, dailyEquity: run.equity };
}

// ---- Statistics (H1/H3) ---------------------------------------------------

// Monthly-block bootstrap CI for CAGR / Sharpe / MDD. Resamples whole calendar
// months with replacement to preserve within-month autocorrelation, rebuilds an
// equity path, and returns the 5th/50th/95th percentiles. Plain node execution,
// so Math.random is available (unlike Workflow scripts). Deterministic-ish: the
// caller may seed by ordering; here we accept sampling noise at 1000 resamples.
function blockBootstrapCI(dailyEquity, resamples = 1000) {
  if (dailyEquity.length < 3) return null;
  // Group daily simple returns by calendar month.
  const byMonth = new Map();
  for (let i = 1; i < dailyEquity.length; i++) {
    const m = dailyEquity[i].date.slice(0, 7), r = dailyEquity[i].equity / dailyEquity[i - 1].equity - 1;
    if (!byMonth.has(m)) byMonth.set(m, []);
    byMonth.get(m).push(r);
  }
  const blocks = [...byMonth.values()];
  if (blocks.length < 6) return null;
  const startDate = dailyEquity[0].date, endDate = dailyEquity.at(-1).date;
  const years = (Date.parse(endDate) - Date.parse(startDate)) / 86400000 / 365.25;
  const cagrs = [], sharpes = [], mdds = [];
  for (let s = 0; s < resamples; s++) {
    const rets = [];
    for (let b = 0; b < blocks.length; b++) rets.push(...blocks[Math.floor(Math.random() * blocks.length)]);
    // Metrics from the resampled daily return path.
    let eq = 1, peak = 1, mdd = 0; for (const r of rets) { eq *= 1 + r; peak = Math.max(peak, eq); mdd = Math.min(mdd, eq / peak - 1); }
    const mean = rets.reduce((a, b) => a + b, 0) / rets.length, sd = stddev(rets);
    cagrs.push(eq ** (1 / years) - 1);
    sharpes.push(sd ? mean / sd * Math.sqrt(252) : 0);
    mdds.push(mdd);
  }
  const pctl = (arr, q) => { const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.floor(q * s.length)))]; };
  const band = arr => ({ p5: pctl(arr, 0.05), p50: pctl(arr, 0.5), p95: pctl(arr, 0.95) });
  return { resamples, months: blocks.length, cagr: band(cagrs), sharpe: band(sharpes), maxDrawdown: band(mdds) };
}

// Inverse standard-normal CDF (Acklam's rational approximation), for the
// expected-maximum-Sharpe hurdle below.
function probit(p) {
  if (p <= 0) return -Infinity; if (p >= 1) return Infinity;
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.383577518672690e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const pl = 0.02425;
  if (p < pl) { const q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  if (p > 1 - pl) { const q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  const q = p - 0.5, r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

// Multiple-testing hurdle (Bailey/López de Prado, deflated Sharpe). Across
// `trials` independent strategy attempts on `nYears` of data, some Sharpe will
// look high by luck alone. Returns the ANNUALIZED Sharpe hurdle a strategy must
// clear to be distinguishable from the best of `trials` null strategies, in the
// same units as the report tables. `clears` = observed beats the hurdle.
function deflatedSharpeNote(observedSharpe, trials, nYears) {
  const EM = 0.5772156649; // Euler-Mascheroni
  // Expected maximum of `trials` iid standard normals.
  const eMaxZ = (1 - EM) * probit(1 - 1 / trials) + EM * probit(1 - 1 / (trials * Math.E));
  // Standard error of an annualized Sharpe estimate over nYears (normal-returns approx).
  const seSharpe = Math.sqrt((1 + 0.5 * observedSharpe * observedSharpe) / nYears);
  const hurdle = eMaxZ * seSharpe;
  return { observedSharpe, trials, nYears, expectedMaxZ: eMaxZ, sharpeStdErr: seSharpe, hurdleAnnualizedSharpe: hurdle, clears: observedSharpe > hurdle };
}

// ---- MDD-control overlays -------------------------------------------------
// Modulate exposure to a strategy's daily-return stream. Exposure is decided at
// the PRIOR close (no look-ahead) and each exposure change pays a transaction
// cost (sell rate when de-risking, buy rate when re-risking), so whipsaw is
// charged honestly. `marketLevels` is [{date, level}] used for the regime MA.

function marketRegimeStates(marketLevels, maWindow = 200, band = 0.03) {
  const states = new Map(); let on = 1;
  for (let i = 0; i < marketLevels.length; i++) {
    if (i < maWindow) { states.set(marketLevels[i].date, 1); continue; } // warmup: fully invested
    const sma = marketLevels.slice(i - maWindow + 1, i + 1).reduce((s, x) => s + x.level, 0) / maWindow;
    const lvl = marketLevels[i].level;
    if (lvl > sma * (1 + band)) on = 1; else if (lvl < sma * (1 - band)) on = 0; // otherwise hold prior state (hysteresis)
    states.set(marketLevels[i].date, on);
  }
  return states;
}

function trailingVolOfReturns(rets, endIdx, window) {
  if (endIdx < window) return null;
  return stddev(rets.slice(endIdx - window + 1, endIdx + 1)) * Math.sqrt(252);
}

// Apply a regime filter and/or volatility target to a strategy's daily equity.
// Returns a new daily-equity path carrying `exposure` each day.
function applyMddOverlay(dailyEquity, marketLevels, opts = {}) {
  const { regime = false, volTarget = null, maWindow = 200, band = 0.03, volWindow = 60 } = opts;
  const dates = dailyEquity.map(x => x.date);
  const rets = dailyEquity.map((x, i) => i ? x.equity / dailyEquity[i - 1].equity - 1 : 0);
  const regimeStates = regime ? marketRegimeStates(marketLevels, maWindow, band) : null;
  let e = 1, eq = INITIAL, exposureTurnover = 0;
  const out = [{ date: dates[0], equity: INITIAL, exposure: 1 }];
  for (let i = 1; i < dates.length; i++) {
    let eDes = 1;
    if (regimeStates) eDes *= (regimeStates.get(dates[i - 1]) ?? 1);
    if (volTarget) { const tv = trailingVolOfReturns(rets, i - 1, volWindow); if (tv && tv > 0) eDes = Math.min(eDes, Math.min(1, volTarget / tv)); }
    const change = Math.abs(eDes - e), rate = eDes < e ? COST + SELL_TAX : COST;
    eq *= (1 - change * rate); exposureTurnover += change;
    e = eDes;
    eq *= (1 + e * rets[i]);
    out.push({ date: dates[i], equity: eq, exposure: e });
  }
  out.exposureTurnover = exposureTurnover;
  return out;
}

// ---- Survivorship sensitivity (C1) ----------------------------------------

// Re-run a strategy's month-end selections with the ex-post best-performing
// `dropFrac` of names removed from the tradable universe each rebalance. The
// CAGR gap vs the full-universe run is a LOWER BOUND on the survivorship premium
// (it does not add back truly delisted names, which the cache lacks).
function winnerRemovalOrders(states, series, calendar, buildOrders, dropFrac) {
  // Rank names by full-sample total return; drop the top dropFrac from selection.
  const fullReturn = new Map();
  for (const [t, s] of states) { const first = closePrice(s, calendar[0]), last = closePrice(s, calendar.at(-1)); if (first && last) fullReturn.set(t, last / first - 1); }
  const ranked = [...fullReturn.entries()].sort((a, b) => b[1] - a[1]);
  const dropSet = new Set(ranked.slice(0, Math.floor(ranked.length * dropFrac)).map(x => x[0]));
  const reduced = new Map([...states].filter(([t]) => !dropSet.has(t)));
  const orders = buildOrders(reduced, series, calendar);
  return { orders, states: reduced, dropped: dropSet.size };
}

// One-call report augmentation shared by every factor script: the total-return
// EW-universe benchmark (C2), the sell-tax-consistent momentum baseline (C3),
// and per-strategy bootstrap CI + multiple-testing hurdle (H1/H3).
// `headlineEquityByStrategy` maps a strategy key to its dailyEquity array.
function reportAugmentation(states, calendar, series, headlineEquityByStrategy, nTrials = 50) {
  const nYears = (Date.parse(calendar.at(-1)) - Date.parse(calendar[0])) / 86400000 / 365.25;
  const strategyStats = {};
  for (const [k, eq] of Object.entries(headlineEquityByStrategy)) {
    const s = stats(eq);
    strategyStats[k] = { ci: blockBootstrapCI(eq), deflated: deflatedSharpeNote(s.sharpeZeroRf, nTrials, nYears) };
  }
  return {
    ewTotalReturnBenchmark: equalWeightUniverseBenchmark(states, calendar),
    taxedMomentumBaseline: taxedMomentumBaseline(states, series, calendar),
    strategyStats, nYears, nTrials,
    costModel: { buyBps: COST * 10000, sellBps: (COST + SELL_TAX) * 10000, sellTaxBps: SELL_TAX * 10000 },
  };
}

// Render a compact Markdown footnote block from reportAugmentation output for a
// chosen headline strategy key. Keeps every report's stats section identical.
function statsFootnote(aug, headlineKey, headlineLabel) {
  const st = aug.strategyStats[headlineKey]; if (!st) return '';
  const p = x => `${(x * 100).toFixed(1)}%`;
  const ci = st.ci, d = st.deflated;
  const ciLine = ci ? `CAGR 90% 신뢰구간 ${p(ci.cagr.p5)}~${p(ci.cagr.p95)} (중앙 ${p(ci.cagr.p50)}), Sharpe ${ci.sharpe.p5.toFixed(2)}~${ci.sharpe.p95.toFixed(2)} — 월 블록 부트스트랩 ${ci.resamples}회, ${ci.months}개월` : '신뢰구간 산출 불가(표본 부족)';
  return `## 통계적 엄밀성 (${headlineLabel})

- **신뢰구간:** ${ciLine}.
- **다중검정 허들:** 이 레포는 동일 표본에서 ~${d.trials}개 구성을 시험했다. 운만으로 나올 최대 연율 Sharpe 허들은 **${d.hurdleAnnualizedSharpe.toFixed(2)}** (Deflated Sharpe, López de Prado). 관측 Sharpe ${d.observedSharpe.toFixed(2)} → **${d.clears ? '허들 통과(선택편향으로 설명 안 됨)' : '허들 미달(운으로 설명 가능, 과신 금지)'}**.
- **벤치마크 해석:** 가격지수(50:50)는 배당을 빼 저평가된 하한 바, 동일가중 유니버스(총수익)는 배당 포함이지만 **소형주 틸트+생존자편향이 섞인 상한 바**다. 공정한 기준선은 두 값 사이에 있다.
`;
}

// Standard disclaimer every report must carry. Transaction tax is now modeled;
// market impact / halts / true delisting are still not.
const DISCLAIMER = [
  'Current market-cap universe applied historically; survivorship bias remains (see winner-removal bound).',
  '매수 25bp + 매도 25bp에 한국 증권거래세 0.18%를 반영. 호가·시장충격·거래정지·상장폐지·유상증자는 미반영.',
];

module.exports = {
  fs, path,
  ROOT, DATA, PANEL, OUT, TOP_FILE, BASE_FILE,
  START, CUTOFF, OOS_START, COST, SELL_TAX, INITIAL, MAX_HOLDINGS,
  read, write, num, clamp, sha, pctText,
  ordinaryShare, quality, loadPriceStates, loadCalendar, monthEnds,
  lastIndex, exactPrice, closePrice, stddev, realizedVol, trailingReturn, percentile,
  stats, annual, runBacktest,
  chooseAccount, loadRawReports, buildSeries, loadSeriesByTicker,
  improvement, fundamentalAt, attachFundamentalComposite, ttmFlow, latestSnapshot,
  equalWeightUniverseBenchmark, momentumEpsOrders, taxedMomentumBaseline,
  blockBootstrapCI, probit, deflatedSharpeNote, winnerRemovalOrders,
  marketRegimeStates, applyMddOverlay,
  reportAugmentation, statsFootnote,
  panelStatus, priceManifestHash, DISCLAIMER,
};
