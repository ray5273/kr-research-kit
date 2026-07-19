#!/usr/bin/env node
'use strict';

// Compare the repository's original current-constituent weekly-main result to
// its annual Top-300 reconstitution counterpart.  The purpose is composition
// attribution, not a claim that their headline returns are perfectly apples to
// apples: the historical baseline predates sell-tax modelling.

const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const OUT = path.join(ROOT, 'analysis-example/kr-market/strategies/annual-top300');
const latestFile = path.join(ROOT, 'analysis-example/kr-market/strategies/trend-following-10y/weekly-main-strategy-from-2017-filing-lag1-through-2026-07-10.json');
const annualFile = path.join(OUT, 'annual-top300-minervini-earnings-regime-2017-01-02-through-2026-07-10.json');
const universeFile = path.join(OUT, 'universe-ledger-2015-2025.json');
const read = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const pct = x => `${(x * 100).toFixed(1)}%`;
const avg = xs => xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0;
const set = rows => new Set(rows.map(x => x.ticker));
const overlap = (a, b) => { const common = [...a].filter(x => b.has(x)); const union = new Set([...a, ...b]); return { common, count: common.length, jaccard: union.size ? common.length / union.size : 0 }; };
function main() {
  const latest = read(latestFile), annual = read(annualFile), universe = read(universeFile);
  const latestSelections = [...latest.selections].sort((a, b) => a.executionDate.localeCompare(b.executionDate));
  const latestActiveAt = date => latestSelections.filter(x => x.executionDate <= date).at(-1) || null;
  const annualRegular = annual.rebalancingLedger.filter(x => !x.forcedAnnualRoll);
  const matches = annualRegular.map(a => { const b = latestActiveAt(a.executionDate); if (!b) return null; const o = overlap(set(a.holdings), set(b.holdings)); return { executionDate: a.executionDate, rankingYear: a.rankingYear, annual: a, latest: b, ...o }; }).filter(Boolean);
  const rolls = annual.rebalancingLedger.filter(x => x.forcedAnnualRoll).map(a => { const b = latestActiveAt(a.executionDate), o = b ? overlap(set(a.holdings), set(b.holdings)) : null; return { executionDate: a.executionDate, rankingYear: a.rankingYear, annualHoldings: a.holdings.length, latestHoldings: b?.holdings?.length ?? null, overlap: o?.count ?? null, jaccard: o?.jaccard ?? null }; });
  const current = latest.selections.at(-1), annualCurrent = annual.rebalancingLedger.at(-1), now = overlap(set(current.holdings), set(annualCurrent.holdings));
  const annualByYear = new Map(universe.snapshots.map(s => [s.rankingYear, new Set(s.constituents.map(x => x.ticker))]));
  const currentUniverse = new Set((read(path.join(ROOT, 'analysis-example/kr-market/strategies/trend-following-10y/largecap-momentum-backtest-2026-07-10.json')).universe.top300 || []).map(x => x.ticker));
  const universeRows = universe.snapshots.map(s => { const o = overlap(annualByYear.get(s.rankingYear), currentUniverse); return { rankingYear: s.rankingYear, asOfDate: s.asOfDate, annualCommon: s.commonShareCount, overlapWithLatest: o.count, latestShare: o.count / s.commonShareCount }; });
  const result = { generatedAt: new Date().toISOString(), files: { latestFile, annualFile, universeFile }, methodology: { latest: latest.rules, annual: annual.rules, returnComparability: 'Portfolio composition is directly comparable. Headline performance is directional only because the original latest-universe artifact models 25bp one-way cost but not the annual run\'s 0.18% sell tax.' }, summary: { latest: latest.summary, annual: annual.summary, matchedRebalances: matches.length, averageHoldingOverlap: avg(matches.map(x => x.count)), averageJaccard: avg(matches.map(x => x.jaccard)), zeroOverlapRebalances: matches.filter(x => x.count === 0).length }, matchedRebalances: matches.map(x => ({ executionDate: x.executionDate, rankingYear: x.rankingYear, overlap: x.count, jaccard: x.jaccard, annualOnly: x.annual.holdings.filter(h => !set(x.latest.holdings).has(h.ticker)), latestOnly: x.latest.holdings.filter(h => !set(x.annual.holdings).has(h.ticker)) })), annualRolls: rolls, currentPortfolio: { latestUniverse: current, annualUniverse: annualCurrent, overlap: now }, universeComposition: universeRows };
  const json = path.join(OUT, 'latest-vs-annual-top300-portfolio-comparison-2026-07-10.json'); fs.writeFileSync(json, JSON.stringify(result, null, 2) + '\n');
  const s = result.summary, names = xs => xs.map(x => `${x.name || x.ticker} (${x.ticker})`).join(', ') || '없음';
  const md = `# 최신 Top 300 기준선 vs 연도별 Top 300 — 포트폴리오 비교

## 핵심 결론

- 동일한 RS·EPS·매출·레짐 계열 규칙이라도, 매 리밸런싱의 평균 공통 보유종목은 **${s.averageHoldingOverlap.toFixed(2)}개 / 10개**(Jaccard **${pct(s.averageJaccard)}**)에 그쳤다. 즉 연도별 재구성은 단순한 성과 조정이 아니라 실제 보유 포트폴리오를 크게 바꾼다.
- 연도별 원장은 매년 첫 거래일에 기존 포지션을 전량 청산 후 새 유니버스에서 재선정한다. 연초 교체 내역은 아래 표에 남겼다.
- 성과는 최신 유니버스 기준선 CAGR ${pct(latest.summary.cagr)} 대 연도별 재구성 CAGR ${pct(annual.summary.cagr)}이나, 최신 기준선은 매도세를 반영하지 않은 과거 산출물이다. 따라서 **구성 차이는 직접 비교 가능하지만 성과 차이는 방향성 비교**로만 해석한다.

## 현재 마지막 포트폴리오 비교

- 최신 유니버스 — 신호 ${current.signalDate}, 체결 ${current.executionDate}: ${names(current.holdings)}
- 연도별 유니버스 — 신호 ${annualCurrent.signalDate}, 체결 ${annualCurrent.executionDate}, 적용 랭킹연도 ${annualCurrent.rankingYear}: ${names(annualCurrent.holdings)}
- 공통: **${now.count}개** — ${now.common.join(', ') || '없음'}

## 리밸런싱별 중복도

|지표|값|
|---|---:|
|연도별 리밸런싱일의 최신 활성 포트폴리오 매칭 수|${s.matchedRebalances}|
|평균 공통 보유 종목|${s.averageHoldingOverlap.toFixed(2)} / 10|
|평균 Jaccard|${pct(s.averageJaccard)}|
|공통 보유 0개 리밸런싱|${s.zeroOverlapRebalances}|

## 연초 유니버스 강제 교체

|체결일|적용 랭킹연도|연도별 보유 수|최신 기준선 보유 수|공통 보유 수|
|---|---:|---:|---:|---:|
${rolls.map(x => `|${x.executionDate}|${x.rankingYear}|${x.annualHoldings}|${x.latestHoldings ?? '—'}|${x.overlap ?? '—'}|`).join('\n')}

## 유니버스 자체의 차이

|랭킹연도|기준일|연도별 보통주 수|현재 Top 300과 공통|연도별 유니버스 중 현재에도 남은 비율|
|---:|---|---:|---:|---:|
${universeRows.map(x => `|${x.rankingYear}|${x.asOfDate}|${x.annualCommon}|${x.overlapWithLatest}|${pct(x.latestShare)}|`).join('\n')}

## 해석 주의

- 최신 유니버스 기준선은 현 시점 구성종목을 과거에 적용한 생존자 편향 기준선이다.
- 연도별 재구성도 상장폐지 최종수익률·거래정지·유동성 결측을 완전히 복원하지 못한다.
- 연도별 실적 후보는 DART 자료가 없는 종목을 해당 신호에서만 제외했다. JSON 원장에 후보 수와 제외 수가 기록된다.
`;
  fs.writeFileSync(path.join(OUT, 'latest-vs-annual-top300-portfolio-comparison-2026-07-10.md'), md);
  console.log(JSON.stringify({ json, markdown: path.join(OUT, 'latest-vs-annual-top300-portfolio-comparison-2026-07-10.md'), summary: result.summary, currentOverlap: now.count }, null, 2));
}
main();
