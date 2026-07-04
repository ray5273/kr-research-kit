# Tesla, Inc. SEC 분석

기준일: 2026-07-04

이 문서는 SEC 원문, SEC submissions, SEC XBRL companyfacts를 기준으로 만든 filing evidence pack이다. 주가, 목표가, 밸류에이션 결론은 포함하지 않는다.

## 범위

- 회사명: Tesla, Inc.
- 티커: `TSLA`
- CIK: `0001318605`
- 시장: Nasdaq
- 대상 filings: 최신 `10-K`, 최신 `10-Q`, 최신 `8-K` 및 `8-K Exhibit 99.1`
- SEC 수집 경로: `data.sec.gov/submissions`, `data.sec.gov/api/xbrl/companyfacts`, SEC Archives primary filing HTML
- 로컬 산출물: `sec-reference.md`, `sec-cache.json`, `sec-filing-export.json`, `sec-companyfacts.json`, `sec-sections-10k.json`, `sec-sections-10q.json`

## Filing Set

| 역할 | Form | Accession | Filed | Period | Primary document | Source |
| --- | --- | --- | --- | --- | --- | --- |
| 최신 연간 보고서 | 10-K | `0001628280-26-003952` | 2026-01-29 | 2025-12-31 | `tsla-20251231.htm` | https://www.sec.gov/Archives/edgar/data/1318605/000162828026003952/tsla-20251231.htm |
| 최신 분기 보고서 | 10-Q | `0001628280-26-026673` | 2026-04-23 | 2026-03-31 | `tsla-20260331.htm` | https://www.sec.gov/Archives/edgar/data/1318605/000162828026026673/tsla-20260331.htm |
| 최신 8-K | 8-K | `0001628280-26-046717` | 2026-07-02 | 2026-07-02 | `tsla-20260702.htm` | https://www.sec.gov/Archives/edgar/data/1318605/000162828026046717/tsla-20260702.htm |
| 최신 8-K 부속자료 | EX-99.1 | `0001628280-26-046717` | 2026-07-02 | 2026 Q2 operating update | `exhibit99111111.htm` | https://www.sec.gov/Archives/edgar/data/1318605/000162828026046717/exhibit99111111.htm |

## SEC 기반 핵심 판단

Tesla의 최신 SEC 기준 그림은 "자동차/서비스 부문의 1Q26 회복, 에너지 매출 둔화와 마진 개선, AI/자율주행 투자 확대"로 요약된다. 1Q26 매출은 전년 대비 16% 증가했고 총 gross margin은 16.3%에서 21.1%로 개선됐다. 다만 R&D와 SG&A가 각각 38%, 47% 증가했고, 회사는 2026년 capex가 250억 달러를 넘을 것으로 예상한다고 밝혔다.

7월 2일 8-K Exhibit 99.1은 2Q26 차량 생산 451,758대, 인도 480,126대, 에너지 저장장치 deployment 13.5 GWh를 공시했다. 단, 회사는 이 지표들이 분기 재무성과를 대체하지 않는다고 명시했으므로 2Q26 실적 판단은 2026-07-22 예정 실적 발표와 후속 10-Q 확인이 필요하다.

## XBRL 핵심 지표

| 지표 | 최신 값 | 단위 | 기간 | Form | Filed | Accession | Concept | 비고 |
| --- | ---: | --- | --- | --- | --- | --- | --- | --- |
| Revenue | 22,387 | USD mn | 2026-01-01 to 2026-03-31 | 10-Q | 2026-04-23 | `0001628280-26-026673` | `us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax` | Q1 standalone fact |
| Gross profit | 4,720 | USD mn | 2026-01-01 to 2026-03-31 | 10-Q | 2026-04-23 | `0001628280-26-026673` | `us-gaap:GrossProfit` | Q1 standalone fact |
| Operating income | 941 | USD mn | 2026-01-01 to 2026-03-31 | 10-Q | 2026-04-23 | `0001628280-26-026673` | `us-gaap:OperatingIncomeLoss` | Q1 standalone fact |
| Net income attributable to common stockholders | 477 | USD mn | 2026-01-01 to 2026-03-31 | 10-Q | 2026-04-23 | `0001628280-26-026673` | `us-gaap:NetIncomeLoss` | companyfacts label은 consolidated net income concept |
| Diluted EPS | 0.13 | USD/share | 2026-01-01 to 2026-03-31 | 10-Q | 2026-04-23 | `0001628280-26-026673` | `us-gaap:EarningsPerShareDiluted` | Q1 standalone fact |
| Cash and cash equivalents | 16,603 | USD mn | 2026-03-31 | 10-Q | 2026-04-23 | `0001628280-26-026673` | `us-gaap:CashAndCashEquivalentsAtCarryingValue` | balance sheet point-in-time |
| Assets | 143,724 | USD mn | 2026-03-31 | 10-Q | 2026-04-23 | `0001628280-26-026673` | `us-gaap:Assets` | balance sheet point-in-time |
| Liabilities | 58,922 | USD mn | 2026-03-31 | 10-Q | 2026-04-23 | `0001628280-26-026673` | `us-gaap:Liabilities` | balance sheet point-in-time |
| Stockholders' equity | 84,116 | USD mn | 2026-03-31 | 10-Q | 2026-04-23 | `0001628280-26-026673` | `us-gaap:StockholdersEquity` | balance sheet point-in-time |
| Operating cash flow | 3,937 | USD mn | 2026-01-01 to 2026-03-31 | 10-Q | 2026-04-23 | `0001628280-26-026673` | `us-gaap:NetCashProvidedByUsedInOperatingActivities` | Q1 cash-flow fact |
| Capex | 2,493 | USD mn | 2026-01-01 to 2026-03-31 | 10-Q | 2026-04-23 | `0001628280-26-026673` | `us-gaap:PaymentsToAcquirePropertyPlantAndEquipment` | purchases of property and equipment |

파생 지표:

| 항목 | 값 | 계산 | 비고 |
| --- | ---: | --- | --- |
| Q1 gross margin | 21.1% | 4,720 / 22,387 | 10-Q MD&A 표와 일치 |
| Q1 operating margin | 4.2% | 941 / 22,387 | derived from XBRL facts |
| Q1 net margin | 2.1% | 477 / 22,387 | common stockholders 기준 |
| Q1 free cash flow | 1,444 USD mn | 3,937 - 2,493 | SEC cash-flow facts 기반 단순 계산 |
| Cash + short-term investments | 44,743 USD mn | 16,603 + 28,140 | 10-Q balance sheet 기준 |

## 1Q26 실적 및 사업부 해석

| 항목 | 1Q26 | 1Q25 | YoY | SEC 근거 |
| --- | ---: | ---: | ---: | --- |
| Total revenues | 22,387 USD mn | 19,335 USD mn | +16% | 10-Q MD&A / XBRL |
| Automotive sales | 15,473 USD mn | 12,925 USD mn | +20% | 10-Q MD&A |
| Automotive regulatory credits | 380 USD mn | 595 USD mn | -36% | 10-Q MD&A |
| Automotive leasing | 381 USD mn | 447 USD mn | -15% | 10-Q MD&A |
| Services and other | 3,745 USD mn | 2,638 USD mn | +42% | 10-Q MD&A |
| Energy generation and storage | 2,408 USD mn | 2,730 USD mn | -12% | 10-Q MD&A |
| Total gross profit | 4,720 USD mn | 3,153 USD mn | +50% | 10-Q MD&A / XBRL |
| Income from operations | 941 USD mn | 399 USD mn | +136% | 10-Q statements / XBRL |

핵심 포인트:

- 자동차 매출 증가는 10-Q상 현금 인도 증가, New Model Y 전환 영향이 있었던 전년 기저, 판매 믹스, 달러 약세 영향으로 설명된다.
- Regulatory credit revenue는 36% 감소했다. 회사는 규제 변화와 타 완성차 업체의 credit 수요 영향을 명시했다.
- Services and other는 used vehicle sales, non-warranty maintenance/collision, paid Supercharging, insurance revenue 증가가 주요 원인이다.
- Energy generation and storage 매출은 Megapack/Powerwall deployment 감소로 12% 줄었지만, segment gross margin은 28.8%에서 39.5%로 개선됐다.

## 사업부 및 지역 공시

| 블록 | 1Q26 | 1Q25 | 비고 | Source |
| --- | ---: | ---: | --- | --- |
| Automotive segment revenue | 19,979 USD mn | 16,605 USD mn | Automotive + services and other 기준 | 10-Q Note 13 |
| Automotive segment gross profit | 3,768 USD mn | 2,368 USD mn | segment gross margin 18.9% | 10-Q Note 13 |
| Energy segment revenue | 2,408 USD mn | 2,730 USD mn | deployment 감소 영향 | 10-Q Note 13 |
| Energy segment gross profit | 952 USD mn | 785 USD mn | segment gross margin 39.5% | 10-Q Note 13 |
| U.S. revenue | 10,677 USD mn | 10,333 USD mn | sales location 기준 | 10-Q Note 13 |
| China revenue | 4,184 USD mn | 4,303 USD mn | sales location 기준 | 10-Q Note 13 |
| Other international revenue | 7,526 USD mn | 4,699 USD mn | sales location 기준 | 10-Q Note 13 |

고객 집중도는 이 SEC sweep의 표준 XBRL/핵심 섹션 기준으로 별도 수치가 확인되지 않았다. 필요하면 `Item 8` 주석 전체를 고객/매출채권/contract concentration 키워드로 추가 정밀 검색해야 한다.

## 현금흐름, 투자, 유동성

| 항목 | 1Q26 | 1Q25 | 변화 | Source |
| --- | ---: | ---: | ---: | --- |
| Operating cash flow | 3,937 USD mn | 2,156 USD mn | +1,781 USD mn | 10-Q cash-flow statement |
| Capex | 2,493 USD mn | 1,492 USD mn | +1,001 USD mn | 10-Q cash-flow statement |
| SpaceX equity investment | 2,002 USD mn | 0 | +2,002 USD mn | 10-Q cash-flow statement / Note 12 |
| Net cash used in investing activities | 5,023 USD mn | 1,651 USD mn | +3,372 USD mn outflow | 10-Q cash-flow statement |
| Net cash provided by financing activities | 1,172 USD mn | -332 USD mn | +1,504 USD mn | 10-Q cash-flow statement |

Tesla는 10-Q에서 현재 자금원이 2026-03-31 이후 12개월 및 장기 유동성에 충분하다고 밝혔다. 동시에 2026년 capex가 250억 달러를 초과할 것으로 예상한다고 공시했으며, 주요 사용처는 AI initiatives, compute infrastructure/data centers, manufacturing/R&D lines and facilities, company-operated AI-enabled assets, retail/service/charging footprint이다.

## 10-K 핵심 섹션

| Item | 섹션 | 상태 | 핵심 내용 | Source |
| --- | --- | --- | --- | --- |
| Item 1 | Business | parsed | Tesla는 automotive와 energy generation and storage 두 reportable segments를 공시한다. 회사의 전략 서사는 EV 제조에서 AI/FSD/Robotaxi/Optimus로 넓어졌다. | 2025 10-K |
| Item 1A | Risk Factors | parsed | 성장의 핵심 리스크는 신제품/서비스/FSD/Robotaxi/Cybercab/Optimus 개발과 생산 ramp 지연, 제조비용 통제 실패, 공급망/관세/규제 변화다. | 2025 10-K |
| Item 7 | MD&A | parsed | 2025년 생산 166만 대, 인도 164만 대. 회사는 2026년에도 AI, autonomy, battery, compute, supply-chain localization, infrastructure 투자를 강조한다. | 2025 10-K |
| Item 8 | Financial Statements | parsed | 감사의견은 2025년 재무제표와 내부회계관리제도에 대해 적정 의견. 디지털 자산 회계정책 변경이 언급된다. | 2025 10-K |

10-K parser coverage: `parsed 13`, `partial 7`, `needs_review 3`, `missing 0`. `needs_review` 항목은 주로 heading-only 또는 reserved 성격의 짧은 섹션이다.

## 10-Q 핵심 섹션

| Item | 섹션 | 상태 | 핵심 내용 | Source |
| --- | --- | --- | --- | --- |
| Part I Item 1 | Financial Statements | parsed | 1Q26 손익계산서, 대차대조표, 현금흐름표, segment/geographic tables를 확인했다. | 2026 Q1 10-Q |
| Part I Item 2 | MD&A | parsed | 1Q26 매출 +16%, gross margin 개선, R&D/SG&A 증가, AI/Robotaxi/Optimus 투자와 tariff/geopolitical uncertainty를 설명한다. | 2026 Q1 10-Q |
| Part II Item 1A | Risk Factors | partial | 10-Q는 2025 10-K Risk Factors를 참조하며, 중대한 변경이 별도 상세 반복되지는 않았다. | 2026 Q1 10-Q |

10-Q parser coverage: `parsed 6`, `partial 2`, `needs_review 3`, `missing 0`.

## 최신 8-K 및 Q2 운영 업데이트

| Filed | Accession | Items | Primary document | Exhibit | Source |
| --- | --- | --- | --- | --- | --- |
| 2026-07-02 | `0001628280-26-046717` | `2.02`, `9.01` | `tsla-20260702.htm` | `exhibit99111111.htm` | SEC Archives |

Exhibit 99.1 공시:

| 항목 | Q2 2026 |
| --- | ---: |
| 총 생산 | 451,758 vehicles |
| 총 인도 | 480,126 vehicles |
| Model 3/Y 생산 | 442,936 vehicles |
| Model 3/Y 인도 | 467,762 vehicles |
| Other Models 생산 | 8,822 vehicles |
| Other Models 인도 | 12,364 vehicles |
| Energy storage deployments | 13.5 GWh |
| Q2 2026 실적 발표 예정 | 2026-07-22 after market close |

주의: Tesla는 이 8-K에서 차량 인도와 storage deployments가 분기 재무성과 전체를 대체하지 않으며, 순이익과 현금흐름은 Q2 실적 발표 때 공시된다고 밝혔다.

## 미공시 또는 별도 확인 필요

- 고객 집중도: 이번 SEC sweep의 표준 XBRL companyfacts와 핵심 section summary 기준으로 별도 고객별 매출 비중은 확인되지 않음.
- Q2 2026 재무제표: 2026-07-02 8-K는 production/delivery/deployment와 실적 발표 일정만 제공. Q2 손익/현금흐름은 후속 실적자료와 10-Q 확인 필요.
- 8-K Exhibit 99.1은 furnished 정보 성격이며, 8-K 본문은 Item 2.02 정보가 Exchange Act Section 18 목적상 filed로 간주되지 않는다고 명시한다.
- Risk Factors: 10-Q는 10-K Risk Factors 참조 방식이므로 구체 리스크 문구는 2025 10-K Item 1A를 기준으로 봐야 한다.

## Source Map

| 주장 또는 숫자 | Source type | 문서/Concept | Filed | Accession | URL | 상태 |
| --- | --- | --- | --- | --- | --- | --- |
| 최신 filing set | SEC submissions API | `CIK0001318605.json` | 2026-07-04 확인 | n/a | https://data.sec.gov/submissions/CIK0001318605.json | collected |
| XBRL 핵심 지표 | SEC companyfacts API | `CIK0001318605.json` | 2026-07-04 확인 | n/a | https://data.sec.gov/api/xbrl/companyfacts/CIK0001318605.json | collected |
| 2025 10-K 사업/리스크/MD&A | SEC primary filing | `tsla-20251231.htm` | 2026-01-29 | `0001628280-26-003952` | https://www.sec.gov/Archives/edgar/data/1318605/000162828026003952/tsla-20251231.htm | parsed |
| 1Q26 매출 22,387 USD mn | SEC XBRL + 10-Q financial statements | `RevenueFromContractWithCustomerExcludingAssessedTax` | 2026-04-23 | `0001628280-26-026673` | https://www.sec.gov/Archives/edgar/data/1318605/000162828026026673/tsla-20260331.htm | found |
| 1Q26 gross profit 4,720 USD mn | SEC XBRL + 10-Q MD&A | `GrossProfit` | 2026-04-23 | `0001628280-26-026673` | https://www.sec.gov/Archives/edgar/data/1318605/000162828026026673/tsla-20260331.htm | found |
| 1Q26 operating income 941 USD mn | SEC XBRL + 10-Q statements | `OperatingIncomeLoss` | 2026-04-23 | `0001628280-26-026673` | https://www.sec.gov/Archives/edgar/data/1318605/000162828026026673/tsla-20260331.htm | found |
| 1Q26 operating cash flow 3,937 USD mn | SEC XBRL + 10-Q cash-flow statement | `NetCashProvidedByUsedInOperatingActivities` | 2026-04-23 | `0001628280-26-026673` | https://www.sec.gov/Archives/edgar/data/1318605/000162828026026673/tsla-20260331.htm | found |
| 2026 capex expected to exceed 25B USD | SEC 10-Q MD&A | Liquidity and Capital Resources | 2026-04-23 | `0001628280-26-026673` | https://www.sec.gov/Archives/edgar/data/1318605/000162828026026673/tsla-20260331.htm | parsed |
| Q2 production/deliveries/storage deployments | SEC 8-K Exhibit 99.1 | `exhibit99111111.htm` | 2026-07-02 | `0001628280-26-046717` | https://www.sec.gov/Archives/edgar/data/1318605/000162828026046717/exhibit99111111.htm | parsed |

## 다음 확인 항목

- 2026-07-22 Q2 2026 실적 발표와 후속 10-Q에서 Q2 gross margin, automotive gross margin, energy margin, operating cash flow, capex, AI/data center investment cadence 확인.
- Regulatory credits 감소가 automotive margin에 미치는 영향과 non-credit automotive gross margin을 후속 filing에서 분리 확인.
- AI hardware company acquisition, SpaceX equity investment, related-party transactions가 재무제표/현금흐름/거버넌스 리스크에 미치는 영향 추가 확인.
- Robotaxi/Cybercab/Optimus 관련 사업 진행은 SEC Risk Factors와 실제 재무 기여 사이의 간극을 추적해야 함.
