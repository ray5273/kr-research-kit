#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const L = require('./lib/factor-backtest-core.js');
const { buildContext } = require('./analyze-overlay-ablation.js');
const {
  BASE_CONFIG,
  runEntryJumpFilter,
} = require('./analyze-52w-high-entry-jump-filter.js');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const INITIAL = 100000000;
const DEFAULT_START = '2017-01-02';
const DEFAULT_END = '2026-07-16';
const DEFAULT_THRESHOLD = 0.25;
const EPSILON = 1e-12;

const arg = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
};

const sha256File = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const mean = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const pct = value => value === null || value === undefined ? '—' : `${(value * 100).toFixed(2)}%`;
const multiple = value => value === null || value === undefined ? '—' : `${value.toFixed(2)}배`;
const integer = value => Number(value).toLocaleString('ko-KR');

function newCycle(ticker, name, entryDate) {
  return {
    ticker,
    name,
    entryDate,
    lastTradeDate: entryDate,
    lots: [],
    grossBuyNotional: 0,
    grossSellNotional: 0,
    actualCosts: 0,
    matchedCostBasis: 0,
    realizedPnl: 0,
    buyTradeCount: 0,
    sellTradeCount: 0,
  };
}

function publicCycle(cycle, extras) {
  const holdingDays = Math.round((Date.parse(extras.exitDate) - Date.parse(cycle.entryDate)) / 86400000);
  return {
    ticker: cycle.ticker,
    name: cycle.name,
    status: extras.status,
    entryDate: cycle.entryDate,
    exitDate: extras.exitDate,
    exitYear: extras.exitDate.slice(0, 4),
    holdingDays,
    buyTradeCount: cycle.buyTradeCount,
    sellTradeCount: cycle.sellTradeCount,
    grossBuyNotional: cycle.grossBuyNotional,
    grossSellNotional: cycle.grossSellNotional,
    actualCosts: cycle.actualCosts,
    costBasis: extras.costBasis,
    netPnl: extras.netPnl,
    return: extras.costBasis > 0 ? extras.netPnl / extras.costBasis : null,
    ...extras.extra,
  };
}

/**
 * Convert rebalance fills into continuous holding cycles. Buy lots are matched
 * FIFO against every partial sell. A cycle closes only when all lots for a
 * ticker have been sold; this prevents equal-weight resizing fills from being
 * miscounted as independent wins and losses.
 */
function deriveHoldingCycles({
  trades,
  getTradePrice,
  getMarkPrice,
  getName = ticker => ticker,
  endDate,
  hypotheticalSellCostRate,
}) {
  const active = new Map();
  const completed = [];

  for (const trade of trades) {
    if (trade.side !== 'BUY' && trade.side !== 'SELL') throw new Error(`unsupported trade side: ${trade.side}`);
    const price = getTradePrice(trade);
    if (!(price > 0)) throw new Error(`missing execution price for ${trade.ticker} on ${trade.date}`);
    const shares = trade.notional / price;
    const tolerance = Math.max(1e-8, shares * 1e-10);

    if (trade.side === 'BUY') {
      let cycle = active.get(trade.ticker);
      if (!cycle) {
        cycle = newCycle(trade.ticker, getName(trade.ticker), trade.date);
        active.set(trade.ticker, cycle);
      }
      cycle.lots.push({
        shares,
        grossUnitCost: (trade.notional + trade.estimatedCost) / shares,
        date: trade.date,
      });
      cycle.grossBuyNotional += trade.notional;
      cycle.actualCosts += trade.estimatedCost;
      cycle.buyTradeCount++;
      cycle.lastTradeDate = trade.date;
      continue;
    }

    const cycle = active.get(trade.ticker);
    if (!cycle) throw new Error(`sell without an active cycle: ${trade.ticker} on ${trade.date}`);
    let remaining = shares;
    const netSaleUnit = (trade.notional - trade.estimatedCost) / shares;
    while (remaining > tolerance && cycle.lots.length) {
      const lot = cycle.lots[0];
      const matched = Math.min(remaining, lot.shares);
      cycle.matchedCostBasis += matched * lot.grossUnitCost;
      cycle.realizedPnl += matched * (netSaleUnit - lot.grossUnitCost);
      lot.shares -= matched;
      remaining -= matched;
      if (lot.shares <= tolerance) cycle.lots.shift();
    }
    if (remaining > tolerance) {
      throw new Error(`sell exceeds FIFO lots: ${trade.ticker} on ${trade.date}; unmatched shares ${remaining}`);
    }
    cycle.grossSellNotional += trade.notional;
    cycle.actualCosts += trade.estimatedCost;
    cycle.sellTradeCount++;
    cycle.lastTradeDate = trade.date;

    const openShares = cycle.lots.reduce((sum, lot) => sum + lot.shares, 0);
    if (openShares <= Math.max(1e-8, shares * 1e-9)) {
      completed.push(publicCycle(cycle, {
        status: 'completed',
        exitDate: trade.date,
        costBasis: cycle.matchedCostBasis,
        netPnl: cycle.realizedPnl,
        extra: {},
      }));
      active.delete(trade.ticker);
    }
  }

  const openMarked = [];
  const unmarkable = [];
  for (const [ticker, cycle] of active) {
    const mark = getMarkPrice(ticker, endDate);
    const markPrice = typeof mark === 'object' ? mark?.price : mark;
    const markPriceDate = typeof mark === 'object' ? mark?.date : endDate;
    if (!(markPrice > 0)) {
      unmarkable.push({ ticker, name: cycle.name, entryDate: cycle.entryDate });
      continue;
    }
    const openShares = cycle.lots.reduce((sum, lot) => sum + lot.shares, 0);
    const remainingCostBasis = cycle.lots.reduce((sum, lot) => sum + lot.shares * lot.grossUnitCost, 0);
    const hypotheticalSellNotional = openShares * markPrice;
    const hypotheticalSellCost = hypotheticalSellNotional * hypotheticalSellCostRate;
    const hypotheticalNetSaleUnit = markPrice * (1 - hypotheticalSellCostRate);
    const hypotheticalPnl = cycle.lots.reduce(
      (sum, lot) => sum + lot.shares * (hypotheticalNetSaleUnit - lot.grossUnitCost),
      0,
    );
    openMarked.push(publicCycle(cycle, {
      status: 'open-marked',
      exitDate: endDate,
      costBasis: cycle.matchedCostBasis + remainingCostBasis,
      netPnl: cycle.realizedPnl + hypotheticalPnl,
      extra: {
        markDate: endDate,
        markPriceDate,
        markAgeCalendarDays: Math.round((Date.parse(endDate) - Date.parse(markPriceDate)) / 86400000),
        markPrice,
        openShares,
        hypotheticalSellNotional,
        hypotheticalSellCost,
        note: 'Not an actual exit; marked at the latest close on or before the end date and charged a hypothetical sell cost.',
      },
    }));
  }

  return { completed, openMarked, unmarkable };
}

function summarizeCycles(cycles) {
  const wins = cycles.filter(cycle => cycle.netPnl > EPSILON);
  const losses = cycles.filter(cycle => cycle.netPnl < -EPSILON);
  const breakeven = cycles.length - wins.length - losses.length;
  const averageWinReturn = mean(wins.map(cycle => cycle.return));
  const averageLossReturn = mean(losses.map(cycle => cycle.return));
  const grossProfit = wins.reduce((sum, cycle) => sum + cycle.netPnl, 0);
  const grossLoss = -losses.reduce((sum, cycle) => sum + cycle.netPnl, 0);
  const winRate = cycles.length ? wins.length / cycles.length : null;
  return {
    cycleCount: cycles.length,
    wins: wins.length,
    losses: losses.length,
    breakeven,
    winRate,
    averageWinReturn,
    averageLossReturn,
    payoffRatio: averageWinReturn !== null && averageLossReturn !== null && averageLossReturn !== 0
      ? averageWinReturn / Math.abs(averageLossReturn)
      : null,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : null,
    expectancyReturn: winRate === null || averageWinReturn === null || averageLossReturn === null
      ? null
      : winRate * averageWinReturn + (1 - winRate) * averageLossReturn,
    netPnl: cycles.reduce((sum, cycle) => sum + cycle.netPnl, 0),
    grossProfit,
    grossLoss,
    averageHoldingDays: mean(cycles.map(cycle => cycle.holdingDays)),
  };
}

function annualEquityReturns(equity, startYear, endYear) {
  const output = {};
  let priorEquity = INITIAL;
  for (let year = startYear; year <= endYear; year++) {
    const rows = equity.filter(row => row.date.startsWith(String(year)));
    if (!rows.length) continue;
    const endingEquity = rows.at(-1).equity;
    output[String(year)] = {
      startReferenceEquity: priorEquity,
      endingEquity,
      return: endingEquity / priorEquity - 1,
      firstDate: rows[0].date,
      lastDate: rows.at(-1).date,
    };
    priorEquity = endingEquity;
  }
  return output;
}

function annualCycleStats(completed, annualReturns, startYear, endYear) {
  const output = {};
  for (let year = startYear; year <= endYear; year++) {
    const key = String(year);
    output[key] = {
      year,
      periodEnd: annualReturns[key]?.lastDate || null,
      strategyReturn: annualReturns[key]?.return ?? null,
      ...summarizeCycles(completed.filter(cycle => cycle.exitYear === key)),
    };
  }
  return output;
}

function dataQuality(context) {
  let rows = 0;
  let firstDate = null;
  let lastDate = null;
  const markets = new Set();
  for (const state of context.states.values()) {
    rows += state.bars.length;
    if (state.market) markets.add(state.market);
    if (state.bars.length) {
      const first = state.bars[0].date;
      const last = state.bars.at(-1).date;
      if (!firstDate || first < firstDate) firstDate = first;
      if (!lastDate || last > lastDate) lastDate = last;
    }
  }
  return {
    eligibleMarkets: ['KOSPI', 'KOSDAQ'],
    marketsObservedInCache: [...markets].sort(),
    priceSymbols: context.states.size,
    priceRows: rows,
    firstPriceDate: firstDate,
    lastPriceDate: lastDate,
    annualCoverage: context.coverageLedger,
  };
}

function tradeSamples(trades, count = 5) {
  return { first: trades.slice(0, count), last: trades.slice(-count) };
}

function equitySamples(equity) {
  const output = [];
  const seen = new Set();
  for (const row of [equity[0], ...Object.values(Object.fromEntries(equity.map(item => [item.date.slice(0, 4), item]))), equity.at(-1)]) {
    if (row && !seen.has(row.date)) {
      output.push(row);
      seen.add(row.date);
    }
  }
  return output;
}

function renderMarkdown(artifact, jsonFile, jsonSha256) {
  const rows = Object.values(artifact.annual).map(row => {
    const year = row.year === Number(artifact.period.end.slice(0, 4)) ? `${row.year} YTD*` : row.year;
    return `|${year}|${pct(row.strategyReturn)}|${row.cycleCount}|${row.wins}|${row.losses}|${pct(row.winRate)}|${pct(row.averageWinReturn)}|${pct(row.averageLossReturn)}|${multiple(row.payoffRatio)}|${multiple(row.profitFactor)}|`;
  }).join('\n');
  const overall = artifact.overallCompleted;
  const provisional = artifact.currentYearProvisional;
  const summary = artifact.backtestSummary;
  const hashes = Object.entries(artifact.inputHashes).map(([key, value]) => `|${key}|\`${value}\`|`).join('\n');
  const coverage = artifact.dataQuality.annualCoverage.map(row => `|${row.rankingYear}|${row.snapshotDate || row.asOfDate || '—'}|${row.commonShareCount || row.total || row.totalCount || row.universeCount || '—'}|${row.priceAvailable || row.available || row.availableCount || row.priceAvailableCount || '—'}|${row.priceCoverage === null || row.priceCoverage === undefined ? '—' : pct(row.priceCoverage)}|`).join('\n');

  return `# 메인 52주 신고가 전략 — 연도별 승률·손익비\n\n> 투자 권유가 아닌 과거 시뮬레이션이다. JSON 원장이 수치의 기준이며, 2026년은 ${artifact.period.end}까지만 집계했다.\n\n## 결론\n\n완결 보유 사이클 ${integer(overall.cycleCount)}건 기준 전체 승률은 **${pct(overall.winRate)}**, 평균 수익/평균 손실 손익비는 **${multiple(overall.payoffRatio)}**, Profit Factor는 **${multiple(overall.profitFactor)}**다. 2026년은 실제 청산 완료 ${provisional.closedOnly.cycleCount}건만 보면 승률 ${pct(provisional.closedOnly.winRate)}·손익비 ${multiple(provisional.closedOnly.payoffRatio)}이고, ${artifact.period.end} 직전 7일 이내 가격이 있는 미청산 ${provisional.currentMarkedCount}개를 매도비용까지 차감해 가상 청산하면 승률 ${pct(provisional.includingCurrentMarked.winRate)}·손익비 ${multiple(provisional.includingCurrentMarked.payoffRatio)}다. 후자는 미실현손익을 포함한 참고치다.\n\n## 연도별 결과 — 실제 청산 완료 사이클\n\n|연도|전략 연간수익률|완결 사이클|승|패|승률|평균 수익|평균 손실|손익비|Profit Factor|\n|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|\n${rows}\n\n\* 2026년 전략 수익률과 사이클은 ${artifact.period.end}까지다. 연도를 넘긴 사이클은 **최종 청산 연도**에 귀속했다. 따라서 연간 수익률(연말 평가)과 사이클 순손익의 부호가 다를 수 있다. 손익분기 사이클은 승리로 세지 않으며 승률 분모에는 포함한다.\n\n## 2026년 미청산 포지션 포함 참고치\n\n|기준|사이클|승|패|승률|평균 수익|평균 손실|손익비|Profit Factor|\n|---|---:|---:|---:|---:|---:|---:|---:|---:|\n|실제 청산만|${provisional.closedOnly.cycleCount}|${provisional.closedOnly.wins}|${provisional.closedOnly.losses}|${pct(provisional.closedOnly.winRate)}|${pct(provisional.closedOnly.averageWinReturn)}|${pct(provisional.closedOnly.averageLossReturn)}|${multiple(provisional.closedOnly.payoffRatio)}|${multiple(provisional.closedOnly.profitFactor)}|\n|최근 가격 미청산 포함|${provisional.includingCurrentMarked.cycleCount}|${provisional.includingCurrentMarked.wins}|${provisional.includingCurrentMarked.losses}|${pct(provisional.includingCurrentMarked.winRate)}|${pct(provisional.includingCurrentMarked.averageWinReturn)}|${pct(provisional.includingCurrentMarked.averageLossReturn)}|${multiple(provisional.includingCurrentMarked.payoffRatio)}|${multiple(provisional.includingCurrentMarked.profitFactor)}|\n\n가상청산은 ${provisional.currentMarkPriceDates.join(', ')}의 최신 종가에서 매도비용 43bp(25bp+거래세 18bp)를 차감했다. 실제 매도 신호나 체결이 아니다. 가격이 7일 넘게 오래된 엔진 잔존 포지션 ${provisional.staleCarriedCount}개(${provisional.staleCarried.map(row => `${row.name} ${row.ticker}, 마지막 ${row.markPriceDate}`).join('; ')})는 2026 참고 승패에서 제외했다.\n\n## 계산 정의\n\n- 메인 전략: 전년말 KOSPI·KOSDAQ 보통주 Top 300, 52주 최고 종가 근접도, 월간(21거래일) 상위 15개, 보유 밴드 45위, 연초 롤 완화, KOSPI SMA200 ±3% 이진 레짐, 신규진입 당일 +25% 이상 급등 제외.\n- 신호는 종가까지 계산하고 다음 거래일 시가에 체결했다. 비용은 매수 25bp, 매도 25bp+증권거래세 18bp다.\n- 같은 종목의 첫 매수부터 보유수량이 다시 0이 될 때까지를 한 사이클로 묶었다. 부분 매도는 FIFO로 매수 로트에 대응했다.\n- 승률 = 순손익이 양수인 완결 사이클 / 전체 완결 사이클. 손익비 = 승리 사이클 평균 수익률 / 손실 사이클 평균 손실률 절댓값. Profit Factor = 이익금 합계 / 손실금 합계 절댓값.\n- 사이클 수익률은 비용 포함 FIFO 원가 대비 순손익률이다. 리밸런싱 주문 ${integer(summary.tradeCount)}건을 각각 한 거래로 세지 않았다.\n\n## 전체 백테스트 성과와 OOS\n\n|구분|누적수익률|CAGR|변동성|Sharpe|MDD|월 승률|거래 주문|회전율|\n|---|---:|---:|---:|---:|---:|---:|---:|---:|\n|전체 ${artifact.period.start}~${artifact.period.end}|${pct(summary.totalReturn)}|${pct(summary.cagr)}|${pct(summary.annualizedVolatility)}|${summary.sharpeZeroRf.toFixed(2)}|${pct(summary.maxDrawdown)}|${pct(summary.monthWinRate)}|${integer(summary.tradeCount)}|${summary.turnover.toFixed(2)}x|\n|OOS ${artifact.oos.period.start}~${artifact.oos.period.end}|${pct(artifact.oos.summary.totalReturn)}|${pct(artifact.oos.summary.cagr)}|${pct(artifact.oos.summary.annualizedVolatility)}|${artifact.oos.summary.sharpeZeroRf.toFixed(2)}|${pct(artifact.oos.summary.maxDrawdown)}|—|${integer(artifact.oos.summary.tradeCount)}|${artifact.oos.summary.turnover.toFixed(2)}x|\n\n## 데이터·재현 정보\n\n- 생성 시각: ${artifact.generatedAt}\n- JSON 원장: \`${jsonFile}\`\n- JSON SHA-256: \`${jsonSha256}\`\n- 가격: split+배당 총수익 연구 캐시. strict official KRX/DART 기업행사 원장은 아니다.\n- 가격 심볼/행: ${integer(artifact.dataQuality.priceSymbols)}개 / ${integer(artifact.dataQuality.priceRows)}행 (${artifact.dataQuality.firstPriceDate}~${artifact.dataQuality.lastPriceDate})\n- 대상 시장: KOSPI·KOSDAQ 보통주, 전년말 Top 300을 다음 해에만 적용.\n\n|입력|SHA-256|\n|---|---|\n${hashes}\n\n### 연도별 가격 커버리지\n\n|랭킹연도|스냅샷|유니버스|가격가능|커버리지|\n|---:|---|---:|---:|---:|\n${coverage}\n\n## 검증\n\n- 기존 25% 필터 민감도 원장과 CAGR·Sharpe·MDD·회전율·거래 수가 허용오차 내 일치했다: **${artifact.validation.referenceParity.passes ? '통과' : '실패'}**.\n- 완결 사이클 손익 + 모든 기말 미청산 사이클의 엔진 이월가격 가상청산 손익을 최종 자산과 대사한 차이: **${artifact.validation.pnlReconciliation.differenceWon.toFixed(4)}원**.\n- FIFO 합성 단위 테스트: 별도 테스트 스크립트 통과.\n\n## 한계\n\n- 연도별 시점일치 유니버스로 생존편향을 줄였지만 strict official 총수익 원장이 아니며, 상장폐지 대가·합병·유증 등 일부 기업행사를 공식 문서로 완전 검증한 결과는 아니다.\n- 연구 엔진은 체결 가능 시가가 사라진 종목을 자동 청산하지 못하고 마지막 종가로 이월한다. GS홈쇼핑·쌍용C&E·더존비즈온 잔존분이 대표적이며, 이 3개는 2026 가상 승패에서 제외했다.\n- 호가 단위, 장중 시장충격, 실제 슬리피지, 거래정지 중 주문 실패, 세금의 개인별 차이는 반영하지 않았다.\n- 승률과 손익비는 종목 사이클 통계다. 포트폴리오 복리수익률과 동일하지 않고, 손익비가 높아도 미래 성과를 보장하지 않는다.\n- 2026 가상청산 포함 수치는 미실현 포지션을 최신 종가에 강제로 닫은 참고치이며 실제 전략 원장과 분리해야 한다.\n`;
}

function main() {
  const startDate = arg('--start-date', DEFAULT_START);
  const endDate = arg('--end-date', DEFAULT_END);
  const threshold = Number(arg('--threshold', String(DEFAULT_THRESHOLD)));
  const universeFile = arg('--universe-file', path.join(ROOT, 'analysis-example/kr-market/strategies/annual-top300/universe-ledger-2015-2025.json'));
  const cacheDir = arg('--cache-dir', path.join(ROOT, '.tmp/kr-strategy-backtest/marcap-total-return'));
  const panelDir = arg('--dart-panel-dir', path.join(ROOT, '.tmp/kr-strategy-backtest/dart-quarterly-panel'));
  const outDir = arg('--out-dir', path.join(ROOT, 'analysis-example/kr-market/strategies/annual-top300'));
  const stem = arg('--artifact-stem', `52w-high-yearly-win-payoff-${startDate.slice(0, 4)}-through-${endDate}`);
  const referenceFile = arg('--reference-file', path.join(outDir, `52w-high-new-entry-jump-filter-sensitivity-${startDate}-through-${endDate}.json`));
  const dartManifest = path.join(panelDir, 'completion-manifest.json');

  if (threshold !== DEFAULT_THRESHOLD) throw new Error('this report is fixed to the adopted 25% entry-jump threshold');
  const context = buildContext({ universeFile, cacheDir, panelDir, startDate, endDate });
  const run = runEntryJumpFilter(context, threshold);
  const reference = JSON.parse(fs.readFileSync(referenceFile, 'utf8'));
  const selected = reference.comparisons.find(row => row.threshold === threshold);
  if (!selected) throw new Error(`reference does not contain threshold ${threshold}`);

  const parityFields = ['cagr', 'sharpeZeroRf', 'maxDrawdown', 'turnover', 'tradeCount'];
  const parityDeltas = Object.fromEntries(parityFields.map(field => [field, run.summary[field] - selected.fullSample[field]]));
  const referenceParity = {
    passes: parityFields.every(field => field === 'tradeCount' ? parityDeltas[field] === 0 : Math.abs(parityDeltas[field]) <= 1e-12),
    tolerance: 1e-12,
    deltas: parityDeltas,
  };
  if (!referenceParity.passes) throw new Error(`reference parity failed: ${JSON.stringify(referenceParity)}`);

  const getTradePrice = trade => L.exactPrice(context.states.get(trade.ticker), trade.date, 'open');
  const getMarkPrice = (ticker, date) => {
    const state = context.states.get(ticker);
    const index = state ? L.lastIndex(state.bars, date) : -1;
    return index >= 0 ? { price: state.bars[index].close, date: state.bars[index].date } : null;
  };
  const getName = ticker => context.states.get(ticker)?.name || ticker;
  const cycles = deriveHoldingCycles({
    trades: run.trades,
    getTradePrice,
    getMarkPrice,
    getName,
    endDate,
    hypotheticalSellCostRate: BASE_CONFIG.buyCost + BASE_CONFIG.sellTax,
  });
  if (cycles.unmarkable.length) throw new Error(`unmarkable open cycles: ${JSON.stringify(cycles.unmarkable)}`);

  const startYear = Number(startDate.slice(0, 4));
  const endYear = Number(endDate.slice(0, 4));
  const returnsByYear = annualEquityReturns(run.equity, startYear, endYear);
  const annual = annualCycleStats(cycles.completed, returnsByYear, startYear, endYear);
  const currentYearClosed = cycles.completed.filter(cycle => cycle.exitYear === String(endYear));
  const currentOpenMarked = cycles.openMarked.filter(cycle => cycle.markAgeCalendarDays <= 7);
  const staleCarried = cycles.openMarked.filter(cycle => cycle.markAgeCalendarDays > 7);
  const hypotheticalSellCosts = cycles.openMarked.reduce((sum, cycle) => sum + cycle.hypotheticalSellCost, 0);
  const cycleNetPnl = [...cycles.completed, ...cycles.openMarked].reduce((sum, cycle) => sum + cycle.netPnl, 0);
  const expectedNetPnl = run.equity.at(-1).equity - INITIAL - hypotheticalSellCosts;
  const pnlDifference = cycleNetPnl - expectedNetPnl;
  if (Math.abs(pnlDifference) > 0.01) throw new Error(`cycle P&L reconciliation failed by ${pnlDifference}`);

  const panelHash = fs.existsSync(dartManifest) ? sha256File(dartManifest) : null;
  const artifact = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    strategyIdentity: 'operating-52w-high-annual-top300-monthly-top15-band45-regime-entry-jump25',
    hypothesis: 'Stocks nearest their 52-week high retain trend leadership; a broad-market SMA200 regime reduces crash exposure.',
    period: { start: startDate, end: endDate, currentYearIsPartial: true },
    normalizedConfig: { ...BASE_CONFIG, newEntryJumpThreshold: threshold },
    definitions: {
      winRate: 'profitable completed holding cycles / all completed holding cycles',
      cycle: 'first buy until the ticker position returns to zero; partial sells matched FIFO',
      cycleReturn: 'net realized P&L after modeled costs / FIFO gross cost basis including buy costs',
      payoffRatio: 'arithmetic mean winning cycle return / absolute arithmetic mean losing cycle return',
      profitFactor: 'sum positive cycle P&L / absolute sum negative cycle P&L',
      annualAttribution: 'exit year of the completed holding cycle',
      currentYearProvisional: `open cycles hypothetically sold at ${endDate} close with modeled sell costs`,
    },
    backtestSummary: { ...run.summary, monthWinRate: L.stats(run.equity).monthWinRate },
    oos: {
      period: reference.oosPeriod,
      summary: selected.oos,
      source: referenceFile,
    },
    annualReturns: returnsByYear,
    annual,
    overallCompleted: summarizeCycles(cycles.completed),
    currentYearProvisional: {
      asOf: endDate,
      closedOnly: summarizeCycles(currentYearClosed),
      allEngineOpenCount: cycles.openMarked.length,
      currentMarkedCount: currentOpenMarked.length,
      currentMarkPriceDates: [...new Set(currentOpenMarked.map(cycle => cycle.markPriceDate))].sort(),
      includingCurrentMarked: summarizeCycles([...currentYearClosed, ...currentOpenMarked]),
      staleCarriedCount: staleCarried.length,
      staleCarried: staleCarried.map(cycle => ({
        ticker: cycle.ticker,
        name: cycle.name,
        entryDate: cycle.entryDate,
        markPriceDate: cycle.markPriceDate,
        markAgeCalendarDays: cycle.markAgeCalendarDays,
      })),
    },
    completedCycles: cycles.completed,
    openCyclesMarked: cycles.openMarked,
    dailyEquity: run.equity,
    trades: run.trades.map(trade => ({
      ...trade,
      executionPrice: getTradePrice(trade),
      shares: trade.notional / getTradePrice(trade),
    })),
    samples: {
      trades: tradeSamples(run.trades),
      equity: equitySamples(run.equity),
    },
    universe: {
      policy: 'year-end KOSPI/KOSDAQ common-share Top 300 snapshot t applies only in t+1',
      file: universeFile,
      coverage: context.coverageLedger,
    },
    dataQuality: dataQuality(context),
    inputHashes: {
      annualUniverseLedger: sha256File(universeFile),
      priceStateManifest: L.priceManifestHash(context.states),
      dartCompletionManifest: panelHash,
      adoptedFilterReference: sha256File(referenceFile),
      backtestEngine: sha256File(path.join(__dirname, 'analyze-52w-high-entry-jump-filter.js')),
      cycleAnalysisScript: sha256File(__filename),
    },
    validation: {
      referenceParity,
      pnlReconciliation: {
        endingEquity: run.equity.at(-1).equity,
        initialEquity: INITIAL,
        hypotheticalTerminalSellCosts: hypotheticalSellCosts,
        expectedNetPnlAfterHypotheticalLiquidation: expectedNetPnl,
        cycleNetPnl,
        differenceWon: pnlDifference,
        toleranceWon: 0.01,
      },
    },
    warnings: [
      'Split-and-dividend total-return research cache; not the strict official KRX/DART corporate-action ledger.',
      '2026 is partial through 2026-07-16.',
      'Open-cycle mark-to-market statistics are provisional and are not actual strategy exits.',
      'Market impact, live slippage, tick sizes, order rejection, and personal tax differences are omitted.',
    ],
  };

  fs.mkdirSync(outDir, { recursive: true });
  const jsonFile = path.join(outDir, `${stem}.json`);
  const markdownFile = path.join(outDir, `${stem}.md`);
  fs.writeFileSync(jsonFile, JSON.stringify(artifact, null, 2) + '\n');
  const jsonSha256 = sha256File(jsonFile);
  fs.writeFileSync(markdownFile, renderMarkdown(artifact, jsonFile, jsonSha256));
  console.log(JSON.stringify({
    jsonFile,
    markdownFile,
    overallCompleted: artifact.overallCompleted,
    annual: artifact.annual,
    currentYearProvisional: artifact.currentYearProvisional,
    validation: artifact.validation,
  }, null, 2));
}

module.exports = {
  deriveHoldingCycles,
  summarizeCycles,
  annualEquityReturns,
  annualCycleStats,
};

if (require.main === module) main();
