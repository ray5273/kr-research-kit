# 전체 전략 방법론과 성과 비교 — Codex 정리본

- 작성일: 2026-07-19
- 성과 기준일: 한국은 주로 2026-07-16, 미국은 2025-12-31 또는 2026-07-16
- 범위: `analysis-example/kr-market/strategies/`, `analysis-example/us-market/strategies/`, `skills/kr-strategy-backtest/`, `skills/us-strategy-backtest/`
- 성격: 저장소에 이미 있는 Markdown·JSON 결과를 Codex가 같은 기준으로 재분류한 통합 문서다. 새 백테스트를 실행해 만든 성과가 아니다.

> 이 문서는 투자 권유가 아니다. 서로 다른 유니버스·기간·가격 데이터·비용·세금으로 계산한 CAGR을 한 순위표처럼 비교하면 안 된다. 아래의 `A~D 데이터 등급`을 먼저 확인해야 한다.

## 결론 먼저

1. **한국에서 현재 가장 강한 종목선정 결과는 52주 신고가 근접 모멘텀이다.** 전년말 Top 300 시점일치 유니버스, 상폐 포함 marcap 가격과 OpenDART 연간배당을 결합한 부분 총수익 캐시에서 CAGR 16.41%, Sharpe 0.90, MDD -26.01%, OOS CAGR 14.0%를 기록했다. 이 세션에서 종목선정 팩터 중 유일하게 Deflated Sharpe 허들을 넘었다. 다만 실제 시험 수가 50개를 웃돌고 연회전율이 약 660%이므로 강한 증거이지 확정된 알파는 아니다.
2. **저장소 기본 전략 R1은 더 보수적인 기준선이지만 통계적으로 확정되지 않았다.** Minervini RS 3·6·12개월과 DART EPS·매출 개선을 50:50으로 결합하고 KOSPI SMA200 레짐만 적용한 결과는 CAGR 11.80%, Sharpe 0.57, MDD -35.98%, OOS CAGR 6.14%다. 관측 Sharpe 0.57은 다중검정 허들 0.79에 못 미쳤다.
3. **한국에서 가장 재현성이 높은 위험관리 신호는 종목선정보다 KOSPI 레짐이다.** 광범위 동일가중 바스켓에 이진 SMA200 레짐만 적용하면 CAGR 5.20%, MDD -26.96%로, 레짐 없는 시장 바스켓의 MDD -52.82%를 절반 가까이 줄였다.
4. **기존 21.78% CAGR / -16.44% MDD는 대표 성과로 쓰면 안 된다.** 상폐·급락 종목이 빠지는 raw-cache와 가격점프 필터, 전체표본 튜닝이 섞인 진단값이다. 같은 구형 설계를 생존편향을 줄인 배당 포함 캐시에서 다시 계산하면 CAGR 8.82%, OOS CAGR 2.83%, OOS MDD -34.33%로 낮아진다.
5. **미국 전략은 아직 SPY 대비 검증된 알파가 없다.** 2021~2025 연도별 Top 500 무료 부분표본에서 주간 모멘텀+레짐은 CAGR 13.90%, 레짐 없는 모멘텀은 14.59%, SPY는 14.69%였다. WRDS CRSP/Compustat 시점일치 실행 코드는 있지만 라이선스 입력이 없어 공식 수치가 없다.

## 이 문서가 다루는 것

저장소에는 전략 산출물 240개가 있다. 이 가운데 Markdown 성과 문서가 116개, JSON 원장이 120개이며, 한국·미국 백테스트 스크립트는 98개다. 이 문서는 각 파일을 그대로 나열하는 대신 다음 단위로 묶는다.

- 종목선정: 모멘텀, 52주 신고가, Minervini Trend Template, EPS·매출, 밸류, 퀄리티, 저변동성, Piotroski, 단기 반전
- 유니버스: 현재 상장종목, 전년말 Top 200·300·500, 시총 3,000억원 이상, 미국 Top 500
- 위험관리: KOSPI·SPY SMA200 레짐, 변동성 타깃, 포트폴리오 스톱, 매니지드 모멘텀
- 검증: OOS, 블록 부트스트랩 신뢰구간, Deflated Sharpe, 생존자 편향, 가격·배당·기업행사 처리
- 운용: 주간·월간·일간 리밸런싱, 보유 종목 수, 리밸런싱 밴드, 비용·세금, 공시 반영 지연

포트폴리오 종목표, 다음 주 후보, 공시 이벤트 분석처럼 독립 수익률을 만들지 않는 산출물은 성과표가 아니라 보조 진단 절에서 다룬다.

## 성과를 읽는 데이터 등급

|등급|의미|대표 입력|용도|
|---|---|---|---|
|A|현재 저장소에서 가장 정직한 한국 진단|전년말 시점일치 유니버스, 상폐 포함 marcap, 분할 추정보정, OpenDART 연간 현금배당|한국 전략의 대표 비교|
|B|연도별 유니버스지만 가격·기업행사가 불완전한 비교|Yahoo 조정가격 또는 marcap split-only, 일부 종목 제외|유니버스·가격 민감도 진단|
|C|현재 상장종목을 과거 전체에 소급|현재 Top 300 또는 현재 무료 스크리너 Top 500|아이디어 발굴용, 대표 성과 사용 금지|
|D|완전한 공식 검증 목표|KRX 원시 OHLC와 KRX·DART 이중검증 기업행사, 또는 WRDS CRSP/Compustat|아직 숫자 없음|

한국 A등급도 `strict official`은 아니다. 연간 현금배당은 포함하지만 중간·분기배당, 유상증자, 합병 교환비율, 분할승계의 정확한 대가를 모두 이중검증한 원장은 아직 없다. 다만 상폐 완전손실 후보를 0으로 교정한 하이브리드 검증에서는 CAGR이 소수점 둘째 자리까지 바뀌지 않았다.

## 공통 지표 정의

|지표|정의|읽을 때 주의할 점|
|---|---|---|
|누적 수익률|`기말자산 / 기초자산 - 1`|기간이 다르면 직접 비교할 수 없다.|
|CAGR|연복리 수익률|6개월 YTD를 연율화한 값은 장기 CAGR과 다르다.|
|Sharpe|무위험수익률 0% 기준 연환산 수익률/변동성|같은 표본에서 많은 설정을 시험하면 우연히 높아질 수 있다.|
|MDD|고점 대비 최대 낙폭|전체표본 MDD가 미래 OOS 낙폭을 과소평가할 수 있다.|
|OOS|튜닝에 쓰지 않은 후반 구간|한국은 주로 2023-01-02 이후, 미국은 주로 2024-01-02 또는 2024-07-17 이후다.|
|Deflated Sharpe|여러 전략을 시험한 선택편향을 감안한 Sharpe 허들|허들 통과는 필요조건에 가깝고 미래 성과의 보증이 아니다.|
|회전율|매매대금/자산의 누적 또는 연율 값|보고서마다 누적·연율 표기가 다르므로 단위를 그대로 표시한다.|

## 공통 체결·비용 원칙

한국의 최신 시점일치 전략은 신호일 종가로 순위를 계산하고 다음 거래일 시가에 체결한다. 기본 비용은 매수 25bp, 매도 25bp와 증권거래세 18bp를 합친 매도 43bp다. DART 재무정보는 접수일 이후에만 사용하고, 대표 R1은 1거래일 반영 지연을 둔다.

미국 무료·WRDS 설계도 신호 종가 다음 거래일 시가 체결, 소수점 주식, 무레버리지, 현금 수익률 0%를 기본으로 한다. 무료 결과의 기본 비용은 편도 10bp이고, 한국 투자자용 별도 시나리오는 편도 20bp와 30bp도 시험했다.

## 한국 전략: 현재 의사결정에 쓸 표

모든 행은 2017-01-02~2026-07-16의 A등급 또는 이에 가까운 상폐 포함·배당 포함 진단이다. 단, 리밸런싱 주기와 보유 수가 다르므로 CAGR만으로 순위를 매기면 안 된다.

|전략|핵심 규칙|CAGR|Sharpe|MDD|OOS|다중검정|판정|
|---|---|---:|---:|---:|---:|---|---|
|52주 신고가 모멘텀 v3|Top 300, 월간, 15종목, 밴드 45, soft annual roll, SMA200 레짐|**16.41%**|**0.90**|**-26.01%**|CAGR 14.0%, MDD 약 -19%|0.90 > 0.87 통과|현재 최강, 높은 회전율 주의|
|R1 저장소 기본값|RS 40/30/30 50% + EPS·매출 50%, 5일, 10종목, SMA200 레짐|11.80%|0.57|-35.98%|CAGR 6.14%, MDD -32.09%|0.57 < 0.79 미달|대표 기준선, 알파 미확정|
|순수 EPS·매출 틸트|EPS·매출 100%, 5일, 15종목, SMA200 레짐|11.29%|0.66|-31.75%|CAGR 10.1%, Sharpe 0.52|0.66 < 0.81 미달|계산된 베팅|
|순수 EPS v2 밴드|월간, 15종목, 밴드 45, soft annual roll, SMA200 레짐|9.96%|0.60|-28.65%|CAGR 7.6%|미달|회전율 감소형 보조안|
|광범위 시장 + 이진 레짐|월간, 약 200종목, 팩터 틸트 없음, SMA200 ±3%|5.20%|0.41|-26.96%|CAGR 8.49%, MDD -24.55%|해당 없음|자본보존 코어|
|구형 FULL|RS+EPS, SMA200 레짐 + 60일 18% 변동성 타깃|8.82%|0.55|-36.48%|CAGR 2.83%, MDD -34.33%|미달|R1로 대체됨|

근거: [52주 신고가 모델](../analysis-example/kr-market/strategies/annual-top300/live-52w-high-momentum-2026-07-16.md), [R1 총수익 대표 진단](../analysis-example/kr-market/strategies/annual-top300/annual-top300-R1-total-return-2017-01-02-through-2026-07-16.md), [순수 EPS 틸트](../analysis-example/kr-market/strategies/annual-top300/annual-top300-return-seeking-eps-2017-01-02-through-2026-07-16.md), [EPS 밴드 모델](../analysis-example/kr-market/strategies/annual-top300/live-return-seeking-eps-buffered-2026-07-16.md), [저위험 설계](../analysis-example/kr-market/strategies/annual-top300/lowrisk-regime-design-2017-01-02-through-2026-07-16.md), [배당 포함 총수익 검증](../analysis-example/kr-market/strategies/annual-top300/total-return-dividend-inclusive-2017-01-02-through-2026-07-16.md).

### 현재 최강: 52주 신고가 근접 모멘텀

점수는 `현재 종가 / 최근 252거래일 최고 종가`다. 값이 1에 가까울수록 신고가에 가깝다. 동일한 월간 15종목·밴드·레짐 구조에서 모멘텀 정의만 바꾼 결과는 다음과 같다.

|모멘텀 정의|CAGR|Sharpe|MDD|OOS CAGR|DSR|
|---|---:|---:|---:|---:|---|
|기존 RS 3·6·12개월 혼합|9.9%|0.51|-40%|8.4%|미달|
|12-1 모멘텀|3.5%|0.27|-36%|-1.7%|미달|
|위험조정 모멘텀|6.1%|0.37|-41%|11.5%|미달|
|**52주 신고가 근접**|**16.41%**|**0.90**|**-26%**|**14.0%**|**통과**|

52주 신고가 방식의 CAGR 90% 신뢰구간은 +5.5%~+29.9%다. Top 300에서만 DSR 허들을 넘었고, Top 100은 후보 부족, Top 500은 높은 회전율과 소형주 슬리피지가 약점이었다.

|유니버스|CAGR|Sharpe|MDD|OOS CAGR|OOS MDD|연회전율|DSR|
|---|---:|---:|---:|---:|---:|---:|---|
|Top 100|7.9%|0.53|-30%|15.4%|-22%|265%|미달|
|**Top 300**|**16.4%**|**0.90**|**-26%**|14.0%|-19%|660%|**통과**|
|Top 500|14.9%|0.74|-24%|20.6%|-19%|864%|미달|

근거: [Top 100·300·500 비교](../analysis-example/kr-market/strategies/annual-top300/universe-size-comparison-52w-high-2017-01-02-through-2026-07-16.md).

### R1: 저장소 기본 전략

R1은 5거래일마다 전년말 Top 300에서 다음 점수를 계산한다.

```text
가격 점수 = 3개월 수익률 40% + 6개월 수익률 30% + 12개월 수익률 30%
최종 점수 = 가격 RS 백분위 50% + DART EPS·매출 개선 백분위 50%
```

상위 10개를 동일가중하고, KOSPI가 SMA200의 +3%를 넘으면 주식 100%, -3% 아래면 현금 100%, 그 사이는 직전 상태를 유지한다. 누적 수익률은 189.52%, 동일가중 Top 300 총수익 벤치마크는 124.58%였다. CAGR 90% 신뢰구간은 -1.8%~29.3%로 하한이 음수다.

### 레짐과 변동성 타깃의 기여

|계층|CAGR|Sharpe|MDD|해석|
|---|---:|---:|---:|---|
|RS만|8.17%|0.40|-67.36%|종목선정만으로 낙폭이 매우 큼|
|RS + EPS·매출|12.31%|0.53|-57.31%|재무 슬리브가 수익을 높임|
|+ KOSPI 레짐, R1|11.80%|0.57|-35.98%|수익 희생이 거의 없이 MDD 약 21%p 개선|
|+ 60일 18% 변동성 타깃|8.82%|0.55|-36.48%|CAGR 약 3%p 감소, MDD 개선 없음|

변동성 목표를 12%·15%·18%·22%·30%·OFF로 높일수록 CAGR이 7.60%→8.16%→8.82%→9.62%→10.39%→11.80%로 단조 증가했다. 이 때문에 60일 18% 변동성 타깃은 제거됐고 R1이 엔진 기본값이 됐다.

근거: [오버레이 ablation](../analysis-example/kr-market/strategies/annual-top300/overlay-ablation-sensitivity-marcap-split-2017-01-02-through-2026-07-16.md), [전략 재설계와 walk-forward](../analysis-example/kr-market/strategies/annual-top300/strategy-redesign-marcap-split-2017-01-02-through-2026-07-16.md).

### 종목선정 팩터 검색 결과

같은 A등급 캐시와 R1 레짐에서 12개 후보를 비교했을 때 DSR 허들을 넘은 후보는 없었다. 이 검색 뒤 별도로 추가한 52주 신고가 근접 방식만 허들을 넘었다.

|후보|전체 CAGR|전체 Sharpe|OOS CAGR|OOS Sharpe|판정|
|---|---:|---:|---:|---:|---|
|Quality ROA|10.45%|0.58|20.33%|0.82|정의 변경에 취약, 기각|
|EPS growth|14.76%|0.77|8.69%|0.45|주간 Top 10 코너값 의존, 기각|
|Momentum RS|10.63%|0.49|9.32%|0.43|DSR 미달|
|Value E/P|6.96%|0.48|6.51%|0.40|DSR 미달|
|R1 RS+EPS|11.80%|0.57|6.14%|0.35|DSR 미달|
|Value + Quality|3.44%|0.29|7.96%|0.48|DSR 미달|
|Value + Low-vol|1.42%|0.18|6.02%|0.47|DSR 미달|
|Value + EPS growth|5.13%|0.39|2.86%|0.24|DSR 미달|
|Momentum + Low-vol|-1.98%|-0.07|1.20%|0.16|해로움|
|Value+Quality+Low-vol|1.52%|0.19|-0.43%|0.06|해로움|
|All four|1.02%|0.15|-4.71%|-0.23|해로움|
|Low-vol|-1.45%|-0.10|-7.13%|-0.54|해로움|

근거: [강건성 검색](../analysis-example/kr-market/strategies/annual-top300/robust-strategy-search-2017-01-02-through-2026-07-16.md), [Quality·EPS lead 심층검증](../analysis-example/kr-market/strategies/annual-top300/robust-lead-verification-2017-01-02-through-2026-07-16.md).

## 한국 유니버스·가격 데이터 민감도

아래는 B등급 진단이다. 구형 `RS+EPS+레짐+변동성 타깃` 설계를 주로 사용하며 기간과 세금이 일부 다르다. A등급 현재 전략과 직접 비교하지 않는다.

|유니버스·가격|기간|CAGR|Sharpe|MDD|핵심 한계|
|---|---|---:|---:|---:|---|
|전년말 Top 200, Yahoo 조정가격|2017-01-02~2026-07-10|14.85%|0.89|-16.74%|미제공·가격점프 종목 제외, 매도세 0bp|
|전년말 Top 300, Yahoo 조정가격|같음|16.32%|0.94|-19.01%|같은 한계|
|전년말 Top 500, Yahoo 조정가격|같음|13.18%|0.76|-34.19%|소형주 확대, 같은 한계|
|전년말 시총 3,000억원 이상, Yahoo|같음|12.42%|0.73|-34.77%|같은 한계|
|전년말 Top 300, marcap split-only|2016-07-11~2026-07-16|7.78%|0.51|-39.99%|배당·유증·합병 미반영|
|시총 3,000억원 이상, 자본변동 부분보정|같음|12.74%|0.74|-30.35%|배당·유증·합병 미반영|

Yahoo 결과가 marcap 결과보다 높은 것은 전략 우위보다 상폐·미제공·가격점프 제외가 만든 데이터 선택 차이로 봐야 한다.

## 한국 과거 아이디어 실험: C등급

이 절의 전략은 현재 상장된 종목을 과거 전체에 적용했다. 같은 C등급 안에서 아이디어를 비교하는 용도이며, A등급 52주 신고가의 16.41%와 아래 30~40%대 CAGR을 직접 비교하면 안 된다.

### 초기 추세·돌파 전략

|전략|CAGR|Sharpe|MDD|판정|
|---|---:|---:|---:|---|
|전 유니버스 12개월 모멘텀|-15.08%|-0.26|-89.37%|실패|
|Strict Minervini + RS|-20.07%|-0.27|-94.94%|실패|
|Donchian 55/20|-13.84%|-0.22|-85.00%|실패|
|10개월 SMA|-14.05%|-0.22|-89.72%|실패|
|12개월 절대 모멘텀|-14.99%|-0.26|-89.81%|실패|
|SEPA-style 상태 보유|-1.70%|0.08|-67.00%|실패|
|현재 시총 상위 300 + 다기간 양수 모멘텀|31.46%|1.07|-48.75%|생존자 편향으로 과대평가 가능|

근거: [초기 추세추종 비교](../analysis-example/kr-market/strategies/trend-following-10y/backtest-2026-07-10.md), [확장 추세추종 비교](../analysis-example/kr-market/strategies/trend-following-10y/expanded-backtest-2026-07-10.md), [Minervini 상태 보유](../analysis-example/kr-market/strategies/trend-following-10y/minervini-state-backtest-2026-07-10.md), [대형주 모멘텀](../analysis-example/kr-market/strategies/trend-following-10y/largecap-momentum-backtest-2026-07-10.md).

### 현재 Top 300 모멘텀·재무 조합

매도 25bp와 증권거래세 18bp를 적용해 방법론을 보정한 C등급 결과다.

|전략|CAGR|Sharpe|MDD|생존자 프리미엄 하한|
|---|---:|---:|---:|---:|
|252일 모멘텀 + EPS·매출|41.49%|1.26|-41.23%|10.68%p|
|Minervini RS + EPS·매출|36.97%|1.16|-45.86%|3.76%p|
|변동성조정 모멘텀 + EPS·매출|45.49%|1.35|-41.31%|9.73%p|
|52주 고점 + EPS·매출|33.10%|1.20|-48.03%|7.82%p|
|252일 모멘텀 단독|40.88%|1.13|-45.59%|6.80%p|
|현재 Top 300 동일가중 총수익 벤치마크|20.95%|0.92|-43.34%|같은 생존자 편향 공유|

근거: [모멘텀 계열 방법론 보정 재테스트](../analysis-example/kr-market/strategies/trend-following-10y/momentum-family-retest-through-2026-07-10.md), [생존자 편향 하한 추정](../analysis-example/kr-market/strategies/trend-following-10y/survivorship-bias-quantification.md).

초기 편도 25bp만 반영한 결과에서는 보유 10종목이 CAGR 48.75%, 15종목 38.73%, 20종목 38.14%였다. 이는 동일 표본에서 보유 수를 고른 사후 최적화이므로 현재 권고에 사용하지 않는다.

### 비모멘텀·결합 팩터

|전략|CAGR|Sharpe|MDD|공정 벤치마크 대비|현재 해석|
|---|---:|---:|---:|---|---|
|밸류 E/P 단독|22.97%|1.10|-31.39%|소폭 상회|C등급에서는 양호, A등급에서는 미확인|
|밸류 × 252일 모멘텀|31.66%|1.26|-33.06%|상회|C등급 DSR 통과, A등급에서 재현 실패|
|Piotroski F≥7 → 모멘텀|14.93%|0.64|-50.30%|하회|우선순위 낮음|
|저변동성 120일|8.68%|0.73|-32.94%|하회|단독 수익 약함|
|단기 반전 × EPS·매출|17.69%|0.73|-38.75%|하회|회전율 180x, 비용 취약|
|단기 반전 단독|11.41%|0.51|-47.79%|하회|회전율 224x, 기각|
|모멘텀 + 저변동성 50:50|25.38%|1.29|-32.32%|Sharpe·MDD 개선|C등급 분산효과 확인|
|모멘텀 + 밸류 E/P 50:50|33.34%|1.36|-35.42%|수익·Sharpe 개선|MDD 분산효과 제한적|

근거: [비모멘텀 팩터 보정판](../analysis-example/kr-market/strategies/trend-following-10y/alternative-factors-comparison-through-2026-07-10.md), [밸류·모멘텀](../analysis-example/kr-market/strategies/trend-following-10y/value-momentum-backtest-through-2026-07-10.md), [Piotroski](../analysis-example/kr-market/strategies/trend-following-10y/piotroski-fscore-backtest-through-2026-07-10.md), [저변동성](../analysis-example/kr-market/strategies/trend-following-10y/low-volatility-backtest-through-2026-07-10.md), [단기 반전](../analysis-example/kr-market/strategies/trend-following-10y/short-term-reversal-backtest-through-2026-07-10.md), [결합 슬리브](../analysis-example/kr-market/strategies/trend-following-10y/combined-sleeves-backtest-through-2026-07-10.md).

### 위험관리 오버레이 실험

|기준 전략|오버레이|CAGR|Sharpe|MDD|해석|
|---|---|---:|---:|---:|---|
|252일 모멘텀+EPS|없음|41.49%|1.26|-41.23%|C등급 고수익 기준선|
|동일|SMA200 레짐|28.82%|1.15|-28.03%|MDD 13.2%p 개선|
|동일|18% 변동성 타깃|19.60%|1.08|-30.03%|수익 희생 큼|
|동일|레짐+변동성|15.57%|1.16|-16.29%|최대 방어, CAGR 희생|
|변동성조정 모멘텀+EPS|없음|45.49%|1.35|-41.31%|C등급 고수익 기준선|
|동일|SMA200 레짐|32.14%|1.26|-27.87%|MDD 13.4%p 개선|
|동일|레짐+변동성|17.38%|1.27|-14.62%|가장 낮은 MDD|

매니지드 모멘텀 21일·목표변동성 30%는 Minervini RS+EPS 기준 CAGR 28.34%, MDD -37.65%로, 원본 36.97%/-45.86%보다 크래시 손실을 줄였지만 장기 수익을 희생했다. 2026-06-22~07-08 크래시 손실은 -24.86%에서 -8.67%로 줄었다.

근거: [고성과 모멘텀 MDD 오버레이](../analysis-example/kr-market/strategies/trend-following-10y/momentum-family-mdd-overlay-through-2026-07-10.md), [매니지드 모멘텀](../analysis-example/kr-market/strategies/trend-following-10y/managed-momentum-backtest-through-2026-07-10.md).

### 운용 빈도·공시·청산 진단

|진단|결과|해석|
|---|---|---|
|주간 vs 일간, 2017 시작|주간 CAGR 29.76%·MDD -18.04%, 일간 31.73%·-19.20%|일간 우위는 회전율 1.8배와 슬리피지에 취약한 C등급 결과|
|DART 당일 vs 1일 지연|CAGR 29.76%→30.29%, MDD -18.04%→-17.92%|지연의 목적은 수익 개선이 아니라 선행정보 차단|
|RS 40/30/30 vs 55/35/10|46.53% vs 43.91%|기존 가중치 유지, C등급 민감도|
|레짐 MA 60·120·150·200|CAGR 27.87~29.31%, MDD는 200일이 -17.25%로 최저|구형 15bp·vol-target 결과이므로 R1과 분리|
|완결 보유 사이클|승률 51.99%, 평균 이익 +20.66%, 평균 손실 -7.03%, Profit Factor 3.49|고정 손절선이 아니라 사후 FIFO 사이클 통계|
|실적 공시 반영 주|평균 신규 편입 3.75개 vs 평시 1.26개|실적 시즌에 회전·체결 위험 증가|

근거: [일간·주간 비교](../analysis-example/kr-market/strategies/trend-following-10y/daily-vs-weekly-main-strategy-from-2017-through-2026-07-10.md), [공시 1일 지연](../analysis-example/kr-market/strategies/trend-following-10y/weekly-filing-lag-sensitivity-from-2017-through-2026-07-10.md), [RS 가중치](../analysis-example/kr-market/strategies/trend-following-10y/rs-weight-sensitivity-backtest-through-2026-07-10.md), [레짐 MA 창](../analysis-example/kr-market/strategies/trend-following-10y/regime-ma-window-sensitivity-through-2026-07-10.md), [익절·손절 분석](../analysis-example/kr-market/strategies/trend-following-10y/weekly-main-exit-analysis-through-2026-07-10.md), [공시와 교체](../analysis-example/kr-market/strategies/trend-following-10y/weekly-filing-impact-analysis-through-2026-07-10.md).

## 미국 전략

### 데이터 계층

|계층|유니버스|가격·재무|상태|
|---|---|---|---|
|WRDS D등급|매 신호일 CRSP 시총 Top 500, 상장폐지 포함|CRSP RET·DLRET, Compustat RDQ 시점일치|코드만 있고 결과 없음|
|연도별 무료 B등급|전년도 시총 Top 500을 다음 해에 적용|Yahoo 수정가격, SEC companyfacts, 캐시 존재 종목만|2021~2026 부분표본|
|현재 상장 무료 C등급|2026년 현재 무료 스크리너 Top 500을 과거 전체에 적용|Yahoo 수정가격, SEC companyfacts|생존자 편향 기준선|

### 연도별 Top 500 무료 부분표본: 2021~2025

공통 규칙은 Minervini Trend Template, 상위 10종목 동일가중, 60일 18% 변동성 목표, 다음 수정 시가 체결, 편도 10bp다. 가격 모멘텀은 3·6·12개월 RS 40/30/30이며, 레짐은 SPY SMA200 ±3%다.

|주기·전략|CAGR|Sharpe|MDD|OOS CAGR|SPY 전체 CAGR|판정|
|---|---:|---:|---:|---:|---:|---|
|주간 모멘텀 + 레짐|13.90%|0.71|-24.08%|28.01%|14.69%|전체기간 SPY 하회|
|주간 모멘텀, 레짐 없음|14.59%|0.69|-31.21%|36.92%|14.69%|SPY와 유사, 낙폭 큼|
|주간 가격 + 공시 실적 성장 + 레짐|8.79%|0.54|-24.81%|15.21%|14.69%|실적 추가가 수익 저해|
|주간 가격 + 퀄리티·실적 + 레짐|6.82%|0.45|-25.79%|10.54%|14.69%|가장 약함|
|월간 모멘텀 + 레짐|12.76%|0.64|-28.80%|19.69%|14.69%|전체기간 SPY 하회|
|월간 모멘텀, 레짐 없음|12.46%|0.60|-29.98%|25.57%|14.69%|전체기간 SPY 하회|
|월간 가격 + 공시 실적 성장 + 레짐|12.68%|0.69|-21.81%|21.67%|14.69%|낙폭은 양호, 수익 하회|
|월간 가격 + 퀄리티·실적 + 레짐|13.41%|0.74|-19.81%|24.11%|14.69%|위험지표 양호, 수익 하회|
|SPY|14.69%|0.89|-24.50%|21.64%|14.69%|비교 기준|

결론은 `어느 변형도 SPY를 전체기간에 일관되게 이기지 못했다`다. OOS 우위는 2년 안팎의 짧은 구간이므로 검증된 알파로 해석하지 않는다.

근거: [주간 변형 비교](../analysis-example/us-market/strategies/us-minervini-annual-variant-comparison/weekly-annual-variant-comparison-2025-12-31.md), [연도별 실적 전략](../analysis-example/us-market/strategies/us-minervini-earnings-regime-annual-free-partial/weekly-annual-ranked-free-partial-2025-12-31.md), [연도별 모멘텀 전략](../analysis-example/us-market/strategies/us-minervini-momentum-annual-free-partial/weekly-annual-ranked-price-only-free-partial-2025-12-31.md), [퀄리티·실적 전략](../analysis-example/us-market/strategies/us-minervini-quality-earnings-annual-free-partial/weekly-annual-ranked-price-quality-growth-hysteresis-free-partial-2025-12-31.md).

### 미국 현재 상장 무료 프록시: C등급

|주기|기간|CAGR|Sharpe|MDD|OOS CAGR|SPY CAGR|한계|
|---|---|---:|---:|---:|---:|---:|---|
|주간 실적+레짐|2016-07-15~2026-07-15|19.80%|0.88|-26.22%|48.52%|15.17%|현재 상장 Top 500 생존자 편향|
|월간 실적+레짐|같음|17.34%|0.77|-30.41%|38.92%|15.17%|같은 한계|

이 결과는 보기에는 SPY를 이기지만 과거 시점의 Top 500과 상장폐지 수익률을 쓰지 않았다. 미국 대표 성과로 사용하지 않는다.

근거: [주간 무료 프록시](../analysis-example/us-market/strategies/us-minervini-earnings-regime-free-proxy/weekly-free-proxy-backtest-2026-07-15.md), [월간 무료 프록시](../analysis-example/us-market/strategies/us-minervini-earnings-regime-free-proxy/monthly-free-proxy-backtest-2026-07-15.md).

### 2026-07-16까지 확장한 연도별 가격 모멘텀 부분표본

|주기|기간|CAGR|Sharpe|MDD|OOS CAGR|SPY CAGR|
|---|---|---:|---:|---:|---:|---:|
|주간|2021-01-04~2026-07-16|17.48%|0.80|-24.08%|33.60%|15.26%|
|월간|같음|19.05%|0.84|-28.80%|33.04%|15.26%|

2026년 강세가 전체 CAGR을 끌어올렸다. 이 역시 Yahoo·무료 연도별 부분표본이며 WRDS 시점일치 결과가 아니다.

근거: [최근 2년·현재 포트폴리오](../analysis-example/us-market/strategies/us-minervini-momentum-annual-free-current/portfolio-summary-2026-07-16.md), [연도별 포트폴리오](../analysis-example/us-market/strategies/us-minervini-momentum-annual-free-current/portfolio-history-2021-2026-07-16.md).

### 미국 2026 YTD 비용·세후 시나리오

2026-01-02에 현금으로 시작해 2026-07-16에 전량 청산하는 주간 모멘텀 가정이다. 장기 CAGR이 아니라 6개월 누적 수익률이다.

|편도 올인 비용|청산 후 세전 수익률|MDD|누적 회전율|
|---:|---:|---:|---:|
|10bp|20.62%|-13.07%|7.58x|
|20bp|19.64%|-13.15%|7.56x|
|30bp|18.67%|-13.22%|7.55x|

편도 20bp, 연 250만원 공제 후 22% 세율을 단순 적용한 전량 청산 예시는 원금 1천만원 19.64%, 5천만원 16.42%, 1억원 15.87%, 5억원 15.43%의 세후 수익률이다. 실제 세금은 원화 취득·양도가, 다른 해외주식 손익, 필요경비, 배당과 금융소득에 따라 달라진다.

근거: [한국 투자자 세후 시나리오](../analysis-example/us-market/strategies/us-minervini-momentum-annual-free-ytd-net/korean-net-ytd-scenarios-2026-07-16.md).

### WRDS 시점일치 방법론

미국 D등급 설계는 매 신호일 CRSP에서 NYSE·AMEX·NASDAQ 보통주만 남기고 `abs(PRC) × SHROUT` 시총 상위 500을 고른다. CRSP `RET`로 총수익 가격을 만들고 `DLRET`를 상장폐지 시점에 한 번 반영한다. Compustat 분기 매출·희석 EPS는 `RDQ` 다음 시장 세션 이후에만 사용한다.

실행 템플릿은 [WRDS Top 500 예제](../examples/us-strategy-backtest/README.md), 입력 스키마는 [WRDS 데이터 계약](../skills/us-strategy-backtest/references/pit-wrds-data-contract.md)에 있다. 라이선스 입력 파일이 없어 저장소에는 성과표가 없다.

## 직접 비교하면 안 되는 숫자

|잘못된 비교|왜 틀리는가|
|---|---|
|한국 52주 신고가 16.41% vs 과거 현재-Top300 모멘텀 45.49%|전자는 시점일치·상폐 포함 A등급, 후자는 현재 승자만 과거에 소급한 C등급이다.|
|R1 11.80% vs Yahoo Top 300 16.32%|Yahoo 결과는 상폐·미제공·가격점프 종목이 빠지고 매도세가 0bp다.|
|미국 2026 YTD 연율 CAGR 100%대 vs 5년 CAGR 13~15%|6개월 강세를 연율화한 값이라 표본 길이가 다르다.|
|미국 무료 프록시 19.80% vs SPY 15.17%|현재 상장 Top 500을 과거 전체에 적용한 생존자 편향이 있다.|
|전체표본 MDD -16% vs forward 위험|한국 walk-forward OOS MDD는 -30~-36%대로 더 깊었다.|

## Codex 판정

### 수익 우선

한국에서는 현재 증거상 `전년말 Top 300 + 52주 신고가 근접 + 월간 Top 15 + 밴드 45 + soft annual roll + KOSPI SMA200 레짐`이 가장 낫다. 단, 높은 회전율과 아직 완성되지 않은 strict official 기업행사 원장을 감안해 실전 기대수익은 16.41%보다 낮게 잡는 편이 안전하다.

### 균형형

저장소 기본 R1은 구조가 단순하고 종목선정 근거가 다양하지만 DSR 미달과 OOS CAGR 6.14%를 받아들여야 한다. `11.80% CAGR`보다 `OOS 6.14% / MDD 약 -32%`를 운용 기대치의 중심으로 보는 편이 정직하다.

### 자본보존 우선

종목선정에 대한 확신이 낮다면 광범위 동일가중 바스켓과 이진 SMA200 레짐이 가장 단순하다. CAGR은 5.20%로 낮지만, 저장소에서 가장 반복적으로 확인된 효과는 레짐의 낙폭 축소다.

### 미국

WRDS 결과가 나오기 전에는 SPY를 기본 비교대상으로 두고, 무료 연도별 전략은 연구용 보조 신호로 취급하는 것이 맞다. 현재 저장소 증거만으로 미국 개별주 전략이 SPY를 안정적으로 이긴다고 결론낼 수 없다.

## 재현 경로

한국 대표 엔진과 검증 규약은 [KRX strategy backtest skill](../skills/kr-strategy-backtest/SKILL.md), 미국 엔진과 결과 계약은 [U.S. strategy backtest skill](../skills/us-strategy-backtest/SKILL.md)에 있다. JSON이 수치의 원장이고 Markdown은 사람이 읽는 요약이다.

대표 한국 실행 흐름은 다음 순서다.

```text
전년말 유니버스 원장 구축
→ 가격·배당 캐시 검증
→ DART 분기 패널 시점일치
→ 다음날 시가·비용 반영 백테스트
→ OOS·부트스트랩·Deflated Sharpe 검증
→ Markdown·JSON 동시 저장
```

공식 총수익의 남은 작업은 [A2 아카이빙 체크리스트](../analysis-example/kr-market/strategies/official-total-return/A2-archival-checklist.md)에 정리되어 있다. 상폐 대가의 영향 검증은 [하이브리드 A2 결과](../analysis-example/kr-market/strategies/official-total-return/hybrid-delisting-correction-result.md)를 참고한다.

