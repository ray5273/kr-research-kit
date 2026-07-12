#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const DATA = path.join(ROOT, '.tmp/kr-strategy-backtest/2026-07-10');
const PANEL = path.join(ROOT, '.tmp/kr-strategy-backtest/dart-quarterly-panel');
const OUT = path.join(ROOT, 'analysis-example/kr-market/strategies/trend-following-10y');
const TOP_FILE = path.join(OUT, 'largecap-momentum-backtest-2026-07-10.json');
const BASE_FILE = path.join(OUT, 'backtest-2026-07-10.json');
const START = '2016-07-11';
const CUTOFF = '2026-07-10';
const COST = 0.0025;
const INITIAL = 100000000;
const MAX_HOLDINGS = 10;
const OUT_STEM = 'alternative-indicators-backtest-through-2026-07-10';

const read = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const write = (f, x) => fs.writeFileSync(f, JSON.stringify(x, null, 2) + '\n');
const num = v => { if (v === undefined || v === null || v === '') return null; const n = Number(String(v).replace(/,/g, '')); return Number.isFinite(n) ? n : null; };
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const sha = x => crypto.createHash('sha256').update(x).digest('hex');

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

function chooseAccount(list, kind) {
  const c = list.filter(a => {
    const id = a.account_id || '', nm = a.account_nm || '';
    if (kind === 'revenue') {
      if (/CostOfSales|OtherRevenue|InvestmentIncome|기타수익|매출원가/.test(id + '|' + nm)) return false;
      return id === 'ifrs-full_Revenue' || id === 'ifrs_Revenue' || /^(매출액|수익\(매출액\)|영업수익|매출)$/.test(nm);
    }
    if (kind === 'eps') return (/BasicEarningsLossPerShare/.test(id) || /기본.*주당.*이익/.test(nm)) && !/Preferred|FromContinuing|FromDiscontinued|우선|희석|중단|계속/.test(id + '|' + nm);
    if (kind === 'gross') return id === 'ifrs-full_GrossProfit' || id === 'ifrs_GrossProfit' || /^매출총이익/.test(nm);
    if (kind === 'assets') return id === 'ifrs-full_Assets' || id === 'ifrs_Assets' || /^자산총계/.test(nm);
    return false;
  });
  const score = a => { const id = a.account_id || '', nm = a.account_nm || ''; if (kind === 'revenue') return id === 'ifrs-full_Revenue' ? 0 : id === 'ifrs_Revenue' ? 1 : nm === '매출액' ? 2 : 3; if (kind === 'eps') return id === 'ifrs-full_BasicEarningsLossPerShare' ? 0 : id === 'ifrs_BasicEarningsLossPerShare' ? 1 : 2; if (kind === 'gross') return id === 'ifrs-full_GrossProfit' ? 0 : id === 'ifrs_GrossProfit' ? 1 : 2; return id === 'ifrs-full_Assets' ? 0 : id === 'ifrs_Assets' ? 1 : 2; };
  return c.sort((a, b) => score(a) - score(b))[0] || null;
}

function loadRawReports() {
  const raw = new Map(), files = fs.readdirSync(PANEL).filter(f => f.endsWith('.json'));
  const manifest = [];
  for (const f of files) {
    const x = read(path.join(PANEL, f));
    const m = f.match(/^(\d+)-(\d+)-(\d+)\.json$/); if (!m) continue;
    const status = x.response?.status || 'error'; manifest.push(`${f}|${status}|${x.fsDiv || 'CFS'}|${x.fetchedAt || ''}`);
    if (status !== '000') continue;
    const list = x.response.list || [], accounts = { revenue: chooseAccount(list, 'revenue'), eps: chooseAccount(list, 'eps'), gross: chooseAccount(list, 'gross'), assets: chooseAccount(list, 'assets') };
    if (!accounts.revenue && !accounts.eps && !accounts.gross && !accounts.assets) continue;
    const receipts = list.map(a => a.rcept_no).filter(Boolean).map(String).sort(); const filingRaw = (receipts.at(-1) || '').slice(0, 8); if (!/^\d{8}$/.test(filingRaw)) continue;
    const filing = `${filingRaw.slice(0, 4)}-${filingRaw.slice(4, 6)}-${filingRaw.slice(6, 8)}`;
    const metric = a => a ? { direct: num(a.thstrm_amount), cumulative: num(a.thstrm_add_amount) ?? num(a.thstrm_amount) } : { direct: null, cumulative: null };
    const entry = { filing, fsDiv: x.fsDiv || 'CFS', revenue: metric(accounts.revenue), eps: metric(accounts.eps), gross: metric(accounts.gross), assets: metric(accounts.assets) };
    const ticker = m[1], year = Number(m[2]), report = m[3]; if (!raw.has(ticker)) raw.set(ticker, new Map()); if (!raw.get(ticker).has(year)) raw.get(ticker).set(year, new Map()); raw.get(ticker).get(year).set(report, entry);
  }
  return { raw, manifestHash: sha(manifest.sort().join('\n')), files: files.length };
}

function buildSeries(years) {
  const out = [];
  for (let y = 2015; y <= 2026; y++) {
    const q = [years.get(y)?.get('11013'), years.get(y)?.get('11012'), years.get(y)?.get('11014')]; const annual = years.get(y)?.get('11011');
    const prior = { revenue: null, eps: null, gross: null };
    for (let i = 0; i < q.length; i++) {
      const r = q[i]; if (!r) continue;
      const flow = k => r[k].direct ?? (r[k].cumulative !== null && prior[k] !== null ? r[k].cumulative - prior[k] : r[k].cumulative);
      out.push({ year: y, quarter: i + 1, filing: r.filing, revenue: flow('revenue'), eps: flow('eps'), gross: flow('gross'), assets: r.assets.direct ?? r.assets.cumulative });
      for (const k of ['revenue', 'eps', 'gross']) if (r[k].cumulative !== null) prior[k] = r[k].cumulative;
    }
    if (annual) {
      const gross = annual.gross.direct !== null && prior.gross !== null ? annual.gross.direct - prior.gross : annual.gross.direct;
      const revenue = annual.revenue.direct !== null && prior.revenue !== null ? annual.revenue.direct - prior.revenue : annual.revenue.direct;
      out.push({ year: y, quarter: 4, filing: annual.filing, revenue, eps: null, gross, assets: annual.assets.direct ?? annual.assets.cumulative });
    }
  }
  return out.sort((a, b) => (a.year - b.year) || (a.quarter - b.quarter));
}

function improvement(cur, prev) { if (cur === null || prev === null || !Number.isFinite(cur) || !Number.isFinite(prev) || prev === 0) return null; return clamp((cur - prev) / Math.abs(prev), -5, 5); }
function fundamentalAt(series, date) {
  const reports = series.filter(x => x.filing <= date && x.revenue !== null && x.eps !== null).sort((a, b) => b.filing.localeCompare(a.filing));
  for (const r of reports) { const same = series.find(x => x.year === r.year - 1 && x.quarter === r.quarter && x.revenue !== null && x.eps !== null); const idx = series.indexOf(r), prev = idx > 0 ? series[idx - 1] : null; const metrics = { revenueYoY: improvement(r.revenue, same?.revenue ?? null), revenueQoQ: improvement(r.revenue, prev?.revenue ?? null), epsYoY: improvement(r.eps, same?.eps ?? null), epsQoQ: improvement(r.eps, prev?.eps ?? null) }; const available = Object.values(metrics).filter(x => x !== null).length; if (available >= 3) return { report: r, metrics, available }; }
  return null;
}
function grossProfitabilityAt(series, date) {
  const reports = series.filter(x => x.filing <= date && x.gross !== null).sort((a, b) => a.filing.localeCompare(b.filing)); if (reports.length < 4) return null;
  const latest = reports.at(-1), last4 = reports.slice(-4); if (last4.length < 4 || latest.assets === null || latest.assets <= 0) return null;
  const ttm = last4.reduce((s, x) => s + x.gross, 0); return { value: ttm / latest.assets, report: latest, quarters: last4.map(x => `${x.year}Q${x.quarter}`) };
}

function lastIndex(bars, date) { let lo = 0, hi = bars.length - 1, out = -1; while (lo <= hi) { const mid = (lo + hi) >> 1; if (bars[mid].date <= date) { out = mid; lo = mid + 1; } else hi = mid - 1; } return out; }
function exactPrice(s, d, f) { const i = lastIndex(s.bars, d); return i >= 0 && s.bars[i].date === d ? s.bars[i][f] : null; }
function closePrice(s, d) { const i = lastIndex(s.bars, d); return i >= 0 ? s.bars[i].close : null; }
function stddev(xs) { const m = xs.reduce((s, x) => s + x, 0) / xs.length; return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, xs.length - 1)); }
function percentile(rows, key) { const valid = rows.filter(x => x[key] !== null && Number.isFinite(x[key])).sort((a, b) => a[key] - b[key]); const n = valid.length; valid.forEach((x, i) => { x[`${key}Pct`] = n <= 1 ? 1 : i / (n - 1); }); }

function stats(e) { if (e.length < 2) return { startEquity: e[0]?.equity || INITIAL, endEquity: e.at(-1)?.equity || INITIAL, totalReturn: 0, cagr: 0, annualizedVolatility: 0, sharpeZeroRf: 0, maxDrawdown: 0, monthWinRate: 0, sessions: e.length }; const r = e.slice(1).map((x, i) => x.equity / e[i].equity - 1), m = r.reduce((s, x) => s + x, 0) / r.length, v = stddev(r), years = (Date.parse(e.at(-1).date) - Date.parse(e[0].date)) / 86400000 / 365.25; let peak = 0, mdd = 0; for (const x of e) { peak = Math.max(peak, x.equity); mdd = Math.min(mdd, x.equity / peak - 1); } const mv = new Map(); e.forEach(x => mv.set(x.date.slice(0, 7), x.equity)); const vals = [...mv.values()], mr = vals.slice(1).map((x, i) => x / vals[i] - 1); return { startEquity: e[0].equity, endEquity: e.at(-1).equity, totalReturn: e.at(-1).equity / e[0].equity - 1, cagr: (e.at(-1).equity / e[0].equity) ** (1 / years) - 1, annualizedVolatility: v * Math.sqrt(252), sharpeZeroRf: v ? m / v * Math.sqrt(252) : 0, maxDrawdown: mdd, monthWinRate: mr.length ? mr.filter(x => x > 0).length / mr.length : 0, sessions: e.length }; }
function annual(e) { const out = {}; for (let y = 2016; y <= 2026; y++) { const a = e.filter(x => x.date.startsWith(String(y))); if (a.length > 1) out[y] = a.at(-1).equity / a[0].equity - 1; } return out; }

function runBacktest(states, calendar, orders) {
  const pos = new Map(), trades = [], equity = []; let cash = INITIAL, turnover = 0; const value = (d, f) => { let v = cash; for (const [t, q] of pos) { const p = f === 'close' ? closePrice(states.get(t), d) : exactPrice(states.get(t), d, f); if (p !== null) v += q * p; } return v; };
  for (const d of calendar) { const o = orders.get(d); if (o) { const before = value(d, 'open'), names = o.tickers.filter(t => exactPrice(states.get(t), d, 'open') !== null), all = new Set([...pos.keys(), ...names]); let lo = 0, hi = before; for (let z = 0; z < 32; z++) { let c = cash, invest = (lo + hi) / 2; for (const t of all) { const p = exactPrice(states.get(t), d, 'open'); if (p === null) continue; const target = names.includes(t) ? invest / names.length / p : 0, delta = target - (pos.get(t) || 0); c -= delta * p + Math.abs(delta) * p * COST; } if (c >= 0) lo = invest; else hi = invest; } for (const t of all) { const p = exactPrice(states.get(t), d, 'open'); if (p === null) continue; const target = names.includes(t) ? lo / names.length / p : 0, delta = target - (pos.get(t) || 0); if (Math.abs(delta) < 1e-8) continue; const n = Math.abs(delta) * p, fee = n * COST; cash -= delta * p + fee; turnover += n / Math.max(before, 1); if (target) pos.set(t, target); else pos.delete(t); trades.push({ date: d, signalDate: o.signalDate, ticker: t, side: delta > 0 ? 'BUY' : 'SELL', notional: n, estimatedCost: fee }); } } equity.push({ date: d, equity: value(d, 'close'), cash, holdings: pos.size }); }
  return { equity, trades, turnover };
}

function main() {
  const top = read(TOP_FILE).universe.top300.filter(ordinaryShare), base = read(BASE_FILE); const calendar = base.benchmark.dailyEquity.map(x => x.date).filter(d => d >= START && d <= CUTOFF); const states = new Map();
  for (const u of top) { const f = path.join(DATA, 'normalized', `${u.ticker}.json`); if (!fs.existsSync(f)) continue; const x = read(f); if (quality(x.bars)) states.set(u.ticker, { ...u, bars: x.bars }); }
  const loaded = loadRawReports(), series = new Map([...loaded.raw].map(([t, years]) => [t, buildSeries(years)])); const monthEnds = calendar.filter((d, i) => !calendar[i + 1] || calendar[i + 1].slice(0, 7) !== d.slice(0, 7));
  const modes = ['baseline', '52wHigh', 'volAdjusted', 'grossProfitability']; const result = {};
  for (const mode of modes) {
    const orders = new Map(), monthly = [], warnings = { noPrice: 0, noFundamental: 0, noProfitability: 0, candidates: [] };
    for (const signalDate of monthEnds) {
      const rows = [];
      for (const [ticker, state] of states) {
        const i = lastIndex(state.bars, signalDate); if (i < 252 || state.bars[i].date !== signalDate) { warnings.noPrice++; continue; }
        const fund = fundamentalAt(series.get(ticker) || [], signalDate), profitability = grossProfitabilityAt(series.get(ticker) || [], signalDate);
        if (mode === 'grossProfitability') { if (!profitability) { warnings.noProfitability++; continue; } } else if (!fund) { warnings.noFundamental++; continue; }
        const ret252 = state.bars[i].close / state.bars[i - 252].close - 1;
        const highs = state.bars.slice(i - 251, i + 1).map(x => x.high).filter(Number.isFinite), highProximity = highs.length === 252 ? state.bars[i].close / Math.max(...highs) : null;
        const returns = []; for (let j = i - 251; j <= i; j++) { if (j < 1) continue; returns.push(state.bars[j].close / state.bars[j - 1].close - 1); }
        const vol = returns.length === 252 ? stddev(returns) * Math.sqrt(252) : null, volAdjusted = vol && vol > 0 ? ret252 / vol : null;
        if (mode === '52wHigh' && highProximity === null) continue; if (mode === 'volAdjusted' && volAdjusted === null) continue;
        rows.push({ ticker, name: state.name, market: state.market, ret252, highProximity, volAdjusted, priceSignal: mode === '52wHigh' ? highProximity : mode === 'volAdjusted' ? volAdjusted : ret252, fundamental: fund, profitability });
      }
      percentile(rows, 'priceSignal'); if (mode === 'grossProfitability') percentile(rows, 'profitabilityValue'); else { for (const r of rows) if (r.fundamental) r.fundamentalValue = r.fundamental.metrics.revenueYoY; percentile(rows, 'fundamentalValue'); }
      if (mode !== 'grossProfitability') { percentile(rows, 'fundamentalValue'); for (const r of rows) { const m = r.fundamental.metrics, vals = [m.revenueYoY, m.revenueQoQ, m.epsYoY, m.epsQoQ].filter(x => x !== null); r.fundamentalScore = vals.length >= 3 ? ['revenueYoYPct', 'revenueQoQPct', 'epsYoYPct', 'epsQoQPct'].filter(k => r.fundamental[k.replace('Pct', '')] !== undefined).reduce((s, k) => s + (r[k] || 0), 0) / 4 : null; } }
      // Rank each of the four EPS/revenue metrics independently for the baseline/technical modes.
      if (mode !== 'grossProfitability') {
        for (const k of ['revenueYoY', 'revenueQoQ', 'epsYoY', 'epsQoQ']) { const proxy = rows.map(r => ({ r, value: r.fundamental.metrics[k] })).filter(x => x.value !== null).sort((a, b) => a.value - b.value); const n = proxy.length; proxy.forEach((x, i) => { x.r[`${k}Pct`] = n <= 1 ? 1 : i / (n - 1); }); }
        for (const r of rows) { const p = ['revenueYoYPct', 'revenueQoQPct', 'epsYoYPct', 'epsQoQPct'].filter(k => r[k] !== undefined); r.fundamentalScore = p.length >= 3 ? p.reduce((s, k) => s + r[k], 0) / p.length : null; }
      } else {
        for (const r of rows) r.fundamentalValue = r.profitability.value;
        percentile(rows, 'fundamentalValue'); for (const r of rows) r.fundamentalScore = r.fundamentalValuePct;
      }
      for (const r of rows) r.score = r.fundamentalScore === null ? null : 0.5 * r.priceSignalPct + 0.5 * r.fundamentalScore;
      const ranked = rows.filter(r => r.score !== null).sort((a, b) => b.score - a.score || b.priceSignal - a.priceSignal), next = calendar[calendar.indexOf(signalDate) + 1]; if (next && next <= CUTOFF) orders.set(next, { signalDate, tickers: ranked.slice(0, MAX_HOLDINGS).map(r => r.ticker) });
      warnings.candidates.push({ signalDate, candidates: ranked.length });
      monthly.push({ signalDate, executionDate: next || null, candidates: ranked.length, holdings: ranked.slice(0, MAX_HOLDINGS).map(r => ({ ticker: r.ticker, name: r.name, score: r.score, priceSignal: r.priceSignal, highProximity: r.highProximity, volAdjusted: r.volAdjusted, ret252: r.ret252, fundamentalScore: r.fundamentalScore, metrics: r.fundamental?.metrics || null, profitability: r.profitability ? { value: r.profitability.value, quarters: r.profitability.quarters } : null, reportFilingDate: r.fundamental?.report.filing || r.profitability?.report.filing || null })) });
    }
    const run = runBacktest(states, calendar, orders), summary = { ...stats(run.equity), tradeCount: run.trades.length, turnover: run.turnover }, ytd = run.equity.filter(x => x.date >= '2026-01-01');
    result[mode] = { summary, ytd: stats(ytd), annualReturns: annual(run.equity), dailyEquity: run.equity, trades: run.trades, monthlySelections: monthly, warnings };
  }
  const benchEq = base.benchmark.dailyEquity.filter(x => x.date >= START && x.date <= CUTOFF), panelFiles = fs.readdirSync(PANEL).filter(f => f.endsWith('.json')), panelStatus = { total: panelFiles.length, ok: 0, ofs: 0, noData: 0 }; for (const f of panelFiles) { const x = read(path.join(PANEL, f)); if (x.response?.status === '000') { panelStatus.ok++; if (x.fsDiv === 'OFS') panelStatus.ofs++; } else if (x.response?.status === '013') panelStatus.noData++; }
  const priceManifest = [...states].map(([t]) => `${t}:${read(path.join(DATA, 'normalized', `${t}.json`)).rawSha256 || ''}`).sort().join('\n');
  const artifact = { generatedAt: new Date().toISOString(), period: { start: START, end: CUTOFF }, universe: { source: TOP_FILE, top300Count: 300, eligibleCount: top.length, priceUsableCount: states.size, maxHoldings: MAX_HOLDINGS }, commonRules: { costOneWay: COST, signal: 'month-end adjusted close', execution: 'next trading-day open', pointInTime: 'DART rcept_no <= signal date', cashResidual: true }, data: { priceCache: DATA, dartPanel: PANEL, panelStatus, hashes: { priceManifestSha256: sha(priceManifest), dartPanelManifestSha256: loaded.manifestHash } }, strategies: result, benchmark: { summary: stats(benchEq), dailyEquity: benchEq }, warnings: ['Current market-cap universe applied historically; survivorship bias remains.', 'TTM gross profitability uses four reported standalone quarters and latest reported total assets.', 'Piotroski F-score, ROIC, and cash-flow quality are not included in this run.'] };
  const jsonFile = path.join(OUT, `${OUT_STEM}.json`), mdFile = path.join(OUT, `${OUT_STEM}.md`); write(jsonFile, artifact);
  const pct = x => `${(x * 100).toFixed(2)}%`, labels = { baseline: '기준선: 252일 모멘텀 + EPS·매출', '52wHigh': '후보 A: 52주 고점 근접도 + EPS·매출', volAdjusted: '후보 B: 변동성 조정 모멘텀 + EPS·매출', grossProfitability: '후보 C: 252일 모멘텀 + TTM 총이익성' };
  const rows = modes.map(k => { const s = result[k].summary, y = result[k].ytd; return `|${labels[k]}|${pct(s.totalReturn)}|${pct(s.cagr)}|${pct(s.annualizedVolatility)}|${s.sharpeZeroRf.toFixed(2)}|${pct(s.maxDrawdown)}|${pct(s.monthWinRate)}|${s.tradeCount}|${s.turnover.toFixed(2)}|${pct(y.totalReturn)}|`; }).join('\n');
  fs.writeFileSync(mdFile, `# KOSPI·KOSDAQ 대체 지표 3종 비교 백테스트\n\n- 기간: ${START}~${CUTOFF}\n- 유니버스: 현재 시가총액 상위 300개 중 보통주 ${top.length}개, 가격 데이터 사용 가능 ${states.size}개\n- 보유: 상위 ${MAX_HOLDINGS}개 동일비중\n- 체결: 월말 조정 종가 신호, 다음 거래일 시가\n- 비용: 편도 25bp\n\n|전략|누적수익률|CAGR|변동성|Sharpe|MDD|월 승률|거래 수|회전율|2026 YTD|\n|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|\n${rows}\n|KOSPI/KOSDAQ 50:50|${pct(artifact.benchmark.summary.totalReturn)}|${pct(artifact.benchmark.summary.cagr)}|${pct(artifact.benchmark.summary.annualizedVolatility)}|${artifact.benchmark.summary.sharpeZeroRf.toFixed(2)}|${pct(artifact.benchmark.summary.maxDrawdown)}|${pct(artifact.benchmark.summary.monthWinRate)}|—|—|${pct(stats(benchEq.filter(x => x.date >= '2026-01-01')).totalReturn)}|\n\n## 산식\n\n- 후보 A: 현재 조정종가 / 최근 252거래일 조정 고가 최고값\n- 후보 B: 252일 수익률 / (최근 252일 일수익률 표준편차 × √252)\n- 후보 C: 최근 4개 standalone 분기 총이익 합계 / 최신 공시 총자산\n- 모든 점수는 월별 유니버스 백분위로 변환하고 가격·재무를 50:50 합산했다.\n\n## 데이터 품질과 한계\n\n- DART 패널 ${panelStatus.total}건 중 정상 ${panelStatus.ok}건, OFS fallback ${panelStatus.ofs}건, 양쪽 모두 미제공 ${panelStatus.noData}건.\n- DART 접수일 이후 자료는 해당 월 신호에서 제외했다.\n- 현재 구성종목을 과거에 적용한 생존자 편향, 거래정지·상장폐지·호가·시장충격·세금은 완전히 재현하지 않는다.\n- Piotroski F-score·ROIC·현금흐름 품질은 이번 비교에서 제외했다.\n`);
  console.log(JSON.stringify(Object.fromEntries(modes.map(k => [k, result[k].summary])), null, 2));
}

try { main(); } catch (e) { console.error(e.stack || e); process.exit(1); }
