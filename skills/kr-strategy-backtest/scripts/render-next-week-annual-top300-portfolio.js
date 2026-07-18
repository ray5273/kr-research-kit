#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const DEFAULT_OUT = path.join(ROOT, 'analysis-example/kr-market/strategies/annual-top300');
const input = process.argv.includes('--input') ? process.argv[process.argv.indexOf('--input') + 1] : path.join(DEFAULT_OUT, 'annual-top300-minervini-earnings-regime-2017-01-02-through-2026-07-16.json');
const OUT = process.argv.includes('--out-dir') ? process.argv[process.argv.indexOf('--out-dir') + 1] : DEFAULT_OUT;
const asOf = process.argv.includes('--as-of') ? process.argv[process.argv.indexOf('--as-of') + 1] : '2026-07-16';
const nextWeek = process.argv.includes('--next-week') ? process.argv[process.argv.indexOf('--next-week') + 1] : '2026-07-20';
const x = JSON.parse(fs.readFileSync(input, 'utf8'));
const unverifiedCorporateActions = /annual-cap300b-marcap|raw-diagnostic/.test(x.data?.priceCache || '') || process.argv.includes('--unverified-corporate-actions');
const provisionalYahooComparison = x.data?.priceMode === 'yahoo-adjusted' || process.argv.includes('--provisional-yahoo-comparison');
fs.mkdirSync(OUT, { recursive: true });
const universeSpec = x.universe?.source && fs.existsSync(x.universe.source) ? JSON.parse(fs.readFileSync(x.universe.source, 'utf8')) : null;
const marketCapThreshold = Number(universeSpec?.marketCapThreshold);
const selection = x.rebalancingLedger.filter(r => r.executionDate <= asOf).at(-1);
const last = x.dailyEquity.filter(x => x.date <= asOf).at(-1);
if (!selection || !last) throw new Error('no completed portfolio as of requested date');
const universeLabel = Number.isFinite(marketCapThreshold) && marketCapThreshold > 0 ? `${selection.rankingYear}년말 시가총액 ${(marketCapThreshold / 1e8).toLocaleString('ko-KR')}억원 이상 보통주` : `${selection.rankingYear}년말 Top 300`;
const exposure = last.exposure, weight = exposure / selection.holdings.length;
const payload = { generatedAt: new Date().toISOString(), asOf, nextWeekStart: nextWeek, modelOnly: true, validationStatus: provisionalYahooComparison ? 'yahoo-adjusted-price-comparison-provisional' : (unverifiedCorporateActions ? 'corporate-actions-unverified-diagnostic' : 'standard-model-artifact'), sourceArtifact: input, signalDate: selection.signalDate, executionDate: selection.executionDate, nextScheduledSignal: nextWeek, nextScheduledExecution: '2026-07-21', universe: { rankingYear: selection.rankingYear, snapshotDate: selection.asOfDate, marketCapThreshold: Number.isFinite(marketCapThreshold) ? marketCapThreshold : null, label: universeLabel }, overlay: { exposure, investedWeightPerHolding: weight, cashWeight: 1 - exposure, note: 'Exposure is recalculated each completed session from the KOSPI regime and trailing strategy volatility.' }, holdings: selection.holdings.map((h, i) => ({ rank: i + 1, ...h, targetWeight: weight })) };
const stem = process.argv.includes('--stem') ? process.argv[process.argv.indexOf('--stem') + 1] : `next-week-portfolio-${nextWeek}`;
fs.writeFileSync(path.join(OUT, `${stem}.json`), JSON.stringify(payload, null, 2) + '\n');
const p = n => `${(n * 100).toFixed(2)}%`;
const warning = provisionalYahooComparison ? '> **Yahoo 조정가격 비교본:** 2015–2017 연도 가격 커버리지의 엄격 90% 게이트를 예외로 실행한 비교·모델 화면이다. Yahoo 미제공 상장폐지/종목변경 이력과 공식 KRX/DART 기업행사 검증을 대체하지 않으므로 공식 총수익 결과나 주문 지시로 사용하지 않는다.\n\n' : (unverifiedCorporateActions ? '> **기업행사 미검증 진단:** 원시 KRX 가격의 분할 추정 보정만 사용했으며 배당·유상증자·감자·합병·상장폐지 대가를 완전 반영하지 않았다. 공식 총수익 모델이나 주문 지시로 사용하지 않는다.\n\n' : '');
const md = `# 다음 주 모델 포트폴리오 — ${nextWeek} 시작

> 과거 규칙을 기계적으로 적용한 모델 목표 포트폴리오입니다. 투자 권유나 개인화된 투자 조언이 아니며, 개장 전 공시·거래정지·호가·유동성 및 실제 체결 제약을 반영하지 못합니다.

${warning}- 검증 상태: ${provisionalYahooComparison ? 'Yahoo 조정가격·커버리지 예외 비교본' : (unverifiedCorporateActions ? '기업행사 미검증 진단용' : '표준 모델 산출물')}
- 기준 종가: ${asOf}
- 적용 신호 / 체결: ${selection.signalDate} 종가 / ${selection.executionDate} 시가
- 유니버스: ${universeLabel} (기준일 ${selection.asOfDate})
- 다음 정규 신호: ${nextWeek} 종가 → 예정 체결 ${payload.nextScheduledExecution} 시가
- 레짐·변동성 오버레이 노출: **${p(exposure)}**; 현금 목표: **${p(1 - exposure)}**
- 보유 종목은 투자 가능 자산의 동일비중이며, 총자산 기준 종목별 목표 비중은 약 **${p(weight)}**다. 오버레이는 매 거래일 종가 후 변동할 수 있다.

|순위|종목|코드|총자산 목표비중|RS 점수|종합 점수|반영 실적 공시일|
|---:|---|---|---:|---:|---:|---|
${payload.holdings.map(h => `|${h.rank}|${h.name}|${h.ticker}|${p(h.targetWeight)}|${h.rs.toFixed(3)}|${h.score.toFixed(3)}|${h.reportFilingDate || '—'}|`).join('\n')}

## 운용 메모

- 7월 20일 장 마감 뒤 RS·EPS·매출 점수를 다시 계산한다. 교체가 생기면 7월 21일 시가에 체결하는 규칙이다.
- 해당 연도말 유니버스 밖 종목은 새 후보에 포함하지 않는다. DART 결측 종목은 그 신호에서만 제외한다.
- 실제 주문 전에는 당일 공시, 거래정지, 호가 및 계좌별 세금·수수료를 별도 확인해야 한다.
`;
fs.writeFileSync(path.join(OUT, `${stem}.md`), md);
console.log(JSON.stringify({ markdown: path.join(OUT, `${stem}.md`), json: path.join(OUT, `${stem}.json`), holdings: payload.holdings.length, exposure, cash: 1 - exposure }, null, 2));
