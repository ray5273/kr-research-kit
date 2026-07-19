#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const L = require('./lib/factor-backtest-core.js');
const { buildContext } = require('./analyze-overlay-ablation.js');
const {
  deriveHoldingCycles,
  summarizeCycles,
  annualEquityReturns,
  annualCycleStats,
} = require('./analyze-52w-high-yearly-win-payoff.js');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const INITIAL = 100000000;
const DEFAULT_START = '2017-01-02';
const DEFAULT_END = '2026-07-16';
const SELL_COST_RATE = 0.0043;

const arg = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
};
const sha256File = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const pct = value => value === null || value === undefined ? '—' : `${(value * 100).toFixed(2)}%`;
const multiple = value => value === null || value === undefined ? '—' : `${value.toFixed(2)}배`;
const integer = value => Number(value).toLocaleString('ko-KR');

function strategyFromRunner({ meta, file, context, startDate, endDate }) {
  const run = readJson(file);
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
    hypotheticalSellCostRate: SELL_COST_RATE,
  });
  if (cycles.unmarkable.length) {
    throw new Error(`${meta.id}: unmarkable open cycles: ${JSON.stringify(cycles.unmarkable)}`);
  }

  const startYear = Number(startDate.slice(0, 4));
  const endYear = Number(endDate.slice(0, 4));
  const annualReturns = annualEquityReturns(run.dailyEquity, startYear, endYear);
  const annual = annualCycleStats(cycles.completed, annualReturns, startYear, endYear);
  const currentYearClosed = cycles.completed.filter(cycle => cycle.exitYear === String(endYear));
  const currentMarked = cycles.openMarked.filter(cycle => cycle.markAgeCalendarDays <= 7);
  const staleCarried = cycles.openMarked.filter(cycle => cycle.markAgeCalendarDays > 7);
  const hypotheticalSellCosts = cycles.openMarked.reduce((sum, cycle) => sum + cycle.hypotheticalSellCost, 0);
  const cycleNetPnl = [...cycles.completed, ...cycles.openMarked].reduce((sum, cycle) => sum + cycle.netPnl, 0);
  const expectedNetPnl = run.dailyEquity.at(-1).equity - INITIAL - hypotheticalSellCosts;
  const pnlDifference = cycleNetPnl - expectedNetPnl;
  if (Math.abs(pnlDifference) > 0.01) {
    throw new Error(`${meta.id}: cycle P&L reconciliation failed by ${pnlDifference}`);
  }

  return {
    ...meta,
    source: {
      fullRunnerArtifact: file,
      sha256: sha256File(file),
      rules: run.rules,
      summary: run.summary,
    },
    annualReturns,
    annual,
    overallCompleted: summarizeCycles(cycles.completed),
    currentYearProvisional: {
      asOf: endDate,
      closedOnly: summarizeCycles(currentYearClosed),
      allEngineOpenCount: cycles.openMarked.length,
      currentMarkedCount: currentMarked.length,
      includingCurrentMarked: summarizeCycles([...currentYearClosed, ...currentMarked]),
      staleCarriedCount: staleCarried.length,
      staleCarried: staleCarried.map(cycle => ({
        ticker: cycle.ticker,
        name: cycle.name,
        entryDate: cycle.entryDate,
        markPriceDate: cycle.markPriceDate,
        markAgeCalendarDays: cycle.markAgeCalendarDays,
      })),
    },
    validation: {
      cyclePnl: cycleNetPnl,
      expectedPnlAfterHypotheticalSellCosts: expectedNetPnl,
      difference: pnlDifference,
      tolerance: 0.01,
      passes: Math.abs(pnlDifference) <= 0.01,
    },
  };
}

function strategyFromMain({ meta, file }) {
  const run = readJson(file);
  return {
    ...meta,
    source: {
      yearlyAnalysisArtifact: file,
      sha256: sha256File(file),
      rules: run.normalizedConfig,
      summary: run.backtestSummary,
    },
    annualReturns: run.annualReturns,
    annual: run.annual,
    overallCompleted: run.overallCompleted,
    currentYearProvisional: run.currentYearProvisional,
    validation: run.validation,
  };
}

function overallRow(strategy) {
  return {
    id: strategy.id,
    name: strategy.name,
    cycleCount: strategy.overallCompleted.cycleCount,
    winRate: strategy.overallCompleted.winRate,
    averageWinReturn: strategy.overallCompleted.averageWinReturn,
    averageLossReturn: strategy.overallCompleted.averageLossReturn,
    payoffRatio: strategy.overallCompleted.payoffRatio,
    profitFactor: strategy.overallCompleted.profitFactor,
  };
}

function annualTable(strategy, startYear, endYear) {
  const lines = [
    '| 연도 | 전략수익률 | 실현 사이클 | 승률 | 평균 이익 | 평균 손실 | 손익비 | PF |',
    '|---:|---:|---:|---:|---:|---:|---:|---:|',
  ];
  for (let year = startYear; year <= endYear; year++) {
    const row = strategy.annual[String(year)];
    const yearLabel = year === endYear ? `${year} YTD` : String(year);
    lines.push(`| ${yearLabel} | ${pct(row?.strategyReturn)} | ${integer(row?.cycleCount || 0)} | ${pct(row?.winRate)} | ${pct(row?.averageWinReturn)} | ${pct(row?.averageLossReturn)} | ${multiple(row?.payoffRatio)} | ${row?.profitFactor == null ? '—' : row.profitFactor.toFixed(2)} |`);
  }
  return lines.join('\n');
}

function renderMarkdown(artifact, jsonFile, jsonSha256) {
  const lines = [
    '# 핵심 전략별 연도별 승률·손익비 비교',
    '',
    `- 기간: ${artifact.period.start} ~ ${artifact.period.end} (${artifact.period.currentYearIsPartial ? '2026년은 7월 16일까지' : '전체 기간'})`,
    '- 공통 기준: 거래비용 반영, 종목별 첫 매수부터 잔고 0까지를 1개 보유 사이클로 묶고 부분매도는 FIFO로 대응',
    '- 연도 귀속: 보유 사이클이 실제 청산된 연도',
    '- 승률: 순손익이 양수인 실현 사이클 / 전체 실현 사이클',
    '- 손익비: 평균 이익률 / 평균 손실률 절댓값',
    `- 기계 판독 JSON: \`${path.relative(ROOT, jsonFile)}\` (SHA-256 \`${jsonSha256}\`)`,
    '',
    '## 전체 기간 요약',
    '',
    '| 전략 | 실현 사이클 | 승률 | 평균 이익 | 평균 손실 | 손익비 | PF |',
    '|---|---:|---:|---:|---:|---:|---:|',
  ];
  for (const row of artifact.overallComparison) {
    lines.push(`| ${row.name} | ${integer(row.cycleCount)} | ${pct(row.winRate)} | ${pct(row.averageWinReturn)} | ${pct(row.averageLossReturn)} | ${multiple(row.payoffRatio)} | ${row.profitFactor == null ? '—' : row.profitFactor.toFixed(2)} |`);
  }

  lines.push(
    '',
    '## 해석',
    '',
    ...artifact.findings.map(item => `- ${item}`),
  );

  for (const strategy of artifact.strategies) {
    lines.push(
      '',
      `## ${strategy.name}`,
      '',
      strategy.description,
      '',
      annualTable(strategy, Number(artifact.period.start.slice(0, 4)), Number(artifact.period.end.slice(0, 4))),
      '',
      `전체 실현 사이클은 ${integer(strategy.overallCompleted.cycleCount)}개, 승률 ${pct(strategy.overallCompleted.winRate)}, 손익비 ${multiple(strategy.overallCompleted.payoffRatio)}, PF ${strategy.overallCompleted.profitFactor?.toFixed(2) ?? '—'}다.`,
    );
  }

  lines.push(
    '',
    '## 2026년 해석 주의',
    '',
    '- 표의 2026 YTD 행은 2026년에 실제 청산된 사이클만 사용한다.',
    '- 미청산 보유분은 승패가 확정되지 않았으므로 연도별 표에서 제외했다. 각 전략의 JSON에는 현재가 표시 보조통계를 별도로 남겼다.',
    '- 사이클 수가 0인 연도는 시장 방어 규칙으로 신규 진입이 없었거나 해당 연도에 청산된 사이클이 없었다는 뜻이다.',
    '',
    '## 재현 메모',
    '',
    '- 네 비교전략의 전체 백테스트 산출물은 격리된 프레젠테이션 작업 폴더에 보존했고, 본 JSON에 경로·SHA-256·정규화 규칙을 기록했다.',
    '- 핵심 52주 전략은 기존 연도별 분석 JSON을 직접 참조했다.',
    '- 모든 전략의 사이클 손익 합계는 엔진 최종자산과 0.01원 이내로 대사했다.',
    '',
  );
  return lines.join('\n');
}

function main() {
  const startDate = arg('--start-date', DEFAULT_START);
  const endDate = arg('--end-date', DEFAULT_END);
  const universeFile = path.resolve(arg('--universe-file', path.join(ROOT, 'analysis-example/kr-market/strategies/annual-top300/universe-ledger-2015-2025.json')));
  const cacheDir = path.resolve(arg('--cache-dir', path.join(ROOT, '.tmp/kr-strategy-backtest/marcap-total-return')));
  const panelDir = path.resolve(arg('--dart-panel-dir', path.join(ROOT, '.tmp/kr-strategy-backtest/dart-quarterly-panel')));
  const mainFile = path.resolve(arg('--main-file', path.join(ROOT, 'analysis-example/kr-market/strategies/annual-top300/52w-high-yearly-win-payoff-2017-through-2026-07-16.json')));
  const files = {
    r1: path.resolve(arg('--r1-file', '')),
    eps: path.resolve(arg('--eps-file', '')),
    market: path.resolve(arg('--market-file', '')),
    legacy: path.resolve(arg('--legacy-file', '')),
  };
  for (const [key, file] of Object.entries(files)) {
    if (!file || !fs.existsSync(file)) throw new Error(`--${key}-file is required and must exist: ${file}`);
  }

  const context = buildContext({ universeFile, cacheDir, panelDir, startDate, endDate });
  const metas = {
    main: {
      id: '52w-high',
      name: '52주 최고가 근접',
      description: '52주 최고가 근접도, 월간 리밸런싱, 상위 15종목, 보유완충 45위, KOSPI SMA200 ±3% 방어, 신규진입 +25% 갭 필터.',
    },
    r1: {
      id: 'base-mixed-r1',
      name: '기본 혼합전략',
      description: '3·6·12개월 RS 50% + 시점일치 EPS·매출 50%, 상위 10종목, 5거래일 리밸런싱, KOSPI SMA200 ±3% 방어.',
    },
    eps: {
      id: 'earnings-growth',
      name: '이익성장 중심',
      description: '시점일치 EPS·매출 성장 100%, 상위 15종목, 5거래일 리밸런싱, KOSPI SMA200 ±3% 방어.',
    },
    market: {
      id: 'broad-market-sma200',
      name: '시장 전체 + 200일선',
      description: '연간 상위 300 유니버스에서 RS 기준 상위 200종목을 21거래일마다 리밸런싱하고 KOSPI SMA200 ±3% 방어를 적용.',
    },
    legacy: {
      id: 'legacy-vol-target',
      name: '구형 전략',
      description: '기본 혼합전략에 18% 변동성 타깃(60거래일)을 추가한 구형 운용안.',
    },
  };

  const strategies = [
    strategyFromMain({ meta: metas.main, file: mainFile }),
    strategyFromRunner({ meta: metas.r1, file: files.r1, context, startDate, endDate }),
    strategyFromRunner({ meta: metas.eps, file: files.eps, context, startDate, endDate }),
    strategyFromRunner({ meta: metas.market, file: files.market, context, startDate, endDate }),
    strategyFromRunner({ meta: metas.legacy, file: files.legacy, context, startDate, endDate }),
  ];
  const overallComparison = strategies.map(overallRow);
  const leaderPayoff = [...overallComparison].sort((a, b) => (b.payoffRatio || -Infinity) - (a.payoffRatio || -Infinity))[0];
  const leaderPf = [...overallComparison].sort((a, b) => (b.profitFactor || -Infinity) - (a.profitFactor || -Infinity))[0];
  const leaderWin = [...overallComparison].sort((a, b) => (b.winRate || -Infinity) - (a.winRate || -Infinity))[0];
  const findings = [
    `손익비가 가장 높은 전략은 ${leaderPayoff.name} ${multiple(leaderPayoff.payoffRatio)}다.`,
    `이익·손실 금액의 비대칭까지 반영한 PF는 ${leaderPf.name} ${leaderPf.profitFactor.toFixed(2)}가 가장 높다.`,
    `승률은 ${leaderWin.name} ${pct(leaderWin.winRate)}가 가장 높지만, 전략 평가는 승률 단독이 아니라 손익비·PF·낙폭을 함께 봐야 한다.`,
  ];

  const artifact = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    period: { start: startDate, end: endDate, currentYearIsPartial: true },
    definitions: {
      winRate: 'profitable completed holding cycles / all completed holding cycles',
      cycle: 'first buy until ticker position returns to zero; partial sells are FIFO matched',
      cycleReturn: 'net realized P&L after modeled costs / FIFO gross cost basis including buy costs',
      payoffRatio: 'arithmetic mean winning cycle return / absolute arithmetic mean losing cycle return',
      profitFactor: 'sum positive cycle P&L / absolute sum negative cycle P&L',
      annualAttribution: 'exit year of completed holding cycle',
    },
    overallComparison,
    findings,
    strategies,
    commonInputs: {
      annualUniverseLedger: universeFile,
      annualUniverseLedgerSha256: sha256File(universeFile),
      priceStateManifestSha256: L.priceManifestHash(context.states),
      priceCacheDir: cacheDir,
      dartPanelDir: panelDir,
    },
  };

  const outDir = path.resolve(arg('--out-dir', path.join(ROOT, 'analysis-example/kr-market/strategies/annual-top300')));
  const stem = arg('--stem', 'strategy-yearly-win-payoff-comparison-2017-through-2026-07-16');
  fs.mkdirSync(outDir, { recursive: true });
  const jsonFile = path.join(outDir, `${stem}.json`);
  const markdownFile = path.join(outDir, `${stem}.md`);
  fs.writeFileSync(jsonFile, JSON.stringify(artifact, null, 2) + '\n');
  const jsonSha256 = sha256File(jsonFile);
  fs.writeFileSync(markdownFile, renderMarkdown(artifact, jsonFile, jsonSha256));
  console.log(JSON.stringify({ jsonFile, markdownFile, overallComparison, findings }, null, 2));
}

if (require.main === module) main();
