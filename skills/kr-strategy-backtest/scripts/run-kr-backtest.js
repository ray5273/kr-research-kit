#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function fail(message) { throw new Error(message); }
function arg(name) { const i = process.argv.indexOf(name); return i < 0 ? undefined : process.argv[i + 1]; }
function number(value, fallback, label) { if (value === undefined) return fallback; const n = Number(value); if (!Number.isFinite(n)) fail(`${label} must be numeric`); return n; }
function hash(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function slug(value) { return String(value).trim().replace(/[^0-9A-Za-z가-힣._-]+/g, '-').replace(/^-+|-+$/g, '') || 'strategy'; }
function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  const headers = lines.shift().split(',').map(x => x.trim());
  return lines.map((line, row) => {
    const cells = line.split(',').map(x => x.trim());
    if (cells.length !== headers.length) fail(`CSV row ${row + 2} has ${cells.length} columns; quoted commas are unsupported`);
    return Object.fromEntries(headers.map((key, i) => [key, cells[i]]));
  });
}
function loadBars(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const parsed = file.toLowerCase().endsWith('.json') ? JSON.parse(raw) : parseCsv(raw);
  const bars = Array.isArray(parsed) ? parsed : parsed.bars;
  if (!Array.isArray(bars)) fail('Input must be a CSV, JSON array, or JSON object containing bars');
  const required = ['date', 'ticker', 'market', 'open', 'close'];
  const seen = new Set();
  const result = [];
  for (const [i, row] of bars.entries()) {
    for (const key of required) if (row[key] === undefined || row[key] === '') fail(`Row ${i + 1} is missing ${key}`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(row.date))) fail(`Row ${i + 1} has invalid date`);
    const open = Number(row.open), close = Number(row.close);
    if (!(open > 0 && close > 0)) fail(`Row ${i + 1} requires positive open and close`);
    const key = `${row.date}|${row.ticker}`;
    if (seen.has(key)) fail(`Duplicate bar: ${key}`);
    seen.add(key);
    if (row.market !== 'KOSPI' && row.market !== 'KOSDAQ') continue;
    result.push({ date: String(row.date), ticker: String(row.ticker), name: row.name || '', market: row.market, open, close });
  }
  if (!result.length) fail('No eligible KOSPI/KOSDAQ bars after filtering');
  return { bars: result, rawHash: hash(raw) };
}
function mean(xs) { return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null; }
function std(xs) { if (xs.length < 2) return null; const m = mean(xs); return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1)); }
function pct(x) { return x === null || x === undefined || !Number.isFinite(x) ? null : x * 100; }
function metrics(points) {
  if (points.length < 2) return {};
  const start = points[0].equity, end = points.at(-1).equity;
  const daily = points.slice(1).map((x, i) => x.equity / points[i].equity - 1);
  let peak = -Infinity, maxDrawdown = 0;
  for (const p of points) { peak = Math.max(peak, p.equity); maxDrawdown = Math.min(maxDrawdown, p.equity / peak - 1); }
  const years = Math.max((new Date(points.at(-1).date) - new Date(points[0].date)) / 86400000 / 365.25, 1 / 252);
  const monthly = new Map();
  for (const p of points) monthly.set(p.date.slice(0, 7), p.equity);
  const monthValues = [...monthly.values()];
  const monthReturns = monthValues.slice(1).map((v, i) => v / monthValues[i] - 1);
  const vol = std(daily);
  return { startEquity: start, endEquity: end, totalReturn: end / start - 1, cagr: (end / start) ** (1 / years) - 1, annualizedVolatility: vol === null ? null : vol * Math.sqrt(252), sharpeZeroRf: vol ? mean(daily) / vol * Math.sqrt(252) : null, maxDrawdown, monthWinRate: monthReturns.length ? monthReturns.filter(x => x > 0).length / monthReturns.length : null, sessions: points.length };
}
function main() {
  const barsPath = arg('--bars'), configPath = arg('--config'), outDir = arg('--out-dir');
  if (!barsPath || !configPath || !outDir) fail('Usage: node run-kr-backtest.js --bars bars.csv --config strategy.json --out-dir output-dir');
  const { bars, rawHash } = loadBars(barsPath);
  const rawConfig = fs.readFileSync(configPath, 'utf8'); const config = JSON.parse(rawConfig);
  if (!config.name || !config.strategy || !config.strategy.type) fail('config requires name and strategy.type');
  const type = config.strategy.type;
  if (!['cross-sectional-momentum', 'sma-cross'].includes(type)) fail(`Unsupported strategy.type: ${type}`);
  const initialCapital = number(config.initialCapital, 100000000, 'initialCapital');
  const commissionBps = number(config.commissionBps, 15, 'commissionBps');
  const slippageBps = number(config.slippageBps, 10, 'slippageBps');
  const cashRateAnnual = number(config.cashRateAnnual, 0, 'cashRateAnnual');
  if (initialCapital <= 0 || commissionBps < 0 || slippageBps < 0) fail('Capital must be positive and costs non-negative');
  const byDate = new Map(), byTicker = new Map();
  for (const bar of bars) { if (!byDate.has(bar.date)) byDate.set(bar.date, []); byDate.get(bar.date).push(bar); if (!byTicker.has(bar.ticker)) byTicker.set(bar.ticker, []); byTicker.get(bar.ticker).push(bar); }
  const dates = [...byDate.keys()].sort().filter(d => (!config.startDate || d >= config.startDate) && (!config.endDate || d <= config.endDate));
  if (dates.length < 3) fail('Selected date range has fewer than 3 sessions');
  for (const list of byTicker.values()) list.sort((a, b) => a.date.localeCompare(b.date));
  const rowAt = new Map(bars.map(b => [`${b.date}|${b.ticker}`, b]));
  const strategy = config.strategy;
  const lookback = type === 'cross-sectional-momentum' ? number(strategy.lookbackDays, 60, 'lookbackDays') : number(strategy.slowDays, 60, 'slowDays');
  const cadence = number(strategy.rebalanceEvery, type === 'cross-sectional-momentum' ? 20 : 5, 'rebalanceEvery');
  if (!Number.isInteger(lookback) || lookback < 1 || !Number.isInteger(cadence) || cadence < 1) fail('Lookback and rebalanceEvery must be positive integers');
  if (type === 'sma-cross' && !(number(strategy.fastDays, 20, 'fastDays') < lookback)) fail('sma-cross fastDays must be less than slowDays');
  const positionCount = type === 'cross-sectional-momentum' ? number(strategy.topN, 10, 'topN') : number(strategy.maxPositions, 20, 'maxPositions');
  if (!Number.isInteger(positionCount) || positionCount < 1) fail(type === 'cross-sectional-momentum' ? 'topN must be a positive integer' : 'maxPositions must be a positive integer');
  let cash = initialCapital; const shares = new Map(); const equity = []; const trades = []; const warnings = [];
  let pendingTargets = null; let turnover = 0;
  function equityAt(date, field) { let value = cash; for (const [ticker, qty] of shares) { const b = rowAt.get(`${date}|${ticker}`); if (b) value += qty * b[field]; } return value; }
  function targetFor(signalIndex) {
    const date = dates[signalIndex]; const candidates = [];
    for (const [ticker, series] of byTicker) {
      const history = series.filter(b => b.date <= date); const latest = history.at(-1);
      if (!latest || latest.date !== date || history.length <= lookback) continue;
      if (type === 'cross-sectional-momentum') { const base = history.at(-(lookback + 1)); candidates.push({ ticker, score: latest.close / base.close - 1 }); }
      else { const fast = number(strategy.fastDays, 20, 'fastDays'); const fastSma = mean(history.slice(-fast).map(b => b.close)); const slowSma = mean(history.slice(-lookback).map(b => b.close)); if (fastSma > slowSma) candidates.push({ ticker, score: fastSma / slowSma }); }
    }
    candidates.sort((a, b) => b.score - a.score || a.ticker.localeCompare(b.ticker));
    return candidates.slice(0, positionCount).map(x => x.ticker);
  }
  for (let i = 0; i < dates.length; i++) {
    const date = dates[i];
    if (pendingTargets) {
      const before = equityAt(date, 'open'); const targetWeight = pendingTargets.length ? 1 / pendingTargets.length : 0;
      const all = new Set([...shares.keys(), ...pendingTargets]);
      for (const ticker of all) {
        const bar = rowAt.get(`${date}|${ticker}`); if (!bar) { warnings.push(`${date}: ${ticker} missing execution bar`); continue; }
        const oldQty = shares.get(ticker) || 0; const desiredQty = pendingTargets.includes(ticker) ? (before * targetWeight) / (bar.open * (1 + (commissionBps + slippageBps) / 10000)) : 0;
        const delta = desiredQty - oldQty; if (Math.abs(delta) < 1e-10) continue;
        const notional = Math.abs(delta) * bar.open; const cost = notional * (commissionBps + slippageBps) / 10000;
        cash -= delta * bar.open + cost; turnover += notional / Math.max(before, 1);
        shares.set(ticker, desiredQty); if (desiredQty === 0) shares.delete(ticker);
        trades.push({ date, ticker, side: delta > 0 ? 'BUY' : 'SELL', shares: Math.abs(delta), price: bar.open, notional, estimatedCost: cost, signalDate: dates[i - 1] });
      }
      pendingTargets = null;
    }
    cash *= 1 + cashRateAnnual / 252;
    equity.push({ date, equity: equityAt(date, 'close'), cash, holdings: shares.size });
    if (i >= lookback && i < dates.length - 1 && (i - lookback) % cadence === 0) pendingTargets = targetFor(i);
  }
  const summary = metrics(equity); summary.tradeCount = trades.length; summary.turnover = turnover;
  const oosIndex = config.outOfSampleStart ? equity.findIndex(x => x.date >= config.outOfSampleStart) : -1;
  const oos = oosIndex > 0 ? metrics(equity.slice(oosIndex - 1)) : null;
  const markets = [...new Set(bars.map(b => b.market))].sort(); const symbols = [...byTicker.keys()].sort();
  const generatedAt = new Date().toISOString(); const reportDate = dates.at(-1);
  const artifact = { schemaVersion: 1, generatedAt, reportDate, inputs: { barsPath, barsSha256: rawHash, configPath, configSha256: hash(rawConfig) }, config, data: { eligibleMarkets: markets, rows: bars.length, symbols, firstDate: dates[0], lastDate: dates.at(-1) }, warnings: [...new Set(warnings)], summary, outOfSampleSummary: oos, dailyEquity: equity, trades };
  fs.mkdirSync(outDir, { recursive: true }); const base = `backtest-${reportDate}`; const jsonPath = path.join(outDir, `${base}.json`); const mdPath = path.join(outDir, `${base}.md`);
  fs.writeFileSync(jsonPath, JSON.stringify(artifact, null, 2));
  const f = x => x === null || x === undefined || !Number.isFinite(x) ? 'N/A' : `${x.toFixed(2)}%`;
  const money = x => x === undefined ? 'N/A' : Math.round(x).toLocaleString('ko-KR');
  const metricRows = s => `|시작 자본|${money(s.startEquity)}|\n|종료 자산|${money(s.endEquity)}|\n|누적 수익률|${f(pct(s.totalReturn))}|\n|CAGR|${f(pct(s.cagr))}|\n|연환산 변동성|${f(pct(s.annualizedVolatility))}|\n|Sharpe (무위험 0%)|${s.sharpeZeroRf?.toFixed(2) ?? 'N/A'}|\n|최대 낙폭|${f(pct(s.maxDrawdown))}|\n|월간 승률|${f(pct(s.monthWinRate))}|\n|세션 수|${s.sessions ?? 'N/A'}|`;
  const tradeRows = trades.slice(0, 8).concat(trades.length > 16 ? [{ separator: true }] : []).concat(trades.slice(-8)).map(t => t.separator ? '|…|…|…|…|…|' : `|${t.date}|${t.side}|${t.ticker}|${t.price.toFixed(2)}|${Math.round(t.notional).toLocaleString('ko-KR')}|`).join('\n');
  const equitySample = equity.slice(0, 5).concat(equity.length > 10 ? [{ separator: true }] : []).concat(equity.slice(-5)).map(p => p.separator ? '|…|…|…|…|' : `|${p.date}|${money(p.equity)}|${money(p.cash)}|${p.holdings}|`).join('\n');
  const equitySection = `## Equity curve 표본\n\n|일자|자산|현금|보유 종목 수|\n|---|---:|---:|---:|\n${equitySample}\n\n`;
  const oosSection = `${oos ? `## Out-of-sample (${config.outOfSampleStart} 이후)\n\n|지표|값|\n|---|---|\n${metricRows(oos)}\n` : ''}${equitySection}`;
  const md = `# KRX 전략 백테스트 — ${config.name}\n\n> 과거 일봉 기반 시뮬레이션이며 투자 권유가 아닙니다. 다음 거래일 시가 체결, 비용 반영 결과입니다.\n\n## 재현 정보\n\n|항목|값|\n|---|---|\n|생성시각|${generatedAt}|\n|테스트 기간|${dates[0]} ~ ${dates.at(-1)}|\n|전략|${type}|\n|입력 SHA-256|${rawHash}|\n|설정 SHA-256|${hash(rawConfig)}|\n|JSON 원장|${jsonPath}|\n\n## 가설 및 규칙\n\n- 가설: ${type} 규칙이 명시된 비용 후에도 KOSPI/KOSDAQ 일봉 유니버스에서 위험조정 수익을 만들 수 있는지 검증한다.\n- 신호: 종가 기준으로 계산하고 다음 세션 시가에 리밸런싱한다. 설정: ${JSON.stringify(strategy)}.\n- 비용: 편도 수수료 ${commissionBps}bp + 슬리피지 ${slippageBps}bp. 현금 연율 ${cashRateAnnual}%. 동일비중, 소수점 주식 허용.\n\n## 데이터 품질\n\n|항목|값|\n|---|---|\n|허용 시장|${markets.join(', ')}|\n|행 / 종목 수|${bars.length.toLocaleString('ko-KR')} / ${symbols.length.toLocaleString('ko-KR')}|\n|소스 메모|${config.dataNotes || '미기재'}|\n\n## 전체 결과\n\n|지표|값|\n|---|---|\n${metricRows(summary)}\n|거래 수|${trades.length}|\n|누적 회전율|${turnover.toFixed(2)}x|\n\n${oosSection}\n## 거래 표본\n\n|체결일|방향|종목|시가|거래대금|\n|---|---|---|---:|---:|\n${tradeRows || '|해당 없음|—|—|—|—|'}\n\n## 한계 및 다음 검증\n\n- 입력이 시점별 구성종목과 상장폐지 종목을 포함하는지, 그리고 수정주가의 배당·분할 처리 기준을 별도 확인해야 한다. 현재 파일만으로 생존자 편향 제거 여부를 증명할 수 없다.\n- 세금, 호가단위, 상·하한가, 거래정지, 유동성/시장충격, 권리락과 실제 주문 제약은 모델에 반영하지 않았다.\n- 전체 구간에서 파라미터를 선택했다면 미래 정보에 최적화됐을 수 있다. ${config.outOfSampleStart || 'outOfSampleStart 미설정'} 기준의 분리 검증과 파라미터 민감도 분석을 수행한다.\n- 경고: ${artifact.warnings.length ? artifact.warnings.join('; ') : '없음'}\n`;
  fs.writeFileSync(mdPath, md); console.log(JSON.stringify({ markdown: mdPath, json: jsonPath, summary, warnings: artifact.warnings }, null, 2));
}
try { main(); } catch (error) { console.error(`Backtest failed: ${error.message}`); process.exitCode = 1; }
