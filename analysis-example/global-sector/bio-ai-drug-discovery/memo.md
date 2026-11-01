# 바이오 AI 신약개발

- 대상: 바이오 AI 신약개발
- 기준일: 2026-09-20
- 범위: 생성형 AI와 구조기반 계산을 활용하는 글로벌 신약개발 기업. 단순 CRO, 임상시험 운영 AI, 진단 AI는 제외한다.
- 핵심 질문: AI는 신약개발의 어느 구간에서 실제 우위를 보이며, 그 강점이 임상 성과와 투자 가능한 기업으로 이어지고 있는가.

## Summary

**진짜 병목은 분자 설계가 아니라 임상 효능이다.**

AlphaFold 이후 구조 예측과 생성 설계는 빠르게 발전했다. 단백질·항체·저분자 후보를 더 빨리 만들고 탐색 공간을 넓히는 능력은 이미 실험실과 초기 임상에서 확인되고 있다.

하지만 좋은 구조와 높은 결합 친화도가 좋은 약을 뜻하지는 않는다. 어떤 표적이 인간 질병을 실제로 움직이는지, 적절한 조직에 약이 도달하는지, 장기 투여에서 안전한지, 환자에게 의미 있는 효능이 있는지는 여전히 임상에서 확인해야 한다.

[brown: 따라서 2026년 바이오 AI의 투자 포인트는 모델 성능보다 Phase 2 이후의 무작위 효능 데이터와 현금 런웨이다.]

현재 임상 검증의 앞줄에는 rentosertib의 Insilico Medicine과 GB-0895의 Generate:Biomedicines가 있다. 다만 전자는 작은 Phase 2a에서 나온 효능 신호이고, 후자는 Phase 3에 진입했을 뿐 결과가 나온 것은 아니다. AI 우위가 최종적으로 입증됐다고 말하기에는 아직 이르다.

## 먼저 바로잡아야 할 것: AlphaFold가 모든 구조 문제를 해결한 것은 아니다

AlphaFold2는 정형 단백질의 단일 구조 예측을 획기적으로 발전시켰다. AlphaFold3는 단백질뿐 아니라 핵산, 저분자, 이온이 포함된 복합체로 범위를 넓혔다.

그러나 구조 예측과 단백질 접힘의 물리적 메커니즘은 같은 문제가 아니다. 실제 단백질은 한 장의 사진처럼 고정돼 있지 않고 여러 상태를 오간다. 내재적 무질서 영역, 대체 구조, 일시적 복합체, 막단백질, 세포 환경에 따른 동역학에서는 여전히 불확실성이 크다.

그래서 성숙도는 다음처럼 보는 편이 안전하다.

| 영역 | 2026년 판단 | 남은 병목 |
|---|---|---|
| 정형 단백질 구조 예측 | 매우 성숙 | 동역학·대체 구조·IDR·세포 환경 |
| 단백질·항체 생성 설계 | 빠르게 성숙 | 습식 실험 성공률·면역원성·제조성 |
| 구조기반 저분자 설계 | 성숙도 상승 | 선택성·PK·독성·조직 도달 |
| ADMET·인간 PK 예측 | 중간 | 종간 차이와 장기 독성 |
| 표적 발굴·검증 | 미성숙 | 인간 질병 인과성과 환자 층화 |
| 임상 효능 예측 | 미성숙 | 실제 환자의 복잡한 생물학 |

## 초기 임상 성공률은 흥미롭지만 아직 결론이 아니다

2024년 Drug Discovery Today 분석은 2023년 말까지의 AI 발굴 약물을 모아 Phase 1 성공률을 80~90%, Phase 2 성공률을 약 40%로 집계했다.

이 결과는 AI가 약물다운 분자를 고르고 초기 독성을 줄이는 데 도움을 줄 가능성을 보여준다. 동시에 효능을 보는 Phase 2에서는 전통적 개발보다 뚜렷한 우위가 확인되지 않았다는 뜻이기도 하다.

주의할 점도 있다. 표본이 작고 `AI 발굴`의 정의가 기업마다 다르며, 비교 대상은 같은 시기에 무작위로 뽑은 대조군이 아니라 역사적 평균이다.

[blue: Phase 1의 높은 통과율을 신약 승인 확률의 상승으로 곧바로 해석하면 안 된다.]

## 첫 번째 임상 기준점: Insilico의 rentosertib

Insilico Medicine의 rentosertib는 TNIK를 표적으로 하는 특발성 폐섬유증 후보물질이다. 회사의 PandaOmics와 Chemistry42가 표적 발굴과 분자 설계에 사용됐다.

2025년 6월 Nature Medicine에 발표된 GENESIS-IPF Phase 2a는 71명을 네 군으로 나눠 12주간 진행했다. 60mg 1일 1회 투여군의 평균 FVC 변화는 +98.4mL, 위약군은 -20.3mL였다.

중요한 진전이지만 해석에는 선을 그어야 한다. 이 시험의 1차 평가변수는 안전성이었고 FVC는 2차 평가변수였다. 군당 17~18명, 중국 단일 국가, 12주 추적이라는 한계가 있다.

[red: rentosertib는 AI가 표적과 분자 설계에 모두 관여한 약물에서 나온 가장 중요한 무작위 임상 효능 신호 중 하나다.]

[blue: 그러나 더 크고 길며 지역적으로 다양한 후속 시험 전까지 확정적 효능 입증으로 보기는 어렵다.]

Insilico는 2025년 12월 홍콩거래소에 상장했고 약 22억7,700만 홍콩달러를 조달했다. 2026년 3월에는 Lilly와 선불 1억1,500만 달러, 총 잠재가치 약 27억5,000만 달러의 협업을 맺었다. 2026년 6월 말 현금과 투자자산은 5억8,480만 달러였다.

## 가장 앞선 후기 임상: Generate의 GB-0895

Generate:Biomedicines의 GB-0895는 중증 천식을 겨냥한 장기지속형 항-TSLP 항체다. 회사는 생성형 생물학 플랫폼으로 항체를 설계했고, 반감기 연장을 통해 6개월 간격 투여 가능성을 시험하고 있다.

SOLAIRIA-1과 SOLAIRIA-2는 약 1,600명을 대상으로 하는 글로벌 Phase 3 시험이다. 회사 파이프라인 기준으로 2026년 현재 Phase 3가 진행 중이다.

[red: 공개적으로 알려진 AI 엔지니어링 항체 가운데 GB-0895는 가장 앞선 임상 단계에 있다.]

다만 Phase 3 진입은 승인이 아니다. Phase 1에서 바이오마커 억제와 긴 반감기를 확인했어도, 천식 악화 감소와 안전성은 대규모 환자 시험에서 입증해야 한다.

Generate는 2026년 2월 주당 16달러로 IPO를 진행했고 2월 27일부터 나스닥에서 `GENB`로 거래를 시작했다. 이 변화 때문에 이제 Generate는 비상장 관찰 대상이 아니라 직접 비교 가능한 상장 바이오텍이다.

## 플랫폼 최강 후보: Isomorphic Labs

Isomorphic Labs는 AlphaFold3를 넘어서는 통합 약물설계 엔진 IsoDDE를 개발하고 있다. 회사는 단백질-리간드 구조 예측, 결합 친화도 예측, 신규 포켓 탐색을 하나의 계산 체계로 묶는다고 설명한다.

2026년 5월 Series B로 21억 달러를 조달했다. 2025년 6억 달러 조달에 이어 자본력은 업계 최상위다. Lilly와 Novartis 협업, Alphabet의 지원도 강점이다.

하지만 2026년 9월 20일 현재 공개된 임상 후보는 없다. 첫 임상 목표도 2025년 말에서 2026년 말로 늦춰졌다.

[brown: Isomorphic은 모델과 자본의 선두지만, 지금 평가는 임상 성과가 아니라 미래 실행력에 대한 평가다.]

## 상장사와 비상장사를 분리해서 봐야 한다

| 구분 | 기업 | 현재 핵심 검증점 |
|---|---|---|
| 홍콩 상장 | Insilico Medicine(3696.HK) | rentosertib 후속 임상, 플랫폼 딜의 현금화 |
| 미국 상장 | Generate:Biomedicines(GENB) | GB-0895 Phase 3 효능·안전성 |
| 미국 상장 | Recursion(RXRX) | REC-4881·REC-617 임상과 2028년 초 런웨이 |
| 미국 상장 | Relay Therapeutics(RLAY) | zovegalisib Phase 3 ReDiscover-2 |
| 미국 상장 | Schrödinger(SDGR) | 소프트웨어 성장과 자체 파이프라인의 균형 |
| 미국 상장 | Absci(ABSI) | ABS-201 효능 신호와 ABS-101 임상 진전 |
| 비상장 | Isomorphic Labs | 첫 임상 진입과 공개 후보의 차별성 |
| 비상장 | Xaira Therapeutics | virtual cell이 실제 후보물질로 연결되는지 |
| 비상장 | Iambic Therapeutics | IAM1363 Phase 1/1b와 Takeda 협업 |
| 인프라 | EvolutionaryScale | ESM 계열 모델의 채택과 수익화 |

이 구분이 중요한 이유는 과학적으로 매력적인 회사와 개인 투자자가 살 수 있는 종목이 같지 않기 때문이다.

## 공개 상장사별로 지금 볼 숫자

### Recursion

Recursion은 2024년 Exscientia를 합병해 표현형 데이터와 화학 설계를 결합했다. 2025년에 REC-2282, REC-994를 중단하고 REC-3964의 파트너링을 추진한 것은 플랫폼 실패의 단정적 증거라기보다 자본 배분의 현실을 보여준다.

2026년 6월 말 현금·현금성자산·제한현금은 5억5,680만 달러였고 회사가 제시한 런웨이는 2028년 초다. REC-4881의 Phase 2 데이터와 REC-7735의 임상 진입이 다음 검증점이다.

### Relay Therapeutics

Relay는 단백질 동역학과 구조기반 설계를 결합한다. zovegalisib은 변이 선택적 PI3Kα 억제제로 Phase 3 ReDiscover-2가 진행 중이다.

2026년 6월 말 현금·현금성자산·투자자산은 9억1,090만 달러였고 런웨이는 2029년까지로 제시됐다. 임상 후기 단계와 자금 여력을 함께 갖춘 상장사라는 점이 강점이다.

### Schrödinger

Schrödinger는 물리 기반 자유에너지 계산과 머신러닝을 결합하고 소프트웨어 사업을 병행한다. 2026년 2분기 소프트웨어 매출은 3,250만 달러, 소프트웨어 총마진은 71%였다.

SGR-2921은 두 건의 치료 관련 사망으로 2025년 중단됐다. 이는 계산 플랫폼이 임상 안전성 위험을 제거해 주지 못한다는 중요한 반례다. 현재는 SGR-1505와 SGR-3515의 데이터 패키지 및 파트너링이 관전 포인트다.

### Absci

Absci는 생성형 AI로 항체를 만들고 습식 실험 피드백을 반복한다. ABS-201은 2026년 6월 중간 Phase 1에서 우호적인 초기 안전성·PK를 보고했고 반감기는 최소 65일로 추정됐다.

그러나 아직 핵심은 모발 성장 효능이다. 2026년 하반기 중간 개념증명 데이터가 플랫폼의 실제 가치를 가를 가능성이 크다.

## 하이브리드 모델의 진짜 위험

BenevolentAI는 2025년 3월 Euronext Amsterdam에서 상장폐지되고 비상장사로 전환했다. Recursion도 여러 프로그램을 정리했다.

이를 `플랫폼과 파이프라인을 함께 하면 실패한다`로 단순화할 필요는 없다. Relay와 Insilico처럼 자금 조달이나 파트너십이 받쳐주는 사례도 있다.

진짜 위험은 플랫폼 매출과 선불금이 자체 임상개발의 현금 소모를 상쇄하지 못하는 상황이다. 후보가 많아질수록 임상비용은 커지고, 실패한 프로그램을 오래 끌수록 주주 희석 위험도 커진다.

따라서 파이프라인 개수보다 아래를 봐야 한다.

1. 선불금이 실제 현금으로 얼마나 들어오는가.
2. 가장 앞선 두 프로그램에 자원이 집중되는가.
3. 24개월 안에 임상 효능 이벤트가 있는가.
4. 그 이벤트까지 추가 증자 없이 버틸 수 있는가.

## 기업을 고르는 공통 점수표

| 평가축 | 질문 | 가중치를 높게 둘 이유 |
|---|---|---|
| 인간 생물학 | 표적이 인간 유전학·환자 데이터로 지지되는가 | 좋은 분자보다 잘못된 표적이 더 큰 실패 원인 |
| 임상 검증 | 무작위 Phase 2 이상 효능 데이터가 있는가 | AI의 진짜 우위는 여기서 판별 |
| 설계 차별성 | 기존 약보다 선택성·반감기·조직 도달이 나은가 | AI가 만든 실질적 제품 차이 |
| 자금 | 핵심 데이터까지 현금이 충분한가 | 좋은 기술도 자금 부족이면 희석·중단 위험 |
| 파트너 경제성 | 총 마일스톤보다 선불금과 비용분담이 큰가 | 외부 검증의 질과 현금 기여를 반영 |
| 투자 가능성 | 상장 여부와 유동성은 어떤가 | 산업 선두와 매수 가능한 종목을 분리 |

## 현재 판단

임상 근거만 보면 Insilico와 Generate가 선두다. Insilico는 작은 무작위 Phase 2a의 효능 신호, Generate는 Phase 3 진입이라는 서로 다른 강점을 갖는다.

플랫폼과 자본력만 보면 Isomorphic이 가장 강하지만 아직 임상 검증은 없다. 상장사 가운데 후기 임상과 자금 여력을 함께 보려면 Generate와 Relay가 눈에 띄고, 플랫폼 매출의 완충 장치를 중시하면 Schrödinger가 다른 성격의 선택지다.

Recursion과 Absci는 2026년 하반기 데이터가 판단을 크게 바꿀 수 있는 고변동 후보군이다.

[brown: 지금은 어느 AI가 가장 똑똑한가보다 어느 후보가 인간에서 효능을 보였고 다음 데이터까지 버틸 현금이 있는가를 물어야 한다.]

## 판단을 바꿀 신호

1. rentosertib가 더 크고 긴 무작위 시험에서 FVC 이점을 재현한다.
2. GB-0895가 Phase 3에서 천식 악화를 유의하게 줄이고 6개월 투여의 안전성을 확인한다.
3. Isomorphic이 2026년 말까지 실제 후보와 임상 등록을 공개한다.
4. 여러 AI 발굴 약물의 Phase 2 성공률이 동시대 대조군보다 일관되게 높아진다.
5. 대형 제약사 계약에서 선불금과 공동개발 비용 분담 비중이 올라간다.
6. 상장사가 핵심 데이터 전 과도한 증자 없이 24개월 이상 런웨이를 유지한다.

## Risks

- `AI-designed`의 정의가 회사마다 달라 기업 간 비교가 어렵다.
- 구조·결합 예측의 향상이 표적의 인간 질병 인과성을 보장하지 않는다.
- 작은 초기 임상은 효과 크기를 과대평가할 수 있다.
- Phase 3 진입은 승인과 매출을 뜻하지 않는다.
- 상장 바이오텍은 임상 실패뿐 아니라 증자와 파트너 계약 지연에도 크게 흔들린다.
- 비상장 선두 기업은 과학적으로 중요해도 일반 투자자의 직접 투자 대상이 아니다.

## Sources

- Nature Medicine, 2025-06-03, [A generative AI-discovered TNIK inhibitor for idiopathic pulmonary fibrosis: a randomized phase 2a trial](https://www.nature.com/articles/s41591-025-03743-2)
- Nature Reviews Drug Discovery, 2026-08, [Artificial intelligence in drug discovery — what it is, where we stand and the path forward](https://www.nature.com/articles/s41573-026-01496-2)
- Drug Discovery Today, 2024, [How successful are AI-discovered drugs in clinical trials?](https://www.sciencedirect.com/science/article/pii/S135964462400134X)
- EMBL-EBI, 2026 확인, [What AlphaFold 3 struggles with](https://www.ebi.ac.uk/training/online/courses/alphafold/alphafold-3-and-alphafold-server/introducing-alphafold-3/what-alphafold-3-struggles-with/)
- Generate:Biomedicines, 2025-12-01, [GB-0895 Phase 3 studies](https://generatebiomedicines.com/news-releases/generatebiomedicines-to-initiate-global-phase-3-studies-of-gb-0895-a-long-acting-anti-tslp-antibody-for-severe-asthma-engineered-with-ai/)
- Generate:Biomedicines, 2026-02-26, [IPO pricing](https://generatebiomedicines.com/news-releases/generate-biomedicines-inc-announces-pricing-of-initial-public-offering/)
- Insilico Medicine, 2026, [2026 first-half interim results](https://insilico.com/news/s11n46hx31-commercialization-roadmap-validated-with)
- Insilico Medicine, 2026-03, [Global R&D collaboration with Lilly](https://insilico.com/news/uiy12zcjg1-insilico-medicine-announces-global-rampd)
- Isomorphic Labs, 2026-05-12, [Series B funding](https://www.isomorphiclabs.com/press/isomorphic-labs-funding)
- Isomorphic Labs, 2026-02-10, [IsoDDE](https://www.isomorphiclabs.com/articles/the-isomorphic-labs-drug-design-engine-unlocks-a-new-frontier)
- Recursion, 2026-08-05, [Second quarter 2026 results](https://ir.recursion.com/news-releases/news-release-details/recursion-reports-second-quarter-financial-results-genentech)
- Relay Therapeutics, 2026-08-06, [Second quarter 2026 results](https://ir.relaytx.com/news-releases/news-release-details/relay-therapeutics-reports-second-quarter-2026-financial-results)
- Schrödinger, 2026-08-05, [Second quarter 2026 results](https://ir.schrodinger.com/press-releases/news-details/2026/Schrdinger-Reports-Second-Quarter-2026-Financial-Results/)
- Schrödinger, 2025-08-14, [Discontinuation of SGR-2921](https://ir.schrodinger.com/press-releases/news-details/2025/Schrdinger-Announces-Discontinuation-of-SGR-2921-Program/default.aspx)
- Absci, 2026-06-24, [Interim Phase 1 data for ABS-201](https://investors.absci.com/news-releases/news-release-details/absci-announces-positive-interim-phase-1-data-headlinetm-trial)
- BenevolentAI / Euronext, 2025-03-12, [Delisting announcement](https://live.euronext.com/en/products/equities/company-news/2025-03-12-result-extraordinary-general-meeting-and-delisting)
