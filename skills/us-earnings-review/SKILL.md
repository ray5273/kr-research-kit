---
name: us-earnings-review
description: End-to-end playbook for a U.S. post-earnings review published on the research site — collect inputs (SEC 8-K Item 2.02 press release, XBRL quarterly results and cash flow, balance-sheet rows, share counts, Yahoo consensus with dated pre-release observations, analyst rating and price-target actions, prices), pass a readiness gate that puts the review ON HOLD for the user's review when key evidence is missing, then write memo.md + analysis-data.json (currency USD, 5-axis rating, P/E or EV-based targets) + evidence files, publish to site/published.json, run the checks, deploy the preview and commit on a branch. Use when the user asks for a 실적 리뷰 / 실적발표 자료 / post-earnings note for a U.S.-listed company. Do not use for Korean companies (kr-earnings-review), pre-earnings previews, or full decision memos (us-stock-analysis).
---

# US 실적 리뷰 (사이트 발행형)

`kr-earnings-review`와 같은 절차·같은 5축 판단 레벨을 미국 상장사에 적용한다. 규칙의 원문은 아래 문서이며, 이 파일은 **미국 자료원과 다른 점**만 바꾼다. 둘이 다르면 원문 문서와 `research.js` 검증이 이긴다.

| 문서 | 내용 |
| --- | --- |
| `skills/kr-earnings-review/SKILL.md` | 전체 순서, 판단 레벨 채점, memo.md 절 순서, 실패 사례 |
| `skills/kr-stock-analysis/references/earnings-review.md` | 리뷰 5요소, 판단 레벨·목표가 규칙, Summary·Update Log 형식 |
| `skills/kr-research-site/references/earnings-data.md` | `analysis-data.json` 계약 (`currency: "USD"`, `basis: "P/E"` 포함) |
| `skills/us-sec-analysis/SKILL.md` | 10-Q·10-K 본문 확인이 필요할 때 |

## 0. 원칙

- 사실은 원문에서만. 실적은 8-K 보도자료(EX-99.x)와 10-Q, 컨센서스는 날짜가 찍힌 관측점, 증권사 의견은 날짜가 있는 원문·보도.
- 발표 후 조회한 컨센서스를 발표 전 예상으로 쓰지 않는다. 같은 값이 발표 전에 관측된 근거(스냅샷·기사)가 있을 때만 쓴다.
- 결측은 0이 아니다. 값은 `null` + `reason`.
- 판단 레벨은 5개 축 점수에서 계산된다. 가격·밸류에이션 축(2배 가중)은 필수.
- 공개 저장소다. 보유 종목·원장·private 디렉터리 내용을 쓰지 않는다.
- 커밋은 작업 브랜치에만. main 병합·푸시·운영 배포는 사용자가 요청할 때만.

## 1. 입력 수집

```bash
git checkout -b feat/<company-slug>-<yyyy>q<q>-earnings   # main에서
node skills/us-earnings-review/scripts/collect-us-earnings-inputs.js --ticker <TICKER> --period <YYYY-Qn>
cat .tmp/earnings/us-<TICKER>-<period>/SUMMARY.md
```

`--period`는 **회계 분기**다(10-Q 표기 기준). 회계연도 말이 12월이 아닌 회사(Apple 9월 말 등)는 달력 분기와 다르다. 수집 결과는 모두 `.tmp/earnings/us-<TICKER>-<period>/`에 쌓이며 커밋하지 않는다.

| 파일 | 내용 | 확인할 점 |
| --- | --- | --- |
| `release/<accn>.txt` | 대상 분기 8-K Item 2.02 첨부 EX-99.x 텍스트 | 손익계산서 표, 조정 지표 정의 변경, 일회성 항목 |
| `facts.json` | XBRL 8분기 매출·영업이익·순이익·희석 EPS·영업현금흐름·투자지출 | 사용한 태그(`concept`), 누적 차감 행(`how`), 재작성 반영 |
| `balance.json` | 최근 분기 현금·투자·차입·리스·비지배지분 행 | 합계·세부 태그 중복, 고객 예치금 성격의 현금 |
| `shares.json` | 표지 주식 수(전 클래스 합), 희석 가중평균, Yahoo 주식 수 | 표지 값이 없으면 10-Q 표지를 직접 읽는다 |
| `consensus.json` | Yahoo 분기·연간 EPS·매출 컨센서스, EPS 추세(7·30·60·90일 전), 발표 전 관측 후보 `preRelease` | 대상 분기 열(`endDate`)이 맞는지, 관측일이 발표일보다 앞서는지 |
| `analysts.json` | 투자의견·목표가 변경 이력, 발표 후 변경 집계, 현재 목표가 분포 | 발표일 이후 행만 전망 변화 근거 |
| `prices.json` | 일별 종가 | 발표 시점(장 전/장 후)에 맞는 반응일 |
| `readiness.json` | R1~R6 자료 존재 사전 점검 | 존재만 본다. 충분한지는 §2에서 판정 |

**발표 전 스냅샷(권장):** 미국 무료 자료원은 과거 컨센서스를 보관하지 않는다. 실적 발표 전 주에 매일 아래를 로컬에서 돌려 두면 R2가 발표 전 날짜의 매출·EPS 관측점으로 채워진다.

```bash
node skills/us-earnings-review/scripts/collect-us-earnings-inputs.js snapshot --ticker <TICKER>
# → .tmp/earnings/consensus-snapshots/<TICKER>/<YYYY-MM-DD>.json (수집기가 자동으로 읽음)
```

스크립트가 못 하는 것: 실적 콜 원문(회사 IR·전사 서비스), 증권사 노트 원문, 발표 전 컨센서스를 인용한 기사(WebSearch), 10-Q 본문 문단. 직접 찾는다.

## 2. 준비도 게이트 — 부족하면 **검토 대기**

`kr-earnings-review` §2와 같은 표를 미국 자료원으로 판정한다.

| # | 필수 입력 | 미국 자료원 | 없을 때 |
| --- | --- | --- | --- |
| R1 | 이번 분기 실적 원문 | 8-K Item 2.02 EX-99.x (또는 10-Q) | 대기 |
| R2 | 같은 기준의 발표 전 컨센서스 관측점 (날짜 있음) | 발표 전 스냅샷 > 발표 전 날짜의 기사·프리뷰 > Yahoo EPS 추세의 7·30일 전 값(날짜는 조회일 기준 근사) | 대기 |
| R3 | 실적 차이 원인 근거 | 보도자료 본문 + 실적 콜 원문/요약, 또는 발표 후 증권사 리뷰 2건 이상 | 대기 |
| R4 | 전망 변화 근거: 발표 후 증권사 2건 이상 | `analysts.json` 발표 후 행(목표가·의견 변경) 또는 날짜 있는 노트·보도 | 대기 |
| R5 | 가격 축 입력 | 기준일 종가, 표지 주식 수, 최근 분기 순차입금, 다음 회계연도 EPS(또는 영업이익) 컨센서스 | 대기 |
| R6 | 직전 분기까지의 분기 현금흐름 | `facts.json` 영업현금흐름·투자지출 | 대기 |
| S1 | 콜 Q&A 원문, 일회성 금액, 조정 지표 재조정표 | | 한계로 명시하고 진행 |

**R 항목이 하나라도 없으면** `kr-earnings-review` §2와 똑같이 멈춘다: `.tmp/earnings/us-<TICKER>-<period>/REVIEW-NEEDED.md` 작성(확인된 사실·빠진 항목·생길 시점·선택지), `site/published.json`·프리뷰·커밋 없이 사용자에게 보고하고 결정을 받는다. 사용자가 진행을 승인하면 빠진 근거를 `limitations`와 해당 축 `reason`에 적는다.

미국 특유의 판정 기준:

- **R2 근사 관측:** Yahoo EPS 추세는 "N일 전" 값이라 관측일이 근사다. 쓸 때는 source에 `role: "historical_consensus"`, `dataAsOf`=`publishedAt`=조회일−N, `retrievedAt`=조회일을 넣고 `limitations`에 "Yahoo 상대 관측, 정확한 기준 시각 미공개"를 적는다. 매출 컨센서스는 추세가 없으므로 스냅샷·기사가 없으면 `null` + 이유.
- **R2 기준 일치:** 컨센서스 EPS가 GAAP인지 조정(Non-GAAP)인지 확인한다. 기준이 다르면 비교표에 넣지 않고 이유를 적는다.
- **R4 날짜:** Yahoo 변경 이력은 하루 이틀 늦게 반영된다. 발표 직후 0건이면 대기하고 다시 수집한다.

## 3. 기준과 수치 정하기

- **회계 기준·단위:** `currency: "USD"`, `basis: "연결 US GAAP · 분기"`, `unit: "백만 달러"`. 비교표·차트·관측값 모두 같은 기준.
- **실적 상태:** 보도자료 수치는 `잠정`, 10-Q 수치는 `확정`. 10-Q가 같은 날 나오면 10-Q를 출처로 `확정`.
- **과거 8분기:** `facts.json`. 4분기는 연간 − 9개월 누적(손익), 현금흐름은 YTD 차감. EPS는 차감할 수 없으므로 4분기 EPS가 없으면 10-K·보도자료에서 읽거나 결측.
- **일회성:** 회사가 밝힌 금액만 분리한다(예: Circle ARC 사전판매 1억8,200만 달러). 관련 비용·세금을 모르면 매출만 뺀 단순 차감이라고 적는다.
- **순차입금:** 차입·전환사채·리스(유동+비유동) − 현금 − 단기투자. 고객 자산(스테이블코인 준비자산, 증권사 고객 현금)은 회사 현금이 아니므로 빼지 않는다.
- **목표가 방식:**

| 방식 | 언제 | 계산 |
| --- | --- | --- |
| `basis: "P/E"` | 컨센서스가 EPS로만 있을 때(무료 자료원 기본) | 목표가 = 해당 연도 EPS 컨센서스 × P/E 배수, $0.1 단위 |
| 생략(EV/영업이익)·`EV/EBITDA` | 영업이익·EBITDA 컨센서스를 날짜 있는 원문으로 확보했을 때 | `(이익 × 배수 − 순차입금 ± 조정) ÷ 주식 수`, 금액 단위 백만 달러 |

- **기간:** 12개월 = 다음 회계연도(Yahoo `+1y`). 24개월은 그다음 해 컨센서스 원문이 있을 때만 넣는다(없으면 12개월 하나만).
- **배수:** 근거를 `multipleNote`에 쓴다. 과거 P/E 밴드(종가 ÷ 직전 4분기 EPS), 동종사 배수, 증권사 노트가 쓴 배수 중 무엇을 썼는지와 "작성자 선택"을 적는다.
- **현재가:** 발표 반응이 반영된 기준일 종가. 장 전 발표면 당일, 장 마감 후 발표면 다음 거래일부터 반응이다(`consensus.json`의 `releaseTiming`).

## 4. 판단 레벨 채점

`kr-earnings-review` §4와 같다. 검증 명령에 통화만 넘긴다.

```bash
node -e "
const r=require('./skills/kr-research-site/scripts/research.js');const d=require('./analysis-example/us/<폴더>/analysis-data.json');
console.log(r.ratingLevel(d.rating.axes));
for(const h of r.horizonTargets(d.targets,d.currency))console.log(h.months,h.prices,(h.upside*100).toFixed(1),h.label,h.score);"
```

## 5. 파일 만들기

폴더: `analysis-example/us/<Company>-<YYYY>Q<n>/`. 이미 같은 폴더에 메모가 있으면 덮어쓰지 말고 메모를 이 절차의 형식으로 고쳐 쓴다(기존 사실·출처·Update Log는 보존).

| 파일 | 내용 |
| --- | --- |
| `analysis-data.json` | 계약 전체 + `currency: "USD"`. 계산기는 `priceLabel`·`priceUnit`·`priceNote`·`baseProfitLabel`·`baseProfitNote`를 반드시 회사에 맞게 쓴다(기본 문구는 한국 양극재용) |
| `earnings-evidence.json` | XBRL 태그·누적 차감 행, 순차입금 구성, 컨센서스 관측 출처, 보도자료 위치 |
| `pre-earnings-consensus-<yyyy>-q<n>.json` | 지표별 관측일·값·출처·실제·차이·rawSha256 |
| `sources/sec-<accn>.txt` | 이번 분기 보도자료 텍스트 |
| `memo.md` | `kr-earnings-review` §5 순서. `## DART Recheck` 대신 `## SEC Recheck`. 가격 절에는 주가·시가총액·순차입금·배수를 모두 적는다(게이트 키워드) |

`## 목표가 계산 기준`은 직접 쓰지 않는다: `node skills/kr-research-site/scripts/render-target-basis.js --dir analysis-example/us/<폴더>`.

## 6. 사이트 등록

```json
{"memo":"analysis-example/us/<폴더>/memo.md","slug":"us/<english-slug>-<yyyy>-q<n>","company":"<회사>","ticker":"<TICKER>",
 "market":"us","exchange":"NYSE|NASDAQ","articleType":"earnings-review","period":"<YYYY-Qn>","companyId":"us/<ticker 소문자>",
 "analysisData":"analysis-example/us/<폴더>/analysis-data.json","headline":"<회사> <n>분기: …","summary":"…",
 "datePublished":"<기준일>","dateModified":"<기준일>","sectors":["<site/cover-sectors.json의 label>"],"tags":[…]}
```

## 7. 검증·배포·보고

`kr-earnings-review` §7과 같다. 게이트는 미국 경로를 넘긴다.

```bash
node scripts/harness.js --mode gate --company <폴더> --memo-path analysis-example/us/<폴더>/memo.md
```

사용자 보고: 판단 레벨과 축 점수 표, 목표가(방식·배수 근거), 발표 전 컨센서스의 관측 방식(스냅샷/기사/근사), 빠진 자료.

## 실패했던 지점

| 증상 | 처리 |
| --- | --- |
| 8-K에서 표지만 잡힘 | 첨부 파일명이 자유 형식이라 공시 인덱스의 `EX-99` 유형으로 찾는다(수집기 기본) |
| EDGAR 접수 시각 해석 | 표기는 `Z`지만 동부시간이고, 8-K는 보도자료보다 몇 시간 늦을 수 있다. 반응일은 Yahoo 이벤트 시각으로 정한다 |
| 4분기 EPS가 이상함 | EPS는 연간 − 9개월로 만들 수 없다. 수집기는 비워 둔다 |
| 현금이 수백억 달러 | `CashCashEquivalentsRestrictedCash…`는 고객 준비자산을 포함할 수 있다. 회사 현금 태그를 쓴다 |
| 표지 주식 수 없음 | 다중 클래스 회사는 XBRL `dei`에 없을 수 있다. 10-Q 표지를 읽고, 희석 가중평균은 검산에만 쓴다 |
| 발표 직후 R4 0건 | Yahoo 반영 지연. 하루 뒤 재수집, 또는 날짜 있는 보도에서 확인 |
