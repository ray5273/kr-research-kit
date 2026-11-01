# Alphabet Inc. SEC 분석

## 범위
- 회사명: Alphabet Inc.
- 티커: GOOGL (Class A), GOOG (Class C)
- CIK: 0001652044
- 기준일: 2026-11-01
- 대상 filings: 최신 10-Q (Q3 2026), 최신 10-K (FY2025), 최신 8-K (Q3 2026 실적, Item 2.02) + Exhibit 99.1. 비교용으로 Q1·Q2 2026, Q3·Q4 2025 실적 8-K Ex.99.1과 10-Q도 사용했다.
- SEC 수집 경로: `skills/us-sec-analysis/scripts/fetch-sec-edgar.js --cik 0001652044` (User-Agent "Sanghyeok Park ray527321@gmail.com", 요청 간격 150ms). 이어서 `extract-sec-sections.js` (10-Q/10-K)와 `build-sec-reference.js`를 실행했다. Exhibit 99.1과 과거 10-Q는 curl로 별도 다운로드했다(`raw/`).
- 최신 분기 상태: Q3 2026 실적 8-K는 **2026-10-28**에 냈고 10-Q는 **2026-10-29**에 냈다. 10-Q가 이미 있으므로 8-K 수치를 10-Q로 대조했다.

## Filing Set
| 역할 | Form | Accession | Filed | Period | Primary document | Source |
| --- | --- | --- | --- | --- | --- | --- |
| 최신 10-Q | 10-Q | 0001652044-26-000084 | 2026-10-29 | 2026-09-30 | goog-20260930.htm | https://www.sec.gov/Archives/edgar/data/1652044/000165204426000084/goog-20260930.htm |
| 최신 10-K | 10-K | 0001652044-26-000018 | 2026-02-05 | 2025-12-31 | goog-20251231.htm | https://www.sec.gov/Archives/edgar/data/1652044/000165204426000018/goog-20251231.htm |
| 최신 실적 8-K | 8-K (2.02, 9.01) | 0001652044-26-000080 | 2026-10-28 | 2026-10-28 | goog-20261028.htm / googexhibit991q32026.htm | https://www.sec.gov/Archives/edgar/data/1652044/000165204426000080/googexhibit991q32026.htm |
| 직전 10-Q | 10-Q | 0001652044-26-000071 | 2026-07-23 | 2026-06-30 | goog-20260630.htm | https://www.sec.gov/Archives/edgar/data/1652044/000165204426000071/goog-20260630.htm |
| 직전 실적 8-K | 8-K (2.02, 9.01) | 0001652044-26-000066 | 2026-07-22 | 2026-07-22 | googexhibit991q22026.htm | https://www.sec.gov/Archives/edgar/data/1652044/000165204426000066/googexhibit991q22026.htm |
| Q1 2026 8-K / 10-Q | 8-K / 10-Q | 0001652044-26-000043 / -000048 | 2026-04-29 / 2026-04-30 | 2026-03-31 | googexhibit991q12026.htm / goog-20260331.htm | https://www.sec.gov/Archives/edgar/data/1652044/000165204426000043/googexhibit991q12026.htm |
| Q4 2025 8-K | 8-K (2.02, 9.01) | 0001652044-26-000012 | 2026-02-04 | 2026-02-04 | googexhibit991q42025.htm | https://www.sec.gov/Archives/edgar/data/1652044/000165204426000012/googexhibit991q42025.htm |
| 전년 동기 8-K / 10-Q | 8-K / 10-Q | 0001652044-25-000087 / -25-000091 | 2025-10-29 / 2025-10-30 | 2025-09-30 | googexhibit991q32025.htm / goog-20250930.htm | https://www.sec.gov/Archives/edgar/data/1652044/000165204425000091/goog-20250930.htm |

## XBRL 핵심 지표
Source: https://data.sec.gov/api/xbrl/companyfacts/CIK0001652044.json (2026-11-01 수집)

| 지표 | 값 | 단위 | 기간 | Form | Filed | Accession | Concept | 비고 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 매출 (Q3) | 127,577,000,000 | USD | 2026-07-01~09-30 (CY2026Q3) | 10-Q | 2026-10-29 | 0001652044-26-000084 | us-gaap:Revenues | 2025년 이후 `RevenueFromContractWithCustomer...` 대신 `Revenues`를 쓴다. sec-reference.md의 revenue 행(2025Q1)은 스크립트 우선순위 탓에 오래된 값이 잡혔다 → needs_review |
| 매출 (전년 Q3) | 102,346,000,000 | USD | CY2025Q3 | 10-Q | 2026-10-29 | 0001652044-26-000084 | us-gaap:Revenues | |
| 영업이익 (9M) | 121,042,000,000 | USD | 2026-01-01~09-30 | 10-Q | 2026-10-29 | 0001652044-26-000084 | us-gaap:OperatingIncomeLoss | Q3 단독 40,576M (8-K/10-Q 본문) |
| 순이익 (9M) | 201,239,000,000 | USD | 2026-01-01~09-30 | 10-Q | 2026-10-29 | 0001652044-26-000084 | us-gaap:NetIncomeLoss | Q3 단독 26,468M |
| 희석 EPS (9M) | 16.33 | USD/share | 2026-01-01~09-30 | 10-Q | 2026-10-29 | 0001652044-26-000084 | us-gaap:EarningsPerShareDiluted | Q3 단독 $2.12 |
| 희석 주식수 (Q3) | 12,368,000,000 | shares | CY2026Q3 | 10-Q | 2026-10-29 | 0001652044-26-000084 | us-gaap:WeightedAverageNumberOfDilutedSharesOutstanding | |
| 현금 및 현금성자산 | 56,334,000,000 | USD | 2026-09-30 | 10-Q | 2026-10-29 | 0001652044-26-000084 | us-gaap:CashAndCashEquivalentsAtCarryingValue | 시장성 유가증권 포함 시 265,098M |
| 총자산 | 1,003,312,000,000 | USD | 2026-09-30 | 10-Q | 2026-10-29 | 0001652044-26-000084 | us-gaap:Assets | |
| 총부채 | 325,763,000,000 | USD | 2026-09-30 | 10-Q | 2026-10-29 | 0001652044-26-000084 | us-gaap:Liabilities | |
| 자기자본 | 677,549,000,000 | USD | 2026-09-30 | 10-Q | 2026-10-29 | 0001652044-26-000084 | us-gaap:StockholdersEquity | |
| 영업현금흐름 (9M) | 127,149,000,000 | USD | 2026-01-01~09-30 | 10-Q | 2026-10-29 | 0001652044-26-000084 | us-gaap:NetCashProvidedByUsedInOperatingActivities | Q3 단독 42,290M (8-K) |
| Capex (9M) | 131,953,000,000 | USD | 2026-01-01~09-30 | 10-Q | 2026-10-29 | 0001652044-26-000084 | us-gaap:PaymentsToAcquirePropertyPlantAndEquipment | Q3 단독 51,355M (8-K) |
| RPO | 567,700,000,000 | USD | 2026-09-30 (CY2026Q3I) | 10-Q | 2026-10-29 | 0001652044-26-000084 | us-gaap:RevenueRemainingPerformanceObligation | 2026-06-30 519.5B, 2025-09-30 157.7B |
| 매출총이익 | not separately disclosed | | | | | | GrossProfit | Alphabet은 GrossProfit 개념을 보고하지 않는다 |

## 10-Q 핵심 섹션 (Q3 2026)
| Item | 섹션 | 상태 | 핵심 내용 | Source |
| --- | --- | --- | --- | --- |
| Part I Item 1 | Financial Statements | parsed | RPO $567.7B (Cloud $560.8B, 24개월 내 just over 55%). 2026년 USD 노트 $45.0B와 외화 노트 $35.8B 발행. 장기부채 $125,102M. 매입 프로그램 잔여 $69.5B. 무형자산 상각 $375M | 10-Q Note 2 / Debt / Stockholders' Equity |
| Part I Item 2 | MD&A | parsed | G&A -$1.3B(전년 EC fine $3.5B 기저). OI&E 감소는 SpaceX 등 시장성 지분 미실현손실 때문. 9M capex $132.0B, 감가상각 $22.0B. "In 2026, we expect to significantly increase … our investment in our technical infrastructure". TPU 시스템 매출은 Q2 2026에 인식을 시작했고 "significant majority to be recognized in 2027" | 10-Q MD&A |
| Part I Item 3 | Market Risk | partial | 10-K Item 7A 참조 문구만 있음 | |
| Part I Item 4 | Controls | parsed | | |
| Part II Item 1 | Legal Proceedings | parsed | Note 참조 문구 | |
| Part II Item 1A | Risk Factors | parsed | 의무전환우선주 배당, 자사주 매입 불확실성 문구 추가 | |
| Part II Item 2 | Unregistered Sales / Repurchases | partial | Q3 매입 없음(현금흐름표 Repurchases 0) | |
| Part II Item 3/4 | Defaults / Mine Safety | missing | 파서가 헤딩을 놓침. "not separately disclosed"로 바꾸지 않음 | |
| Part II Item 5 | Other Information | parsed | 임원 10b5-1 계획(Porat, Hennessy 등) | |

## 10-K 핵심 섹션 (FY2025)
| Item | 섹션 | 상태 | 핵심 내용 | Source |
| --- | --- | --- | --- | --- |
| Item 7 | MD&A | parsed | FY2025 매출 402,836M, 영업이익 129,039M, capex 91,447M | 10-K / Q4 2025 Ex.99.1 |
| Item 8 | Financial Statements | parsed | 2025-12-31 RPO $242.8B (24개월 내 just over 50%) | 10-K |
| Item 3 | Legal Proceedings | partial | | |
| Item 1B/4/6/9/9C | | needs_review | 파서 약함. 재확인 필요 | |

## 최신 8-K 메타데이터
| Filed | Accession | Items | Primary document | Source |
| --- | --- | --- | --- | --- |
| 2026-10-28 | 0001652044-26-000080 | 2.02, 9.01 | goog-20261028.htm, Ex.99.1 googexhibit991q32026.htm | https://www.sec.gov/Archives/edgar/data/1652044/000165204426000080/ |
| 2026-08-10 | 0001193125-26-342390 | 8.01, 9.01 | d171253d8k.htm (본문 미파싱) | https://www.sec.gov/Archives/edgar/data/1652044/000119312526342390/ |

## 미공시 또는 별도 확인 필요
- Q3 2026 capex 가이던스는 8-K Ex.99.1에 없다. 콜 발언은 제3자 transcript에만 있다 (earnings-facts.md §4 참조).
- 회사 공식 콜 transcript는 abc.xyz가 Cloudflare 403을 반환해 접근하지 못했다 → needs_review.
- Q3 2025 EC fine $3.5B의 세후 EPS 효과는 회사가 공시하지 않았다.
- sec-reference.md XBRL revenue 행은 스크립트가 `RevenueFromContractWithCustomerExcludingAssessedTax`를 우선해 2025Q1 값을 골랐다. 올바른 값은 위 표의 `us-gaap:Revenues` → needs_review (스크립트 개선 후보).
- 10-Q Part II Item 3/4 파서 결과 missing → 원문 확인 전까지 미공시로 간주하지 않는다.

## Source Map
| 주장 또는 숫자 | Source type | 문서/Concept | Filed | Accession | URL | 상태 |
| --- | --- | --- | --- | --- | --- | --- |
| Q3 2026 매출 127,577M / 영업이익 40,576M / EPS $2.12 | 8-K Ex.99.1 | Income statement | 2026-10-28 | 0001652044-26-000080 | https://www.sec.gov/Archives/edgar/data/1652044/000165204426000080/googexhibit991q32026.htm | parsed |
| 세그먼트 매출·영업이익 | 8-K Ex.99.1 | Segment Results | 2026-10-28 | 0001652044-26-000080 | 위 동일 | parsed |
| 지분증권 손실 $8.7B, EPS -$0.55 | 8-K Ex.99.1 | OI&E footnote | 2026-10-28 | 0001652044-26-000080 | 위 동일 | parsed |
| OCF 42,290M / capex 51,355M / FCF (9,065)M / TTM FCF 19,747M | 8-K Ex.99.1 | Cash flow, FCF reconciliation | 2026-10-28 | 0001652044-26-000080 | 위 동일 | parsed |
| RPO $567.7B (Cloud $560.8B) | 10-Q | Note 2 Revenues / us-gaap:RevenueRemainingPerformanceObligation | 2026-10-29 | 0001652044-26-000084 | https://www.sec.gov/Archives/edgar/data/1652044/000165204426000084/goog-20260930.htm | parsed |
| 매입 프로그램 잔여 $69.5B, Q3 매입 0 | 10-Q | Note Stockholders' Equity, Cash flow | 2026-10-29 | 0001652044-26-000084 | 위 동일 | parsed |
| ATM Q3 발행 12M A + 24M C, 잔여 $27.6B | 10-Q / 8-K | Liquidity | 2026-10-29 | 0001652044-26-000084 | 위 동일 | parsed |
| 장기부채 125,102M, 액면 127,485M | 10-Q | Debt note | 2026-10-29 | 0001652044-26-000084 | 위 동일 | parsed |
| EC fine $5.2B 현금 지급 (2026-07) | 10-Q | Legal matters | 2026-10-29 | 0001652044-26-000084 | 위 동일 | parsed |
| 2026 capex 가이던스 $175–185B (2026-02-04 최초) | 8-K Ex.99.1 | CEO quote | 2026-02-04 | 0001652044-26-000012 | https://www.sec.gov/Archives/edgar/data/1652044/000165204426000012/googexhibit991q42025.htm | parsed |
| 2026 capex $195–205B 유지, 2027 "increase significantly" | 제3자 transcript | Q3 2026 call | 2026-10-28 | n/a | https://www.fool.com/earnings/call-transcripts/2026/10/29/alphabet-googl-q3-2026-earnings-call-transcript/ | needs_review (2차 출처) |
