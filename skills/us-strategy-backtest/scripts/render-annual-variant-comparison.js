#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..', '..');
const strategyRoot = path.join(root, 'analysis-example/us-market/strategies');
const outputDir = path.join(strategyRoot, 'us-minervini-annual-variant-comparison');
const outputBase = path.join(outputDir, 'weekly-annual-variant-comparison-2025-12-31');
const variants = [
  ['모멘텀 + 레짐', 'us-minervini-momentum-annual-free-partial/weekly-annual-ranked-price-only-free-partial-2025-12-31.json'],
  ['모멘텀, 레짐 없음', 'us-minervini-momentum-annual-free-partial/weekly-annual-ranked-price-only-always-on-free-partial-2025-12-31.json'],
  ['가격 + 공시 실적 성장 + 레짐', 'us-minervini-earnings-regime-annual-free-partial/weekly-annual-ranked-free-partial-2025-12-31.json'],
  ['가격 + 퀄리티·실적 성장 + 레짐', 'us-minervini-quality-earnings-annual-free-partial/weekly-annual-ranked-price-quality-growth-hysteresis-free-partial-2025-12-31.json'],
];
const pct = value => `${(value * 100).toFixed(2)}%`;
const ratio = value => value.toFixed(2);
const loaded = variants.map(([name, relative]) => {
  const file = path.join(strategyRoot, relative);
  if (!fs.existsSync(file)) throw new Error(`Missing variant result: ${file}`);
  return { name, relative, result: JSON.parse(fs.readFileSync(file, 'utf8')) };
});
const spy = loaded[0].result.fullPeriod.spy;
const rows = loaded.map(({ name, relative, result }) => {
  const s = result.fullPeriod.strategy, o = result.outOfSample.strategy;
  const eligible = result.universeLedger.map(x => x.eligible);
  return {
    name,
    source: relative,
    fullCagr: s.cagr,
    fullVol: s.annualizedVolatility,
    fullSharpe: s.sharpeZeroRf,
    fullMdd: s.maxDrawdown,
    oosCagr: o.cagr,
    oosMdd: o.maxDrawdown,
    turnover: result.fullPeriod.turnover,
    trades: result.trades.length,
    eligibleAverage: eligible.reduce((a, b) => a + b, 0) / eligible.length,
  };
});
const json = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  method: {
    period: '2021-01-04 to 2025-12-31',
    oos: '2024-01-02 to 2025-12-31',
    universe: 'Supplied year t market-cap Top 500 applied to year t+1; free-data cached partial sample',
    commonRules: 'Minervini template, top 10 equal weight, next adjusted open execution, 10bp one-way cost, 60-day 18% volatility cap',
  },
  benchmark: { fullPeriod: spy, outOfSample: loaded[0].result.outOfSample.spy },
  variants: rows,
};
const body = rows.map(row => `|${row.name}|${pct(row.fullCagr)}|${ratio(row.fullSharpe)}|${pct(row.fullMdd)}|${pct(row.oosCagr)}|${pct(row.oosMdd)}|${ratio(row.turnover)}x|${row.trades}|${row.eligibleAverage.toFixed(1)}|`).join('\n');
const markdown = `# 미국 연도별 Top 500 전략 변형 비교 — 주간 무료 부분표본\n\n> **결론:** 이 2021–2025 부분표본에서 SPY(연 ${pct(spy.cagr)})를 일관되게 이긴 변형은 없었다. 모멘텀+레짐은 OOS에서는 앞섰지만(전략 ${pct(rows[0].oosCagr)} vs SPY ${pct(json.benchmark.outOfSample.cagr)}), 전체 기간에서는 뒤졌다. 결과를 ‘검증된 알파’로 해석하면 안 된다.\n\n## 공통 조건\n\n- 제공받은 연도 t 시가총액 Top 500을 연도 t+1 유니버스로 사용했다. 2020–2024 랭킹을 2021–2025에 적용했다.\n- 매주 리밸런싱, Minervini 추세 템플릿, 상위 10종목 동일비중, 다음 거래일 수정 시가 체결, 편도 10bp, 60일 변동성 목표 연 18%를 공통 적용했다.\n- 공시 ‘실적 성장’은 컨센서스 대비 서프라이즈가 아니라 SEC 분기 매출·희석 EPS YoY 성장의 프록시다. 퀄리티는 순이익률과 분기 ROE의 횡단면 순위다.\n\n## 결과\n\n|전략|전체 CAGR|Sharpe|전체 MDD|OOS CAGR|OOS MDD|회전율|거래 수|리밸런싱당 평균 적격 종목|\n|---|---:|---:|---:|---:|---:|---:|---:|---:|\n${body}\n|SPY|${pct(spy.cagr)}|${ratio(spy.sharpeZeroRf)}|${pct(spy.maxDrawdown)}|${pct(json.benchmark.outOfSample.cagr)}|${pct(json.benchmark.outOfSample.maxDrawdown)}|—|—|—|\n\n## 해석\n\n- **레짐의 역할:** 모멘텀에서 레짐을 끄면 전체 CAGR은 ${pct(rows[1].fullCagr)}로 모멘텀+레짐(${pct(rows[0].fullCagr)})보다 소폭 높지만, MDD가 ${pct(rows[1].fullMdd)}로 확대됐다. 이 표본에서는 초과수익을 만들기보다는 방어 성격이었다.\n- **실적·퀄리티 추가:** 가격+공시 실적 성장은 전체 CAGR ${pct(rows[2].fullCagr)}, 퀄리티까지 추가하면 ${pct(rows[3].fullCagr)}였다. 이 단순 구성에서는 오히려 가격 모멘텀 단독보다 약했다.\n- **OOS만으로는 불충분:** 모멘텀+레짐의 OOS 우위는 2년뿐이며, 동일 기간의 선택·튜닝 결과일 수 있다. 더 긴 과거, 상장폐지 종목, 당시 이용 가능했던 원시 공시 데이터로 재검증이 필요하다.\n\n## 한계\n\n- 무료 Yahoo 수정주가와 SEC companyfacts 캐시를 사용한 부분표본이다. 2020–2024 각 Top 500의 가격 커버리지는 약 98–99%이고, SEC 기반 변형은 약 98%다.\n- CRSP 상장폐지 수익률, PERMNO 연결, 당시 거래소·보통주 여부, 발행주식수 기반의 매일 시총 재구성은 포함하지 않았다. 따라서 survivorship/delisting 편향을 완전히 제거한 WRDS 결과가 아니다.\n- 원본 원장과 종목 선택은 아래 JSON에 보관한다.\n\n## 개별 결과\n\n${loaded.map(({ name, relative }) => `- [${name}](../${relative.replace(/\.json$/, '.md')})`).join('\n')}\n\n- [비교 JSON](weekly-annual-variant-comparison-2025-12-31.json)\n`;

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(`${outputBase}.json`, JSON.stringify(json, null, 2));
fs.writeFileSync(`${outputBase}.md`, markdown);
console.log(`${outputBase}.md`);
