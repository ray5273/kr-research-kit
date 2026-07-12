#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const DATA = path.join(ROOT, '.tmp/kr-strategy-backtest/2026-07-10');
const PANEL = path.join(ROOT, '.tmp/kr-strategy-backtest/dart-quarterly-panel');
const OUT = path.join(ROOT, 'analysis-example/kr-market/strategies/trend-following-10y');
const TOP_FILE = path.join(OUT, 'largecap-momentum-backtest-2026-07-10.json');
const BASE_FILE = path.join(OUT, 'backtest-2026-07-10.json');
const START = '2016-07-11';
const CUTOFF = process.env.CUTOFF || '2025-12-31';
const END_YEAR = Number(CUTOFF.slice(0, 4));
const MOMENTUM_MODE = process.env.MOMENTUM_MODE || '12m';
const PRICE_LABEL = MOMENTUM_MODE === 'minervini-rs' ? 'Minervini RS(3개월 40%·6개월 30%·12개월 30%)' : '252거래일 가격 모멘텀';
const INITIAL = 100000000;
const COST = 0.0025;
const MAX_HOLDINGS = 20;

const read = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const write = (f, x) => fs.writeFileSync(f, JSON.stringify(x, null, 2) + '\n');
const num = v => {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
};
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

function ordinaryShare(x) {
  const n = x.name || '';
  if (!/^\d{6}$/.test(x.ticker)) return false;
  if (/(^|\s)(KODEX|TIGER|ACE|RISE|ARIRANG|HANARO|KBSTAR|SOL|PLUS|TIME|KOSEF|KIWOOM)\b/i.test(n)) return false;
  if (/(ETF|ETN|SPAC|스팩|레버리지|인버스|커버드콜|머니마켓|채권|금현물|CD금리|KOFR|MSCI|S&P|나스닥|혼합|액티브)/i.test(n)) return false;
  if (/(^|\s)리츠$|REIT/i.test(n)) return false;
  if (/(우선|[1-3]?우(?:B|C)?$)/.test(n)) return false;
  return x.market === 'KOSPI' || x.market === 'KOSDAQ';
}

function quality(bars) {
  return bars.length >= 273 && !bars.some((x, i) => i && (x.close / bars[i - 1].close < 0.6 || x.close / bars[i - 1].close > 1.4));
}

function chooseAccount(list, kind) {
  const c = list.filter(a => {
    const id = a.account_id || '';
    const nm = a.account_nm || '';
    if (kind === 'revenue') {
      if (/CostOfSales|OtherRevenue|InvestmentIncome|기타수익|매출원가/.test(id + '|' + nm)) return false;
      return id === 'ifrs-full_Revenue' || id === 'ifrs_Revenue' || /^(매출액|수익\(매출액\)|영업수익|매출)$/.test(nm);
    }
    if (!(/BasicEarningsLossPerShare/.test(id) || /기본.*주당.*이익/.test(nm))) return false;
    return !/Preferred|FromContinuing|FromDiscontinued|우선|희석|중단|계속/.test(id + '|' + nm);
  });
  const score = a => {
    const id = a.account_id || '', nm = a.account_nm || '';
    if (kind === 'revenue') return id === 'ifrs-full_Revenue' ? 0 : id === 'ifrs_Revenue' ? 1 : nm === '매출액' ? 2 : nm === '수익(매출액)' ? 3 : nm === '영업수익' ? 4 : 5;
    return id === 'ifrs-full_BasicEarningsLossPerShare' ? 0 : id === 'ifrs_BasicEarningsLossPerShare' ? 1 : 2;
  };
  return c.sort((a, b) => score(a) - score(b))[0] || null;
}

function loadRawReports() {
  const raw = new Map();
  for (const f of fs.readdirSync(PANEL)) {
    const m = f.match(/^(\d+)-(\d+)-(\d+)\.json$/);
    if (!m) continue;
    const x = read(path.join(PANEL, f));
    if (x.response?.status !== '000') continue;
    const rev = chooseAccount(x.response.list || [], 'revenue');
    const eps = chooseAccount(x.response.list || [], 'eps');
    if (!rev || !eps) continue;
    const receipts = [rev.rcept_no, eps.rcept_no].filter(Boolean).map(String).sort();
    const filingRaw = (receipts.at(-1) || '').slice(0, 8);
    if (!/^\d{8}$/.test(filingRaw)) continue;
    const filing = `${filingRaw.slice(0, 4)}-${filingRaw.slice(4, 6)}-${filingRaw.slice(6, 8)}`;
    const ticker = m[1], year = Number(m[2]), report = m[3];
    if (!raw.has(ticker)) raw.set(ticker, new Map());
    const years = raw.get(ticker);
    if (!years.has(year)) years.set(year, new Map());
    years.get(year).set(report, {
      filing,
      rev: { direct: num(rev.thstrm_amount), cumulative: num(rev.thstrm_add_amount) ?? num(rev.thstrm_amount) },
      eps: { direct: num(eps.thstrm_amount), cumulative: num(eps.thstrm_add_amount) ?? num(eps.thstrm_amount) },
    });
  }
  return raw;
}

function buildSeries(years) {
  const out = [];
  for (let y = 2015; y <= END_YEAR; y++) {
    const q1 = years.get(y)?.get('11013');
    const q2 = years.get(y)?.get('11012');
    const q3 = years.get(y)?.get('11014');
    const annual = years.get(y)?.get('11011');
    const q = [q1, q2, q3];
    const priorCum = { rev: null, eps: null };
    for (let i = 0; i < q.length; i++) {
      const r = q[i];
      if (!r) continue;
      const quarter = i + 1;
      const rev = r.rev.direct ?? (r.rev.cumulative !== null && priorCum.rev !== null ? r.rev.cumulative - priorCum.rev : r.rev.cumulative);
      const eps = r.eps.direct ?? (r.eps.cumulative !== null && priorCum.eps !== null ? r.eps.cumulative - priorCum.eps : r.eps.cumulative);
      out.push({ year: y, quarter, filing: r.filing, rev, eps });
      if (r.rev.cumulative !== null) priorCum.rev = r.rev.cumulative;
      if (r.eps.cumulative !== null) priorCum.eps = r.eps.cumulative;
    }
    // Annual EPS is not additive, so Q4 EPS is intentionally left null.
    if (annual) {
      const rev = annual.rev.direct !== null && priorCum.rev !== null ? annual.rev.direct - priorCum.rev : annual.rev.direct;
      out.push({ year: y, quarter: 4, filing: annual.filing, rev, eps: null });
    }
  }
  return out.filter(x => x.rev !== null || x.eps !== null).sort((a, b) => (a.year - b.year) || (a.quarter - b.quarter));
}

function improvement(cur, prev) {
  if (cur === null || prev === null || !Number.isFinite(cur) || !Number.isFinite(prev) || prev === 0) return null;
  return clamp((cur - prev) / Math.abs(prev), -5, 5);
}

function fundamentalAt(series, signalDate) {
  const reports = series.filter(x => x.filing <= signalDate && x.rev !== null && x.eps !== null).sort((a, b) => b.filing.localeCompare(a.filing));
  for (const r of reports) {
    const sameYear = series.find(x => x.year === r.year - 1 && x.quarter === r.quarter && x.rev !== null && x.eps !== null);
    const idx = series.indexOf(r);
    const prev = idx > 0 ? series[idx - 1] : null;
    const metrics = {
      revenueYoY: improvement(r.rev, sameYear?.rev ?? null),
      revenueQoQ: improvement(r.rev, prev?.rev ?? null),
      epsYoY: improvement(r.eps, sameYear?.eps ?? null),
      epsQoQ: improvement(r.eps, prev?.eps ?? null),
    };
    const available = Object.values(metrics).filter(x => x !== null).length;
    if (available >= 3) return { report: r, metrics, available };
  }
  return null;
}

function lastIndex(bars, date) {
  let lo = 0, hi = bars.length - 1, out = -1;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (bars[mid].date <= date) { out = mid; lo = mid + 1; } else hi = mid - 1; }
  return out;
}
function exactPrice(state, date, field) {
  const i = lastIndex(state.bars, date);
  return i >= 0 && state.bars[i].date === date ? state.bars[i][field] : null;
}
function closePrice(state, date) {
  const i = lastIndex(state.bars, date);
  return i >= 0 ? state.bars[i].close : null;
}

function percentile(rows, key) {
  const valid = rows.filter(x => x[key] !== null && Number.isFinite(x[key])).sort((a, b) => a[key] - b[key]);
  const n = valid.length;
  valid.forEach((x, i) => { x[`${key}Pct`] = n <= 1 ? 1 : i / (n - 1); });
}

function stats(equity) {
  if (equity.length < 2) return { startEquity: equity[0]?.equity ?? INITIAL, endEquity: equity.at(-1)?.equity ?? INITIAL, totalReturn: 0, cagr: 0, annualizedVolatility: 0, sharpeZeroRf: 0, maxDrawdown: 0, monthWinRate: 0, sessions: equity.length };
  const daily = equity.slice(1).map((x, i) => x.equity / equity[i].equity - 1);
  const mean = daily.reduce((s, x) => s + x, 0) / daily.length;
  const variance = daily.reduce((s, x) => s + (x - mean) ** 2, 0) / Math.max(1, daily.length - 1);
  const vol = Math.sqrt(variance) * Math.sqrt(252);
  let peak = 0, mdd = 0; for (const x of equity) { peak = Math.max(peak, x.equity); mdd = Math.min(mdd, x.equity / peak - 1); }
  const years = (Date.parse(equity.at(-1).date) - Date.parse(equity[0].date)) / 86400000 / 365.25;
  const months = new Map(); equity.forEach(x => months.set(x.date.slice(0, 7), x.equity));
  const mr = [...months.values()].slice(1).map((x, i) => x / [...months.values()][i] - 1);
  return { startEquity: equity[0].equity, endEquity: equity.at(-1).equity, totalReturn: equity.at(-1).equity / equity[0].equity - 1, cagr: (equity.at(-1).equity / equity[0].equity) ** (1 / years) - 1, annualizedVolatility: vol, sharpeZeroRf: vol ? mean / Math.sqrt(variance) * Math.sqrt(252) : 0, maxDrawdown: mdd, monthWinRate: mr.length ? mr.filter(x => x > 0).length / mr.length : 0, sessions: equity.length };
}

function annual(equity) {
  const out = {}; for (let y = 2016; y <= END_YEAR; y++) { const a = equity.filter(x => x.date.startsWith(String(y))); if (a.length > 1) out[y] = a.at(-1).equity / a[0].equity - 1; } return out;
}

function runBacktest(states, calendar, orders) {
  const pos = new Map(), trades = [], equity = []; let cash = INITIAL, turnover = 0;
  const value = (date, field) => { let v = cash; for (const [t, q] of pos) { const p = field === 'close' ? closePrice(states.get(t), date) : exactPrice(states.get(t), date, field); if (p !== null) v += q * p; } return v; };
  for (const date of calendar) {
    const order = orders.get(date);
    if (order) {
      const before = value(date, 'open');
      const names = order.tickers.filter(t => exactPrice(states.get(t), date, 'open') !== null);
      const all = new Set([...pos.keys(), ...names]); let lo = 0, hi = before;
      for (let z = 0; z < 32; z++) { let c = cash, invest = (lo + hi) / 2; for (const t of all) { const p = exactPrice(states.get(t), date, 'open'); if (p === null) continue; const old = pos.get(t) || 0; const target = names.includes(t) ? invest / names.length / p : 0; const d = target - old; c -= d * p + Math.abs(d) * p * COST; } if (c >= 0) lo = invest; else hi = invest; }
      for (const t of all) { const p = exactPrice(states.get(t), date, 'open'); if (p === null) continue; const old = pos.get(t) || 0; const target = names.includes(t) ? lo / names.length / p : 0; const d = target - old; if (Math.abs(d) < 1e-8) continue; const notional = Math.abs(d) * p, fee = notional * COST; cash -= d * p + fee; turnover += notional / Math.max(before, 1); if (target) pos.set(t, target); else pos.delete(t); trades.push({ date, signalDate: order.signalDate, ticker: t, side: d > 0 ? 'BUY' : 'SELL', notional, estimatedCost: fee }); }
    }
    equity.push({ date, equity: value(date, 'close'), cash, holdings: pos.size });
  }
  return { equity, trades, turnover };
}

function main() {
  const top = read(TOP_FILE).universe.top300.filter(ordinaryShare);
  const base = read(BASE_FILE);
  const calendar = base.benchmark.dailyEquity.map(x => x.date).filter(d => d >= START && d <= CUTOFF);
  const states = new Map();
  for (const u of top) { const f = path.join(DATA, 'normalized', `${u.ticker}.json`); if (!fs.existsSync(f)) continue; const x = read(f); if (quality(x.bars)) states.set(u.ticker, { ...u, bars: x.bars }); }
  const raw = loadRawReports();
  const series = new Map([...raw].map(([t, years]) => [t, buildSeries(years)]));
  const monthEnds = calendar.filter((d, i) => !calendar[i + 1] || calendar[i + 1].slice(0, 7) !== d.slice(0, 7));
  const orders = new Map(), monthly = [], diagnostics = { signals: 0, candidateCounts: [], reportsUsed: {}, noPrice: 0, noFundamental: 0 };
  for (let mi = 0; mi < monthEnds.length; mi++) {
    const signalDate = monthEnds[mi], rows = [];
    for (const [ticker, state] of states) {
      const i = lastIndex(state.bars, signalDate); if (i < 252 || state.bars[i].date !== signalDate) { diagnostics.noPrice++; continue; }
      const fund = fundamentalAt(series.get(ticker) || [], signalDate); if (!fund) { diagnostics.noFundamental++; continue; }
      const metrics = fund.metrics;
      const priceMomentum = state.bars[i].close / state.bars[i - 252].close - 1;
      const rs3m = state.bars[i].close / state.bars[i - 63].close - 1;
      const rs6m = state.bars[i].close / state.bars[i - 126].close - 1;
      const rs12m = priceMomentum;
      const momentumSignal = MOMENTUM_MODE === 'minervini-rs' ? 0.4 * rs3m + 0.3 * rs6m + 0.3 * rs12m : priceMomentum;
      rows.push({ ticker, name: state.name, market: state.market, priceMomentum, rs3m, rs6m, rs12m, momentumSignal, ...metrics, available: fund.available, report: fund.report });
    }
    percentile(rows, 'momentumSignal'); percentile(rows, 'revenueYoY'); percentile(rows, 'revenueQoQ'); percentile(rows, 'epsYoY'); percentile(rows, 'epsQoQ');
    for (const r of rows) { const p = ['revenueYoYPct', 'revenueQoQPct', 'epsYoYPct', 'epsQoQPct'].filter(k => r[k] !== undefined); r.fundamentalScore = p.reduce((s, k) => s + r[k], 0) / p.length; r.score = 0.5 * r.momentumSignalPct + 0.5 * r.fundamentalScore; }
    rows.sort((a, b) => b.score - a.score || b.momentumSignal - a.momentumSignal);
    const next = calendar[calendar.indexOf(signalDate) + 1];
    if (next && next <= CUTOFF) orders.set(next, { signalDate, tickers: rows.slice(0, MAX_HOLDINGS).map(x => x.ticker) });
    diagnostics.signals++; diagnostics.candidateCounts.push({ signalDate, candidates: rows.length });
    for (const r of rows.slice(0, MAX_HOLDINGS)) diagnostics.reportsUsed[r.report.filing] = (diagnostics.reportsUsed[r.report.filing] || 0) + 1;
    monthly.push({ signalDate, executionDate: next || null, candidates: rows.length, holdings: rows.slice(0, MAX_HOLDINGS).map(r => ({ ticker: r.ticker, name: r.name, score: r.score, priceMomentum: r.priceMomentum, momentumSignal: r.momentumSignal, rs3m: r.rs3m, rs6m: r.rs6m, rs12m: r.rs12m, fundamentalScore: r.fundamentalScore, metrics: { revenueYoY: r.revenueYoY, revenueQoQ: r.revenueQoQ, epsYoY: r.epsYoY, epsQoQ: r.epsQoQ }, available: r.available, reportFilingDate: r.report.filing })) });
  }
  const run = runBacktest(states, calendar, orders), summary = { ...stats(run.equity), tradeCount: run.trades.length, turnover: run.turnover, firstExecutionDate: [...orders].find(([, o]) => o.tickers.length)?.[0] || null };
  const oosEquity = run.equity.filter(x => x.date >= '2023-07-11' && x.date <= CUTOFF);
  const oosSummary = { ...stats(oosEquity), tradeCount: run.trades.filter(x => x.date >= '2023-07-11').length };
  const benchmarkEquity = base.benchmark.dailyEquity.filter(x => x.date >= START && x.date <= CUTOFF), benchmark = { ...stats(benchmarkEquity), name: base.benchmark.name };
  const benchmarkOos = { ...stats(benchmarkEquity.filter(x => x.date >= '2023-07-11')) };
  const old = read(path.join(OUT, 'largecap-momentum-backtest-through-2025-12-31.json'));
  const panelFiles = fs.readdirSync(PANEL).filter(f => f.endsWith('.json')); const panelStatus = { total: panelFiles.length, cfsOrLegacyOk: 0, ofsOk: 0, noData: 0 }; for (const f of panelFiles) { const x = read(path.join(PANEL, f)); if (x.response?.status === '000') { panelStatus.cfsOrLegacyOk++; if (x.fsDiv === 'OFS') panelStatus.ofsOk++; } else if (x.response?.status === '013') panelStatus.noData++; }
  const artifact = { generatedAt: new Date().toISOString(), asOf: CUTOFF, period: { start: START, end: CUTOFF }, universe: { source: 'Naver Finance current market-cap top 300, ordinary KOSPI/KOSDAQ shares only', top300Count: 300, eligibleCount: top.length, priceUsableCount: states.size, excludedRules: 'ETF/ETN/REIT/SPAC/preferred and non-KRX symbols excluded' }, data: { priceCache: DATA, dartPanel: PANEL, panelStatus, pointInTimeRule: 'rcept_no first 8 digits <= signal date', priceRule: 'Yahoo adjusted OHLC; month-end close signal, next trading-day open execution', costOneWay: COST }, strategy: { name: `${PRICE_LABEL} + EPS/revenue improvement composite top 20`, scoreFormula: `${PRICE_LABEL} percentile 50% + equal-weight average of EPS YoY, EPS QoQ, revenue YoY, revenue QoQ improvement percentiles 50%; at least 3 of 4 fundamental metrics required`, momentumMode: MOMENTUM_MODE, maxHoldings: MAX_HOLDINGS, cashResidual: true, summary, outOfSample: oosSummary, annualReturns: annual(run.equity), dailyEquity: run.equity, trades: run.trades, monthlySelections: monthly, diagnostics }, benchmark, benchmarkOutOfSample: benchmarkOos, comparison: { existingLargecapPriceMomentumThrough2025: old.strategy?.summary || null } };
  const stem = `fundamental-${MOMENTUM_MODE === 'minervini-rs' ? 'minervini-rs' : 'momentum'}-backtest-through-${CUTOFF}`;
  const jsonFile = path.join(OUT, `${stem}.json`); const mdFile = path.join(OUT, `${stem}.md`); write(jsonFile, artifact);
  const pct = x => `${(x * 100).toFixed(2)}%`, s = summary, b = benchmark, oldS = old.strategy?.summary || {};
  fs.writeFileSync(mdFile, `# KOSPI·KOSDAQ 시가총액 상위 300 — 가격 모멘텀 + EPS/매출 개선 백테스트\n\n- 테스트 기간: ${START}~${CUTOFF}\n- 실행 유니버스: 현재 시가총액 상위 300개 중 보통주 ${top.length}개\n- 신호: 월말 조정 종가, 다음 거래일 시가 체결\n- 비용: 편도 25bp\n- 공시: DART 접수일(${artifact.data.pointInTimeRule}) 이후에만 사용\n\n## 성과\n\n|전략|누적 수익률|CAGR|연환산 변동성|Sharpe(무위험 0)|MDD|월 승률|거래 수|회전율|\n|---|---:|---:|---:|---:|---:|---:|---:|---:|\n|가격 + EPS/매출 개선 composite|${pct(s.totalReturn)}|${pct(s.cagr)}|${pct(s.annualizedVolatility)}|${s.sharpeZeroRf.toFixed(2)}|${pct(s.maxDrawdown)}|${pct(s.monthWinRate)}|${s.tradeCount}|${s.turnover.toFixed(2)}|\n|KOSPI/KOSDAQ 50:50 benchmark|${pct(b.totalReturn)}|${pct(b.cagr)}|${pct(b.annualizedVolatility)}|${b.sharpeZeroRf.toFixed(2)}|${pct(b.maxDrawdown)}|${pct(b.monthWinRate)}|—|—|\n|기존 상위300 가격 모멘텀(참조)|${pct(oldS.totalReturn || 0)}|${pct(oldS.cagr || 0)}|${pct(oldS.annualizedVolatility || 0)}|${(oldS.sharpeZeroRf || 0).toFixed(2)}|${pct(oldS.maxDrawdown || 0)}|${pct(oldS.monthWinRate || 0)}|${oldS.tradeCount || '—'}|${(oldS.turnover || 0).toFixed(2)}|\n\n## 연도별 수익률\n\n|연도|수익률|\n|---|---:|\n${Object.entries(artifact.strategy.annualReturns).map(([y, v]) => `|${y}|${pct(v)}|`).join('\n')}\n\n## 데이터 품질 및 한계\n\n- DART 패널 ${panelStatus.total}건 중 정상 ${panelStatus.cfsOrLegacyOk}건, OFS fallback 복구 ${panelStatus.ofsOk}건, CFS·OFS 모두 미제공 ${panelStatus.noData}건.\n- EPS는 DART 기본주당이익 계정을 우선 사용했다. 연간 EPS는 가산식이 아니므로 Q4 EPS를 파생하지 않고, 분기별로 사용 가능한 지표가 3개 이상일 때만 점수를 계산했다.\n- 현재 구성종목을 과거에 적용한 생존자 편향, 상장폐지·거래정지·세금·시장충격·실제 체결 제약은 완전히 재현하지 않는다.\n- 결과는 투자 조언이 아니라 재현 가능한 현재-유니버스 시뮬레이션이다.\n`);
  console.log(JSON.stringify({ eligible: top.length, priceUsable: states.size, panelStatus, summary, benchmark }, null, 2));
}

try { main(); } catch (e) { console.error(e.stack || e); process.exit(1); }
