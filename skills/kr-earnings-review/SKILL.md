---
name: kr-earnings-review
description: End-to-end playbook for a KRX post-earnings review published on the research site — collect inputs (DART 잠정실적, pre-release FnGuide consensus, WiseReport annual consensus, Naver broker PDFs, cash flow, net debt, shares, prices), pass a readiness gate that puts the review ON HOLD for the user's review when key evidence is missing, then write memo.md + analysis-data.json (5-axis rating, 12/24-month targets) + evidence files, publish to site/published.json, run the checks, deploy the preview and commit on a branch. Use when the user asks for a 실적 리뷰 / 실적발표 자료 / post-earnings note for a Korean listed company. Do not use for pre-earnings previews, full decision memos (kr-stock-analysis) or incremental memo updates (kr-stock-update).
---

# KR 실적 리뷰 (사이트 발행형)

삼성SDI·LG에너지솔루션·포스코퓨처엠·대한항공 2026Q3 리뷰를 만든 절차를 그대로 재현한다. 규칙의 원문은 아래 문서이며, 이 파일은 **순서·명령·판단 기준**을 묶는다. 둘이 다르면 원문 문서와 `research.js` 검증이 이긴다.

| 문서 | 내용 |
| --- | --- |
| `skills/kr-stock-analysis/references/earnings-review.md` | 리뷰 5요소, 판단 레벨·목표가 규칙, Summary·Update Log 형식 |
| `skills/kr-stock-analysis/references/earnings-consensus.md` | 발표 전 컨센서스 복원 규칙 |
| `skills/kr-stock-analysis/references/earnings-call-qa.md` | 컨퍼런스콜 Q&A 작성 |
| `skills/kr-stock-analysis/references/financial-readability.md` | 표·줄글 금지·계산 표기 |
| `skills/kr-research-site/references/earnings-data.md` | `analysis-data.json` 계약 |
| `analysis-example/kr/대한항공-2026Q3/` | 가장 최근 완성 예시 (별도 실적 + 연결 가치) |
| `analysis-example/kr/LG에너지솔루션/` | 연결 실적 예시 (보조금·일회성 분리) |

## 0. 원칙

- 사실은 원문에서만. 잠정실적은 DART 원문, 컨센서스는 날짜가 찍힌 관측점, 증권사 의견은 PDF 원문. 기사는 공시 인용 확인용.
- 발표 후 자료를 발표 전 예상에 소급하지 않는다. 작성자 사전 추정이 없으면 "사전 추정 없음".
- 결측은 0이 아니다. 값은 `null` + `reason`.
- 판단 레벨은 재량이 아니라 5개 축 점수에서 계산된다. 가격·밸류에이션 축(2배 가중)은 필수.
- 공개 저장소다. 보유 종목·원장·private 디렉터리 내용을 쓰지 않는다.
- 커밋은 작업 브랜치에만. main 병합·푸시·운영 배포는 사용자가 요청할 때만. 프리뷰 배포는 보여주기 위해 해도 된다.

## 1. 입력 수집

```bash
git checkout -b feat/<company-slug>-<yyyy>q<q>-earnings   # main에서
node skills/kr-earnings-review/scripts/collect-earnings-inputs.js --ticker <6자리> --period <YYYY-Qn>
cat .tmp/earnings/<ticker>-<period>/SUMMARY.md
```

스크립트가 모으는 것(모두 `.tmp/earnings/<ticker>-<period>/`, 커밋 안 됨):

| 파일 | 내용 | 확인할 점 |
| --- | --- | --- |
| `prelim/<rcept>.txt` | 모든 잠정실적 원문 | "연결/별도 기준" 문구, 당기·전기·전년동기 열 |
| `cashflow.json` | 분기 영업현금흐름·투자지출 (연결·별도) | 누적 차감, 4Q=연간−9개월, 계정명 |
| `balance.json` | 최근 정기보고서 차입·리스·현금·비지배지분 행 | 소계 행 중복 제거 후 순차입금 직접 합산 |
| `shares.json` | 주식 총수 | 보통주 발행 − 자기주식, 우선주 별도 |
| `consensus-history.json` | FnGuide 주간 시계열 (연결 IFRSL / 별도 IFRSS) | 대상 분기 열, 발표 전 마지막 관측일, 발표직전(E) 값 |
| `consensus-annual.json` | WiseReport 연간 연결 (실적 + E) | 다음 해·그다음 해 영업이익(`영업이익(발표기준)` 행일 수 있음) |
| `reports.json`, `pdf/*.txt` | 네이버 증권사 보고서 + 목표가·의견 + PDF 텍스트 | 이미지 PDF는 `note` 표시 → 눈으로 확인 |
| `prices.json` | 일별 종가 | 발표일·다음날·기준일 종가 |

스크립트가 못 하는 것: 회사 IR 자료·보도자료(회사 홈페이지·뉴스룸), 기사 확인(WebSearch), 실적 콜 내용. 직접 찾는다.

## 2. 준비도 게이트 — 부족하면 **검토 대기**

글을 쓰기 전에 아래를 표로 판정한다.

| # | 필수 입력 | 없을 때 |
| --- | --- | --- |
| R1 | 이번 분기 잠정실적 DART 원문 | 대기 |
| R2 | 같은 회계 기준의 발표 전 컨센서스 관측점 (날짜 있음) | 대기 |
| R3 | 실적 차이 원인 근거: 회사 IR 자료·보도자료, 또는 발표 후 증권사 리뷰 2건 이상 | 대기 |
| R4 | 전망 변화 근거: 발표 후 증권사 보고서 2건 이상 (추정·목표가 변경) | 대기 |
| R5 | 가격 축 입력: 기준일 종가, 주식 수, 최근 정기보고서 순차입금, 다음 두 해 연간 영업이익 컨센서스 | 대기 |
| R6 | 직전 분기까지의 분기 현금흐름 | 대기 |
| S1 | 컨퍼런스콜 원문/요약, 일회성 금액, 연결 실적(별도만 공시한 경우) | 한계로 명시하고 진행 |

**하나라도 R 항목이 없으면 검토 대기 상태로 멈춘다.**

1. `.tmp/earnings/<ticker>-<period>/REVIEW-NEEDED.md`를 쓴다: 확인된 사실(숫자·출처), 빠진 R 항목과 이유, 언제 생길지(예: NDR·증권사 리뷰 예정일), 선택지(기다림 / 해당 축 `판단 불가`로 진행 / 중단).
2. `site/published.json`에 넣지 않는다. 프리뷰·운영 배포도 하지 않는다. `analysis-example/`에 초안을 만들었다면 커밋하지 않는다.
3. 사용자에게 위 내용을 요약해 보고하고 결정을 받는다. 사용자가 진행을 승인하면 빠진 근거를 `limitations`와 해당 축 `reason`에 적고 진행한다.

다음 세션은 시작할 때 `.tmp/earnings/*/REVIEW-NEEDED.md`가 있는지 보고, 있으면 빠졌던 항목부터 다시 수집한다.

## 3. 기준과 수치 정하기

- **회계 기준:** 잠정실적이 연결이면 `연결 K-IFRS · 분기`. 별도만 공시하면(대한항공·제주항공) `별도 K-IFRS · 분기`로 비교·차트를 맞추고, 목표가·계산기는 연결 컨센서스·연결 순차입금을 쓰며 메모 앞머리에 두 기준을 적는다.
- **시장 예상:** FnGuide 같은 기준 시계열에서 발표일 이전 마지막 주간 관측점. 발표직전(E) 표와 다르면 둘 다 적고 날짜 있는 값을 쓴다. 증권사가 인용한 값이 다르면 그 차이도 적는다.
- **과거 8분기:** 각 분기 잠정실적 원문. 오래된 분기는 다음 해 같은 분기 공시의 전년 비교 열에서 읽고 출처를 그 공시로 단다.
- **일회성:** 회사가 금액을 밝히지 않으면 증권사 추정 범위(최소~최대)와 출처. 외화환산이익·자산처분이익은 영업 밖인지 확인하고 순이익 브리지 표로 분리.
- **순차입금:** 최근 정기보고서 연결 재무상태표. 차입금·사채·유동성장기부채·리스부채(유동+비유동) − 현금 − 단기금융상품. 리스 포함 여부를 배수 기준과 맞춘다. 비지배지분은 `targets.adjustments`에 음수로.
- **배수 (EV/영업이익):** 업종에 맞게 근거를 남긴다. 증권사 EV/EBITDA 밴드를 쓰면 같은 보고서의 EBITDA÷영업이익 비율로 환산한다(대한항공: 3년 저점·평균 4.8·5.0배, 목표 6.1배 × 2.62 → 12.6/13.1/16.0배). `multipleNote`에 출처와 "작성자 선택"을 쓴다.
- **목표가:** `(연간 영업이익 컨센서스 × 배수 − 순차입금 ± 조정) ÷ 주식 수`, 100원 단위. 12개월=다음 해, 24개월=그다음 해. 지분가치가 음수면 목표가 없음.

## 4. 판단 레벨 채점

| 축 | key | 점수 기준 (대한항공 예) |
| --- | --- | --- |
| 본업 이익 | coreProfit | 일회성 제외 영업이익 범위·이익률 |
| 이익 방향 | direction | 같은 기준 전분기·전년 대비 |
| 현금 전환 | cash | 최근 확인 분기 OCF·FCF |
| 전망 변화 | outlook | 발표 후 증권사 추정·목표가 방향 + 회사 전망 |
| 가격·밸류에이션 | price | 12개월 기준 목표가 상승여력 구간 점수 (반드시 일치) |

검증 명령:

```bash
node -e "
const r=require('./skills/kr-research-site/scripts/research.js');const d=require('./analysis-example/kr/<폴더>/analysis-data.json');
console.log(r.ratingLevel(d.rating.axes));
for(const h of r.horizonTargets(d.targets))console.log(h.months,h.prices,(h.upside*100).toFixed(1),h.label,h.score);
console.log(r.calculate(d.calculator,d.calculator.variables[0].default,d.calculator.variables[1].default))"
```

`price` 축 점수 = 12개월 `score`. `verdict` = 계산된 레벨.

## 5. 파일 만들기

폴더: `analysis-example/kr/<회사>-<YYYY>Q<n>/` (기존 회사 폴더나 블로그 시리즈를 덮어쓰지 않는다).

| 파일 | 내용 |
| --- | --- |
| `analysis-data.json` | `earnings-data.md` 계약 전체: sources, comparison(매출·영업이익·순이익), quarters 8개, series(매출·영업이익·순이익·영업현금흐름·투자지출), checks, changes, promises(`due`), calculator, rating, targets, `initialReview: true` |
| `earnings-evidence.json` | 현금흐름 차감 행, 순차입금 구성, 일회성 추정 출처, 잠정실적 원문 위치 |
| `pre-earnings-consensus-<yyyy>-q<n>.json` | 지표별 관측일·값·rawValue·발표직전(E)·실제·차이·URL·rawSha256 (`consensus-history.json`의 sha256) |
| `sources/dart-<rcept>.txt` | 이번 분기 잠정실적 원문 텍스트 |
| `memo.md` | 아래 순서 |

JSON은 스크래치 생성기(파이썬/노드)로 만들고 숫자를 손으로 두 번 입력하지 않는다. 대한항공 생성기 구조: `src()`로 sources, `pt()`로 시리즈 점, `obs()`로 비교 관측값.

### memo.md 순서

1. 제목 `# <회사> <YYYY>년 <n>분기 실적 리뷰`, 머리 목록: 한줄요약(한 문장, 50자 이내), 기준일, 최근 업데이트일, 대상, 유형 `post-earnings note · 대상 기간 …`, 회계 기준, 자료 기준
2. `## Summary` — 굵은 결론 한 줄 → 짧은 문단 → 숫자 표 → `**판단 레벨: X** · 가중 평균 · 판정 축 n/5` → 축 표 → 기간 표 → 짧은 목록 → 다음 확인 한 문장
3. `## 이 글을 읽는 법`
4. `## 발표 전 기대와 결과의 시간 구분` (예상 vs 실제 표, 발표 전후 주가 표)
5. `## 실적 차이의 원인 분해` (YoY·QoQ, 운송·가격·비용 표, 일회성, 순이익 브리지)
6. `## 컨퍼런스콜 Q&A` (원문 없으면 "보도자료·증권사 전언 기준"이라고 밝힘)
7. `## 다음 해 이익과 가치의 수정` (계산기 가정 표, 부채 기준 표)
8. `## 이익의 질과 현금 전환`
9. `## 경영진 약속과 장기 계약`
10. `## 현재 가격을 설명하려면 어떤 조건이 필요한가`
11. `## 목표가 계산 기준` ← 직접 쓰지 않는다: `node skills/kr-research-site/scripts/render-target-basis.js --dir analysis-example/kr/<폴더>`
12. `## Street / Alternative Views` (추정 변경 표 + `작성일 | 증권사·원문 | 의견·목표가 | 핵심 의견` 표)
13. `## DART Recheck`
14. `## 다음 분기 검증과 판단 변경 조건` (번호 목록 + 조건→레벨 표)
15. `## Update Log` (`### 날짜 — 첫 기록` + 바뀐 것/판단/근거 세 줄)
16. `## Sources` (본문 모든 URL, 설명형 라벨에 날짜)

문체: 규칙·구간·입력값은 표나 한 줄 목록, 문단은 2~3문장. 작성자 계산은 `[계산]`.

## 6. 사이트 등록

`site/published.json`에 같은 분기 리뷰 다음 위치로 추가:

```json
{"memo":"analysis-example/kr/<폴더>/memo.md","slug":"kr/<english-slug>-<yyyy>-q<n>","company":"<회사>","ticker":"<6자리>",
 "market":"kr","exchange":"KRX","articleType":"earnings-review","period":"<YYYY-Qn>","companyId":"kr/<ticker>",
 "analysisData":"analysis-example/kr/<폴더>/analysis-data.json","headline":"<회사> <n>분기: …","summary":"…",
 "datePublished":"<기준일>","dateModified":"<기준일>","sectors":["<site/cover-sectors.json의 label>"],"coverArt":false,"tags":[…]}
```

## 7. 검증·배포·보고

```bash
git add analysis-example/kr/<폴더>
node scripts/build-artifact-index.js && node scripts/build-artifact-index.js --check
node scripts/harness.js --mode gate --company <폴더>        # PASS, 한줄요약 한 문장 ≤50자
npm run -s test:site && npm run -s test:preview && bash scripts/validate-skills.sh
node skills/kr-research-site/scripts/build-site.js --out <scratch>/dist   # 390px 화면 확인: 가로 넘침 0, 판단 레벨·목표가 표
npm run -s deploy:preview    # https://preview.kr-research-site.pages.dev (curl은 ?v=$RANDOM 붙여 확인)
git commit                   # 작업 브랜치에서. 메시지 끝에 Co-Authored-By 줄
```

사용자 보고: 판단 레벨과 축 점수 표, 12/24개월 목표가, 회계 기준 주의, 배수 선택 근거, 빠진 자료. main 병합·운영 배포는 요청을 받은 뒤 `git rebase origin/main` → fast-forward → push, 운영 URL에서 반영 확인.

## 실패했던 지점

| 증상 | 처리 |
| --- | --- |
| 빌드 `basis/unit required` | 기준 문자열은 `연결 K-IFRS · 분기` 또는 `별도 K-IFRS · 분기`만 |
| FnGuide 대상 분기 값이 엉뚱함 | `chartHeader`에서 `YYYY/MM(E)` 열을 찾는다 (발표 전후로 FY0/FY1이 바뀜) |
| WiseReport E 연도 영업이익이 비어 있음 | `영업이익(발표기준)` 행 사용 |
| 네이버 PC 리서치 목록이 비어 있음 | 모바일 피드 스캔(스크립트 기본) |
| 이미지 PDF | 텍스트 없음 표시 → 목표가·의견만 쓰거나 원문을 보고 확인 |
| 게이트 one-liner 실패 | 한 문장, 50자 이내 |
| 프리뷰 curl이 옛 화면 | 캐시 무효화 쿼리, 배포 후 20초 대기 |
| main 푸시 거부 (릴리스 커밋) | `git rebase --autostash origin/main` 후 fast-forward |
