#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..', '..');
const strategyRoot = path.join(root, 'analysis-example/us-market/strategies');
const cache = path.join(root, '.tmp/us-strategy-backtest/2026-07-17/top500/yahoo');
const historicalFile = path.join(strategyRoot, 'us-minervini-momentum-annual-free-partial/weekly-annual-ranked-price-only-free-partial-2025-12-31.json');
const currentFile = path.join(strategyRoot, 'us-minervini-momentum-annual-free-current/weekly-annual-ranked-price-only-hysteresis-free-partial-2026-07-16.json');
const outDir = path.join(strategyRoot, 'us-minervini-momentum-annual-free-current');
const historical = JSON.parse(fs.readFileSync(historicalFile, 'utf8'));
const current = JSON.parse(fs.readFileSync(currentFile, 'utf8'));
const pct = n => `${(n * 100).toFixed(2)}%`;
const name = ticker => {
  try {
    const meta = JSON.parse(fs.readFileSync(path.join(cache, `${ticker}.json`), 'utf8')).chart.result?.[0]?.meta;
    return meta?.longName || meta?.shortName || ticker;
  } catch { return ticker; }
};
const snapshot = (year, source) => {
  const entry = source.universeLedger.filter(x => x.signalDate.startsWith(year)).at(-1);
  return { year, signalDate: entry.signalDate, executionDate: entry.executionDate, regime: entry.regime, holdings: entry.selected.map(x => ({ ticker: x.ticker, company: name(x.ticker), score: x.score })) };
};
const snapshots = ['2024', '2025', '2026'].map(year => snapshot(year, current));
const currentTop30 = current.universeLedger.at(-1).topCandidates.map((x, index) => ({ rank: index + 1, ticker: x.ticker, company: name(x.ticker), score: x.score, sourceMarketCapRank: x.rank }));
const oosLedger = historical.universeLedger.filter(x => x.signalDate >= historical.outOfSampleStart);
const counts = new Map();
for (const ledger of oosLedger) for (const holding of ledger.selected) counts.set(holding.ticker, (counts.get(holding.ticker) || 0) + 1);
const frequent = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 15).map(([ticker, signals]) => ({ ticker, company: name(ticker), signals, frequency: signals / oosLedger.length }));
const annual = new Map(historical.fullPeriod.annualReturns.map(x => [x.year, x.return]));
const output = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  method: {
    strategy: 'Weekly Minervini template + 3/6/12-month price RS, top 10, 200-day SPY +/-3% hysteresis regime, next adjusted open, 10bp one-way cost, 60-day 18% volatility cap',
    universe: 'Supplied year t market-cap Top 500 used during year t+1',
    historicalPeriod: historical.sourcePeriod,
    oosStart: historical.outOfSampleStart,
    currentSignal: '2026-07-13 close; executed 2026-07-14 adjusted open; prices observed through 2026-07-16',
  },
  oosPerformance: historical.outOfSample,
  annualReturns: ['2024', '2025'].map(year => ({ year, strategyReturn: annual.get(year) })),
  yearEndOrCurrentSnapshots: snapshots,
  currentTop30,
  mostFrequentOosHoldings: frequent,
  dataWarning: 'STX price cache ends on 2025-12-31. The 2026 simulation retains that stale historical position and therefore its 2026 realized performance and exact final weights are not reported here. The current 10-stock signal list does not include STX and each listed current candidate has a current price bar.',
};
const holdingsTable = snapshot => snapshot.holdings.map((x, index) => `|${index + 1}|${x.ticker}|${x.company}|${x.score.toFixed(3)}|`).join('\n');
const top30Table = currentTop30.map(x => `|${x.rank}|${x.ticker}|${x.company}|${x.score.toFixed(3)}|${x.sourceMarketCapRank}|`).join('\n');
const markdown = `# 미국 연도별 Top 500 Minervini 모멘텀 — 최근 2년·현재 포트폴리오\n\n> 매수 추천이 아닌 과거 시뮬레이션 및 규칙 기반 화면이다. 유니버스는 제공받은 전년도 시가총액 Top 500이며, 가격 데이터는 Yahoo 수정주가 프록시다.\n\n## 최근 2년 성과 (2024-01-02~2025-12-31)\n\n|지표|모멘텀 + 레짐|SPY|\n|---|---:|---:|\n|CAGR|${pct(historical.outOfSample.strategy.cagr)}|${pct(historical.outOfSample.spy.cagr)}|\n|누적수익률|${pct(historical.outOfSample.strategy.totalReturn)}|${pct(historical.outOfSample.spy.totalReturn)}|\n|연환산 변동성|${pct(historical.outOfSample.strategy.annualizedVolatility)}|${pct(historical.outOfSample.spy.annualizedVolatility)}|\n|Sharpe|${historical.outOfSample.strategy.sharpeZeroRf.toFixed(2)}|${historical.outOfSample.spy.sharpeZeroRf.toFixed(2)}|\n|MDD|${pct(historical.outOfSample.strategy.maxDrawdown)}|${pct(historical.outOfSample.spy.maxDrawdown)}|\n\n|연도|전략 수익률|\n|---|---:|\n|2024|${pct(annual.get('2024'))}|\n|2025|${pct(annual.get('2025'))}|\n\n## 2년간 자주 편입된 종목\n\n|종목|회사|선정 횟수 (총 ${oosLedger.length}회 신호)|신호 비중|\n|---|---|---:|---:|\n${frequent.map(x => `|${x.ticker}|${x.company}|${x.signals}|${pct(x.frequency)}|`).join('\n')}\n\n## 연말·현재 신호 스냅샷\n\n${snapshots.slice(0, 2).map(x => `### ${x.year}년 말\n\n신호일 ${x.signalDate}, 다음 거래일 ${x.executionDate} 시가 체결, 레짐: ${x.regime ? '위험자산 보유' : '현금'}.\n\n|순위|종목|회사|복합 점수|\n|---:|---|---|---:|\n${holdingsTable(x)}`).join('\n\n')}\n\n### 2026년 현재\n\n신호일 **${snapshots[2].signalDate}** 종가, 체결일 **${snapshots[2].executionDate}** 수정 시가 기준이다. 2025년 시가총액 Top 500을 유니버스로 사용했고 레짐은 **${snapshots[2].regime ? '위험자산 보유' : '현금'}**다. 상위 10개를 동일비중으로 목표 편입하되, 60일 실현변동성에 따른 18% 연율 변동성 상한 때문에 총 익스포저는 100%보다 낮아질 수 있다.\n\n|순위|종목|회사|복합 점수|\n|---:|---|---|---:|\n${holdingsTable(snapshots[2])}\n\n## 중요한 데이터 제한\n\n- **STX(Seagate)의 가격 캐시가 2025-12-31에서 끊겼다.** 엔진은 결측 가격 보유분을 마지막 가격으로 유지하도록 설계되어 있어, 2026년 시뮬레이션의 수익률·정확한 최종 비중은 보고하지 않았다. STX는 위 2026년 신규 신호 10종목에는 포함되지 않는다.\n- 따라서 현재 표는 ‘최신 유효 신호의 목표 포트폴리오’이며, 실제 체결·호가·세금·시장충격을 반영한 투자 지시가 아니다.\n- 상장폐지 수익률, PERMNO 연결, point-in-time 거래소·보통주 필터는 이 무료 프록시에 포함되지 않는다.\n\n- [2024–2025 원장 JSON](../us-minervini-momentum-annual-free-partial/weekly-annual-ranked-price-only-free-partial-2025-12-31.json)\n- [현재 신호 원장 JSON](weekly-annual-ranked-price-only-hysteresis-free-partial-2026-07-16.json)\n- [요약 JSON](portfolio-summary-2026-07-16.json)\n`;

fs.writeFileSync(path.join(outDir, 'portfolio-summary-2026-07-16.json'), JSON.stringify(output, null, 2));
fs.writeFileSync(path.join(outDir, 'portfolio-summary-2026-07-16.md'), markdown);
console.log(path.join(outDir, 'portfolio-summary-2026-07-16.md'));
