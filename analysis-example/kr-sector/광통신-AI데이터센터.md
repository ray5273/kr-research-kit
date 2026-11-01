# 광통신 — AI 데이터센터 광모듈/트랜시버 섹터 (1편: 섹터 구조와 한국 포지션)

기준일: 2026-07-25

> 시리즈 안내: **1편(이 글)** = 섹터 구조·기술·한국 상장사 노출 진위. **2편** = 글로벌 광통신 업체 심층(Innolight·Coherent·Lumentum·Marvell·Broadcom·Fabrinet·Ciena). 데이터팩: `광통신-AI데이터센터-data-pack.md`.
>
> 표기: **[C]** = 확정(공시·실적발표·표준/벤더 발표) · **[E]** = 추정(애널리스트·시장조사). 시장규모·점유율·2027+ 전망은 대부분 추정임.

---

## 소개 및 연구 가정

"광통신"은 한국 증시에서 세 갈래로 갈라진다 — ① 전통 광섬유·통신 인프라, ② 통신사 전송장비, ③ **AI 데이터센터 광인터커넥트(광모듈·광트랜시버)**. 이 리포트는 ③에 한정한다. 2024년 이후 광통신 관련주 랠리의 실체는 통신 CAPEX가 아니라 **엔비디아·하이퍼스케일러의 AI 데이터센터 투자**이기 때문이다.

핵심 가정 두 가지를 먼저 못박는다.
1. 수요는 확실하다. 하이퍼스케일러 Big4 2026 capex 가이던스 합계 ~$725B(+77% YoY), 이 중 ~75%가 AI. [C]
2. 그러나 "한국 광통신주 = AI 수혜"는 대부분 과장이다. 한국사의 실제 매출 노출과 주가에 반영된 기대 사이의 간극이 이 리포트의 핵심 논점이다.

## 연구 범위와 방법론

- **In:** 광트랜시버 완제품, 핵심 광부품(EML/DFB 레이저·TOSA/ROSA·PD), 광 DSP, 실리콘포토닉스/CPO, 고밀도 DC 광케이블.
- **Out(배경만):** 통신사 CAPEX·FTTH·해저케이블, 5G 유선 전송장비, AI 서버/스위치 PCB(이수페타시스 = 인접 노드로만), 반도체 테스트(티에프이 등 = 광통신 아님).
- **소스 순위:** DART/KIND 공시·상장사 IR → 글로벌사 실적발표·표준(OIF/OpenROADM)·벤더 발표(Nvidia/Broadcom) → 산업 리서치(LightCounting·Dell'Oro, 추정 표기) → 전문지. 한국 개별사 근거 다수가 뉴스/공시요약 기반이라, 발행·투자 판단 전 DART 원문 교차검증을 전제로 한다.
- **한국-only 시장규모:** 별도로 깔끔히 공개된 수치 없음(`not separately disclosed`). 글로벌 수치를 한국 수치로 오용하지 않는다.

## 행정/정책 개요

이 섹터는 정책 주도가 아니라 **민간 AI capex 주도**다. 한국 정부 정책(K-클라우드, AI 반도체 지원 등)은 배경 변수이고, 실질 드라이버는 미국 하이퍼스케일러 발주와 엔비디아 로드맵이다. 다만 두 가지 정책성 변수는 봐둘 값어치가 있다.
- **미·중 무역 마찰:** 중국 모듈사(中际旭创·新易盛) 과점 구조에서 대미 수출 규제가 강화되면 한국·일본 2nd-source 기회가 열린다 — 한국의 몇 안 되는 구조적 기회. [E]
- **삼성 파운드리 실리콘포토닉스 로드맵:** PIC 2026 → OE 2027 → CPO turnkey 2029 목표(발표 단계, 고객사 미공개). 국가 반도체 밸류체인과 연결되나 TSMC 대비 수년 후행. [C 발표/E 실현]

## 시장 풍경

| 지표 | 값 | 시점 | 소스 | C/E |
|---|---|---|---|---|
| AI-cluster/datacom 트랜시버 시장 | $16.5B(2025) → ~$26B(2026), +~60% | 2025–26 | LightCounting | E |
| Ethernet 트랜시버 성장 | 2024 2배 → 2025 +70% → 2026 +60%(공급 제약) | 2024–26 | LightCounting | C/E |
| 800G+ 출하 | ~24M(2025) → ~63M units(2026), ~2.6× | 2025–26 | LightCounting-cited | E |
| 1.6T 모듈 출하 | <1M(2025) → 30M+ units(2026), "1.6T의 해" | 2025–26 | LightCounting | C시작/E램프 |
| 하이퍼스케일러 Big4 capex | ~$725B(2026) vs ~$410B(2025), +77% | 2026 | 각사 가이던스 | C |
| 광모듈 attach(scale-out) | GPU당 1개, 대형 다층 팹 최대 6개 | 2025–26 | SemiAnalysis/LightCounting | C/E |

한 줄 요약: **GPU 1개가 scale-out 광모듈 ≥1개를 끌고 오고(대형 팹 최대 6개), 세대전환(400→800→1.6T)마다 lane당 단가가 대략 2배씩 오른다.** 2026년 +60% 성장은 수요가 아니라 **공급(EML 레이저·스위치 ASIC)이 병목**이다. 시장은 고도로 집중(중국 조립 과점 + 미·일 상단 과점)돼 있고 자본집약적이다.

## 성장 드라이버와 제약

**드라이버 (durable)**
1. **하이퍼스케일러 capex 슈퍼사이클** — Big4 $725B(+77%), + 브로드컴/커스텀ASIC(Google TPU·Meta MTIA·Amazon Trainium) Ethernet 팹이 엔비디아와 **별도 수요풀** 형성. [C]
2. **세대전환 = 단가 상승** — 800G(현 기본) → 1.6T(2026 "수천만개") 이동은 물량+ASP 동시 성장. [C/E]
3. **attach ratio 상승** — scale-out 팹 대형화로 GPU당 광모듈 수 증가. [C/E]
4. **엔비디아의 EML 락업이 역설적 수요 신호** — 2026-03-02 Lumentum·Coherent에 각 $2B($4B) 투자로 다년 물량 확보. 공급이 그만큼 부족하다는 증거. [C]

**제약 (real)**
1. **EML(InP 레이저) 병목** — Lumentum ~30% 언더십핑, Coherent InP 제약. <5개사, 3→6인치 웨이퍼 전환이 유일한 capa 레버. 전체 1.6T 램프의 상한. [C]
2. **CPO의 pluggable 잠식 + 벤더 종속** — Nvidia(Spectrum-X Photonics 2H2026)·Broadcom(Tomahawk6 102.4T, 2025-10)이 광학을 스위치 패키지로 흡수하면, 스위치 티어 merchant pluggable TAM이 잠식되고 가치가 엔비디아/브로드컴+TSMC로 집중. 독립 모듈·2nd-source(한국 포함)가 최고가치 소켓에서 배제. 단 대량 CPO는 2027~2030이라 절벽이 아닌 점진적 위협. [C 로드맵/E 채택]
3. **중국 조립 과점** — 톱10 중 7개사, 물량 ~63%. 한국·서구 모듈 신규 진입은 원가·규모 열위. [E]
4. **경기성/과잉** — 광학은 2~3년 성장 후 정체·역성장 반복 패턴. 품귀 인플레 마진(新易盛 순익률 ~33%)은 EML 공급 정상화(2026말~2027) 시 되돌림. [E]

## 가치사슬

마진·해자 순으로 배열하면(높음→낮음):

**광 DSP(최고 해자) > EML 레이저 > 실리콘포토닉스 팹 > 모듈 조립 > 위탁생산**

- **광 DSP:** Marvell(1.6T ~70%), Broadcom — 2사 과점, GM~68%. 코히어런트 DSP는 더 좁은 IP 클럽. **한국 부재.**
- **EML/InP 레이저(물리 병목):** Lumentum·Coherent·Mitsubishi·Sumitomo. **한국 merchant 소스 없음.**
- **실리콘포토닉스 팹/CPO(차기 격전):** TSMC(COUPE)·GlobalFoundries·Tower·Intel. 삼성 후행.
- **모듈 조립(물량·저마진):** 中际旭创 Innolight(#1)·新易盛 Eoptolink(#3)·Coherent. **한국 트랜시버사(오이솔루션·라이트론·옵티코어)가 여기 진입 시도 — 단 글로벌 #1의 1~2% 규모.**
- **위탁생산:** Fabrinet.
- **광섬유·고밀도 케이블(물리층):** Corning·YOFC / **대한광통신**.
- **장비(정렬·리플로우):** **성호전자/ADS Tech·레이저쎌 — 한국이 realistically 방어 가능한 위치.**

> 중국은 조립 물량을 장악하나 마진 최저(희소칩 수입). 미·일이 EML·DSP 상단 장악. **한국은 하단(모듈 진입 시도)과 옆단(장비·케이블)에만 존재.**

## 기술 변화 — DC 내부(intra-DC) vs DC 간(inter-DC)이 다른가

**결론: 근본적으로 다르다. 그리고 지금 그 경계가 "AI 캠퍼스" 규모에서 무너지는 중이며, 이 지점이 투자적으로 가장 중요하다.**

| 구분 | DC 내부(intra-DC) | DC 간(inter-DC/DCI) |
|---|---|---|
| 목적 | GPU·서버·leaf/spine 스위치 연결 | 데이터센터/원거리 캠퍼스 건물 간 |
| 변조 | **IM-DD PAM4**(직접검출, 저전력·저가) | **코히어런트**(위상+편광, DSP集약) |
| 거리 | ~2km 이내 대부분 | 80km(400ZR)~1,000km+(800ZR+) |
| 데이터율 | 400→**800G(현 기본)**→1.6T→3.2T | 400ZR→800ZR(2025)→1.6T 코히어런트 |
| 핵심기술 | 실리콘포토닉스·LPO/LRO·CPO·PAM4 DSP | **코히어런트 DSP(해자)**·tunable laser·DWDM |
| 지배 벤더 | Innolight·Coherent·Eoptolink, Broadcom·Marvell DSP | Ciena·Nokia/Infinera·Cisco/Acacia |

핵심 사실 세 가지:
1. **엔비디아 scale-up(GPU간)은 광이 아니라 구리다.** GB200 NVL72의 NVLink는 구리(랙당 트랜시버 ~20kW·비용 1/6 절감). 광모듈 물량은 **scale-out**에서만 발생(랙당 72×400/800G). 즉 scale-up 광학 TAM은 엔비디아가 의도적으로 억제 중. [C]
2. **inter-DC에 코히어런트를 쓰는 이유:** 80km+ 증폭·DWDM 구간에서 색분산을 이기고 fiber당 최대 bit를 짜내야 하므로. IM-DD로는 불가. 코히어런트 DSP가 해자. [C]
3. **무너지는 경계(핵심 배틀그라운드):** AI 클러스터가 한 건물에 안 들어가면서(전력 제약) **2~20km 캠퍼스 링크** 수요 급증. Marvell "Aquila" **코히어런트-라이트**(2~20km, 800G/1.6T)와 늘어난 IM-DD/LPO가 격돌. **고장벽 코히어런트가 대량 시장을 침범하는 마진 변곡점.** Microsoft "Fairwater"(2026-06-23 개소)가 수십만 GB200을 800G Ethernet으로 캠퍼스 단일 팹으로 묶은 실증. [C]

**한국 함의:** 한국 노출은 거의 전부 **intra-DC 모듈/부품 티어**이며 **코히어런트 DSP 해자엔 부재**. 대한광통신만 864심 물리 케이블로 내부·DCI 배선 층에 걸친다. **즉 한국 업사이드 = 코히어런트 IP 스토리가 아니라 AI capex 물량 스토리.**

## 규제 프레임워크

이 섹터의 실질 "규제"는 정부 규제가 아니라 **표준·공급망 통제**다.
- **표준:** 800ZR IA(OIF, 2024-10), Open ROADM MSA v8.0(2025-04, 120km DCI~1,000km+), OSFP/QSFP-DD MSA — 표준 채택 속도가 세대전환 타이밍을 좌우. [C]
- **공급망 통제:** 엔비디아의 EML capa 락업($4B), 미·중 수출 통제가 사실상의 진입장벽. 한국에는 대미 2nd-source 기회이자 대중 경쟁 위협의 양날. [C/E]
- **한국 개별사 공시 규율:** 단일판매·공급계약 공시(KIND)와 사업보고서 매출 사업부문(DART)이 노출 진위 판정의 1차 근거. 후술 표의 CONFIRMED/THEME 구분은 이 규율에 기반.

## 대표 상장사/비상장 플레이어 맵 — 노출 진위

**직접·확정(공시 근거 有) — 3곳뿐:**

| 회사 | 티커 | 노드 | 노출 | 근거+날짜 |
|---|---|---|---|---|
| 옵티코어 | KOSDAQ 380540 | 완제품 트랜시버 | **CONFIRMED(계약)** | AI DC용 400/800G 트랜시버 단일판매공급계약 2건: 2025-09-29 66.8억(매출比 28.7%), 2025-12-29 40.1억(17.2%, ~2026-03). 상대처 비공개 |
| 대한광통신 | KOSDAQ 010170 | 광섬유·케이블(소재) | **CONFIRMED(계약)** | 2026-02 美 빅테크 AI DC용 864심 초고밀도 케이블 1차 ~378만불(~54억). 美매출 3Q'25 +221%, 거래처 8→18 |
| 이수페타시스 | KOSPI 007660 | **PCB·기판(인접)** | **CONFIRMED(인접)** | Nvidia/Google/MS MLB, 엔비디아향 40%+. 2025 매출 1.08조(+30%). *광인터커넥트 아님* |

**부분·기대(제품력 有, 매출 미확정):**

| 회사 | 티커 | 노출 | 핵심 |
|---|---|---|---|
| 오이솔루션 | KOSDAQ 138080 | **부분 CONFIRMED** | 국내 트랜시버 1위, 2025 매출 573.8억(+79%). 단 주동력은 日·美 5G/FTTH, DC는 램프 초입. OFC 2026서 1.6T OSFP 전시 |
| 라이트론(구 빛과전자) | KOSDAQ 069540 | **부분/THEME** | 800G/1.6T 라인업, 2025 3Q 누적 +97.6%이나 영업손실. 1.6T는 "하반기 매출 예상"=forward |

**테마·초기(개발완료/기술이전 단계, DC 매출 미확인):**

| 회사 | 티커 | 노출 | 핵심 |
|---|---|---|---|
| 퀄리타스반도체 | KOSDAQ 432720 | THEME/초기 | CPO 전기 SerDes IP. 삼성파운드리 "광통신모듈" IP 수주(2026-04경). 광부품 아님 |
| 우리로 | KOSDAQ 046970 | THEME/기대 | ETRI 200Gbps 광검출기(PD) 기술이전, 상용화 목표 2026-09. 3년 적자, 주가 한달 +476%(투자경고) |
| 코셋 | **KONEX 189350** | THEME/부분 | DC용 트랜시버 "개발완료" 선언. KONEX 소형주, 확정 계약 미확인 |
| 큐에스아이 | KOSDAQ 066310 | THEME(약) | LD/VCSEL이나 주매출 OA·산업·LiDAR, DC laser 매출 미확인 |

**Picks-and-shovels(장비·부품, 글로벌 프라임 체인 진입 — 티커 발행 전 재확인):**
- **성호전자/ADS Tech(043260*)** — 액티브 얼라인먼트 장비 → Mellanox(Nvidia)·Broadcom·Lumentum·Corning·Fabrinet. **한국 최강 방어 포지션(확정).**
- **레이저쎌** — 선택적 레이저 리플로우 → 글로벌 CPO/OSAT.
- **RF머트리얼즈** — 펌프레이저 패키지 → Lumentum → Nvidia. 2nd-source 부품.
- **삼성전기·LG이노텍** — CPO 기판/글라스 기판(2027–28+), 장기 옵션.

**제외:** 티에프이(425420, 반도체 테스트 소켓), 우리넷·쏠리드·엔텔스·오파스넷(네트워크 SI/리셀러), 나무가(카메라)·인텍플러스(검사) — 광인터커넥트 노드 근거 없음.

## 시장 기회와 미래 전망

**어디에 기회가 있나 (냉정하게)**
- 한국의 실질 기회는 **① intra-DC 트랜시버 2nd-source/틈새(오이솔루션·라이트론 — H2 2026 datacom *booked* 매출이 confirm/deny 신호)**, **② picks-and-shovels 장비(성호전자·레이저쎌 — 이미 글로벌 프라임 공급, 가장 방어적)**, **③ 고밀도 케이블(대한광통신)**이다.
- 한국 업사이드는 **코히어런트 IP·EML·CPO 해자가 아니라 AI capex 물량과 장비 판매**에서 나온다. 이 구분을 흐리면 밸류에이션을 과대평가하게 된다.

**무엇이 잘못될 수 있나**
1. **테마-모멘텀 vs booked revenue 갭.** 한국 다수 종목이 미인식 forward 매출로 거래. H2 2026 datacom 실적이 확인/부인 촉매. 실망 시 소형·단일테마주가 가장 크게 되돌림.
2. **CPO 벤더 종속.** 엔비디아/브로드컴 CPO 확산이 merchant 모듈·2nd-source를 최고가치 소켓에서 배제(2027~2030 점진).
3. **EML/DSP 종속.** <5 EML·2 DSP 과점, 엔비디아 락업으로 여타 구매자 리드타임 2027+. 한국·중국 조립사는 희소칩 가격수용자.
4. **소형·투기 리스크.** 우리로(+476%·투자경고)·옵티코어(자본잠식 이력)·코셋(KONEX)은 노출 진위와 별개로 밸류에이션 근거로 취약.

**관점을 바꿀 트리거**
- 오이솔루션/라이트론 사업보고서에 **DC 매출이 별도 세그먼트로 분리 공개**되고 telecom 대비 유의미해지는 시점.
- 성호전자·레이저쎌의 **글로벌 프라임향 수주 잔고·매출 인식** 지속.
- 삼성 SiPh/CPO의 **명명된 고객 확보**(현재 없음).
- 캠퍼스 2~20km 티어를 코히어런트-라이트가 가져가는지 vs IM-DD/LPO가 방어하는지 — intra-DC 모듈사(한국 포함)의 TAM 방향을 가름.

**한 줄 결론:** 수요(글로벌 AI capex)는 진짜다. 그러나 한국 광통신주는 **확정 노출 3곳(옵티코어·대한광통신·이수페타시스[인접]) + 장비 picks-and-shovels**를 제외하면 상당수가 테마 거래이며, 한국의 구조적 위치는 **코히어런트 해자 밖의 물량·장비 티어**다. 개별 종목은 booked 매출로 옥석을 가려야 한다. → **2편에서 실제 해자를 쥔 글로벌 업체들을 본다.**

## Sources

- LightCounting: [Optics for AI Clusters(2026-01)](https://www.lightcounting.com/newsletter/en/january-2026-optics-for-ai-clusters-366) · [$100B by 2030(2026-03)](https://www.lightcounting.com/newsletter/en/march-2026-ethernet-optics-382) · [Top10 Transceiver(2025-05)](https://www.lightcounting.com/newsletter/en/may-2025-optical-vendor-landscape-333) · [PAM4 & Coherent DSP(2025-04)](https://www.lightcounting.com/report/february-2025-pam4-and-coherent-dsps-updated-april-2025-340)
- Dell'Oro: [Optical transport +16% 2026](https://www.delloro.com/news/optical-transport-equipment-market-forecast-to-grow-16-percent-in-2026/)
- SemiAnalysis: [Nvidia's Optical Boogeyman](https://newsletter.semianalysis.com/p/nvidias-optical-boogeyman-nvl72-infiniband)
- Nvidia CPO: [Spectrum-X Photonics(GTC 2025-03)](https://nvidianews.nvidia.com/news/nvidia-spectrum-x-co-packaged-optics-networking-switches-ai-factories)
- Broadcom: [Tomahawk6 Davisson 102.4T CPO(2025-10)](https://www.globenewswire.com/news-release/2025/10/08/3163429/19933/en/Broadcom-Announces-Tomahawk-6-Davisson-the-Industry-s-First-102-4-Tbps-Ethernet-Switch-with-Co-Packaged-Optics.html)
- Marvell 코히어런트-라이트: [Aquila DSP](https://www.marvell.com/products/coherent-lite-dsp.html)
- Nvidia–EML 락업: [$4B into Lumentum & Coherent(CNBC 2026-03-02)](https://www.cnbc.com/2026/03/02/nvidia-investment-coherent-lumentum.html)
- 하이퍼스케일러 capex: [Big4 $725B 2026,+77%](https://www.tomshardware.com/tech-industry/big-tech/big-techs-ai-spending-plans-reach-725-billion)
- 한국: 옵티코어 [한경 2025-12-29](https://www.hankyung.com/article/202512290768O) · 대한광통신 [핀포인트 864심](https://www.pinpointnews.co.kr/news/articleView.html?idxno=451744) · 오이솔루션 [디지털투데이 2026-02-06](https://www.digitaltoday.co.kr/news/articleView.html?idxno=628147) · 라이트론 [thebell 2026-05-07](https://www.thebell.co.kr/front/newsview.asp?key=202605071424310160109266) · 우리로 [아시아경제 2026-06-18](https://www.asiae.co.kr/article/2026061809122156322) · 장비체인 [theElec 2026](https://www.thelec.kr/news/articleView.html?idxno=58033) · 삼성 SiPh [theElec](https://www.thelec.kr/news/articleView.html?idxno=54279) · "30개 다 올랐는데 진짜 3개뿐" [LeadEconomy](https://www.leadeconomy.co.kr/news/articleView.html?idxno=7124)
