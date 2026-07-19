# 800Vdc 전력 인프라 — 데이터 팩 / 사실 검증 로그

기준일: 2026-06-29
범위: AI 데이터센터 전력 + 전기차(EV)/충전 인프라의 800Vdc(및 1,000V) 전환과 관련 상장사 노출도
용도: `800Vdc 전력인프라.md` 테마 포스트의 입력. 본 문서는 해석이 아니라 출처·날짜가 붙은 사실 기록.

---

## 1. 핵심 주장 검증표 (지표 | 값 | 날짜 | 출처 | 비고)

### 데이터센터

| 지표 | 값 | 날짜 | 출처 | 비고 |
|---|---|---|---|---|
| NVIDIA VR200 NVL72(Oberon) 양산 | 풀 프로덕션 진입, 물량 출하 2026 하반기 | 2026-01 (CES) | SemiAnalysis "Vera Rubin Extreme Co-Design", AI Weekly | 랙 ~190~230kW(CPX 변형 ~370kW) — 아직 네이티브 800Vdc 아님 |
| 네이티브 800Vdc·Kyber(Rubin Ultra) | 랙 ~600kW, 이후 1MW급 | 2027 (계획) | SemiAnalysis, DCD | **계획**. 800VDC + 100% 액냉 요구 |
| NVIDIA 800VDC "최대 1년 지연" 관측 | 대량 배포 2028+로 밀릴 수 있음 | 2026-06-11 | Digitimes | **시장 관측**(공급사 "계획 불명확"), 확정 아님 |
| NVIDIA–Navitas 800V HVDC 협력 | Kyber/Rubin Ultra용 GaN·SiC | 2025-05-21 | Navitas IR / SEC 8-K, GlobeNewswire | 13.8kV→800Vdc 경계 변환(정류기·SST) |
| NVIDIA 800VDC 효익 | 종단 효율 최대 5%↑, 유지보수 최대 70%↓, 구리 45%↓, 동일 도체 85% 더 송전 | 2025~2026 | NVIDIA 블로그 / Navitas 보도자료 | **NVIDIA·파트너 자체 추정**, "최대(up to)" 한정어 |
| OCP Diablo 400(Mt Diablo) v0.5.2 | ±400Vdc 또는 800Vdc, 100kW~1MW 랙 | 2025-05-30 | OCP 사양 문서 | Google·Meta·MS 공저. 400V 공칭=EV 공급망 활용. 종단 효율 ~3%↑ |
| UL 857(부스웨이) 14판 | DC 상한 600→**1000Vdc** | 2025 | UL Solutions / DCD | 15판(개발 중) 1500Vdc 목표. 코드화가 기술보다 뒤처짐 |
| SemiAnalysis 800VDC 증분 용량 | 2030년 ~**39GW** | 2026 (5월경) | SemiAnalysis "Inside the 800VDC Revolution" | **단일 분석사 모델 추정** |
| SemiAnalysis 사이드카(전원 랙) TAM | 2028년 ~**$11B** 정점 후 감소 | 2026 | SemiAnalysis | 시설 단위 800Vdc로 비중 이동 |
| SemiAnalysis SST TAM | 2030년 ~**$32B** | 2026 | SemiAnalysis | 자료/판본별 편차(사용자 초안은 $13B 인용) — 단일 분석사 추정 |
| 데이터센터 SST UL 인증 | 2026-05 기준 **완료 벤더 없음**, 대규모 채택 2029+ 전망 | 2026-05 | SemiAnalysis | 표준 미비가 병목 |

### 전기차 / 충전

| 지표 | 값 | 날짜 | 출처 | 비고 |
|---|---|---|---|---|
| BYD Super e-Platform | 세계 첫 양산 1,000V 풀도메인, 1,000A·10C·1MW, "5분 400km" | 2025-03-17 | BYD 공식 / Electrek | **피크 사양**. SiC 칩. 첫 적용 Han L·Tang L |
| BYD Flash Charging 2.0(차세대) | 피크 1,500kW·1,500A, 10→70% 5분·10→97% 9분 | 2026-02 유출 | CarNewsChina | **피크 사양** |
| BYD Flash Charger 배포 | 5,000기 돌파(출시 27일 만, 297개 도시), 5월 5,715기 | 2026-04-01 / 05-05 | CnEVPost, CarNewsChina | **BYD 자체 집계** |
| BYD 배포 목표 | 중국 2만기(상업 협력 1.8만 포함) 2026 말, 해외 6,000기(유럽 2026 중반~) | 2026-04 | CarNewsChina | 목표치 |
| BYD Flash Charger 그리드 완충 | 현장 ESS(190kWh Blade 2.0 ×2)로 1MW 충전이 1MW 그리드 불필요 | 2026 | CarNewsChina, evchargingstations | DC ESS 완충 = 데이터센터와 동일 해법 |
| 中 800V 승용차 판매 | 2024년 **84만 대(+185%)**, 침투율 **6.9%** | 2025-10-21 | ResearchAndMarkets 보고서 | 모델 수 13(2022)→47(2024)→70+(2025 중반) |
| 中 800V 침투율 전망 | 2025년 9.5% → 2030년 **>35%** | 2025-10-21 | ResearchAndMarkets | 800V 차량 RMB10~15만대까지 하향(Leapmotor B01) |
| Tesla Supercharger V4(진짜) | 첫 풀 V4 스테이션(Redwood City), 차량 최대 500kW, 캐비닛 1.2MW, **최대 1000V 지원**, 8스톨 | 2025-09-29 | Electrek, TeslaNorth | 美 ~10개소(2025). 표준 Model S/3/X/Y는 여전히 400V/250kW |
| IEA 초고속(150kW+) 충전기 | 2024년 +50% 증가, 공공 급속의 ~**10%** | 2025-05 (GEO 2025) | IEA Global EV Outlook 2025 | "초고속" 정의 출처별 상이(150kW+ vs 350kW+) |
| EU AFIR | TEN-T 핵심망 60km마다 150kW+ 충전소, 스테이션 최소 400kW(2027말 600kW) | 2025 | IEA/AFIR | |
| 한국 800V 양산 차량 | 현대 E-GMP(아이오닉5/6/9, 기아 EV6/EV9, 제네시스), 포르쉐 타이칸, 아우디 e-tron GT, 루시드(~900V) | 2026 현재 | 다수 | 800V는 이미 양산 주류 |

---

## 2. 투자 종목 맵 — 노출도 검증 (직접 / 부분 / 간접)

노출도 정의: **직접**=핵심 제품군이 800Vdc/AI 전력·고전압 EV에 직결, **부분**=여러 사업부 중 하나·인접, **간접**=테마 연관이나 확정 매출 기여 미확인.

### GaN 전력반도체

| 회사 (티커) | 무엇을 만드나 | 노출도 | 근거·날짜 |
|---|---|---|---|
| Navitas (NVTS, 나스닥) | GaN+SiC, 800V 6V/50V DC-DC(98.5% 피크) | **직접** | NVIDIA 800V HVDC 협력사 선정, 2025-05-21 |
| Power Integrations (POWI, 나스닥) | 고전압 전력변환 IC | 부분 | 고압 전력변환 일반, 데이터센터 비중 미공개 |
| Infineon (IFX/IFNNY) | GaN+SiC 전력반도체 전 영역 | **직접** | 800Vdc 핫스왑·IBC 솔루션 발표 |
| Innoscience (HK 2577) | GaN 전력반도체 | 부분 | GaN 순수 플레이, 데이터센터 확장 중 |
| Texas Instruments (TXN) | GaN 통합 버스 컨버터 등 | 부분 | GTC 2026 800Vdc 아키텍처 |
| **RFHIC (218410, 코스닥)** | **RF/마이크로파 GaN**(5G 기지국·레이더·EW) | **간접(주의)** | rfhic.com — **전력 GaN 아님**. 800Vdc 데이터센터/EV 전력과 직접 연관 없음. "GaN" 키워드로 묶이나 응용 영역 다름 |

### SiC 전력반도체 / 소재

| 회사 (티커) | 무엇을 만드나 | 노출도 | 근거·날짜 |
|---|---|---|---|
| onsemi (ON) | SiC MOSFET/모듈 | **직접** | EV·산업·데이터센터 SiC 주력 |
| Wolfspeed (WOLF) | SiC 웨이퍼·디바이스 | 부분(고위험) | **2025년 Chapter 11 후 재상장 — 재무 위험 높음**(디일렉 보도) |
| STMicroelectronics (STM) | SiC, NVIDIA 12kW 전원보드 | **직접** | NVIDIA 검증 후 생산 테스트 |
| ROHM (6963, 도쿄) | SiC MOSFET | 부분 | EV·산업 SiC |
| Renesas (6723, 도쿄) | 전력·MCU | 간접 | |
| **DB하이텍 (000990, 코스피)** | 8인치 파운드리, **SiC·GaN 신사업 준비** | 부분(초기) | 음성 상우공장 SiC 장비 도입, SK실트론CSS·Soitec 웨이퍼 확보 — **초기 단계** |
| SK실트론 / SK실트론CSS / SK파워텍 | SiC 잉곳·웨이퍼·디바이스 | (비상장) | SK그룹 — **KRX 직접 투자 불가**. 인피니언 장기공급(2024-01) |

> 한국 SiC는 핵심 밸류체인(SK실트론·SK파워텍)이 **비상장**이라 순수 KRX 플레이가 적다. DB하이텍이 그나마 상장 노출이나 초기 단계.

### 전력기기 · 변압기 · SST · 부스웨이

| 회사 (티커) | 무엇을 만드나 | 노출도 | 근거·날짜 |
|---|---|---|---|
| Eaton (ETN) | grid-to-chip, "Beam Rubin DSX" | **직접** | GTC 2026(2026-03) NVIDIA 레퍼런스 통합 |
| Vertiv (VRT) | 중앙 정류기·DC 부스웨이·랙 솔루션 | **직접** | NVIDIA 제휴, 800Vdc 포트폴리오 2026 하반기 상용 |
| Delta Electronics (2308, 대만) | 800Vdc In-Row 전원 랙·CDU·SST | **직접** | GTC 2026 |
| ABB / Schneider (ABBNY / SU.PA) | SSCB·SST·전력배전 | 부분 | LVDC·사이드카 |
| Hitachi Energy (히타치 6501) | 변압기·그리드 | 부분 | |
| GE Vernova (GEV) | 그리드·전력장비 | 부분 | AI 전력 인프라 |
| **LS ELECTRIC (010120)** | 변압기·배전·HVDC | **직접(부분)** | 北美 데이터센터 수주 ₩4,893억(2026-04), Q1 신규수주 ₩1.09조 |
| **HD현대일렉트릭 (267260)** | 초고압 변압기 | **직접(부분)** | Q1 신규수주 $17.97억(분기 최대), 2026-02 |
| **효성중공업 (298040)** | 변압기·STATCOM·ESS | **직접(부분)** | 765kV 변압기 ₩7,870억(2026-02), 중공업 신규수주 ₩4.17조 |
| 일진전기 (103590) | 변압기·전선 | 부분 | 4사 공동 대용량 변환변압기 개발(~2027) |
| 제룡전기 (033100) | 변압기(美 수출) | 부분 | 美 변압기 수출 사이클 |
| 대한전선/가온전선 | 전선·케이블 | 간접 | |

> 한국 전력기기 3사(LS·HD현대·효성)의 1차 동력은 **글로벌 그리드·변압기 수출 + AI 데이터센터 전력 수요**다. "800Vdc" 자체보다 **데이터센터로 가는 중전압 AC 전력 인프라**에 직결. 800Vdc 변환(SST/정류기) 국산화는 4사 공동개발(~2027)로 **진행 중**.

### 슈퍼커패시터 · BBU (전력 변동 완충 / 800V 캡뱅크)

| 회사 (티커) | 무엇을 만드나 | 노출도 | 근거·날짜 |
|---|---|---|---|
| **LS머트리얼즈 (417200, 코스닥)** | 울트라커패시터(LIC) | **직접** | Vertiv와 AI 데이터센터 UPS용 슈퍼커패시터 공급 MOU, 2024-09. 600만 회 수명 |
| **비나텍 (126340, 코스닥)** | 슈퍼커패시터·수소연료전지 소재 | **부분** | 데이터센터 슈퍼커패시터 공급계약 공시(2025-06), Bloom Energy 비상전원 독점공급(2025-05) |

> 데이터센터·메가와트 충전 둘 다 **밀리초 전력 변동을 ESS/슈퍼커패시터로 완충**한다는 공통 구조 → 한국 상장사가 실제 글로벌 공급계약으로 연결된 드문 직접 고리.

---

## 3. 알려진 공백 / 주의

- **NVIDIA 2027 Kyber 일정**과 **"1년 지연설"**은 둘 다 미확정: 전자=NVIDIA 계획, 후자=Digitimes 관측(2026-06-11).
- **BYD 수치**(1,500kW, "5분 400km", 5,000기)는 피크 사양·자체 집계 — 독립 검증 아님.
- **시장 규모 추정**(SemiAnalysis 39GW/$11B/$32B, 800V EV 시장 $30~50억·CAGR 21~28%)은 단일 분석사 또는 방법론 불투명 시장조사사 수치 → "방향성 참고".
- **종목 매출 기여**: 한국 전력기기사의 데이터센터·800Vdc 매출 비중은 대부분 **미공개**. 노출도 라벨은 사업 연관성이지 확정 실적이 아님.
- **RFHIC**는 GaN이지만 RF용 — 800Vdc 전력 테마와 직접 연관 없음(오분류 주의).
- **Wolfspeed**는 2025년 Chapter 11을 거쳐 재무 위험이 크다.
- 한국 **SiC 핵심 밸류체인 비상장**(SK실트론·SK파워텍) — KRX 직접 노출 제한적.

## 4. 주요 출처

- NVIDIA / SemiAnalysis: SemiAnalysis "Inside the 800VDC Revolution", "Vera Rubin Extreme Co-Design" (newsletter.semianalysis.com)
- Navitas IR / SEC 8-K (2025-05-21), GlobeNewswire
- OCP Diablo 400 v0.5.2 사양 (opencompute.org, 2025-05-30)
- UL Solutions / DataCenterDynamics(UL 857, 800VDC 표준)
- Digitimes(2026-06-11, 800VDC 일정 관측)
- BYD 공식(2025-03-17), Electrek, CarNewsChina, CnEVPost
- ResearchAndMarkets "NEV 800-1000V High-Voltage Architecture Report 2025"(2025-10-21)
- IEA Global EV Outlook 2025(2025-05)
- Electrek / TeslaNorth(V4, 2025-09-29)
- 국내 전력기기: ZDNet Korea, 이투데이, 다음/뉴스(2026-02~06)
- 슈퍼커패시터: thebell(2025-10), 글로벌이코노믹(2025-06), 삼성증권 리포트
- 한국 SiC: 디일렉/THE ELEC, KIPOST, 전자신문
