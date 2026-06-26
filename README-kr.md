# Stock, Portfolio, And Sector Analysis Skill

미국 주식, 한국 주식, KRX 포트폴리오, 한국 섹터 리서치용 AI 스킬 모음입니다. **Codex**와 **Claude Code**(Anthropic CLI)에서 사용할 수 있습니다.

언어별 문서:

- 영어: [README.md](README.md)
- 한국어: [README-kr.md](README-kr.md)

## 5분 온보딩 (Naver KOL용)

처음 사용한다면 아래 순서가 가장 빠릅니다. 종목 하나를 받아 Naver 블로그까지 한 번에 발행하는 end-to-end 흐름입니다.

### 1. 한 번만 설치

```bash
git clone --single-branch --depth 1 https://github.com/ray5273/stock-analysis-skill ~/.claude/src/stock-analysis-skill
cd ~/.claude/src/stock-analysis-skill
bash ./scripts/install-all-claude-skills.sh
```

Codex 사용자라면 `~/.claude/src`를 `~/.codex/src`로, `install-all-claude-skills.sh`를 `install-all-skills.sh`로 바꿉니다. 자세한 옵션은 아래 [## 설치](#설치) 참조.

### 2. OpenDART API 키 발급 + `.env`

[OpenDART](https://opendart.fss.or.kr/) 가입 후 API 키 발급(무료, 즉시) → 레포 루트에 `.env` 파일:

```text
OPENDART_API_KEY=발급받은_키
```

키가 없으면 `kr-stock-dart-analysis`는 Chrome 확장 fallback으로 동작합니다(아래 [## Claude.ai DART 브라우저 워크플로](#claudeai-dart-브라우저-워크플로) 참조).

### 3. 첫 메모 + Naver 게시 (한 문장으로)

Claude Code 또는 Codex에서 그대로 붙여넣습니다.

```text
/kr-stock-plan SOOP(067160) 결정 메모 작성한 다음, 차트·DART·증권사·외국계 IB·블로거 인사이트까지 채우고, 마지막에 Naver 블로그에 올려줘 (게시 직전에 미리보기 보여줘)
```

이 한 줄이 내부적으로 실행하는 워크플로:

- `kr-stock-plan` → 스코프 확인 (필요시 사용자에게 질문)
- `kr-stock-chart` → 5분할 PNG 차트
- `kr-stock-dart-analysis` → 최신 공시 재확인 + DART recheck
- `kr-foreign-analyst` + `kr-analyst-report-discover/fetch/insight` → 증권사 컨센서스 + 외국계 IB 시각
- `kr-naver-blogger` + `kr-naver-insight` → 동료 블로거 의견
- `kr-stock-analysis` → 메모 작성 (`analysis-example/kr/SOOP/memo.md`)
- `kr-naver-blog-publish` → SmartEditor 미리보기 생성 → **사용자가 명시 승인한 뒤에만** 발행

### 4. 산출물

종목 폴더(`analysis-example/kr/SOOP/`) 안에 생기는 파일:

| 파일 | 용도 |
| --- | --- |
| `memo.md` | 메모 원본 (`Decision Frame`, `DART Recheck`, `Street / Alternative Views`, `Valuation Snapshot`, `Structured Stance`) |
| `assets/SOOP-chart*.png` | 5분할 PNG (trend, overlay, momentum, structure, pattern) |
| `dart-reference.md`, `dart-cache.json` | DART 원문 인용 및 재확인 체크 |
| `naver-insights.md` | 동료 블로거 의견 요약 |
| `naver-post.md` | Naver 블로그 포맷 변환본 |
| `naver-publish.json` | SmartEditor 발행 manifest |
| `naver-preview.png` | 게시 직전 스크린샷(승인용) |

그리고 Naver 블로그에 발행된 글.

### 5. 그 다음에 자주 쓰는 것

```text
/kr-stock-update analysis-example/kr/SOOP/memo.md를 이번 주 새 공시·뉴스 반영해서 업데이트해줘 (기준일은 보존하고 ## Update Log만 추가)
```

```text
/kr-market-leaders 오늘 기준 KOSPI + KOSDAQ 통합 leadership 스크리닝 돌려줘 (어제 대비 신규 진입 종목 비교)
```

## 설치

### Codex

설치 경로: `$CODEX_HOME/skills/<skill-name>` 기본값은 `~/.codex/skills/`

Codex에서 아래 프롬프트를 그대로 붙여넣으면 나머지는 Codex가 처리합니다.

> `https://github.com/ray5273/stock-analysis-skill`의 Codex 스킬을 설치해줘. 로컬 저장소 경로는 `~/.codex/src/stock-analysis-skill`을 사용해줘. `~/.codex/src/stock-analysis-skill/.git`이 없으면 `~/.codex/src`를 만들고 해당 위치에 clone해줘. 이미 있으면 `git -C ~/.codex/src/stock-analysis-skill pull --ff-only`로 업데이트해줘. 그 후 `cd ~/.codex/src/stock-analysis-skill && bash ./scripts/install-all-skills.sh`를 실행해줘. macOS에서 Naver 스택이 Codex용 fallback 경로가 필요하면 대신 `cd ~/.codex/src/stock-analysis-skill && bash ./scripts/install-codex-mac-naver.sh`를 실행해줘. 설치 후 `${CODEX_HOME:-~/.codex}/skills/` 아래에 스킬이 복사됐는지 확인하고 이어서 사용해줘.

프롬프트를 붙여넣는 대신 직접 실행하고 싶다면:

Windows:

```powershell
.\scripts\install-skill.ps1 us-stock-analysis
.\scripts\install-all-skills.ps1
```

Linux 또는 macOS:

```bash
mkdir -p ~/.codex/src
if [ -d ~/.codex/src/stock-analysis-skill/.git ]; then
  git -C ~/.codex/src/stock-analysis-skill pull --ff-only
else
  git clone --single-branch --depth 1 https://github.com/ray5273/stock-analysis-skill ~/.codex/src/stock-analysis-skill
fi
cd ~/.codex/src/stock-analysis-skill
bash ./scripts/install-all-skills.sh
```

macOS Naver 전용 복구 경로:

```bash
mkdir -p ~/.codex/src
if [ -d ~/.codex/src/stock-analysis-skill/.git ]; then
  git -C ~/.codex/src/stock-analysis-skill pull --ff-only
else
  git clone --single-branch --depth 1 https://github.com/ray5273/stock-analysis-skill ~/.codex/src/stock-analysis-skill
fi
cd ~/.codex/src/stock-analysis-skill
bash ./scripts/install-codex-mac-naver.sh
```

커스텀 경로:

```bash
CODEX_HOME=/tmp/codex-home bash ./scripts/install-all-skills.sh
```

### Claude Code

설치 경로: `$CLAUDE_HOME/skills/<skill-name>` 기본값은 `~/.claude/skills/`

Claude Code에서 아래 프롬프트를 그대로 붙여넣으면 나머지는 Claude Code가 처리합니다.

> `https://github.com/ray5273/stock-analysis-skill`의 Claude Code 스킬을 설치해줘. 로컬 저장소 경로는 `~/.claude/src/stock-analysis-skill`을 사용해줘. `~/.claude/src/stock-analysis-skill/.git`이 없으면 `~/.claude/src`를 만들고 해당 위치에 clone해줘. 이미 있으면 `git -C ~/.claude/src/stock-analysis-skill pull --ff-only`로 업데이트해줘. 그 후 `cd ~/.claude/src/stock-analysis-skill && bash ./scripts/install-all-claude-skills.sh`를 실행해줘. 설치 후 `${CLAUDE_HOME:-~/.claude}/skills/` 아래에 스킬이 복사됐는지 확인하고 이어서 사용해줘.

프롬프트를 붙여넣는 대신 직접 실행하고 싶다면:

Windows:

```powershell
.\scripts\install-claude-skill.ps1 us-stock-analysis
.\scripts\install-all-claude-skills.ps1
```

Linux 또는 macOS:

```bash
mkdir -p ~/.claude/src
if [ -d ~/.claude/src/stock-analysis-skill/.git ]; then
  git -C ~/.claude/src/stock-analysis-skill pull --ff-only
else
  git clone --single-branch --depth 1 https://github.com/ray5273/stock-analysis-skill ~/.claude/src/stock-analysis-skill
fi
cd ~/.claude/src/stock-analysis-skill
bash ./scripts/install-all-claude-skills.sh
```

커스텀 경로:

```bash
CLAUDE_HOME=/tmp/claude-home bash ./scripts/install-all-claude-skills.sh
```

## 포함된 스킬

한국 주식 워크플로 요약: `kr-stock-plan -> kr-stock-chart -> kr-stock-dart-analysis -> kr-stock-data-pack -> kr-stock-analysis`

`kr-stock-plan`은 진입점 오케스트레이터처럼 동작해야 합니다. 사용자가 `plan only`를 명시하지 않았다면, 먼저 짧게 필요한 것을 물어보고 브리프를 만든 다음, 이 요청이 `신규 memo`, `기존 memo follow-up`, `dated update` 중 무엇인지 가른 뒤 필요한 하위 skill까지 자동으로 이어서 실행합니다.

추천 핸드오프 프롬프트:

```text
Use $kr-stock-plan as the entry point for Korean stock work. Have it ask what the user actually needs first, scope the request, route through $kr-stock-chart when chart work is needed, route through $kr-stock-dart-analysis when filing precision matters, then build the dated fact base with $kr-stock-data-pack, and finish with $kr-stock-analysis unless the user explicitly asks to stop after planning.
```

한국어 예시:

```text
먼저 $kr-stock-plan으로 사용자가 실제로 필요한 것을 짧게 확인한 뒤 종목, 기간, 출력 모드를 정리하고, 차트가 필요하면 $kr-stock-chart를 먼저 실행하고, 공시 정밀도가 중요하면 $kr-stock-dart-analysis를 거친 뒤, $kr-stock-data-pack으로 날짜가 보이는 팩트 베이스를 만들고, 마지막으로 $kr-stock-analysis로 최종 메모를 작성해줘. 사용자가 브리프만 원한다고 하지 않으면 중간에 멈추지 말고 이어서 실행해줘.
```

- `us-stock-analysis`: 미국 상장 주식과 미국 상장 ETF 분석
- `kr-stock-plan`: 한국 주식 리서치 범위를 실행용 브리프로 정리하고, 신규 memo / follow-up / update 흐름을 라우팅
- `kr-stock-chart`: 한국 주식 차트 전용 스킬. `chart-data.json`, `chart-analysis.md`, 5분할 PNG, CSV sidecar, 선택형 rule-screen 산출물 생성
- `kr-stock-dart-analysis`: 한국 DART 공시에서 분기, 반기, 사업부문, 고객집중 등 핵심 내용을 정밀 추출
- `kr-stock-data-pack`: 종목 메모 작성 전에 구조화된 팩트팩과 외부 관점 입력값 수집
- `kr-stock-analysis`: 한국 주식 quick view, full decision memo, 이벤트 노트, pair compare 작성과 외부 관점 요약, archetype별 불편한 질문, 판단 변경 논점, 후속 리서치 프롬프트 생성
- `kr-stock-update`: 기존 한국 주식 메모에 기준일 이후 업데이트를 누적 반영
- `kr-market-leaders`: KOSPI + KOSDAQ 통합 leadership 스크리닝(단기·중기·구조 lens, RS, 거래량, 52주 신고가)
- `kr-foreign-analyst`: 외국계 IB의 한국 상장사 커버리지를 한국 뉴스에서 수집해 `## Street / Alternative Views`용 Markdown 블록 생성
- `kr-analyst-report-discover`: 한경 컨센서스(1차) + Naver Pay Research(fallback)에서 증권사 리포트 인덱스 수집(기본 365일 lookback)
- `kr-analyst-report-fetch`: discover 인덱스에서 PDF 다운로드 후 `pypdf`로 본문 추출, reportId 단위로 캐싱
- `kr-analyst-report-insight`: 7개 섹션 증권사 커버리지 digest(컨센서스, 브로커 표, 최근 리포트 verbatim 인용, 다이버전스, TP trajectory) 작성
- `kr-naver-browse`: Naver 검색/블로그 페이지용 headless 브라우저 래퍼(다른 Naver 스킬의 종속성)
- `kr-naver-blogger`: 특정 KRX 종목을 지속 커버하는 Naver 블로거 후보 발굴
- `kr-naver-insight`: 후보 블로거 글을 수집하고 `## Street / Alternative Views`용 인사이트 digest 작성
- `kr-naver-blog-publish`: `memo.md`를 Naver 블로그 포스트로 변환하고 SmartEditor에서 draft·미리보기까지 준비, 사용자 명시 승인 후에만 발행
- `kr-web-browse`: Naver 외 일반 한국어 웹페이지용 headless 브라우저 래퍼 + PDF 다운로더
- `kr-portfolio-monitor`: 키움 REST API 기반 국내주식 포트폴리오 스냅샷
- `kr-sector-plan`: 한국 섹터 리서치 범위를 실행용 브리프로 정리
- `kr-sector-data-pack`: 섹터 보고서 작성 전에 구조화된 팩트팩 수집
- `kr-sector-analysis`: 한국 섹터 quick brief 또는 full report 작성
- `kr-sector-compare`: 같은 날짜 기준의 한국 섹터 비교
- `kr-sector-audit`: 기존 한국 섹터 문서의 소스, 날짜, 논리 검토
- `kr-sector-update`: 기존 한국 섹터 메모의 증분 업데이트

## 동작 방식

공통 원칙:

- 모든 스킬은 시점 민감 정보를 메모리 대신 최신 소스로 다시 확인합니다.
- 워크스페이스가 쓰기 가능하면 기본 산출물은 채팅 답변만이 아니라 마크다운 파일입니다.
- 주식 메모는 `analysis-example/kr/<company>/memo.md`, 섹터 문서는 `analysis-example/kr-sector/<sector>.md`에 맞춰 씁니다.
- 최종 답변과 파일은 같은 기준일을 공유해야 합니다.

### `us-stock-analysis`

주요 문서:

- [skills/us-stock-analysis/SKILL.md](skills/us-stock-analysis/SKILL.md)
- [skills/us-stock-analysis/references/workflow.md](skills/us-stock-analysis/references/workflow.md)
- [skills/us-stock-analysis/references/output-format.md](skills/us-stock-analysis/references/output-format.md)

현재 동작:

1. 종목, 거래소, 기간, 비교 대상, 출력 모드를 먼저 확정합니다.
2. SEC 공시와 IR 자료를 우선으로 최신 수치를 확인합니다.
3. 사업 구조, 재무 품질, 자본 배분, 촉매, 리스크를 바탕으로 논리를 정리합니다.
4. 업종에 맞는 밸류에이션을 선택합니다.
5. 풀 메모, 비교, 실적 전후 노트 형식으로 출력합니다.

### `kr-stock-*` 스킬 세트

주요 문서:

- [skills/kr-stock-plan/SKILL.md](skills/kr-stock-plan/SKILL.md)
- [skills/kr-stock-dart-analysis/SKILL.md](skills/kr-stock-dart-analysis/SKILL.md)
- [skills/kr-stock-dart-analysis/references/script-inputs.md](skills/kr-stock-dart-analysis/references/script-inputs.md)
- [skills/kr-stock-data-pack/SKILL.md](skills/kr-stock-data-pack/SKILL.md)
- [skills/kr-stock-analysis/SKILL.md](skills/kr-stock-analysis/SKILL.md)
- [skills/kr-stock-analysis/references/blended-source-notes.md](skills/kr-stock-analysis/references/blended-source-notes.md)
- [skills/kr-stock-update/SKILL.md](skills/kr-stock-update/SKILL.md)
- [skills/kr-foreign-analyst/SKILL.md](skills/kr-foreign-analyst/SKILL.md)
- [skills/kr-foreign-analyst/references/output-format.md](skills/kr-foreign-analyst/references/output-format.md)

현재 동작:

1. `kr-stock-plan`은 먼저 사용자가 무엇을 원하는지 짧게 확인한 뒤, 모호한 종목 요청을 정확한 종목, 주식 종류, 기간, 출력 모드, 핵심 질문, 추천 워크플로가 담긴 브리프로 정리하고, 브리프만 요청한 경우가 아니면 `신규 memo / follow-up / dated update`를 가른 뒤 하위 skill까지 자동으로 이어서 실행합니다.
2. `kr-stock-chart`는 한국 주식 차트 생성의 단일 소유자입니다. 기본적으로 2년 일봉을 받아 `chart-data.json`, `chart-analysis.md`, 5분할 PNG, zone / wave CSV를 만들고, 해석문에 당일 `5/20/60/120/200일선` 가격을 명시합니다.
3. `kr-stock-dart-analysis`는 최신 DART 공시에서 매출, 영업이익, 사업부문, 고객집중, 수주, 계약공시, 증감 사유를 정확한 표와 섹션 단위로 정리하고, 범위가 모호하면 먼저 사용자가 공시에서 무엇을 보고 싶은지 짧게 확인합니다.
   긴 사업보고서나 감사보고서라면 이후 업데이트를 위해 `dart-reference.md`와 `dart-cache.json`도 함께 남겨 섹션별 커버리지와 재확인 필요 항목을 재사용합니다.
   또한 더 넓은 종목 메모를 뒷받침하는 경우에는 핵심 주장들을 DART로 다시 검증하는 `recheck` 단계를 기본으로 수행합니다.
4. `kr-stock-data-pack`은 가격 기준일, 공시, 실적, 거버넌스, 밸류 입력값, 차트 입력값, 필요할 때는 증권사·전문매체·독립 분석의 외부 관점도 구조화해서 모으고, 차트는 자체 생성하지 않고 `kr-stock-chart` 산출물을 ingest합니다.
5. `kr-stock-analysis`는 KRX 상장 주식 기준으로 `quick view`, `full memo`, `pre-earnings note`, `post-earnings note`, `pair compare`를 작성하고, 최종 산출물의 의사결정 프레임이나 강조 섹션이 불명확하면 먼저 짧게 확인합니다.
   `full memo`는 장문 요약이 아니라 `Decision Frame`, `Uncomfortable Questions`, `Decision-Changing Issues`, `Structured Stance`, `Follow-up Research Prompts`를 고정 헤더로 갖는 decision memo로 동작합니다.
6. `kr-stock-update`는 기존 `기준일`을 보존하고 `최근 업데이트일`과 `## Update Log`만 증분 갱신합니다.

권장 파이프라인:

```text
kr-stock-plan
  -> 사용자 필요 확인 후 종목, 출력 모드, 핵심 질문 확정
  -> 신규 memo / follow-up / dated update 분기
  -> 차트가 중요하면: kr-stock-chart
  -> 공시 정밀도가 중요하면: kr-stock-dart-analysis
  -> 외국계 IB 관점이 중요하면: kr-foreign-analyst
  -> kr-stock-data-pack
  -> kr-stock-analysis
```

라우팅 가이드:

- 티커, 주식 종류, 기간, 비교 범위, 산출물 형식, 또는 follow-up인지 신규 분석인지가 아직 모호하면 `kr-stock-plan`부터 시작합니다. 사용자가 실제 분석 작업을 원한 경우에는 브리프 뒤에 자동으로 다음 skill까지 이어서 실행합니다.
- 결론이 DART 원문 문구, 누적공시의 분기 환산, 사업부문, 고객집중, 수주잔고, 계약공시에 크게 의존하면 `kr-stock-dart-analysis`를 중간에 넣습니다.
- `kr-stock-chart`는 "차트만 보고 싶다" 요청의 직접 진입점입니다.
- `kr-stock-data-pack`은 가격, 거버넌스, 밸류, 차트, 외부 관점까지 날짜가 보이는 입력값을 모으는 단계이며, 차트는 `kr-stock-chart` 산출물을 ingest합니다.
- 최종 quick view, memo, 이벤트 노트, pair compare 작성은 `kr-stock-analysis`가 맡습니다. full memo의 canonical artifact는 `analysis-example/kr/<company>/memo.md`입니다.

번들 도구:

- `skills/kr-stock-chart/scripts/fetch-kr-chart.js`: KRX 일봉 데이터 조회. 기본 fetch 범위는 `2y`
- `skills/kr-stock-chart/scripts/chart-basics.js`: 주가/이평/거래량, 오버레이 지표, `MACD + ADX/DMI` 모멘텀, 매물대/지지저항 구조, 후보 파동/Fibonacci를 분리한 5분할 PNG 차트 생성
- `skills/kr-stock-chart/scripts/chart-basics.js`: KR 메인 차트는 캔들스틱, 종가선, 현재가 가이드 라인, `5/20/60/120/200일선`을 기본으로 그리고, 해석문에 당일 이평선 가격을 함께 표기
- `skills/kr-stock-chart/scripts/chart-basics.js`: `--png-out`으로 지정한 파일은 메인 추세 차트로 저장하고, 같은 이름의 `-overlay.png`, `-momentum.png`, `-structure.png`, `-pattern.png` 파일과 `-structure-zones.csv`, `-pattern-waves.csv` sidecar를 추가 생성
- `skills/kr-stock-chart/scripts/build-kr-universe-rs-cache.js`: 통합 `KOSPI + KOSDAQ` RS percentile 캐시를 `.tmp/kr-rs-cache/<YYYY-MM-DD>.json`에 생성
- `skills/kr-stock-chart/scripts/kr-trend-rules.js`: 메모의 `Chart and Positioning` 섹션에 넣을 `Minervini Trend Template` 판정과 `KRX 52주 신고가 리더십 점수` 블록 생성
- `skills/kr-foreign-analyst/scripts/fetch-analyst-coverage.js`: 한국 뉴스에서 외국계 IB 커버리지 기사와 broker/rating/TP/date 메타데이터 수집
- `skills/kr-foreign-analyst/scripts/summarize-analyst-views.js`: 수집 JSON을 `## Street / Alternative Views`용 Markdown 블록으로 렌더링
- `scripts/valuation-bands.js`: 3~5년 밸류에이션 밴드 요약
- `scripts/peer-valuation.js`: 피어 밸류에이션 표 생성
- `skills/kr-stock-dart-analysis/scripts/extract-dart-sections.js`: DART 원문 텍스트에서 섹션 인덱스 생성
- `skills/kr-stock-dart-analysis/scripts/fetch-opendart.js`: Chrome 확장의 대안 경로. `--ticker`로 corp_code를 해석한 뒤 OpenDART API로 최신 정기공시 (사업/반기/분기) `document.xml` ZIP과 구조화 엔드포인트(majorshareholder, alotMatter, tesstkAcqsDspsSttus, irdsSttus, cpndlhCmpsBoardCo, fnlttSinglAcntAll)를 받아와 동일한 `dart-browser-export.json` 스키마로 출력. 환경변수 `OPENDART_API_KEY` 필요(레포 루트의 gitignored `.env` 파일도 인식). 캐시는 `.tmp/opendart-cache/`
- `skills/kr-stock-dart-analysis/scripts/opendart-zip.py`: `fetch-opendart.js`가 호출하는 Python3 stdlib 헬퍼. cp949 한글 파일명을 보존한 ZIP 추출과 `dart4.xsd` XML 전처리 담당
- `skills/kr-stock-dart-analysis/scripts/verify-dart-coverage.js`: 목차 대비 파싱 커버리지 검증
- `skills/kr-stock-dart-analysis/scripts/build-dart-reference.js`: `dart-reference.md`와 `dart-cache.json` 생성
- `dart-cache.json`: 핵심 주장 재검증 결과를 담는 `verifiedClaims` 필드 예약
- [skills/kr-stock-update/scripts/extract-report-baseline.js](skills/kr-stock-update/scripts/extract-report-baseline.js): 메모 기준일, 업데이트 날짜, source URL 추출
- [skills/kr-stock-update/scripts/normalize-update-log.js](skills/kr-stock-update/scripts/normalize-update-log.js): 날짜별 업데이트 블록 생성 및 메모 반영

### `kr-portfolio-monitor`

주요 문서:

- [skills/kr-portfolio-monitor/SKILL.md](skills/kr-portfolio-monitor/SKILL.md)
- [skills/kr-portfolio-monitor/references/workflow.md](skills/kr-portfolio-monitor/references/workflow.md)
- [skills/kr-portfolio-monitor/references/output-format.md](skills/kr-portfolio-monitor/references/output-format.md)
- [skills/kr-portfolio-monitor/references/mcp-setup.md](skills/kr-portfolio-monitor/references/mcp-setup.md)

현재 동작:

1. `kiwoom-mcp` 연결을 먼저 확인합니다.
2. 국내 KRX 보유 종목만 대상으로 계좌 잔고와 가격을 가져옵니다.
3. SMA20 이격도와 RSI14를 계산해 과열/과매도 구간을 표시합니다.
4. 결과를 `analysis-example/kr/portfolio-snapshot.md`에 업데이트합니다.
5. MCP 연결이 안 되면 수동 JSON과 Yahoo Finance 데이터를 사용하는 fallback을 씁니다.

### `kr-sector-*` 스킬 세트

주요 문서:

- [skills/kr-sector-plan/SKILL.md](skills/kr-sector-plan/SKILL.md)
- [skills/kr-sector-data-pack/SKILL.md](skills/kr-sector-data-pack/SKILL.md)
- [skills/kr-sector-analysis/SKILL.md](skills/kr-sector-analysis/SKILL.md)
- [skills/kr-sector-compare/SKILL.md](skills/kr-sector-compare/SKILL.md)
- [skills/kr-sector-audit/SKILL.md](skills/kr-sector-audit/SKILL.md)
- [skills/kr-sector-update/SKILL.md](skills/kr-sector-update/SKILL.md)

현재 동작:

1. `kr-sector-plan`은 섹터 범위와 출력 모드를 정합니다.
2. `kr-sector-data-pack`은 시장 지표, 정책, 규제, 밸류체인, 상장사 후보를 모읍니다.
3. `kr-sector-analysis`는 quick brief 또는 full report를 작성합니다.
4. `kr-sector-compare`는 같은 날짜 기준으로 섹터를 비교합니다.
5. `kr-sector-audit`는 findings-first 형식으로 기존 문서를 점검합니다.
6. `kr-sector-update`는 기존 메모의 증분 업데이트를 관리합니다.

## 사용 예시

### Codex

```text
$us-stock-analysis로 NVDA에 대한 기준일 명시 투자 메모를 작성해줘. 밸류에이션, 촉매, 리스크, 차트 맥락을 포함해줘.
```

```text
$kr-stock-plan을 064400.KS 분석의 진입점으로 사용해줘. 먼저 내가 실제로 필요한 걸 짧게 물어보고, 티커, 주식 종류, 기간, 출력 모드, 핵심 질문을 확정한 다음, 내가 브리프만 원한다고 하지 않으면 한국 주식 하위 workflow까지 자동으로 이어서 실행해줘.
```

```text
$kr-stock-dart-analysis로 LG CNS 최신 분기 또는 반기 공시를 기준으로 매출, 영업이익, 사업부문 차이, 고객집중도, 그리고 누적 DART 수치에서 필요한 분기 단독 환산까지 포함한 공시 기반 요약을 추출해줘.
```

```text
$kr-stock-dart-analysis로 한국 기업의 공시상 수주잔고를 확인하고, 같은 기준의 연간 매출과 비교해서 백로그 커버리지를 한국어로 정리해줘. 소스 매핑을 분명히 하고, 이 비율이 공시된 KPI가 아니라 계산값이라는 점도 표시해줘.
```

```text
$kr-stock-dart-analysis로 최근 12개월 동안 한국 기업이 공시한 단일판매ㆍ공급계약을 모두 행별로 정리해줘. 최초 공시, 정정 여부, 상대방, 금액, 매출 비중, 계약 기간, 최신 상태가 보이게 해줘.
```

```text
$kr-stock-dart-analysis로 한국 기업의 단일판매ㆍ공급계약 공시를 모두 정리하고, 현재 유효 계약 금액 중 2027년까지, 2028년까지, 그리고 그 이후 연도별로 얼마나 종료되는지 만기 분포 표도 추가해줘. 공시에서 수주잔고를 따로 밝히지 않으면 정식 backlog가 아니라 계약 기간 기준 커버리지라는 점을 분명히 적어줘.
```

```text
$kr-stock-data-pack으로 LG CNS에 대한 날짜가 보이는 팩트팩을 모아줘. 가격 맥락, 공시, 최신 실적, 거버넌스 팩트, 밸류 입력값, 차트 입력값, 그리고 증권사나 전문매체의 외부 시각까지 포함해줘.
```

```text
$kr-stock-analysis로 005930.KS를 분석해줘. DART 기반 근거, 시장 또는 대안적 시각, 밸류에이션, 거버넌스 체크, 촉매, 차트 맥락, 후속 리서치 질문까지 포함해줘.
```

```text
$kr-stock-update로 `analysis-example/kr/엘앤에프/memo.md`를 업데이트해줘. 메모 기준일 이후 나온 회사 공시, IR 자료, 뉴스만 반영하고, 같은 파일에 날짜가 표시된 업데이트 블록을 추가해줘.
```

```text
$kr-portfolio-monitor로 현재 키움 지원 KRX 보유 종목을 점검하고, SMA20 이격도와 RSI14를 계산해서 결과를 `analysis-example/kr/portfolio-snapshot.md`에 작성해줘.
```

```text
$kr-naver-blog-publish로 `analysis-example/kr/SOOP/memo.md`를 네이버 블로그용 포스트로 변환하고 SmartEditor에서 draft 저장, 차트 이미지 업로드, 미리보기 스크린샷까지 만든 다음 게시 직전에 멈춰줘. 내가 미리보기 확인하고 "발행해"라고 말하면 그때 한 번만 게시해줘.
```

```text
$kr-sector-analysis로 국내 보안관제 시장 보고서를 작성해줘. 시장 정의, 성장 동인, 제약 요인, 밸류체인, 규제, 기업 지도, 기준일이 보이는 팩트를 포함해줘.
```

### Claude Code

```text
/us-stock-analysis prepare a dated investment memo for NVDA with valuation, catalysts, risks, and chart context.
```

```text
/kr-stock-plan 064400.KS를 진입점으로 사용해서 먼저 내가 필요한 걸 짧게 물어보고, 티커, 주식 종류, 기간, 출력 모드, 핵심 질문을 확정한 다음, 내가 브리프만 원한다고 하지 않으면 한국 주식 하위 workflow까지 자동으로 이어서 실행해줘.
```

```text
/kr-stock-dart-analysis extract a filing-grounded summary for LG CNS covering the latest quarterly or half-year revenue, operating profit, segment differences, customer concentration, and any standalone-quarter derivations needed from cumulative DART figures.
```

### Claude.ai DART 브라우저 워크플로

Codex나 Claude Code가 DART 뷰어를 직접 다루기 어려울 때는 [`integrations/claude-dart-extension/`](integrations/claude-dart-extension/README.md)의 Chrome extension을 사용합니다.

1. 지원 대상 DART 뷰어 페이지 `https://dart.fss.or.kr/dsaf001/main.do*`를 엽니다.
2. extension이 자동 추출을 시도할 때까지 기다립니다.
3. 팝업 상태가 `Export ready`이면 `Save Export`를 눌러 JSON을 저장합니다.
4. 저장한 파일을 정규화합니다.

```text
node skills/kr-stock-dart-analysis/scripts/normalize-browser-dart-export.js --input dart-browser-export.json --output dart-text.txt
node skills/kr-stock-dart-analysis/scripts/extract-dart-sections.js --input dart-text.txt --output sections.json
node skills/kr-stock-dart-analysis/scripts/verify-dart-coverage.js --input sections.json --output coverage.json
```

5. Claude.ai에 JSON을 첨부하거나 이후 DART 스크립트 흐름을 계속 실행합니다.

참고 파일:

- [Claude DART Extractor README](integrations/claude-dart-extension/README.md)
- [브라우저 export 샘플 JSON](examples/kr-stock-dart-analysis/dart-browser-export-sample.json)

### OpenDART API 워크플로

`OPENDART_API_KEY`가 환경에 있으면 Chrome extension 대신 API 경로를 우선 사용합니다. `fetch-opendart.js`는 동일한 `dart-browser-export.json` 스키마를 출력하므로 이후 `normalize → extract → verify → build-reference` 체인은 그대로 사용됩니다.

```bash
# 키는 레포 루트의 gitignored .env 파일에 두거나 인라인으로 export
export OPENDART_API_KEY=<your_key>
node skills/kr-stock-dart-analysis/scripts/fetch-opendart.js --ticker 267250 --year 2025 --report-code 11011 --output analysis-example/kr/HD현대/
node skills/kr-stock-dart-analysis/scripts/normalize-browser-dart-export.js --input analysis-example/kr/HD현대/dart-browser-export.json --output analysis-example/kr/HD현대/dart-text.txt
node skills/kr-stock-dart-analysis/scripts/extract-dart-sections.js --input analysis-example/kr/HD현대/dart-text.txt --output analysis-example/kr/HD현대/dart-sections.json
node skills/kr-stock-dart-analysis/scripts/verify-dart-coverage.js --input analysis-example/kr/HD현대/dart-sections.json --output analysis-example/kr/HD현대/dart-coverage.json
node skills/kr-stock-dart-analysis/scripts/build-dart-reference.js --sections analysis-example/kr/HD현대/dart-sections.json --coverage analysis-example/kr/HD현대/dart-coverage.json --output analysis-example/kr/HD현대/dart-reference.md --company "HD현대" --ticker 267250 --filing-title "사업보고서 (2025.12)" --filing-date 2026-03-20 --as-of 2026-05-10
```

`--report-code`는 `11011`(사업보고서), `11012`(반기보고서), `11013`(1분기보고서), `11014`(3분기보고서). 캐시는 `.tmp/opendart-cache/`(gitignored)에 저장되며, API 키는 어떤 경우에도 로그로 출력되지 않습니다.

```text
/kr-stock-dart-analysis list all disclosed single-sales or supply contracts for a Korean company over the last 12 months, keeping original notices, amendments, counterparties, amounts, sales ratios, contract periods, and latest status visible row by row.
```

```text
/kr-stock-dart-analysis list all disclosed single-sales or supply contracts for a Korean company and add a maturity table showing how much current effective contract amount ends by 2027, by 2028, and by each later year, clearly labeled as contract-period coverage rather than formal backlog unless the filing discloses backlog.
```

```text
/kr-stock-data-pack gather a dated company fact pack for LG CNS with price context, filings, latest results, governance facts, valuation inputs, chart inputs, and outside-view inputs from sell-side or specialist media.
```

```text
/kr-stock-analysis analyze 005930.KS with DART-based evidence, street or alternative views, valuation, governance checks, catalysts, chart context, and follow-up research questions.
```

```text
/kr-stock-update update analysis-example/kr/엘앤에프/memo.md with company-specific disclosures, IR materials, and news after the memo date, and append a dated update block to the same file.
```

```text
/kr-portfolio-monitor scan current Kiwoom-supported KRX holdings, compute SMA20 deviation and RSI14, and write the result to analysis-example/kr/portfolio-snapshot.md.
```

```text
/kr-sector-analysis write a Korea security-operations market report with market definition, drivers, constraints, value chain, regulation, company map, and source-dated facts.
```

## 분석 예시

검증된 golden example과 재사용 fixture만 링크합니다.

**풀 의사결정 메모:**

- [KR - LG CNS Memo](<analysis-example/kr/LG CNS/memo.md>)
- [KR - 대양전기공업 Memo](<analysis-example/kr/대양전기공업/memo.md>)
- [KR - LIG넥스원 Memo](<analysis-example/kr/LIG넥스원/memo.md>)
- [KR - 삼성SDS Memo](<analysis-example/kr/삼성SDS/memo.md>)
- [KR - 엘앤에프 Memo](<analysis-example/kr/엘앤에프/memo.md>)
- [KR - 현대오토에버 Memo](<analysis-example/kr/현대오토에버/memo.md>)
- [KR - HD현대 Memo (지주사, OpenDART 1차 자료 기반)](<analysis-example/kr/HD현대/memo.md>)

**리서치 브리프 및 DART 레퍼런스:**

- [KR - LG CNS DART Reference](<analysis-example/kr/LG CNS/dart-reference.md>)
- [KR - LIG넥스원 리서치 브리프](<analysis-example/kr/LIG넥스원/리서치브리프.md>)
- [KR - 엘앤에프 Chart Analysis](<analysis-example/kr/엘앤에프/chart-analysis.md>)
- [KR - 엘앤에프 Pattern/Wave Chart PNG](<analysis-example/kr/assets/엘앤에프-chart-pattern.png>)
- [KR - 엘앤에프 Pattern/Wave CSV](<analysis-example/kr/assets/엘앤에프-chart-pattern-waves.csv>)
- [KR - HD현대 DART Reference (OpenDART 기반)](<analysis-example/kr/HD현대/dart-reference.md>)
- [KR - HD현대 DART Coverage](<analysis-example/kr/HD현대/dart-coverage.json>)
- [KR - HD현대 Chart PNG](<analysis-example/kr/assets/HD현대-chart.png>)
- [KR - HD현대 Overlay Chart PNG](<analysis-example/kr/assets/HD현대-chart-overlay.png>)
- [KR - HD현대 Momentum Chart PNG](<analysis-example/kr/assets/HD현대-chart-momentum.png>)

**수주 및 계약 분석:**

- [KR - 두산에너빌리티 수주통합분석](<analysis-example/kr/두산에너빌리티/수주통합분석.md>)
- [KR - 한미글로벌 수주계약리스트](<analysis-example/kr/한미글로벌/수주계약리스트.md>)
- [KR - 한전KPS 수주계약리스트](<analysis-example/kr/한전KPS/수주계약리스트.md>)

**Naver 블로거 인사이트 (Street / Alternative Views):**

- [KR - 삼성SDS Naver Insights](<analysis-example/kr/삼성SDS/naver-insights.md>)
- [KR - 엘앤에프 Naver Insights](<analysis-example/kr/엘앤에프/naver-insights.md>)
- [KR - 알테오젠 Naver Insights](<analysis-example/kr/알테오젠/naver-insights.md>)
- [KR - GRT Naver Insights](<analysis-example/kr/GRT/naver-insights.md>)
- [KR - 삼성SDS Naver Blogger 후보](<analysis-example/kr/삼성SDS/naver-bloggers.json>)

**섹터 리서치:**

- [KR Sector - 국내 데이터센터](analysis-example/kr-sector/국내%20데이터센터.md)
- [KR Sector - 국내 데이터센터 리서치 브리프](analysis-example/kr-sector/국내%20데이터센터-리서치브리프.md)

**Fixture:**

- [KR - DART browser export sample](examples/kr-stock-dart-analysis/dart-browser-export-sample.json)

## 검증

Windows:

```powershell
.\scripts\validate-skills.ps1
```

Linux 또는 macOS:

```bash
bash ./scripts/validate-skills.sh
```

이 검증에는 다음이 포함됩니다.

- skill 명세 체크
- skill frontmatter strict YAML 파싱 체크
- 문서와 agent prompt의 산출물 경로 계약 체크
- README 로컬 링크 존재 여부 체크
- [docs/quality-rubrics.md](docs/quality-rubrics.md) 기준 golden example 감사
