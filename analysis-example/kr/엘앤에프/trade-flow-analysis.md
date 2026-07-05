# 엘앤에프 Trade Flow Analysis

기준일: 2026-07-05

Data refresh:
- Trade data: K-stat 지자체 수출입 품목별, 2026-07-05 조회, 2025.01~2026.05 월별 데이터
- Company filings / IR: DART 2026-03-24 단일판매ㆍ공급계약체결, 회사 2026-03-24 보도자료
- Peer results: 이번 검증에서는 미반영

## Question
- Target claim: 엘앤에프 attribution을 위해 2026년 상반기 양극재 proxy를 전국 중국향이 아니라 `대구 HS10 수출중량`에서 확인한다.
- Decision relevance: 엘앤에프 본사가 대구에 있고 핵심 생산 클러스터가 대구/구지 축인 만큼, 전국 목적국 수출보다 대구 지역 HS10 중량이 더 직접적인 shipment proxy다.

## Evidence Classification
| Claim | Grade | What is confirmed | What is inferred | Source role | Source/date |
| --- | --- | --- | --- | --- | --- |
| 대구 HS 2841909020 수출중량은 2026.01~05 합계 32,251.9톤으로 전년동기 18,975.9톤 대비 +70.0% 증가했다. | confirmed disclosure | K-stat 공식 지자체 품목별 중량 수치 | HS10을 NCM 양극재 proxy로 사용 | official trade statistic | K-stat, accessed 2026-07-05 |
| 2026.03 대구 HS 2841909020 수출중량은 6,913.7톤으로 전년동월 대비 +86.7% 증가했다. | confirmed disclosure | K-stat 공식 월별 중량 수치 | 1Q26 엘앤에프 출하 회복 단서로 사용 | official trade statistic | K-stat, accessed 2026-07-05 |
| 대구 NCM 수출중량 증가는 엘앤에프의 하이니켈/NCM 물량 회복 가능성을 높인다. | medium-confidence proxy | 대구 HS10 중량이 크게 증가 | 회사별 통관 주체와 고객/목적국은 미확인 | Trade Flow Inference | K-stat + DART 비교 |
| 삼성SDI 계약은 LFP, 미국 등 공급지역, 2027~2029 확정 물량 중심의 별도 thesis다. | confirmed disclosure | 계약 상대, 제품, 규모, 기간, 공급지역/북미 ESS 맥락 | 현재 대구 NCM 중량 증가와 같은 물량이라고 볼 수 없음 | confirmed disclosure / company PR | DART 2026-03-24, 회사 보도자료 2026-03-24 |

## Trade Lane Definition
| Field | Value | Notes |
| --- | --- | --- |
| HS code(s) | 2841909020 | `니켈코발트망간 산화물의 리튬염`; NCM 양극재 proxy |
| Region | 대구 | K-stat 지자체 수출입, 광역자치별 |
| Reporter / partner | Korea / all destinations | K-stat 지자체 품목별 화면은 지역+HS10+중량을 제공하지만 목적국까지 동시에 격리하지 않음 |
| Direction | export | 수출중량 |
| Period | 2026.01~2026.05 | 2026.06 확정치는 조회 시점에 미반영 |
| Unit | kg / ton | 원자료 kg, 표에서는 ton 병기 |

## Normalized Trade Flow
| Period | HS code | Region | Direction | Quantity kg | Quantity ton | YoY |
| --- | --- | --- | --- | ---: | ---: | ---: |
| 2026.01 | 2841909020 | 대구 | export | 5,552,236 | 5,552.2 | +129.3% |
| 2026.02 | 2841909020 | 대구 | export | 6,208,177 | 6,208.2 | +60.2% |
| 2026.03 | 2841909020 | 대구 | export | 6,913,740 | 6,913.7 | +86.7% |
| 2026.04 | 2841909020 | 대구 | export | 6,922,579 | 6,922.6 | +51.5% |
| 2026.05 | 2841909020 | 대구 | export | 6,655,179 | 6,655.2 | +51.1% |
| 2026.01~05 | 2841909020 | 대구 | export | 32,251,911 | 32,251.9 | +70.0% |

## Triangulation
- `confirmed disclosure`: K-stat는 대구 HS10 수출중량 증가를 확인한다. 2026.01~05 합계는 32,251.9톤이고 전년동기 대비 +70.0%다.
- `Trade Flow Inference`: 대구 HS10 중량은 전국 중국향 금액보다 엘앤에프 attribution에 더 적합하다. 다만 K-stat 공개 화면은 회사명, 고객사, 목적국을 동시에 격리하지 않으므로 `medium-confidence proxy`로 둔다.
- Peer divergence: 이번 검증에서는 포스코퓨처엠/에코프로비엠/코스모신소재의 같은 기간 회사별 실적 차이를 아직 넣지 않았다.
- Contract-scale fit: 삼성SDI LFP 계약은 제품(LFP), 목적지(미국 등/북미 ESS), 본격 기간(2027~2029)이 대구 NCM HS10 수출중량과 다르다. 현재 대구 NCM 증가를 해당 계약 물량으로 해석하면 안 된다.
- Timing fit: 대구 NCM 중량은 2026.01부터 이미 높은 수준이고 2026.03~05가 6.7~6.9천톤대에서 유지된다. 이는 1Q26~2Q26 NCM/하이니켈 shipment 회복 검증에 더 직접적으로 유용하다.
- Contradictions checked: 삼성SDI LFP 계약의 북미/미국 등 공급지역 및 LFP 제품 속성과 대구 NCM HS10 lane은 직접 매칭되지 않는다.

## Confidence Score
- Grade: medium-confidence proxy
- Score: 40
- Supporting factors:
  - 대구 HS10 수출중량이 2026.01~05 전년동기 대비 +70.0% 증가했다.
  - 2026.03 수출중량 6,913.7톤은 1Q26 shipment 회복 가설에 강한 월별 단서다.
  - HS10 `2841909020`은 HS6 `284190`보다 제품 오염 위험이 낮다.
- Contradictions:
  - K-stat 지자체 품목별은 목적국과 회사명을 동시에 확인하지 못한다.
  - Samsung SDI LFP 공시는 대구 NCM 수출중량 증가와 별도 thesis다.
- Why this is not a confirmed disclosure:
  - 엘앤에프는 고객별/지역별/NCM 제품별 매출 비중을 별도 공시하지 않았다.
  - K-stat/관세청 공개 통계는 회사명별 수출중량을 제공하지 않는다.

## Thesis Notes
- Base read: 대구 HS10 수출중량 기준으로 보면 2026년 1~5월 NCM proxy는 분명히 강하다. 이전 전국 중국향보다 훨씬 나은 엘앤에프 shipment proxy다.
- Strong assumption allowed: 대구 NCM 중량 급증을 엘앤에프 하이니켈/NCM 출하 회복 가능성에 연결할 수 있다.
- What would upgrade confidence: 1Q26/2Q26 엘앤에프 실적에서 매출·출하 증가 확인, peer 대비 차별 성장, 회사 IR의 NCM/46파이 출하 코멘트, DART 또는 IR의 대구/구지 생산량 단서.
- What would downgrade or contradict it: 엘앤에프 매출 감소, peer 또는 다른 대구 소재 업체가 해당 HS10 증가를 대부분 설명, 회사가 NCM 회복을 부인.

## Unresolved Checks
- 2026.06 확정 K-stat 대구 HS10 중량 반영.
- 대구 HS10 증가분의 목적국 분해 가능 여부 확인. 공개 K-stat 지자체 품목별 화면은 목적국을 동시에 제공하지 않는다.
- 엘앤에프 1Q26/2Q26 분기보고서 원문에서 매출, 재고, 제품/고객 믹스 확인.
- peer 3사 같은 기간 매출/출하 흐름 비교.

## Sources
- K-stat 지자체 수출입 품목별, 2026-07-05, https://stat.kita.net/stat/kts/prod/ProdWholeList.screen, source role: official trade statistic
- 관세청 수출입무역통계, 2026-07-05, https://tradedata.go.kr/cts/index.do, source role: official trade statistic cross-check
- DART, 2026-03-24, https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20260324800257, source role: confirmed disclosure
- 엘앤에프 보도자료, 2026-03-24, https://www.newswire.co.kr/newsRead.php?no=1030911, source role: company PR
