# SMR 3편 Data Pack: HALEU와 TRISO

기준일: 2026-07-04

## 1. Sector Definition

질문: **HALEU와 TRISO는 왜 SMR 시대의 숨은 병목인가?**

작업 답변: SMR의 병목은 설계 인증만이 아니다. 특히 비경수로형 SMR과 마이크로리액터에서는 `우라늄 확보 -> 전환 -> 농축(HALEU) -> deconversion -> 연료 제조(TRISO/금속/산화물 등) -> 성능검증·인허가 -> 운송·저장` 체인이 실제 배치 속도를 제한할 수 있다.

이 자료팩의 범위:

- 포함: HALEU 정의, 공급망 단계, DOE 프로그램, TRISO 연료의 의미, 노형별 연료 병목, 투자 관점의 노출 경로
- 제외: 우라늄 현물가격 전망, 러시아 제재 세부 법률 해석, 기업별 재무모델, 한국 원전연료 시장 규모 추정
- 원칙: 공식 출처가 없는 SMR별 연료 소요량, HALEU 가격, TRISO 제조원가, 마진은 `not separately disclosed`로 둔다.

## 2. Source Window

| 항목 | 기준 |
|---|---|
| 자료 기준일 | 2026-07-04 |
| 핵심 공식 출처 | U.S. DOE, U.S. NRC, World Nuclear Association, X-energy, Kairos Power, TerraPower |
| 주요 시간축 | DOE HALEU 설명자료 2024-12-03, DOE HALEU enrichment task order 2026-01-05, NRC TRISO-X licensing 페이지 확인일 2026-07-04 |
| 한국-only 시장규모 | not separately disclosed |

## 3. Market Metrics

| Metric | Value | Date | Source | Notes |
|---|---:|---|---|---|
| HALEU 농축도 정의 | U-235 `>5%` and `<20%`; DOE enrichment services page uses `5% to 19.75%` | DOE page checked 2026-07-04 | [DOE HALEU explainer](https://www.energy.gov/ne/articles/what-high-assay-low-enriched-uranium-haleu), [DOE HALEU enrichment services](https://www.energy.gov/ne/haleu-enrichment-services) | 기존 상업용 대형 원전 연료는 주로 최대 5% 이하 LEU |
| 미국 내 HALEU 잠재 수요 | `50 metric tons/year` by 2035 | DOE page dated 2024-12-03, checked 2026-07-04 | [DOE HALEU explainer](https://www.energy.gov/ne/articles/what-high-assay-low-enriched-uranium-haleu) | DOE 추정치. 상업 프로젝트 속도에 따라 달라질 수 있음 |
| INL DOE material route | up to `10 metric tons` of HALEU | DOE page dated 2024-12-03, checked 2026-07-04 | [DOE HALEU explainer](https://www.energy.gov/ne/articles/what-high-assay-low-enriched-uranium-haleu) | 시험·데모용 near-term 물량 성격 |
| Piketon demonstration | 16 advanced centrifuges; `>100 kg` HALEU enriched; expected ramp to `900 kg` | DOE page dated 2024-12-03, checked 2026-07-04 | [DOE HALEU explainer](https://www.energy.gov/ne/articles/what-high-assay-low-enriched-uranium-haleu) | 50 t/year 잠재 수요와 비교하면 아직 데모 규모 |
| DOE enrichment infrastructure allocation | `$2.7 billion` planned for LEU and HALEU infrastructure capabilities | DOE page checked 2026-07-04 | [DOE HALEU enrichment services](https://www.energy.gov/ne/haleu-enrichment-services) | 미국 내 농축 공급망 보강 |
| DOE enrichment task orders | American Centrifuge Operating `$900 million`; General Matter `$900 million` | 2026-01-05 | [DOE HALEU enrichment services](https://www.energy.gov/ne/haleu-enrichment-services) | 10년간 미국 HALEU enrichment capacity 확대 목적 |
| DOE deconversion contracts | 6 awardees; up to `$800 million`; up to 10 years | DOE page checked 2026-07-04 | [DOE HALEU deconversion services](https://www.energy.gov/ne/haleu-deconversion-services) | UF6를 금속·산화물 등 연료 제조용 형태로 바꾸는 단계 |
| SMR designs using HALEU | More than half of SMR designs in development may need HALEU | WNA page checked 2026-07-04 | [World Nuclear Association SMR page](https://world-nuclear.org/information-library/nuclear-power-reactors/small-modular-reactors/small-modular-reactors) | WNA 기준. 프로젝트별 실제 연료 요구는 개별 확인 필요 |
| TRISO-X licensing status | Licensing | NRC page checked 2026-07-04 | [NRC TRISO-X](https://www.nrc.gov/info-finder/fc/triso-x) | Oak Ridge, TN fuel fabrication facility. 상업 운전 상태로 쓰면 안 됨 |

## 4. Policy and Regulatory Timeline

- 2020: U.S. Energy Act of 2020이 HALEU Availability Program 설치를 지시. 목적은 민간 R&D, 데모, 상업용 사용을 위한 HALEU 접근성 확보. Source: [DOE HALEU Availability Program](https://www.energy.gov/ne/haleu-availability-program)
- 2022-08-09: TRISO-X가 NRC에 Oak Ridge fuel fabrication facility license application 제출. Source: [NRC TRISO-X](https://www.nrc.gov/info-finder/fc/triso-x)
- 2022-11-18: NRC가 TRISO-X license application을 docketing accepted. Source: [NRC TRISO-X](https://www.nrc.gov/info-finder/fc/triso-x)
- 2023-10: Centrus Energy가 미국 demonstration-scale cascade에서 HALEU 생산 시작. Source: [World Nuclear Association SMR page](https://world-nuclear.org/information-library/nuclear-power-reactors/small-modular-reactors/small-modular-reactors)
- 2024: DOE가 HALEU enrichment와 deconversion 서비스 첫 계약 체인을 시작. Source: [DOE HALEU explainer](https://www.energy.gov/ne/articles/what-high-assay-low-enriched-uranium-haleu)
- 2026-01-05: DOE가 American Centrifuge Operating 및 General Matter에 각각 $900 million task order를 finalization. Source: [DOE HALEU enrichment services](https://www.energy.gov/ne/haleu-enrichment-services)
- 2026-07-04 확인: NRC TRISO-X 페이지의 current life-cycle status는 `Licensing`. Source: [NRC TRISO-X](https://www.nrc.gov/info-finder/fc/triso-x)

## 5. Value-Chain Map

| 단계 | 역할 | 병목 포인트 | 공개 상태 |
|---|---|---|---|
| 우라늄 채굴·정련 | 천연우라늄 공급 | 원료 가격, 지정학, 장기계약 | 이 자료팩에서 가격 전망 제외 |
| 전환 | U3O8 등을 UF6로 전환 | 서방 전환 설비 capacity | 노형별 소요량 not separately disclosed |
| 농축 | LEU 또는 HALEU 생산 | HALEU commercial supply 부족, 투자 신호 부족, 인허가 | DOE는 미국 내 HALEU 공급이 현재 충분하지 않다고 설명 |
| deconversion | HALEU UF6를 금속·산화물 등으로 전환 | 연료 제조 전 필수 연결고리 | DOE가 최대 $800 million deconversion 계약 체인 운영 |
| 연료 제조 | TRISO, 금속연료, 산화물 연료 등 | 수율, 품질관리, NRC licensing, qualification | TRISO-X facility는 NRC 기준 `Licensing` |
| 원자로 설계·인허가 | 노형별 fuel qualification 포함 | 설계 인허가와 연료 인허가의 동시 진행 | 노형별 단계 상이 |
| 운송·저장 | HALEU와 신형 연료 운송 | 새로운/수정된 운송 용기와 규정 필요 | WNA가 HALEU 대량 운송 인프라 필요성 지적 |

## 6. Reactor and Fuel Exposure Map

| 노형/프로젝트 | HALEU 의존도 | TRISO 의존도 | 확인 근거 | 투자 해석 |
|---|---|---|---|---|
| Light-water SMR 일반 | 낮음~중간 | 낮음 | WNA는 near-term SMR 다수가 기존 water-cooled 기술 기반이고 simplified LWR는 같은 유형의 LEU fuel을 사용한다고 설명 | NuScale, BWRX 계열을 볼 때 1차 병목은 연료보다 인허가, EPC, FOAK cost일 가능성 |
| X-energy Xe-100 | 높음 | 높음 | DOE HALEU Consortium은 Xe-100이 HALEU를 필요로 한다고 명시. X-energy는 Xe-100이 TRISO-X fuel을 쓴다고 설명 | HALEU와 TRISO-X facility 양쪽이 배치 속도 변수 |
| Kairos KP-FHR | 중간~높음 | 높음 | Kairos는 commercial reactor fuel form을 TRISO annular pebble fuel, enrichment level을 19.75%로 제시하고 LEU+ 운전 가능성을 주석 처리 | HALEU가 넓게 풀리기 전에는 LEU+ 운전 여지가 있지만 TRISO 제조·검증은 핵심 |
| TerraPower Natrium | 높음 | 낮음 | DOE HALEU Consortium은 Natrium이 HALEU를 필요로 한다고 설명. TerraPower는 Natrium Fuel Fabrication Facility를 FOAK scope에 포함 | TRISO보다는 HALEU 및 Natrium fuel qualification 병목 |
| Microreactor / Project Pele type | 높음 | 높음 | WNA는 일부 이동형·마이크로 원전이 HALEU TRISO fuel을 요구한다고 설명 | 국방·원격지 수요는 강하지만 연료/운송/안보 규제가 핵심 |

## 7. Representative Companies and Institutions

| Company / Institution | Role | Exposure Type | Source Date | Notes |
|---|---|---|---|---|
| U.S. DOE | HALEU Availability Program, enrichment/deconversion contracting | Policy / demand catalyst | 2026-07-04 checked | 초기 공급자·시장조성자 역할을 줄이고 민간 투자 유도 목표 |
| American Centrifuge Operating | DOE HALEU enrichment task order awardee | Direct HALEU enrichment | 2026-01-05 | DOE task order `$900 million`; public-company look-through requires separate verification |
| General Matter | DOE HALEU enrichment task order awardee | Direct HALEU enrichment | 2026-01-05 | DOE task order `$900 million`; private/public status not verified in this pack |
| Louisiana Energy Services | DOE enrichment selected vendor | Potential enrichment bidder | 2024 selection | 향후 task order eligible, pending appropriations |
| Orano Federal Services | DOE enrichment selected vendor and deconversion awardee | Nuclear fuel-cycle services | 2024 selection / 2026 checked | 미국 federal services entity 기준 |
| Nuclear Fuel Services | DOE deconversion awardee | HALEU deconversion | 2026-07-04 checked | corporate parent exposure not separately verified here |
| Framatome | DOE deconversion awardee | HALEU deconversion | 2026-07-04 checked | 비상장/상장 노출은 별도 확인 필요 |
| Global Nuclear Fuel-Americas | DOE deconversion awardee | HALEU deconversion | 2026-07-04 checked | corporate parent exposure not separately verified here |
| Westinghouse Government Services | DOE deconversion awardee | HALEU deconversion | 2026-07-04 checked | 비상장 노출 성격 |
| X-energy / TRISO-X | Xe-100 developer and TRISO-X fuel developer | Reactor + TRISO fuel integration | 2026-07-04 checked | NRC TRISO-X facility status는 `Licensing` |
| Kairos Power | KP-FHR developer | TRISO pebble / molten-salt reactor | 2026-07-04 checked | 19.75% enrichment level, LEU+ option noted by company |
| TerraPower | Natrium developer | HALEU-dependent fast reactor | 2026-07-04 checked | Natrium Fuel Fabrication Facility 포함 |
| 두산에너빌리티 | 원전 기자재·SMR 기자재 옵션 | Indirect / equipment, not HALEU-TRISO pure play | 2026-07-04 checked in SMR 2편 | HALEU/TRISO 공급망 직접 수혜주로 분류하면 과장 |

## 8. Known Gaps

- 한국 상장사 기준 HALEU/TRISO 순수 노출은 이 자료팩의 공식 출처 세트에서 확인되지 않는다.
- HALEU 장기 가격, 고객별 offtake 계약, 프로젝트별 fuel loading schedule은 not separately disclosed.
- TRISO 상업 생산 capacity, 수율, 원가, 마진은 not separately disclosed.
- DOE 계약 규모는 공급망 구축의 정책 신호이지, 각 기업의 매출 인식 시점이나 수익성을 의미하지 않는다.
- X-energy, Kairos, TerraPower의 회사 발표는 기술·사업 설명으로 유용하지만, 원가·일정·성능 주장은 독립 검증이 필요하다.
- World Nuclear Association의 "more than half of SMR designs"는 산업 개관 지표다. 특정 SMR 투자 판단에는 프로젝트별 fuel specification 확인이 필요하다.

## 9. Source Map

| Source | Role | URL |
|---|---|---|
| U.S. DOE, What is HALEU? | HALEU 정의, 수요 추정, INL/Centrus near-term supply | https://www.energy.gov/ne/articles/what-high-assay-low-enriched-uranium-haleu |
| U.S. DOE, HALEU Availability Program | 정책 프로그램 목적과 필요성 | https://www.energy.gov/ne/haleu-availability-program |
| U.S. DOE, HALEU Enrichment Services | enrichment vendors, $2.7B allocation, 2026 task orders | https://www.energy.gov/ne/haleu-enrichment-services |
| U.S. DOE, HALEU Deconversion Services | deconversion awardees, up to $800M program | https://www.energy.gov/ne/haleu-deconversion-services |
| U.S. DOE, HALEU Consortium | Xe-100 and Natrium HALEU dependence | https://www.energy.gov/ne/us-department-energy-haleu-consortium |
| U.S. DOE, TRISO particles | TRISO 구조와 안전성 설명 | https://www.energy.gov/ne/articles/triso-particles-most-robust-nuclear-fuel-earth |
| U.S. NRC, TRISO-X | TRISO-X fuel fabrication facility licensing status | https://www.nrc.gov/info-finder/fc/triso-x |
| World Nuclear Association, SMR | SMR 노형과 HALEU 공급망 개관 | https://world-nuclear.org/information-library/nuclear-power-reactors/small-modular-reactors/small-modular-reactors |
| X-energy, Xe-100 | Xe-100 output, TRISO-X use | https://x-energy.com/xe-100/ |
| X-energy, TRISO-X Fuel | TRISO-X fuel and HALEU description | https://x-energy.com/triso-x-fuel/ |
| Kairos Power, Technology | KP-FHR TRISO pebble fuel, 19.75%, LEU+ note | https://www.kairospower.com/technology |
| TerraPower, Natrium | Natrium FOAK scope, fuel fabrication facility, 345 MW reactor | https://www.terrapower.com/natrium/ |
