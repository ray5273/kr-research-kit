# Earnings research data v1

`site/published.json` 항목은 아래 필드를 선택적으로 받는다. 미지정 기존 글도 계속 빌드한다.

| 필드 | 형식 | 역할 |
| --- | --- | --- |
| articleType | earnings-review / research / update | 실적 리뷰 목록은 earnings-review만 선택 |
| period | YYYY-Q1~Q4 | 리뷰 대상 분기 |
| companyId | market/lowercase-ticker | 기업 이력의 안정적인 키. market·ticker와 일치해야 함 |
| analysisData | 저장소 상대 JSON 경로 | 공개 검증 데이터. 추적 파일·저장소 내부 경로·비공개 내용 검사를 메모와 동일 적용 |

기업 키는 market과 단일 ticker에서 유추할 수도 있다. 혼합 티커·섹터 글을 임의 기업으로 묶지 않는다. `/companies/<market>/<ticker>/`는 공개 글만 묶는다. `/earnings/`는 대상 분기를 표시한다. 이 경로들은 예약 경로이므로 글·일반 페이지 slug로 사용할 수 없다.

첫 데이터 예시는 [포스코퓨처엠](../../../analysis-example/kr/포스코퓨처엠/analysis-data.json). `research.js`가 아래 계약을 검증하고 표·SVG·계산기를 같은 데이터에서 서버 렌더링한다. `scenario.js`의 동일 계산 함수를 브라우저도 사용한다. 원시 증거는 `earnings-evidence.json`에 따로 보존하며 공개 파일에 자동 복사하지 않는다.

- version=1, companyId, period, verifiedAt, releasedAt, basis, unit, stance, rationale, limitations를 기록한다. 날짜는 공개일이며 검증일 이후 자료는 거절한다. 현재 v1 숫자 비교는 연결 K-IFRS 분기 기준이다.
- 선택 필드: `verdict`는 10자 이내의 판단 라벨(예: `판단 보류`)로 실적 리뷰 목록과 기업 페이지에 칩으로 표시한다. `rating.axes`가 있으면 `verdict`는 계산된 5단계 레벨과 같아야 한다. 축은 `coreProfit`·`direction`·`cash`·`outlook`·`price` 순서이며 각각 `actual`(실제 관측 문장), `score`(−2~+2 정수 또는 null), null이면 `reason`, 선택 `sources`를 가진다. `price` 축은 null일 수 없다(빌드 오류). `targets`는 `price`·`shares`·`netDebt`(각 value·source), 선택 `adjustments`(label·value·source), `multiples`(bear≤base≤bull)·`multipleNote`, `horizons`(months 증가·year·operatingProfit·source), 선택 `brokers`(count·min·median·max·sources)를 가진다. 빌드는 기간별 보수·기준·낙관 목표가와 상승여력·추천을 계산해 표로 보여 주고, `price` 축 점수가 첫 기간 추천과 다르면 거절한다. 가격 부담은 2배 가중하고, 가격 점수가 음수면 매수 이상을 막는다. 사이트는 5단계 눈금, 축별 `적용 기준 | 실제 | 점수` 표, 전체 채점 기준을 첫 본문 절 뒤와 기업 페이지에 표시하고 핵심 답변 상자에 레벨 한 줄을 넣는다. `nextCheck`는 `{event, expected: "YYYY-MM", conditions: [..]}`로 다음 검증 이벤트·예상 시기·조건이며 핵심 답변 상자와 기업 페이지에 표시한다. `expected`는 검증일이 속한 달 이후여야 한다. 예상 시기는 확정 일정이 아니므로 월 단위로만 쓴다.
- sources는 고유 id, label, HTTPS url, publishedAt(날짜), role, access를 가진다. 실제 열람하지 못한 원문을 숫자의 단독 출처로 삼지 않는다. 공시 인용 보도를 사용하면 그 경로와 한계를 표시한다.
- comparison은 key/label/cause와 market/author/actual 관측값을 가진다. 각 관측값은 value(number 또는 null), role, period, basis, unit을 명시한다. 실제값에는 publishedAt/source/status(잠정·확정·추정·가이던스)가 필수다. 결측에는 reason이 필수다. 사전 예상은 releasedAt보다 공개일이 앞서야 한다. 같은 날짜 발표 전 추정은 v1에서 보수적으로 거절하므로 정밀 시각 지원 전까지 결측으로 남긴다.
- 복원한 과거 컨센서스 source의 `publishedAt`은 검증된 원 데이터 관측일이며 `dataAsOf`에 같은 날짜, `retrievedAt`에 실제 확인일을 남긴다. 현재 페이지의 갱신일이나 URL 파라미터를 과거 관측 근거로 대체하지 않는다. 순이익 행은 전체 `netIncome`과 지배주주 `parentNetIncome`을 구분한다. 지배주주 행에는 `incomeScope: "parent"`를 기록하고 모든 숫자 관측에도 같은 scope를 넣는다. 전체 행의 scope를 명시할 경우 `total`이며 혼합은 빌드 오류다.
- 비교표는 날짜·상태·출처와 긴 원인 설명을 숫자 셀 밖으로 모은다. 작성자 예상이 모두 null이면 작성자 열·차이를 생략하고 사전 추정 없음으로 한 번만 알린다. 일부라도 실제 사전 예상이 있으면 작성자 열과 차이를 유지한다. 결측 숫자는 0이나 사후 추정으로 채우지 않는다.
- quarters는 리뷰 분기까지 연속 8개다. series는 key/label/unit와 같은 8개 points를 갖는다. point에는 period/value/kind(actual 또는 estimate)/basis와 공개일·출처 또는 결측 이유를 기록한다. 비교표와 같은 key의 마지막 차트 값은 동일해야 한다. 누적 현금흐름은 원문 차감과 기준 대조를 마친 뒤 분기값으로 넣는다. 가공값이면 산식과 원본 출처를 별도 증거에 보존한다.
- checks/promises는 date/claim/status/evidence/sources를 가진다. 상태는 충족·미충족·판단 보류다. changes는 같은 증거 구조와 to(판단), 선택 `kind`(`판단` 기본값 또는 `자료`)를 가진다. 판단을 바꾸지 않은 원문 대조·수치 보강은 `자료`로 기록하며 기업 페이지의 `자료 갱신 기록`으로 분리된다. 여러 리뷰의 변경 이력은 날짜·조건으로 중복 제거한다. source id는 기업 내에서도 같은 원문에만 재사용한다.
- calculator는 period/label/assumptions와 두 variables(volume, margin)를 갖는다. 각 변수는 label/unit/min/max/step/default를 가진다. 고정값은 price(억원/천 톤), baseProfit(억원), multiple(EV/영업이익), netDebt(억원)다. marketCap은 검증된 시총 또는 null이며 검증값에는 marketCapSource를 기록한다. 모든 가정의 대상 기간과 실측 여부를 메모에도 설명한다. 이익=물량×판가×마진/100+기타이익, 기업가치=이익×배수, 지분가치=기업가치−순차입금이다. 현재 가격 요구 이익=(시총+순차입금)/배수다. 적자 시 배수 가치를 숨긴다. 양극재가 아닌 기업은 선택 문자열 `priceLabel`·`priceUnit`·`priceNote`·`baseProfitLabel`·`baseProfitNote`로 고정 가정의 이름과 단위를 바꾼다(예: ESS 판가 `억원/GWh`). 생략하면 양극재 기본 문구를 쓴다.

## 갱신과 검증

실적·중요 공시 발생 시 원문과 공개 시점을 재확인하고 memo·증거·analysisData를 함께 수정한다. 과거 가설과 원 기준일을 보존한다. 데이터·메모는 같은 검증일의 변경을 반영하고 `dateModified`도 실제 편집일로 갱신한다. 새 파일은 먼저 `git add` 후 `node scripts/build-artifact-index.js`로 추적 파일 인덱스를 갱신한다. README에 링크를 추가하지 않는다.

`analysisData`가 있는 글은 빌드가 각주 라벨을 검사해 발행처·날짜가 없는 라벨을 `[sources]` 경고로 출력한다. `## Sources`에 같은 URL을 설명형 라벨로 올려 해결한다.

`npm run check:site`로 기존 글 호환·보안·수치 검증을 확인한 뒤 로컬 미리보기에서 표 가로 스크롤·차트·키보드 입력·복원을 검증한다. 배포는 별도 요청 범위다.

## 증권사 의견 표시

`작성일 | 증권사·원문 | 당시 의견·목표가 | 핵심 의견` 열을 가진 Markdown 표는 공개 글에서 리포트 카드로 렌더링한다. 최신 2건은 바로 보여주고 이후 항목은 키보드로 열 수 있는 기본 details 안에 둔다. 날짜·의견·원문 링크·설명은 보존하며 긴 문장은 한 열의 전체 너비를 쓴다. 수치 비교표는 기존 표를 유지하고 긴 수치 예외 설명은 표 아래 각주로 분리한다.

## 검증 보강

과거 컨센서스는 `dataAsOf === publishedAt`과 `publishedAt <= retrievedAt <= verifiedAt`을 검증한다. 조회일만 바꾸거나 기준일과 공개일을 모순되게 쓰면 빌드를 거절한다. 달력에 없는 날짜도 거절한다.

경영진 약속의 선택 `due`는 ISO 날짜다. 검증일보다 이후이고 판정이 보류인 경우에만 화면에서 검증시점 미도래로 표시한다. 계산기의 선택 `netDebtSource`와 `netDebtAsOf`는 사용한 부채 잔액의 출처·시점을 표시하며 미래 잔액으로 설명하지 않는다.

첫 분석에는 `initialReview: true`를 사용해 첫 가설 등록으로 표시한다. 후속 리뷰에서 이전 판단을 평가할 때는 false 또는 생략한다.
