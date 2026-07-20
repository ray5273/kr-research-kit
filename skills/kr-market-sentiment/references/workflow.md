# kr-market-sentiment 상세 워크플로우

## 0. 언제 이 스킬을 쓰나

- "지금 한국 시장(코스피) 투심이 바닥인가?"
- "바닥 신호 지표들을 모아서 보여줘 / 대시보드로 만들어줘"
- 밸류에이션·과매도·수급 지표를 한 화면에서 합쳐 판단하고 싶을 때

개별 종목 밸류에이션은 `kr-stock-analysis`, 그날 시황 요약은 `kr-daily-market-news`,
외국인·기관 수급 분해는 `kr-trade-flow-analysis`로 라우팅합니다.

## 1. 자동 지표 수집

```bash
node scripts/fetch-market-indicators.js --output /tmp/kr-sentiment/indicators.json
```

- Yahoo Finance에서 `^KS11`(KOSPI), `^KQ11`(KOSDAQ), `KRW=X`(원/달러) 1년치 일봉을 받습니다.
- 각 지수에 대해 계산: 최근 종가, 52주 고점 대비 낙폭, 52주 저점 대비 반등폭, 20/60/200일선,
  200일선 이격도, RSI14(Wilder).
- 실패한 심볼은 `markets.<key>.status = "DATA_GAP"`로 기록되고, `warnings`에 남습니다.
  채점은 나머지 지표로 계속됩니다.

## 2. 수동 지표 입력

무료 API로 안정적으로 얻기 어려운 지표는 `--manual` JSON으로 넣습니다. 템플릿은
`examples/kr-market-sentiment/manual-indicators.json`. 각 값에 `asOfDate`와 `source`를
반드시 채웁니다. 수집처와 임계값은 `indicators.md` 참고.

```bash
node scripts/fetch-market-indicators.js \
  --manual examples/kr-market-sentiment/manual-indicators.json \
  --output /tmp/kr-sentiment/indicators.json
```

수동 지표가 비어 있으면 밸류에이션·수급 카테고리 신호가 빠져 판단 신뢰도가 낮아집니다
(리포트에 경고로 표시됨). 최소한 PBR·VKOSPI·외국인 수급 셋은 채우는 것을 권장합니다.

## 3. 채점 규칙

- **수치 지표**: 임계값 밴드로 −2~+2 부여. `lowIsBottom`(값이 낮을수록 바닥: PBR, PER, 낙폭,
  RSI, 200일선 이격, ADR)과 `highIsBottom`(값이 높을수록 바닥: VKOSPI, 원달러) 두 방향.
- **범주형 지표**: 문자열 값 → 신호 매핑(외국인 수급, 신용잔고, 예탁금).
- **가중치**: 밸류에이션(PBR 1.5)과 수급(외국인 1.5)에 높은 가중, 보조지표(코스닥, 환율,
  예탁금)에 낮은 가중. 예탁금은 해석이 양면적이라 가중치 0(맥락 표시만).
- **합성 점수** = Σ(signal × weight) / Σ(weight), 가중치>0 지표만. 범위 대략 [−2, +2].

## 4. 판단 밴드

| 합성 점수 | 판단 |
|---|---|
| ≥ +1.2 | 🔵 강한 바닥 신호 (capitulation 국면) |
| +0.6 ~ +1.2 | 🟢 바닥 신호 형성 중 |
| +0.2 ~ +0.6 | 🟡 바닥 신호 일부 |
| −0.2 ~ +0.2 | ⚪ 방향성 불명확 / 중립 |
| < −0.2 | 🔴 바닥 신호 약함 |

## 5. 확정(confirmation) 게이트

합성 점수가 높아도 아래 확인 신호가 없으면 "바닥 근접"까지만 단정합니다.

- 외국인 순매도 → 순매수 전환 (`foreign_flow = net_buy_turn`)
- KOSPI 20일선 회복 (최근 종가 ≥ SMA20)
- KOSPI RSI14 ≥ 40 (과매도 탈출)

3개 중 2개 이상 충족 시 "추세 전환 정황 확대"로 씁니다.

## 6. 검토·전달

- 데이터 공백/경고를 사용자에게 그대로 전달합니다.
- 임계값은 경험칙임을 밝히고, 사용자가 다른 국면 정의를 원하면 조정 여지를 설명합니다.
- 사실(수집값)과 추론(신호·판단)을 구분해 요약합니다.
