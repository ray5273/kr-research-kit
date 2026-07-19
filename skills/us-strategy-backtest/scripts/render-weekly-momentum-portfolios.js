#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..', '..');
const outputDir = path.join(root, 'analysis-example/us-market/strategies/us-minervini-momentum-annual-free-current');
const source = path.join(outputDir, 'weekly-annual-ranked-price-only-hysteresis-free-partial-2026-07-16.json');
const result = JSON.parse(fs.readFileSync(source, 'utf8'));
const ledger = result.universeLedger.map((entry, index) => {
  if (entry.regime && entry.selected.length !== 10) throw new Error(`${entry.signalDate}: active regime must have 10 target holdings`);
  if (!entry.regime && entry.selected.length !== 0) throw new Error(`${entry.signalDate}: inactive regime must hold cash`);
  return {
    rebalanceNumber: index + 1,
    signalDate: entry.signalDate,
    executionDate: entry.executionDate,
    sourceRankingYear: entry.sourceRankingYear,
    regime: entry.regime ? '보유' : '현금',
    eligible: entry.eligible,
    targetTickers: entry.selected.map(x => x.ticker),
    targetScore: entry.selected.map(x => x.score),
  };
});
const byYear = new Map();
for (const row of ledger) {
  const year = row.signalDate.slice(0, 4);
  if (!byYear.has(year)) byYear.set(year, []);
  byYear.get(year).push(row);
}
const table = rows => rows.map(row => `|${row.rebalanceNumber}|${row.signalDate}|${row.executionDate}|${row.sourceRankingYear}|${row.regime}|${row.eligible}|${row.targetTickers.length ? row.targetTickers.join(', ') : '현금 100%'}|`).join('\n');
const sections = [...byYear.entries()].map(([year, rows]) => `## ${year}년\n\n|리밸런싱|신호일|체결일|사용 랭킹 연도|레짐|적격 후보|목표 포트폴리오 (동일비중)|\n|---:|---|---|---:|---|---:|---|\n${table(rows)}`).join('\n\n');
const output = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  sourceResult: path.basename(source),
  methodology: {
    frequency: 'Every five trading sessions; signals at close and executions at next available adjusted open',
    portfolio: 'Top 10 equal target weights from Minervini template + 3/6/12-month price relative-strength score',
    regime: 'SPY 200-day +/-3% hysteresis; inactive regime targets cash',
    universe: 'Supplied market-cap Top 500 of year t applied during year t+1',
  },
  portfolios: ledger,
  dataWarning: 'Yahoo adjusted-price proxy. STX cache ends on 2025-12-31; 2026 target portfolios remain valid signal lists but realized holdings and returns after that date are not used for performance reporting.',
};
const markdown = `# 미국 연도별 Top 500 Minervini 모멘텀 — 매주 목표 포트폴리오\n\n> 2021-01-04부터 2026-07-13 신호일까지 **${ledger.length}회** 리밸런싱의 목표 포트폴리오다. 신호는 종가로 계산하고 다음 거래일 수정 시가에 체결한다. 투자 권유가 아닌 규칙 기반 무료 데이터 프록시다.\n\n## 읽는 법\n\n- 각 행이 한 번의 5거래일 리밸런싱이다. ‘보유’면 표의 10개를 동일 목표비중으로, ‘현금’이면 목표 보유종목 없이 현금으로 둔다.\n- ‘사용 랭킹 연도’는 유니버스용 전년도 시가총액 Top 500의 연도다. 예를 들어 2026년 신호는 2025년 랭킹을 쓴다.\n- 적격 후보는 Minervini 템플릿을 통과한 뒤 점수를 계산할 수 있었던 종목 수다.\n- 60일 변동성 상한(연 18%) 때문에 실제 목표 총 익스포저는 100%보다 낮아질 수 있다.\n\n${sections}\n\n## 데이터 제한\n\n- Yahoo 수정주가 기반의 총수익 프록시이며, CRSP 상장폐지 수익률·PERMNO·거래소/보통주 point-in-time 필터는 없다.\n- STX 가격 캐시가 2025-12-31에서 끝난다. 따라서 2026년 행은 **목표 신호 포트폴리오**로만 해석하고, 이후 실현 보유·수익률은 확정하지 않는다.\n\n- [기계 판독용 JSON](weekly-target-portfolios-2021-2026-07-13.json)\n- [원장 JSON](weekly-annual-ranked-price-only-hysteresis-free-partial-2026-07-16.json)\n`;

fs.writeFileSync(path.join(outputDir, 'weekly-target-portfolios-2021-2026-07-13.json'), JSON.stringify(output, null, 2));
fs.writeFileSync(path.join(outputDir, 'weekly-target-portfolios-2021-2026-07-13.md'), markdown);
console.log(path.join(outputDir, 'weekly-target-portfolios-2021-2026-07-13.md'));
