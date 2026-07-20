---
name: kr-market-sentiment
description: Gather Korean (KOSPI-centric, KOSDAQ-supplementary) market sentiment-bottom indicators — valuation (지수 PBR, 12M forward PER), fear (VKOSPI), index technicals (52-week drawdown, 200-day distance, RSI14), supply/demand (foreign flows, 신용융자 잔고, 투자자예탁금), and breadth (ADR) — then score each on a −2 (overheated) … +2 (deep-value capitulation) scale into a weighted composite bottom judgment with a source-dated report. Use when the user asks whether Korean market sentiment/투심 is at a bottom, wants a KOSPI/코스피 bottom-signal dashboard, or wants to combine oversold/valuation/flow indicators into one call. Bottom signals are contrarian and coincident; the skill labels facts vs. inference and requires 수급 confirmation for any "bottom confirmed" claim.
---

# 한국 시장 투심 바닥 지표 (kr-market-sentiment)

한국 증시(KOSPI 주지표, KOSDAQ 보조지표)가 **투심 바닥권**에 있는지를 여러 지표를
모아 채점하고 한 화면으로 판단하는 스킬입니다. 밸류에이션·공포·기술적·수급·시장 폭
지표를 각각 −2(과열)~+2(강한 바닥)로 채점해 가중 합성 점수와 판단 밴드를 냅니다.

## 핵심 원칙 (먼저 읽기)

- **역발상·동행 지표**: 이 지표들은 바닥 '근접'을 알려줄 뿐, 정확한 저점 시점을 예측하지
  않습니다. 저평가·과매도는 더 깊어질 수 있습니다(가치 함정).
- **저점 '확정'은 수급·추세 전환으로만**: 외국인 순매도 → 순매수 전환, 지수 20일선 회복,
  RSI 과매도 탈출 같은 확인 신호가 붙어야 "바닥 확정"으로 씁니다. 밸류·기술적 지표만으로는
  "바닥 근접"까지입니다.
- **사실과 추론 분리**: 수집한 값(사실)과 신호 해석(추론)을 구분하고, 각 지표의 기준일을
  반드시 표기합니다.
- **표본 한계**: 임계값은 과거 저점 경험칙 기반의 휴리스틱입니다. 통계적 확정이 아니며,
  데이터 공백이 있으면 합성 점수의 신뢰도가 떨어짐을 리포트에 명시합니다.

## Quick Start

```bash
# 1) 지수(KOSPI/KOSDAQ/원달러) 자동 수집 + 수동 지표 병합 → indicators.json
node skills/kr-market-sentiment/scripts/fetch-market-indicators.js \
  --manual examples/kr-market-sentiment/manual-indicators.json \
  --output /tmp/kr-sentiment/indicators.json

# 2) 채점 + 판단 리포트(Markdown) + 기계판독 score.json
node skills/kr-market-sentiment/scripts/score-sentiment-bottom.js \
  --input /tmp/kr-sentiment/indicators.json \
  --output /tmp/kr-sentiment/sentiment-report.md \
  --json-out /tmp/kr-sentiment/score.json

# 오프라인 테스트(네트워크 불요): 픽스처로 전체 파이프라인 검증
node skills/kr-market-sentiment/scripts/test-market-sentiment.js
```

`fetch` 는 KOSPI(`^KS11`)·KOSDAQ(`^KQ11`)·원/달러(`KRW=X`)를 Yahoo Finance에서 받아
기술적 지표를 계산합니다. 네트워크가 막히면 해당 지표를 `DATA_GAP`으로 기록하고
나머지로 채점을 계속합니다.

## Workflow

1. **자동 지표 수집.** `fetch-market-indicators.js`로 KOSPI/KOSDAQ 52주 낙폭, 200일선
   이격도, RSI14와 원/달러 수준을 계산합니다. KOSPI가 주지표, KOSDAQ은 보조지표입니다.
2. **수동 지표 채우기.** 무료 API로 얻기 어려운 지표는 `--manual` JSON으로 입력합니다:
   지수 PBR, 12M 선행 PER, VKOSPI, 외국인 매매 추세, 신용융자 잔고 추세, 투자자예탁금 추세,
   ADR(등락비율). 값마다 `asOfDate`와 `source`를 붙입니다. (수집처는
   [references/indicators.md](references/indicators.md) 참고.)
3. **채점.** `score-sentiment-bottom.js`가 지표별로 임계값 규칙을 적용해 −2~+2 신호를
   부여하고 가중 합성 점수를 계산합니다.
4. **판단.** 합성 점수를 5개 밴드(🔵 강한 바닥 … 🔴 바닥 약함)로 매핑하고, 확정 신호
   체크리스트(외국인 순매수 전환 / 20일선 회복 / RSI 회복)의 충족 여부를 함께 냅니다.
5. **검토.** 데이터 공백·경고를 확인하고, 필요하면 수동 지표를 보강해 다시 채점합니다.
   사실/추론을 구분해 사용자에게 전달합니다.

자세한 절차는 [references/workflow.md](references/workflow.md), 지표 카탈로그와 임계값은
[references/indicators.md](references/indicators.md), 리포트 형식은
[references/output-format.md](references/output-format.md)를 참고하세요.

## 지표 카탈로그 (요약)

| 카테고리 | 지표 | 방향 | 바닥 신호 |
|---|---|---|---|
| 밸류에이션 | KOSPI 후행 PBR | 낮을수록 바닥 | ≤0.90배 |
| 밸류에이션 | KOSPI 12M 선행 PER | 낮을수록 바닥 | ≤9배 |
| 변동성/공포 | VKOSPI | 높을수록 바닥 | ≥30 |
| 지수 기술적 | KOSPI 52주 낙폭 | 낮을수록 바닥 | ≤−20% |
| 지수 기술적 | KOSPI RSI14 | 낮을수록 바닥 | ≤30 |
| 지수 기술적 | KOSPI 200일선 이격도 | 낮을수록 바닥 | ≤−5% |
| 지수 기술적 | KOSDAQ 낙폭·RSI (보조) | 낮을수록 바닥 | ≤−20% / ≤30 |
| 수급 | 외국인 매매 추세 | 전환·둔화가 바닥 | 순매수 전환 |
| 수급 | 신용융자 잔고 추세 | 감소가 바닥 | 급감/감소 |
| 수급(맥락) | 투자자예탁금 추세 | 양면적 | 감소=이탈·위축 |
| 시장 폭 | ADR(등락비율 20일) | 낮을수록 바닥 | ≤75% |
| 매크로 배경 | 원/달러 환율 | 스트레스 정점이 동행 | ≥1400 |

## Bundled Scripts

- `scripts/fetch-market-indicators.js` — KOSPI/KOSDAQ/원달러 자동 수집 + 기술적 지표 계산
  + 수동 지표 병합 → `indicators.json`. `--fixture`로 오프라인 실행 가능.
- `scripts/score-sentiment-bottom.js` — 지표별 −2~+2 채점, 가중 합성, 판단 밴드, 확정
  체크리스트, 한국어 Markdown 리포트 + `score.json`.
- `scripts/test-market-sentiment.js` — 픽스처 기반 오프라인 테스트(네트워크·npm 불요).

모든 스크립트는 Node stdlib만 사용합니다(`node`로 바로 실행).

## Operating Rules

- 각 지표 값에 **기준일**과 **출처**를 붙입니다. 자동 지표는 지수 종가일, 수동 지표는 입력일.
- 지수 기술적 지표는 **자동 수집값**(사실)이고, 신호(−2~+2)는 **해석**(추론)입니다. 둘을 섞지
  않습니다.
- 합성 점수가 높아도 **확정 신호(외국인 순매수 전환 등)가 없으면 "바닥 근접"까지**만
  단정합니다. "바닥 확정"은 수급·추세 전환이 붙을 때만 씁니다.
- 데이터 공백(수동 지표 미입력, `DATA_GAP`)이 있으면 리포트에 그대로 노출하고, 판단
  신뢰도가 낮아짐을 밝힙니다.
- 임계값은 경험칙 휴리스틱입니다. 사용자가 다른 국면(예: 구조적 저평가 vs 이익 사이클
  저점)을 물으면 임계값 조정 여지를 함께 설명합니다.
- 이 스킬은 **시장 전체 지수** 판단용입니다. 개별 종목 분석은 `kr-stock-analysis`,
  일간 시황은 `kr-daily-market-news`, 수급 분해는 `kr-trade-flow-analysis`로 라우팅합니다.
