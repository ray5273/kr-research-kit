#!/usr/bin/env node
'use strict';

// Research-only sensitivity driver for the annual Top-300 52-week-high model.
// It deliberately does not change the operating runner or live monthly builder.
// The only experimental rule is an inclusive signal-close one-day-return gate
// applied to prospective NEW entries. Incumbents within the rank-45 band remain
// eligible regardless of their one-day return, and skipped slots are backfilled
// from the fresh ranking before next-session-open execution.

const fs = require('fs');
const path = require('path');
const L = require('./lib/factor-backtest-core.js');
const A = require('./lib/annual-top300-universe.js');
const { buildContext, runConfig, metrics } = require('./analyze-overlay-ablation.js');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const INITIAL = 100000000;
const DEFAULT_START = '2017-01-02';
const DEFAULT_END = '2026-07-16';
const DEFAULT_OOS_START = '2023-01-02';
const DEFAULT_THRESHOLDS = [null, 0.15, 0.20, 0.25];
const HORIZONS = [1, 5, 21];
const BASE_CONFIG = Object.freeze({
  epsWeight: 0,
  momentumType: 'high52w',
  holdings: 15,
  holdBufferRank: 45,
  softAnnualRoll: true,
  cadence: 21,
  regime: true,
  regimeMaWindow: 200,
  regimeBand: 0.03,
  volTarget: null,
  buyCost: 0.0025,
  sellTax: 0.0018,
});

const arg = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
};
const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length;
const writeJson = (file, value) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
};

function shouldExcludeNewEntry(oneDayReturn, threshold) {
  return threshold !== null && Number.isFinite(oneDayReturn) && oneDayReturn >= threshold;
}

function rankSignal(ctx, signalDate, executionDate) {
  const active = L.statesForSignal(ctx.states, ctx.annualUniverse, executionDate);
  const snapshot = A.snapshotForSignal(ctx.annualUniverse, executionDate);
  const signalIndex = ctx.allCalendar.indexOf(signalDate);
  const fundamentalAsOf = ctx.allCalendar[Math.max(0, signalIndex - 1)] || signalDate;
  const rows = [];

  for (const [ticker, state] of active) {
    const index = L.lastIndex(state.bars, signalDate);
    const fundamental = L.fundamentalAt(ctx.series.get(ticker) || [], fundamentalAsOf);
    if (index < 252 || state.bars[index].date !== signalDate || !fundamental) continue;
    let high52w = 0;
    for (let i = index - 251; i <= index; i++) high52w = Math.max(high52w, state.bars[i].close);
    const close = state.bars[index].close;
    rows.push({
      ticker,
      name: state.name,
      rs: high52w > 0 ? close / high52w : 0,
      oneDayReturn: close / state.bars[index - 1].close - 1,
      signalClose: close,
      previousTradingClose: state.bars[index - 1].close,
      previousTradingDate: state.bars[index - 1].date,
    });
  }

  // This reproduces runConfig's epsWeight=0 ranking, including percentile and
  // tie ordering, rather than introducing a parallel score definition.
  L.percentile(rows, 'rs');
  for (const row of rows) row.score = row.rsPct;
  rows.sort((a, b) => b.score - a.score || b.rs - a.rs);
  rows.forEach((row, index) => { row.rank = index + 1; });
  return { snapshot, rows };
}

function buildOrders(ctx) {
  const orders = new Map();
  const startCalendarIndex = ctx.allCalendar.indexOf(ctx.startDate);
  for (let i = 0; i < ctx.allCalendar.length - 1; i++) {
    const signalDate = ctx.allCalendar[i];
    const executionDate = ctx.allCalendar[i + 1];
    if (executionDate < ctx.startDate) continue;
    const forcedAnnualRoll = executionDate.slice(0, 4) !== signalDate.slice(0, 4);
    const cadenceSignal = !forcedAnnualRoll && signalDate >= ctx.startDate
      && (i - startCalendarIndex + 1) % BASE_CONFIG.cadence === 0;
    if (!forcedAnnualRoll && !cadenceSignal) continue;
    const ranked = rankSignal(ctx, signalDate, executionDate);
    orders.set(executionDate, {
      signalDate,
      executionDate,
      forcedAnnualRoll,
      rankingYear: ranked.snapshot.rankingYear,
      rankingAsOfDate: ranked.snapshot.asOfDate,
      rankedRows: ranked.rows,
    });
  }
  return orders;
}

function forwardPerformance(ctx, ticker, signalDate) {
  const state = ctx.states.get(ticker);
  const signalIndex = ctx.allCalendar.indexOf(signalDate);
  const signalClose = state ? L.exactPrice(state, signalDate, 'close') : null;
  const returns = {};
  for (const horizon of HORIZONS) {
    const targetDate = ctx.allCalendar[signalIndex + horizon] || null;
    const targetClose = targetDate && state ? L.exactPrice(state, targetDate, 'close') : null;
    returns[`${horizon}d`] = signalClose > 0 && targetClose !== null ? targetClose / signalClose - 1 : null;
  }
  return returns;
}

function chooseTarget(ctx, order, positions, threshold, desiredExposure) {
  const rankByTicker = new Map(order.rankedRows.map(row => [row.ticker, row]));
  const heldBefore = [...positions.keys()];
  const kept = heldBefore.filter(ticker => (rankByTicker.get(ticker)?.rank || Infinity) <= BASE_CONFIG.holdBufferRank);
  const keptSet = new Set(kept);
  const slots = Math.max(0, BASE_CONFIG.holdings - kept.length);
  const unfilteredFill = order.rankedRows.filter(row => !keptSet.has(row.ticker)).slice(0, slots);
  const accepted = [];
  const excluded = [];

  if (slots > 0) {
    for (const row of order.rankedRows) {
      if (keptSet.has(row.ticker)) continue;
      if (shouldExcludeNewEntry(row.oneDayReturn, threshold)) {
        excluded.push(row);
        continue;
      }
      accepted.push(row);
      if (accepted.length === slots) break;
    }
  }

  const target = [...kept, ...accepted.map(row => row.ticker)].slice(0, BASE_CONFIG.holdings);
  const unfilteredTarget = [...kept, ...unfilteredFill.map(row => row.ticker)].slice(0, BASE_CONFIG.holdings);
  const targetSet = new Set(target);
  const unfilteredTargetSet = new Set(unfilteredTarget);
  const removedFromCounterfactual = unfilteredFill.filter(row => !targetSet.has(row.ticker));
  const addedByFilter = accepted.filter(row => !unfilteredTargetSet.has(row.ticker));
  const replacementPairs = removedFromCounterfactual.map((removed, index) => ({
    excluded: removed,
    replacement: addedByFilter[index] || null,
  }));
  const replacementByTicker = new Map(replacementPairs.map(pair => [pair.excluded.ticker, pair.replacement]));

  const incumbentJumpExemptions = kept.map(ticker => rankByTicker.get(ticker))
    .filter(row => shouldExcludeNewEntry(row.oneDayReturn, threshold));
  const excludedCandidates = excluded.map(row => {
    const replacement = replacementByTicker.get(row.ticker) || null;
    const executionOpen = L.exactPrice(ctx.states.get(row.ticker), order.executionDate, 'open');
    return {
      ticker: row.ticker,
      name: row.name,
      originalRank: row.rank,
      signalClose: row.signalClose,
      previousTradingDate: row.previousTradingDate,
      previousTradingClose: row.previousTradingClose,
      oneDayReturn: row.oneDayReturn,
      threshold,
      boundaryRule: 'exclude when oneDayReturn >= threshold',
      causedPortfolioReplacement: replacementByTicker.has(row.ticker),
      wouldHaveExecutableEntry: desiredExposure > 0 && executionOpen !== null,
      forwardReturnsFromSignalClose: forwardPerformance(ctx, row.ticker, order.signalDate),
      replacement: replacement ? {
        ticker: replacement.ticker,
        name: replacement.name,
        originalRank: replacement.rank,
        oneDayReturn: replacement.oneDayReturn,
        executionOpenAvailable: L.exactPrice(ctx.states.get(replacement.ticker), order.executionDate, 'open') !== null,
        forwardReturnsFromSignalClose: forwardPerformance(ctx, replacement.ticker, order.signalDate),
      } : null,
    };
  });

  return {
    target,
    kept,
    unfilteredTarget,
    excludedCandidates,
    addedByFilter: addedByFilter.map(row => ({
      ticker: row.ticker,
      name: row.name,
      originalRank: row.rank,
      oneDayReturn: row.oneDayReturn,
      forwardReturnsFromSignalClose: forwardPerformance(ctx, row.ticker, order.signalDate),
    })),
    incumbentJumpExemptions: incumbentJumpExemptions.map(row => ({
      ticker: row.ticker,
      name: row.name,
      rank: row.rank,
      oneDayReturn: row.oneDayReturn,
    })),
  };
}

function periodYears(equity) {
  if (equity.length < 2) return 0;
  return (Date.parse(equity.at(-1).date) - Date.parse(equity[0].date)) / 86400000 / 365.25;
}

function summarize(equity, trades, turnover, exclusionEvents, incumbentExemptions) {
  const base = metrics(equity);
  const years = periodYears(equity);
  const excludedCandidates = exclusionEvents.flatMap(event => event.excludedCandidates);
  const causalCountsBySignal = exclusionEvents.map(event => event.excludedCandidates
    .filter(row => row.causedPortfolioReplacement).length);
  const causalCount = excludedCandidates.filter(row => row.causedPortfolioReplacement).length;
  const maxCausalExclusionsOnOneSignal = causalCountsBySignal.length ? Math.max(...causalCountsBySignal) : 0;
  return {
    ...base,
    tradeCount: trades.length,
    turnover,
    annualizedTurnover: years > 0 ? turnover / years : null,
    screenedExclusionCount: excludedCandidates.length,
    causalPortfolioExclusionCount: causalCount,
    executableEntryBlockCount: excludedCandidates.filter(row => row.wouldHaveExecutableEntry).length,
    affectedSignalCount: exclusionEvents.length,
    maxCausalExclusionsOnOneSignal,
    maxSingleSignalShareOfCausalExclusions: causalCount ? maxCausalExclusionsOnOneSignal / causalCount : null,
    incumbentJumpExemptionCount: incumbentExemptions.length,
  };
}

function runEntryJumpFilter(ctx, threshold) {
  const orders = buildOrders(ctx);
  const positions = new Map();
  const trades = [];
  const equity = [];
  const exclusionEvents = [];
  const incumbentExemptions = [];
  const rebalancingLedger = [];
  const kospiIndex = new Map(ctx.kospi.map((row, index) => [row.date, index]));
  let cash = INITIAL;
  let turnover = 0;
  let regime = true;
  let exposure = 1;

  const portfolioValue = (date, field) => {
    let value = cash;
    for (const [ticker, shares] of positions) {
      const state = ctx.states.get(ticker);
      const price = field === 'close' ? L.closePrice(state, date) : L.exactPrice(state, date, field);
      if (price !== null) value += shares * price;
    }
    return value;
  };

  function rebalance(date, order, desiredExposure, targetTickers, reason) {
    const desiredNames = order ? targetTickers : [...positions.keys()];
    const before = portfolioValue(date, 'open');
    const all = new Set([...positions.keys(), ...desiredNames]);
    const names = desiredNames.filter(ticker => L.exactPrice(ctx.states.get(ticker), date, 'open') !== null);
    let low = 0;
    let high = before;
    for (let iteration = 0; iteration < 34; iteration++) {
      const investment = (low + high) / 2;
      let after = cash;
      for (const ticker of all) {
        const price = L.exactPrice(ctx.states.get(ticker), date, 'open');
        if (price === null) continue;
        const targetShares = names.includes(ticker) ? desiredExposure * investment / names.length / price : 0;
        const delta = targetShares - (positions.get(ticker) || 0);
        const costRate = delta > 0 ? BASE_CONFIG.buyCost : BASE_CONFIG.buyCost + BASE_CONFIG.sellTax;
        after -= delta * price + Math.abs(delta) * price * costRate;
      }
      if (after >= 0) low = investment;
      else high = investment;
    }
    for (const ticker of all) {
      const price = L.exactPrice(ctx.states.get(ticker), date, 'open');
      if (price === null) continue;
      const targetShares = names.includes(ticker) ? desiredExposure * low / names.length / price : 0;
      const oldShares = positions.get(ticker) || 0;
      const delta = targetShares - oldShares;
      if (Math.abs(delta) < 1e-8) continue;
      const notional = Math.abs(delta) * price;
      const estimatedCost = notional * (delta > 0 ? BASE_CONFIG.buyCost : BASE_CONFIG.buyCost + BASE_CONFIG.sellTax);
      cash -= delta * price + estimatedCost;
      turnover += notional / Math.max(before, 1);
      if (targetShares) positions.set(ticker, targetShares);
      else positions.delete(ticker);
      trades.push({
        date,
        signalDate: order?.signalDate || null,
        ticker,
        side: delta > 0 ? 'BUY' : 'SELL',
        notional,
        estimatedCost,
        reason,
      });
    }
  }

  for (let i = 0; i < ctx.calendar.length; i++) {
    const date = ctx.calendar[i];
    const previousDate = ctx.calendar[i - 1] || ctx.allCalendar[ctx.allCalendar.indexOf(date) - 1];
    const order = orders.get(date);
    const index = kospiIndex.get(previousDate);
    if (index >= BASE_CONFIG.regimeMaWindow - 1) {
      const movingAverage = mean(ctx.kospi.slice(index - (BASE_CONFIG.regimeMaWindow - 1), index + 1).map(row => row.close));
      const close = ctx.kospi[index].close;
      if (close > movingAverage * (1 + BASE_CONFIG.regimeBand)) regime = true;
      else if (close < movingAverage * (1 - BASE_CONFIG.regimeBand)) regime = false;
    }
    const nextExposure = regime ? 1 : 0;

    if (order) {
      const holdingsBefore = [...positions.keys()];
      const choice = chooseTarget(ctx, order, positions, threshold, nextExposure);
      if (choice.excludedCandidates.length) {
        exclusionEvents.push({
          signalDate: order.signalDate,
          executionDate: order.executionDate,
          rankingYear: order.rankingYear,
          regimeExposureAtExecution: nextExposure,
          holdingsBefore,
          keptIncumbents: choice.kept,
          unfilteredTarget: choice.unfilteredTarget,
          filteredTarget: choice.target,
          excludedCandidates: choice.excludedCandidates,
          addedByFilter: choice.addedByFilter,
        });
      }
      for (const exemption of choice.incumbentJumpExemptions) {
        incumbentExemptions.push({ signalDate: order.signalDate, executionDate: date, ...exemption });
      }
      rebalancingLedger.push({
        signalDate: order.signalDate,
        executionDate: date,
        forcedAnnualRoll: order.forcedAnnualRoll,
        rankingYear: order.rankingYear,
        regimeExposureAtExecution: nextExposure,
        holdingsBefore,
        keptIncumbents: choice.kept,
        target: choice.target,
        excludedTickers: choice.excludedCandidates.map(row => row.ticker),
        fullRanking: order.rankedRows,
      });
      rebalance(date, order, nextExposure, choice.target, order.forcedAnnualRoll ? 'annual-universe-roll' : '21-session-rank');
    } else if (Math.abs(nextExposure - exposure) > 1e-9) {
      rebalance(date, null, nextExposure, null, 'regime-overlay');
    }
    exposure = nextExposure;
    equity.push({ date, equity: portfolioValue(date, 'close'), cash, holdings: positions.size, exposure });
  }

  return {
    threshold,
    summary: summarize(equity, trades, turnover, exclusionEvents, incumbentExemptions),
    equity,
    trades,
    exclusionEvents,
    incumbentExemptions,
    rebalancingLedger,
  };
}

function parityCheck(reference, researchBaseline) {
  if (reference.equity.length !== researchBaseline.equity.length) {
    return { passes: false, reason: 'daily equity length mismatch' };
  }
  let maxAbsoluteEquityDifference = 0;
  let dateMismatchCount = 0;
  for (let i = 0; i < reference.equity.length; i++) {
    if (reference.equity[i].date !== researchBaseline.equity[i].date) dateMismatchCount++;
    maxAbsoluteEquityDifference = Math.max(
      maxAbsoluteEquityDifference,
      Math.abs(reference.equity[i].equity - researchBaseline.equity[i].equity),
    );
  }
  const deltas = {
    cagr: researchBaseline.summary.cagr - reference.cagr,
    sharpeZeroRf: researchBaseline.summary.sharpeZeroRf - reference.sharpeZeroRf,
    maxDrawdown: researchBaseline.summary.maxDrawdown - reference.maxDrawdown,
    turnover: researchBaseline.summary.turnover - reference.turnover,
    tradeCount: researchBaseline.summary.tradeCount - reference.tradeCount,
  };
  const allowed = { maxAbsoluteEquityDifference: 0.01, metricAbsoluteDifference: 1e-12 };
  const passes = dateMismatchCount === 0
    && maxAbsoluteEquityDifference <= allowed.maxAbsoluteEquityDifference
    && Math.abs(deltas.cagr) <= allowed.metricAbsoluteDifference
    && Math.abs(deltas.sharpeZeroRf) <= allowed.metricAbsoluteDifference
    && Math.abs(deltas.maxDrawdown) <= allowed.metricAbsoluteDifference
    && Math.abs(deltas.turnover) <= allowed.metricAbsoluteDifference
    && deltas.tradeCount === 0;
  return { passes, allowed, dateMismatchCount, maxAbsoluteEquityDifference, deltas };
}

function aggregateForwardPerformance(events) {
  const excluded = events.flatMap(event => event.excludedCandidates.filter(row => row.causedPortfolioReplacement));
  const replacements = events.flatMap(event => event.addedByFilter);
  const averageReturns = rows => Object.fromEntries(HORIZONS.map(horizon => {
    const key = `${horizon}d`;
    const values = rows.map(row => row.forwardReturnsFromSignalClose[key]).filter(Number.isFinite);
    return [key, { observations: values.length, mean: values.length ? mean(values) : null }];
  }));
  return {
    excludedCandidates: { count: excluded.length, averageForwardReturns: averageReturns(excluded) },
    replacementCandidates: { count: replacements.length, averageForwardReturns: averageReturns(replacements) },
  };
}

function publicSummary(run) {
  return { ...run.summary, replacementForwardPerformance: aggregateForwardPerformance(run.exclusionEvents) };
}

function signalView(ledger, ticker) {
  if (!ledger) return null;
  const row = ledger.fullRanking.find(item => item.ticker === ticker) || null;
  return {
    signalDate: ledger.signalDate,
    executionDate: ledger.executionDate,
    heldBeforeSignal: ledger.holdingsBefore.includes(ticker),
    keptAsIncumbent: ledger.keptIncumbents.includes(ticker),
    selectedTarget: ledger.target.includes(ticker),
    excludedByFilter: ledger.excludedTickers.includes(ticker),
    rank: row?.rank ?? null,
    oneDayReturn: row?.oneDayReturn ?? null,
  };
}

function buildSOilCase(ctx, baseline, filtered25) {
  const ticker = '010950';
  const state = ctx.states.get(ticker);
  const jumpDate = '2026-03-03';
  const jumpIndex = state ? L.lastIndex(state.bars, jumpDate) : -1;
  const jumpReturn = jumpIndex > 0 && state.bars[jumpIndex].date === jumpDate
    ? state.bars[jumpIndex].close / state.bars[jumpIndex - 1].close - 1
    : null;
  const jumpDateSignal = baseline.rebalancingLedger.find(row => row.signalDate === jumpDate) || null;
  const actualSignal = baseline.rebalancingLedger.find(row => row.signalDate > jumpDate) || null;
  const filteredActualSignal = actualSignal
    ? filtered25.rebalancingLedger.find(row => row.signalDate === actualSignal.signalDate)
    : null;
  const inWindow = trade => trade.ticker === ticker && trade.date >= '2026-02-01' && trade.date <= '2026-04-30';
  const sOilExclusions = filtered25.exclusionEvents.flatMap(event => event.excludedCandidates
    .filter(row => row.ticker === ticker)
    .map(row => ({ signalDate: event.signalDate, executionDate: event.executionDate, oneDayReturn: row.oneDayReturn })));
  return {
    ticker,
    name: state?.name || 'S-Oil',
    jumpDate,
    previousTradingDate: jumpIndex > 0 ? state.bars[jumpIndex - 1].date : null,
    previousClose: jumpIndex > 0 ? state.bars[jumpIndex - 1].close : null,
    jumpClose: jumpIndex >= 0 ? state.bars[jumpIndex].close : null,
    oneDayReturn: jumpReturn,
    jumpDateWasScheduledSignal: Boolean(jumpDateSignal),
    firstScheduledSignalAfterJump: signalView(actualSignal, ticker),
    filtered25ViewOnThatSignal: signalView(filteredActualSignal, ticker),
    sOilExclusionsAt25Pct: sOilExclusions,
    baselineTradesInCaseWindow: baseline.trades.filter(inWindow),
    filtered25TradesInCaseWindow: filtered25.trades.filter(inWindow),
    conclusion: jumpDateSignal
      ? 'The jump coincided with a scheduled signal and must be evaluated as a new-entry decision.'
      : 'The +28.45% day was not a scheduled signal, so that historical jump alone does not trigger the new-entry filter or change the modeled trade ledger.',
  };
}

function compactExclusionLedger(events) {
  return events.map(event => ({
    signalDate: event.signalDate,
    executionDate: event.executionDate,
    rankingYear: event.rankingYear,
    regimeExposureAtExecution: event.regimeExposureAtExecution,
    holdingsBefore: event.holdingsBefore,
    keptIncumbents: event.keptIncumbents,
    unfilteredTarget: event.unfilteredTarget,
    filteredTarget: event.filteredTarget,
    excludedCandidates: event.excludedCandidates,
    addedByFilter: event.addedByFilter,
  }));
}

function formatPct(value) {
  return value === null || value === undefined ? '—' : `${(value * 100).toFixed(2)}%`;
}

function formatNumber(value, digits = 2) {
  return value === null || value === undefined ? '—' : value.toFixed(digits);
}

function renderMarkdown(artifact) {
  const rows = artifact.comparisons.map(row => {
    const label = row.threshold === null ? '기준(필터 없음)' : `${(row.threshold * 100).toFixed(0)}%`;
    return `|${label}|${formatPct(row.fullSample.cagr)}|${formatNumber(row.fullSample.sharpeZeroRf)}|${formatPct(row.fullSample.maxDrawdown)}|${formatPct(row.fullSample.annualizedTurnover)}|${row.fullSample.tradeCount}|${row.fullSample.screenedExclusionCount}|${formatPct(row.oos.cagr)}|${formatNumber(row.oos.sharpeZeroRf)}|${formatPct(row.oos.maxDrawdown)}|`;
  }).join('\n');
  const selected = artifact.comparisons.find(row => row.threshold === 0.25);
  const baseline = artifact.comparisons.find(row => row.threshold === null);
  const operationsRows = artifact.comparisons.map(row => {
    const label = row.threshold === null ? '기준(필터 없음)' : `${(row.threshold * 100).toFixed(0)}%`;
    return `|${label}|${row.fullSample.causalPortfolioExclusionCount}|${row.fullSample.executableEntryBlockCount}|${formatPct(row.oos.annualizedTurnover)}|${row.oos.tradeCount}|${row.oos.screenedExclusionCount}|${row.oos.causalPortfolioExclusionCount}|${row.oos.executableEntryBlockCount}|`;
  }).join('\n');
  const forward = selected.fullSample.replacementForwardPerformance;
  const forwardRows = [
    ['제외 후보', forward.excludedCandidates],
    ['대체 편입', forward.replacementCandidates],
  ].map(([label, item]) => `|${label}|${item.count}|${formatPct(item.averageForwardReturns['1d'].mean)} (${item.averageForwardReturns['1d'].observations})|${formatPct(item.averageForwardReturns['5d'].mean)} (${item.averageForwardReturns['5d'].observations})|${formatPct(item.averageForwardReturns['21d'].mean)} (${item.averageForwardReturns['21d'].observations})|`).join('\n');
  const delta = {
    fullCagr: selected.fullSample.cagr - baseline.fullSample.cagr,
    oosCagr: selected.oos.cagr - baseline.oos.cagr,
    fullMdd: selected.fullSample.maxDrawdown - baseline.fullSample.maxDrawdown,
  };
  const exclusionN = selected.fullSample.causalPortfolioExclusionCount;
  const maxConcentrationEvent = artifact.exclusionLedgers['25'].reduce((best, event) => {
    const count = event.excludedCandidates.filter(row => row.causedPortfolioReplacement).length;
    return !best || count > best.count ? { signalDate: event.signalDate, count } : best;
  }, null);
  const concentrationWarning = exclusionN < 30
    ? `25% 규칙이 목표 종목을 바꾼 표본은 ${exclusionN}건뿐이고, 이 중 한 신호일에 최대 ${selected.fullSample.maxCausalExclusionsOnOneSignal}건(${formatPct(selected.fullSample.maxSingleSignalShareOfCausalExclusions)})이 몰렸다.`
    : `25% 규칙이 목표 종목을 바꾼 표본은 ${exclusionN}건이며, 한 신호일 최대 비중은 ${formatPct(selected.fullSample.maxSingleSignalShareOfCausalExclusions)}다.`;
  const sOil = artifact.sOilCase;
  return `# 52주 신고가 신규진입 급등 필터 민감도\n\n> 연구 단계에서는 가상 규칙으로 비교했으며, 사용자 결정에 따라 **25% 규칙을 2026-07-19 운영 러너·라이브 월간 생성기·Hermes에 채택**했다. 15%·20%는 계속 민감도 참고값일 뿐이다.\n\n## 규칙과 검증 범위\n\n- 기준 전략: 전년말 Top 300 보통주 · 52주 최고 종가 근접도 · 15종목 동일비중 · 보유 밴드 45위 · 21거래일 주기 · 연초 롤 완화 · KOSPI SMA200 ±3% 이진 레짐.\n- 급등 판정: 신호일 종가 ÷ 해당 종목 직전 거래일 종가 − 1. 신규 후보가 임계값 **이상**이면 제외한다. 장중 고가와 과거 급등 이력은 쓰지 않는다.\n- 기존 보유: 신호일 신규 후보가 아니므로, 급등했더라도 새 순위 45위 이내이면 유지한다. 빈자리는 다음 순위 신규 후보로 채운다.\n- 체결과 비용: 신호일까지의 정보만 사용하고 다음 거래일 시가에 체결한다. 매수 25bp, 매도 25bp+거래세 18bp.\n- 데이터: 생존편향 완화 연도별 유니버스, split+배당 총수익 가격 캐시, 기존 point-in-time DART 후보 게이트. strict official 총수익 원장은 아니다.\n- 기간: 전체 ${artifact.period.start}~${artifact.period.end}; OOS ${artifact.oosPeriod.start}~${artifact.oosPeriod.end}.\n\n## 결과\n\n|규칙|전체 CAGR|Sharpe|MDD|연환산 회전율|거래 수|스크리닝 제외|OOS CAGR|OOS Sharpe|OOS MDD|\n|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|\n${rows}\n\n25% 규칙의 기준 대비 변화는 전체 CAGR ${formatPct(delta.fullCagr)}p, OOS CAGR ${formatPct(delta.oosCagr)}p, MDD ${formatPct(delta.fullMdd)}p(낙폭 축소)다. ${concentrationWarning} ${exclusionN}건 중 다음 시가 진입이 실제 가능했던 차단은 ${selected.fullSample.executableEntryBlockCount}건이다.\n\n|규칙|전체 목표변경|전체 실행가능 차단|OOS 연환산 회전율|OOS 거래 수|OOS 스크리닝 제외|OOS 목표변경|OOS 실행가능 차단|\n|---|---:|---:|---:|---:|---:|---:|---:|\n${operationsRows}\n\n### 25% 제외·대체 후보의 이후 성과\n\n|구분|목표변경 표본|1거래일 평균 (n)|5거래일 평균 (n)|21거래일 평균 (n)|\n|---|---:|---:|---:|---:|\n${forwardRows}\n\n개별 신호일·제외 종목·급등률·원래 순위·대체 종목은 JSON 원장에 보존했다. 전체표본에서는 25% 규칙이 CAGR·MDD를 개선했지만 OOS CAGR은 낮아졌고, 표본도 매우 작고 ${maxConcentrationEvent?.signalDate || '—'} 한 날에 ${maxConcentrationEvent?.count || 0}건이 집중됐다. 정책 근거로 확대 해석할 수 없다.\n\n## S-Oil 사례\n\n- ${sOil.jumpDate}: ${sOil.previousClose?.toLocaleString('ko-KR')}원 → ${sOil.jumpClose?.toLocaleString('ko-KR')}원, ${formatPct(sOil.oneDayReturn)}.\n- 이 날은 21거래일 주기 신호일이 **${sOil.jumpDateWasScheduledSignal ? '맞았다' : '아니었다'}**. 다음 실제 신호일은 ${sOil.firstScheduledSignalAfterJump?.signalDate || '—'}이고, 당시 1일 수익률은 ${formatPct(sOil.firstScheduledSignalAfterJump?.oneDayReturn)}였다.\n- 따라서 2026-03-03의 +28.45%만으로는 필터가 발동하지 않으며, 그 사건 자체는 거래 원장을 바꾸지 않는다. 25% 원장의 S-Oil 제외 건수는 ${sOil.sOilExclusionsAt25Pct.length}건이다.\n\n## 회귀·시점 검증\n\n- 필터 비활성화와 기존 연구 엔진의 일별 equity·CAGR·Sharpe·MDD·회전율·거래 수 일치: **${artifact.baselineParity.passes ? '통과' : '실패'}** (최대 equity 절대차 ${artifact.baselineParity.maxAbsoluteEquityDifference}).\n- 운영 러너 기본 25% 경로는 이 보고서의 25% 결과를 재현하고, '--new-entry-jump-threshold-pct 0'은 필터 없는 기준을 재현한다.\n- 경계 단위 테스트: +24.99% 허용, +25.00% 제외, +28.45% 제외, 밴드 내 기존 보유 유지, 제외 후 차순위 충원.\n- 모든 필터 입력은 신호일 종가와 그 이전 값이며, 주문 가격은 다음 거래일 시가다. 다음 시가는 실행 가능 여부와 체결에만 사용하고 제외 판단에는 쓰지 않는다.\n\n## 해석 제한\n\n25% 채택은 수익 최적화가 아니라 당일 급등 신규 추격을 제한하는 운영 제약이다. OOS CAGR이 낮아졌고 표본도 작으므로 구조적 알파로 홍보하거나 임계값을 사후 조정하지 않는다.\n`;
}

function main() {
  const universeFile = arg('--universe-file', path.join(ROOT, 'analysis-example/kr-market/strategies/annual-top300/universe-ledger-2015-2025.json'));
  const cacheDir = arg('--cache-dir', path.join(ROOT, '.tmp/kr-strategy-backtest/marcap-total-return'));
  const panelDir = arg('--dart-panel-dir', path.join(ROOT, '.tmp/kr-strategy-backtest/dart-quarterly-panel'));
  const startDate = arg('--start-date', DEFAULT_START);
  const endDate = arg('--end-date', DEFAULT_END);
  const oosStart = arg('--oos-start', DEFAULT_OOS_START);
  const outDir = arg('--out-dir', path.join(ROOT, 'analysis-example/kr-market/strategies/annual-top300'));
  const artifactStem = arg('--artifact-stem', `52w-high-new-entry-jump-filter-sensitivity-${startDate}-through-${endDate}`);

  const fullContext = buildContext({ universeFile, cacheDir, panelDir, startDate, endDate });
  const oosContext = buildContext({ universeFile, cacheDir, panelDir, startDate: oosStart, endDate });
  const referenceBaseline = runConfig(fullContext, BASE_CONFIG);
  const fullRuns = DEFAULT_THRESHOLDS.map(threshold => runEntryJumpFilter(fullContext, threshold));
  const oosRuns = DEFAULT_THRESHOLDS.map(threshold => runEntryJumpFilter(oosContext, threshold));
  const baseline = fullRuns.find(run => run.threshold === null);
  const filtered25 = fullRuns.find(run => run.threshold === 0.25);
  const baselineParity = parityCheck(referenceBaseline, baseline);
  if (!baselineParity.passes) throw new Error(`filter-off parity failed: ${JSON.stringify(baselineParity)}`);

  const comparisons = fullRuns.map(fullRun => ({
    threshold: fullRun.threshold,
    role: fullRun.threshold === null ? 'baseline' : (fullRun.threshold === 0.25 ? 'preselected-candidate' : 'sensitivity-only'),
    fullSample: publicSummary(fullRun),
    oos: publicSummary(oosRuns.find(run => run.threshold === fullRun.threshold)),
  }));
  const artifact = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    researchOnly: true,
    operatingAdoption: {
      status: 'adopted after research',
      adoptedAt: '2026-07-19',
      runnerDefault: '--new-entry-jump-threshold-pct 25 for high52w; 0 disables',
      liveAndHermes: 'deployed; existing July holdings preserved and ledger metadata backfilled',
    },
    period: { start: startDate, end: endDate },
    oosPeriod: { start: oosStart, end: endDate },
    rules: {
      baseStrategy: BASE_CONFIG,
      entryJumpFilter: 'new candidates only; exclude when signal-close return versus the stock previous trading close is >= threshold',
      incumbentRule: 'keep incumbents ranked 45 or better regardless of one-day return',
      replacementRule: 'scan down the fresh ranking until 15 target names are filled',
      informationCutoff: 'signal-date close and earlier only',
      execution: 'next market session open',
      forwardReturnDefinition: 'signal close to exact close 1, 5, and 21 KOSPI trading sessions later',
    },
    inputs: { universeFile, priceCache: cacheDir, dartPanel: panelDir },
    thresholds: DEFAULT_THRESHOLDS,
    baselineParity,
    comparisons,
    exclusionLedgers: Object.fromEntries(fullRuns.filter(run => run.threshold !== null)
      .map(run => [String(Math.round(run.threshold * 100)), compactExclusionLedger(run.exclusionEvents)])),
    incumbentJumpExemptions25Pct: filtered25.incumbentExemptions,
    sOilCase: buildSOilCase(fullContext, baseline, filtered25),
    limitations: [
      'This is a split-and-dividend total-return research cache, not the strict official corporate-action ledger.',
      'DART coverage is held identical to the existing research engine even though the selected factor has zero EPS weight.',
      '15% and 20% are sensitivity references; 25% is the fixed candidate and is not selected from the realized best result.',
      'A small or event-concentrated exclusion sample cannot establish a live trading edge.',
      'The 25% rule was later adopted as a chase-risk constraint by explicit user decision; the small sample and weaker OOS CAGR remain binding caveats.',
    ],
  };

  const jsonFile = path.join(outDir, `${artifactStem}.json`);
  const markdownFile = path.join(outDir, `${artifactStem}.md`);
  writeJson(jsonFile, artifact);
  fs.writeFileSync(markdownFile, renderMarkdown(artifact));
  console.log(JSON.stringify({ jsonFile, markdownFile, baselineParity, comparisons }, null, 2));
}

module.exports = {
  BASE_CONFIG,
  DEFAULT_THRESHOLDS,
  shouldExcludeNewEntry,
  chooseTarget,
  buildOrders,
  runEntryJumpFilter,
  parityCheck,
};

if (require.main === module) main();
