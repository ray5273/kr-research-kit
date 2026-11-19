# 고려아연 Data Pack

- 기준일: 2026-11-19. 5개 채널 산출물을 수집한 뒤 조립한 재사용 입력 자료다.

## Security

- Ticker: 010130.KS · KOSPI 보통주 · 비철금속 제련 사업회사.
- Output mode: full memo. 12~24개월 판단과 2030년 사업계획 구분.
- Archetype: Cyclical Manufacturing / Materials / Commodity-Linked Supplier.

## Price Context

| 항목 | 값 | 시점·출처 |
| --- | ---: | --- |
| 종가 | 799,000원 | 2026-11-18, 회사 시세·한경·Yahoo 교차 확인 |
| 발행주식 시가총액 | 16조 6,775억원 | 위 가격 × 20,872,969주 |
| 자기주식 제외 시가총액 | 16조 2,942억원 | 위 가격 × 20,393,232주 |

## Latest Results

- 2026Q3 연결 매출 60,860.97억원, 영업이익 1,416.55억원, 지배주주순이익 1,853.48억원. 2026-11-16 정식 분기보고서.
- TTM 매출 233,006.14억원, 영업이익 19,033.52억원, 지배주주순이익 10,977.68억원.
- TTM 영업현금 −4,725.13억원, 단순 FCF −16,653.10억원.
- 원 단위·동일 계정 산식은 dart-financial-inputs.json, 검증 위치는 dart-analysis.md.

## Revenue Mix

- Segment: 연결 조정 전 비철금속 제조·판매71.6%, 수출입25.1%, 폐기물3.3%. 2026년 1~9월.
- Product: 본사 별도 은48.7%·아연19.3%·금13.6%·연8.6%·동4.4%·기타5.3%. 제품별 이익 비중과 구분.
- Geography: 본사 내수약30%, Local 및 직수출약70%. 연결 사업지역은 최종 고객 목적지 분류와 구분.
- Customer concentration: not separately disclosed after DART check. 연간·Q3 사업·수익·부문 주석 점검.
- Revenue Mix Proxy / Trade Flow Inference: 이번 분석은 무역통계를 사용하지 않았다.

## Balance Sheet And Capital Allocation

- 2026-09-30 리스 포함 총차입81,653.95억원, 현금10,383.05억원, 단기예치2,262.40억원, 순차입69,008.49억원.
- 단기예치 중 제한성846억원 포함. 장기제한 프로젝트 자금26,603.39억원과 공정가치 금융자산은 차감하지 않았다.
- 비지배지분2,402.23억원, 지배주주자본106,196.58억원.
- 공급자금융18,132.91억원은 차입에 이미 포함. 유동 금융부채약51,640.66억원.
- 유형자산 취득약정11,417.53억원; 총미국예산과 중복 가산 금지.
- 미국USD7,432m예산, 자체추가585m·JV1940m·대출4698m·보조금210m. 9월말CreditAgreement미체결,모회사담보·지급보증·이행보증 예정,준공보증·지분담보등공시.
- 켐코기존가동률24%·잔여신규투자700억원,케이잼가동률7%. 둘다9개월순손실.

## Order Backlog Inputs

- Order-driven company: no. 금속 제련·제품 판매 회사이며 EPC수주잔고가 본업의 매출 인식 기준이 아니다.
- Chart basis / official backlog / coverage ratio: not applicable. 미국 프로젝트는 자금·공정·판매계약으로 검증.

## Governance And Structure

- 2026-09-30 YPC25.21%,공시특수관계인합계32.88%;경영권연합전체의안별의결권과다름.
- 반기상세2026-06-30이사회14명(사내2·기타비상무4·독립8),황덕남독립의장. Q3본문생략.
- 2026-11-19공시: HMG발행무효항소심회사승소;별도직무정지가처분신청. 주총결의취소1심11-13공시와분리.
- 2025DPS20,000원;2026Q1~Q3각5,000원. 연간최종액미확정.

## Valuation Inputs

| 지표 | 값 | 정의 |
| --- | ---: | --- |
| TrailingPER | 14.84배 | 자기주식제외시가총액/TTM지배순익 |
| ForwardPER | 18.52배 | 2027E지배순익8,797억원,WiseReport11-19 |
| PBR | 1.53배 | 9월말지배자본 |
| EV/EBITDA | 10.04배 | DARTTTM,작성자D&A정의 |
| ForwardEV/EBITDA | 12.59배 | 한화11-06의2027EBITDA1.861조원,현재부채 |
| FCFyield | −10.22% | OCF−유형·무형취득,TTM |

- annual market history: 2021~2025연말PER·PBR. EV/EBITDA동일정의시계열미확보.
- valuation-inputs.json에각분자·분모와부채민감도저장.

## External Views

| Source role | Date | Takeaway | Verification status | Source |
| --- | --- | --- | --- | --- |
| sell-side consensus | 2026-11-06 | 한화: 희소금속프리미엄,127만원·2027EBIT1.3234조원 | sell-side (broker) | https://consensus.hankyung.com/analysis/downpdf?report_idx=653837 |
| sell-side consensus | 2026-11-06 | iM: 2027Q1회복,125만원·2027EBIT1.107조원 | sell-side (broker) | https://consensus.hankyung.com/analysis/downpdf?report_idx=653875 |
| sell-side consensus | 2026-11-06 | 신한: 성장프리미엄은현금흐름검증필요,150만원 | sell-side (broker) | https://stock.pstatic.net/stock-research/company/21/20261106_company_700107000.pdf |
| sell-side consensus | 2026-10-08 | 메리츠: 기존현금창출력과미국조달비용점검 | sell-side (broker) | https://consensus.hankyung.com/analysis/downpdf?report_idx=652803 |
| independent analysis | 2026-11-17 | 이익보다 현금흐름이 더 신경 쓰입니다 | unverified (blogger) | https://m.blog.naver.com/hoontrinh27/224480941110 |
| independent analysis | 2026-11-18 | 이 실행이 영풍 측과 지분 갈등의 시발점이 되게 된다. | unverified (blogger) | https://m.blog.naver.com/blissyoon/224480244669 |
| independent analysis | 2026-11-15 | 사업 추진에는 긍정적이지만, 이를 곧바로 이익 증가나 주가 상승으로 환산할 단계는 아니에요. | unverified (blogger) | https://m.blog.naver.com/seulo_ol/224478038152 |
| independent analysis | 2026-11-16 | 기술 경쟁력이 오래 유지돼도 투자비를 언제 회수하는지에 따라 주주의 수익은 달라집니다. | unverified (blogger);잠정순익수치는배제 | https://m.blog.naver.com/seulo_ol/224478791373 |
| foreign-IB via Koreanmedia | 2025-12-17 | 맥쿼리: 미국정부전략자산이라는과거프레임 | historicalmediaquotation;currentviewunverified | https://www.sentv.co.kr/article/view/sentv202512170174 |

- 현재최신3보고서목표가표본중앙값127만원,평균134만원,범위125만~150만원;3개모두매수. 시장전체컨센서스아님.
- analyst-report-insight.md·naver-insights.md·foreign-views.md를역할구분해반영했다.
- 새로운외국계2026실적조정후원문·등급·목표가는미확보. 대출주관·매매창구언급을리서치의견으로분류하지않았다.

## Chart Inputs

- 2024-11-19~2026-11-18,485확정일봉,Nov19장중제외.
- 주요MA·볼린저·일목·RSI·MACD·ADX/DMI·매물대와구조zone확보.
- KRX통합RS적격2,472개,29.7백분위. Minervini fail,리더십10/100(D).
- Yahoo거래량24,032/한경23,046의차이존재;거래량지표Yahoo단일제공자기준.

## Sources

- DART연간: https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20260813001726
- DART분기: https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20261116000994
- DART반기: https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20260814003958
- 최신소송: https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20261119800002 / https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20261119800003
- 회사IR: https://investors.koreazinc.co.kr/media/clwppkhc/26q3-korea-zinc-ir-presentation-kr.pdf
- 시장값: https://markets.hankyung.com/stock/010130/chart / https://comp.wisereport.co.kr/company/c1010001.aspx?cmp_cd=010130
- 원문·주장별위치는dart-analysis.md,기계입력은dart-financial-inputs.json·valuation-inputs.json에저장했다.
