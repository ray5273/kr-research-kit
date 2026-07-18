# Lead 심층검증 — Quality / EPS growth (기각)

강건성 검색에서 나온 2개 lead(Quality ROA·EPS growth)가 진짜인지 소표본 노이즈인지 압박. honest 배당 포함 캐시, 레짐-on/vol-off.

## 1. 연도별 분해 (OOS 강세의 출처)

| 전략 | 2017 | 2018 | 2020 | 2023 | 2024 | 2025 | 2026 |
|---|---:|---:|---:|---:|---:|---:|---:|
| Quality ROA | −2% | 16% | 22% | 2% | **−16%** | **51%** | **44%** |
| EPS growth | **44%** | −5% | **72%** | −15% | 4% | **50%** | 4% |

→ Quality ROA의 OOS 20%는 전적으로 2025-26 랠리(2024는 −16%). EPS growth는 2017/2020/2025 스파이크 의존. 둘 다 꾸준한 컴파운더가 아니라 소수 대박해 의존.

## 2. Quality 정의 4종 × cadence × holdings

| 정의 | full Sharpe | OOS Sharpe |
|---|---|---|
| ROA (net/assets) | 0.43~0.62 | 0.44~0.82 |
| ROE (net/equity) | 0.41~0.47 | 0.51~0.54 |
| **GP (gross/assets, Novy-Marx)** | **−0.34~−0.01** | **−0.21~−0.05** |
| CFOA (cfo/assets) | −0.00~0.14 | 0.25~0.29 |

**정의들이 불일치.** 학술적으로 가장 강건한 Gross Profitability가 코스피에서 음수인데 ROA만 약양수 → "퀄리티 팩터"가 아니라 ROA 정의-특이적 우연. 진짜 팩터라면 정의가 달라도 같은 방향이어야 한다.

## 3. EPS growth cadence·holdings 취약성

| cadence | holdings | full Sharpe | OOS Sharpe |
|---|---|---|---|
| 주간(5) | 10 | 0.77 | 0.45 |
| 주간(5) | 20 | 0.62 | 0.41 |
| 월간(21) | 10 | 0.51 | 0.16 |
| 월간(21) | 20 | 0.45 | 0.28 |

최고 성과가 주간·top10 코너값. 월간·top20으로 가면 무너짐 = 그 config에 과적합.

## 판정: 둘 다 기각

honest 데이터에서 코스피의 **강건한 종목선택 팩터는 존재하지 않는다.** 4단계 증거:
1. 검색: 12개 후보 중 DSR 통과 0개
2. 연도분해: 상위 후보 전부 소수 대박해 의존
3. 정의 불일치: 퀄리티 GP 음수 vs ROA 양수
4. config 취약: EPS growth가 cadence/holdings에 무너짐

**실전 함의:** 코스피에서 "좋은 전략"은 팩터 사냥이 아니라 **위험관리**다. 신뢰할 수 있는 edge는 레짐 낙폭방어 하나. 종목선택 알파에 자본을 거는 것은 과신이다.

## 한계
- split+배당 캐시(strict official 아님), 상대 랭킹 목적.
- OOS 3.5년 소표본. 더 긴 표본·다른 유니버스(cap300b)·롤링 walk-forward는 미탐색이나, 이미 4단계 증거가 수렴.
- 도구: `search-robust-strategies.js`, runConfig 확장(cadence·holdings·quality 4종: roa/roe/gp/cfoa).
