#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..', '..');
const strategyRoot = path.join(root, 'analysis-example/us-market/strategies');
const resultFile = path.join(strategyRoot, 'us-minervini-momentum-annual-free-current/weekly-annual-ranked-price-only-hysteresis-free-partial-2026-07-16.json');
const cache = path.join(root, '.tmp/us-strategy-backtest/2026-07-17/top500/yahoo');
const outDir = path.dirname(resultFile);
const result = JSON.parse(fs.readFileSync(resultFile, 'utf8'));
const name = ticker => {
  try {
    const meta = JSON.parse(fs.readFileSync(path.join(cache, `${ticker}.json`), 'utf8')).chart.result?.[0]?.meta;
    return meta?.longName || meta?.shortName || ticker;
  } catch { return ticker; }
};
const pct = value => `${(value * 100).toFixed(2)}%`;
const rows = [];
const yearly = [];
for (const year of ['2021', '2022', '2023', '2024', '2025', '2026']) {
  const signal = result.universeLedger.filter(x => x.signalDate.startsWith(year)).at(-1);
  if (!signal) continue;
  const holdings = signal.selected.map((x, index) => ({
    year,
    signalDate: signal.signalDate,
    executionDate: signal.executionDate,
    regime: signal.regime,
    momentumRank: index + 1,
    ticker: x.ticker,
    company: name(x.ticker),
    score: x.score,
    sourceRankingYear: signal.sourceRankingYear,
    sourceMarketCapRank: x.rank,
  }));
  rows.push(...holdings);
  yearly.push({ year, signalDate: signal.signalDate, executionDate: signal.executionDate, regime: signal.regime, sourceRankingYear: signal.sourceRankingYear, holdings });
}
const currentTop30 = result.universeLedger.at(-1).topCandidates.map((x, index) => ({
  momentumRank: index + 1,
  ticker: x.ticker,
  company: name(x.ticker),
  score: x.score,
  sourceMarketCapRank: x.rank,
}));
const annualReturn = new Map(result.fullPeriod.annualReturns.map(x => [x.year, x.return]));
const benchmarkAnnual = new Map();
for (const point of result.spyDailyEquity) {
  const year = point.date.slice(0, 4);
  if (!benchmarkAnnual.has(year)) benchmarkAnnual.set(year, { start: point.equity, end: point.equity });
  else benchmarkAnnual.get(year).end = point.equity;
}
const output = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  strategy: 'Weekly Minervini trend template + 3/6/12-month price RS; top 10 equal target weights; SPY 200-day +/-3% hysteresis; 60-day 18% volatility cap; next adjusted open; 10bp one-way cost',
  universe: 'Supplied market-cap Top 500 of year t, applied during year t+1',
  snapshots: yearly,
  currentTop30,
  annualPerformance: ['2021', '2022', '2023', '2024', '2025'].map(year => ({ year, strategyReturn: annualReturn.get(year), spyReturn: benchmarkAnnual.get(year).end / benchmarkAnnual.get(year).start - 1 })),
  currentDataWarning: 'STX cache ends 2025-12-31; 2026 realized performance and final weights are excluded. The latest 2026 signal candidates all have price data through 2026-07-16.',
};
const historyTable = yearly.flatMap(snapshot => snapshot.holdings.length ? snapshot.holdings.map(x => `|${x.year}|${x.signalDate}|${x.executionDate}|${x.regime ? '보유' : '현금'}|${x.momentumRank}|${x.ticker}|${x.company}|${x.score.toFixed(3)}|${x.sourceRankingYear}|${x.sourceMarketCapRank}|`) : [`|${snapshot.year}|${snapshot.signalDate}|${snapshot.executionDate}|현금|—|—|레짐 비활성: 목표 보유 없음|—|${snapshot.sourceRankingYear}|—|`]).join('\n');
const top30Table = currentTop30.map(x => `|${x.momentumRank}|${x.ticker}|${x.company}|${x.score.toFixed(3)}|${x.sourceMarketCapRank}|`).join('\n');
const performanceTable = output.annualPerformance.map(x => `|${x.year}|${pct(x.strategyReturn)}|${pct(x.spyReturn)}|`).join('\n');
const markdown = `# 미국 연도별 Top 500 Minervini 모멘텀 — 2021년 이후 포트폴리오 표\n\n> 무료 Yahoo 수정주가 프록시와 제공받은 연도별 시가총액 랭킹으로 만든 규칙 기반 시뮬레이션이다. 투자 권유가 아니며 WRDS point-in-time·상장폐지 완전 결과가 아니다.\n\n## 규칙과 읽는 법\n\n- 연도 t의 제공 시가총액 Top 500을 연도 t+1 유니버스로 사용했다. 따라서 2021년 포트폴리오는 2020년 랭킹, 2026년은 2025년 랭킹을 쓴다.\n- 매주 Minervini 추세 템플릿을 통과한 종목의 3/6/12개월 RS를 점수화해 상위 10개를 목표 편입한다. SPY 200일선 ±3% 레짐이 현금이면 보유하지 않는다.\n- 아래 표는 각 연도의 **마지막 리밸런싱 신호**다. ‘시총 순위’는 입력 랭킹의 순위이며 모멘텀 순위와 다르다.\n\n## 연도별 성과 (2021~2025)\n\n|연도|전략|SPY|\n|---|---:|---:|\n${performanceTable}\n\n## 연도별 마지막 Top 10 포트폴리오\n\n|연도|신호일|체결일|레짐|모멘텀 순위|종목|회사|점수|사용 랭킹 연도|시총 순위|\n|---|---|---|---|---:|---|---|---:|---:|---:|\n${historyTable}\n\n## 2026년 현재 모멘텀 상위 30\n\n기준: **2026-07-13 종가 신호**, **2026-07-14 수정 시가 체결**. 상위 10개만 목표 편입이고 11~30위는 후보군이다.\n\n|모멘텀 순위|종목|회사|점수|2025년 시총 순위|\n|---:|---|---|---:|---:|\n${top30Table}\n\n## 2026년 데이터 제한\n\n- STX 가격 캐시가 2025-12-31에서 중단되어, 결측 보유분을 마지막 가격으로 유지하는 엔진 규칙상 2026년 실현 성과·정확한 최종 비중은 기재하지 않았다.\n- 위 2026년 Top 30 후보는 모두 2026-07-16까지의 가격 바를 확인했다. STX는 현재 후보 30위 안에 없다.\n- 입력 랭킹에는 보통주 외 증권이 섞였을 수 있으며, 이 무료 프록시는 CRSP share code·PERMNO·상장폐지 수익률을 검증하지 않는다.\n\n- [원장 JSON](weekly-annual-ranked-price-only-hysteresis-free-partial-2026-07-16.json)\n- [표 데이터 JSON](portfolio-history-2021-2026-07-16.json)\n`;

fs.writeFileSync(path.join(outDir, 'portfolio-history-2021-2026-07-16.json'), JSON.stringify(output, null, 2));
fs.writeFileSync(path.join(outDir, 'portfolio-history-2021-2026-07-16.md'), markdown);
console.log(path.join(outDir, 'portfolio-history-2021-2026-07-16.md'));
