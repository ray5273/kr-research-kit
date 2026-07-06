# Marketplace Submission Guide

This document tracks how `kr-research-kit` (a.k.a. KrResearchKit, repo
`ray5273/kr-research-kit`) gets onto the public AI agent skill catalogs.
It captures the official spec as of June 2026 plus the in-repo files that
back each channel. Re-verify spec links before each submission — the docs are
moving targets.

## Channels at a glance

| Channel | Status (Jun 2026) | Submission path | Time-to-live |
| --- | --- | --- | --- |
| **Self-hosted Claude marketplace** | Live the moment a user runs `/plugin marketplace add ray5273/kr-research-kit` | None — already wired via `.claude-plugin/marketplace.json` | Immediate |
| **Anthropic community marketplace** (`@claude-community`) | Form-based, manual review + automated safety screen | claude.ai or platform.claude.com form (see below) | Days to a couple of weeks |
| **Anthropic official marketplace** (`claude-plugins-official`) | Curated by Anthropic, no application process | Anthropic invites at its discretion | N/A — passive |
| **OpenAI Codex public catalog** (`openai/skills`) | Self-publishing "coming soon" per Codex plugin docs | For now, file a PR against `github.com/openai/skills` or wait | Weeks |
| **agentskills.io** | Open standard catalog (Dec 2025) | Listed once skills follow the open spec — verify before submit | Days |

## 1. Self-hosted Claude marketplace (no submission)

Already live. Users in Claude Code:

```text
/plugin marketplace add ray5273/kr-research-kit
/plugin install kr-research-kit@kr-research-kit-marketplace
```

Backing files in this repo:

- `.claude-plugin/plugin.json` — plugin manifest (name `kr-research-kit`,
  version `0.1.0`, MIT, keywords for discoverability).
- `.claude-plugin/marketplace.json` — marketplace manifest. `plugins[]`
  enumerates the published Korean + U.S. skill paths under `skills/` and points
  `source: "."` so the repo serves as both plugin and marketplace.
- `manifest.json` (repo root) — _informational_ project descriptor. Not read
  by Claude Code; lives next to README for human/marketplace-card consumption.
- `NOTICE` — third-party attribution (NotoSansKR SIL OFL, gstack MIT,
  pypdf BSD-3, Pillow HPND, Bun MIT). Required for clean redistribution.

Validate locally before publishing changes:

```bash
# When Claude Code CLI is installed:
claude plugin validate

# Always:
bash ./scripts/validate-skills.sh
```

## 2. Anthropic community marketplace (`@claude-community`)

This is the primary distribution channel for v0.1.0. Submission is **form-based**, not a PR.

### Submission form

| Account type | Form |
| --- | --- |
| Team / Enterprise organization (directory management access) | https://claude.ai/admin-settings/directory/submissions/plugins/new |
| Individual author | https://platform.claude.com/plugins/submit |

The form asks for the repo URL (`https://github.com/ray5273/kr-research-kit`) and the plugin name (`kr-research-kit`). The review pipeline pulls `.claude-plugin/plugin.json` from a specific commit SHA and runs `claude plugin validate` plus automated safety screening.

Approved plugins land in `anthropics/claude-plugins-community/.claude-plugin/marketplace.json` pinned to a commit SHA. CI auto-bumps the pin as new commits land on this repo. Public catalog sync runs nightly — there is a delay between approval and the plugin appearing as installable.

### Pre-submission checklist

- [ ] `claude plugin validate` passes locally (run it once Claude Code CLI ≥ v2.1 is installed).
- [ ] `bash ./scripts/validate-skills.sh` green.
- [ ] CI badge green in README.
- [ ] `.claude-plugin/plugin.json` `version` matches the latest git tag.
- [ ] `NOTICE` lists every redistributed third-party asset.
- [ ] No secrets in tracked files (`.env` is gitignored — confirm `git ls-files | grep .env` is empty).
- [ ] README has a "Sponsor" section + FUNDING.yml configured (`github: ray5273` + KakaoPay link).
- [ ] At least one runnable demo: `node scripts/harness.js --mode all --ticker 066970 --company "엘앤에프" --with-blog --with-analyst` works on a fresh clone.
- [ ] Naver SmartEditor automation (`kr-naver-blog-publish`) explicitly gated on user approval (already enforced by SKILL.md — confirm before submit so reviewers don't flag spam risk).

### Listing card copy (paste into submission form)

- **Plugin name:** `kr-research-kit`
- **Display name:** KrResearchKit — Korean + U.S. Equity Research
- **Category:** `finance`
- **Tags:** `korean-market`, `us-market`, `equity-research`, `krx`, `sec-edgar`, `dart`, `naver-blog`
- **Homepage:** https://github.com/ray5273/kr-research-kit
- **Sponsor:** GitHub Sponsors `ray5273` + KakaoPay (linked via `.github/FUNDING.yml`)

#### Short tagline (≤80 chars)

- **EN:** Korean + U.S. equity research — DART/SEC, consensus, charts, Naver publish.
- **KR:** 한국+미국 주식 리서치 — DART/SEC, 컨센서스, 차트, 네이버 게시까지.

#### Long description (English, ≤500 words)

> **AI-native Korean + U.S. equity research in one skill pack.** One Korean ticker question goes through:
>
> 1. **Filing precision** — `kr-stock-dart-analysis` pulls primary OpenDART filings (사업/반기/분기보고서, 단일판매·공급계약, 임원·주요주주 등) via the official API. Chrome-extension fallback for sessions without an API key.
> 2. **Chart pack** — `kr-stock-chart` renders five synchronized PNG panels (trend, overlay, momentum, structure with volume-by-price + S/R zones, pattern with swing pivots + Fibonacci) plus structure-zone and pattern-wave CSV sidecars. Auto-discovers Korean fonts on macOS/Linux/Windows.
> 3. **Sell-side consensus** — `kr-analyst-report-discover/fetch/insight` crawls Hankyung Consensus (primary) and Naver Pay Research (fallback), downloads PDFs, extracts text via pypdf, and renders a 7-section digest with verbatim broker quotes, divergence flags, and TP trajectory.
> 4. **Foreign-IB coverage** — `kr-foreign-analyst` extracts views from Morgan Stanley, Goldman, JPMorgan, Nomura, CLSA, UBS, HSBC, Macquarie, Citi, BofA, Daiwa, etc. directly from Korean news (연합인포맥스/한경/머니투데이/네이버 뉴스). Never invents a broker — every view links to a dated Korean news URL.
> 5. **Independent retail views** — `kr-naver-blogger` + `kr-naver-insight` discover and summarize relevant Naver bloggers for a `Street / Alternative Views` section.
> 6. **Decision memo** — `kr-stock-analysis` writes a memo with fixed headers (`Decision Frame`, `DART Recheck`, `Street / Alternative Views`, `Valuation Snapshot`, `Catalysts & Disconfirming Evidence`, `Uncomfortable Questions`, `Structured Stance`, `Follow-up Research Prompts`).
> 7. **Naver publish** — `kr-naver-blog-publish` converts the memo to a Naver SmartEditor draft with charts, tags, and a preview screenshot. **Publish requires explicit user approval via screenshot review — never auto-publishes.**
>
> U.S. stock work adds `us-sec-analysis`, which collects official SEC submissions, latest 10-K/10-Q filing text, latest 8-K metadata, standardized XBRL companyfacts, `sec-reference.md`, `sec-cache.json`, and a Source Map before `us-stock-analysis` writes thesis, valuation, catalysts, and risks.
>
> Also bundled: `kr-market-leaders` (KOSPI + KOSDAQ leadership screener), `kr-portfolio-monitor` (SMA20/RSI14 portfolio health), `kr-stock-update` (baseline-aware memo maintenance with gated thesis updates), U.S. daily market news, Korean brokerage report watch, explicit Telegram report sending, and a full sector workflow (`kr-sector-plan/-analysis/-data-pack/-compare/-audit/-update`). 30 skills total.
>
> Native to both **Claude Code** and **OpenAI Codex CLI**. No npm dependencies (Node stdlib only). Optional Python (pypdf, Pillow) for PDF extraction and chart text rendering on macOS/Linux. Optional Bun for Naver browser automation.
>
> **Useful env:** `OPENDART_API_KEY` (free, opendart.fss.or.kr) for Korean filings and `SEC_USER_AGENT` (app/contact string) for live SEC collection. License: MIT. Third-party attributions in `NOTICE`.

#### Long description (한국어, ≤500자)

> **AI가 쓰는 한국 주식 리서치 메모 — 한 번 입력으로 끝.** 종목 하나를 입력하면 `kr-stock-plan`이 자동으로 라우팅:
>
> 1. **DART 공시 정밀 분석** — OpenDART API + Chrome 확장 fallback으로 사업/반기/분기보고서, 단일판매·공급계약, 임원·주요주주 등 1차 자료에서 직접 추출.
> 2. **차트 5장 + CSV sidecar** — 추세, 오버레이(이치모쿠 + RSI), MACD+ADX 모멘텀, 매물대 + 지지저항 zone, Fibonacci 파동까지. 한글 폰트 자동 탐지.
> 3. **증권사 컨센서스** — 한경 컨센서스(1차) + 네이버 페이 리서치(fallback)에서 PDF 자동 수집·텍스트 추출, 브로커 표·TP trajectory·다이버전스 플래그까지 7개 섹션 digest.
> 4. **외국계 IB 한국 보도** — 모건스탠리/골드만/JPM/노무라/CLSA 등 외국계 시각을 한국 뉴스에서 수집. 모든 view는 날짜 표시된 한국 뉴스 URL과 1:1 매칭.
> 5. **Naver 블로거 인사이트** — 동료 KOL 의견을 `Street / Alternative Views` 섹션으로 자동 정리.
> 6. **결정 메모 작성** — `Decision Frame`, `DART Recheck`, `Valuation Snapshot`, `Structured Stance` 같은 고정 헤더로 출력.
> 7. **Naver 블로그 자동 게시** — SmartEditor로 draft·이미지·태그·미리보기까지 준비. **발행 직전 사용자 명시 승인 필수 — 자동 스팸 없음.**
>
> 미국 주식은 `us-sec-analysis`가 SEC submissions, 최신 10-K/10-Q 원문, 최신 8-K 메타데이터, XBRL companyfacts, Source Map을 먼저 수집하고 `us-stock-analysis`가 thesis·valuation·catalyst·risk 메모로 넘깁니다.
>
> 추가 번들: `kr-market-leaders`(KOSPI+KOSDAQ leadership 스크리닝), `kr-portfolio-monitor`(SMA20/RSI14 헬스체크), `kr-stock-update`(기존 메모 상태 기반 증분 업데이트와 제한적 thesis 동기화), 미국 데일리 시장 뉴스, 증권사 리포트 워치, Telegram 리포트 발송, 섹터 워크플로 6종(`kr-sector-*`). 총 30개 스킬.
>
> **Claude Code + Codex CLI 양쪽 네이티브**. npm 의존성 0, Node stdlib만. 선택 의존성: Python(pypdf, Pillow), Bun(Naver 자동화).
>
> **주요 환경변수:** `OPENDART_API_KEY`(무료, opendart.fss.or.kr), `SEC_USER_AGENT`(SEC live 수집용 앱/연락처 문자열). License: MIT.

### Use cases (paste into submission form 또는 README)

각 시나리오는 사용자가 그대로 붙여넣을 수 있는 한 줄 프롬프트와, 내부적으로 어떤 스킬 체인이 실행되는지를 보여줍니다.

---

#### 1. Naver KOL — 종목 메모 작성부터 블로그 게시까지 한 사이클 (10분)

**페르소나**: 매주 2–3편 종목 메모를 발행하는 Naver 핀테크 블로거. 기존엔 데이터 수집 1시간 + 차트 30분 + 글쓰기 1시간 + Naver 업로드 20분이 걸렸음.

**프롬프트 (Claude Code / Codex 공통):**

```text
/kr-stock-plan SOOP(067160) 결정 메모 작성한 다음, 차트·DART·증권사·외국계 IB·블로거 인사이트까지 채우고, 마지막에 Naver 블로그에 올려줘 (게시 직전에 미리보기 보여줘)
```

**내부 체인:**
`kr-stock-plan` → `kr-stock-chart` → `kr-stock-dart-analysis` → `kr-foreign-analyst` + `kr-analyst-report-*` → `kr-naver-blogger` + `kr-naver-insight` → `kr-stock-analysis` → `kr-naver-blog-publish` (사용자 승인 게이트)

**산출물:**
- `analysis-example/kr/SOOP/memo.md` — 결정 메모 (Decision Frame, DART Recheck, Street/Alt Views, Valuation, Structured Stance)
- `analysis-example/kr/SOOP/assets/SOOP-chart{,-overlay,-momentum,-structure,-pattern}.png` — 5분할 차트
- `analysis-example/kr/SOOP/naver-preview.png` — 게시 직전 SmartEditor 스크린샷
- Naver 블로그에 발행된 글

---

#### 2. 실적 시즌 — 기존 메모 증분 업데이트 (5분)

**페르소나**: 실적 발표 다음 날 아침, 보유 종목 5개의 메모를 빠르게 갱신해야 하는 리테일 투자자.

**프롬프트:**

```text
/kr-stock-update analysis-example/kr/엘앤에프/memo.md를 이번 주 새 공시·뉴스 반영해서 업데이트해줘 (기존 기준일은 보존하고 기본은 ## Update Log만 갱신하되, thesis가 바뀌면 Summary/Structured Stance 같은 제한 섹션만 동기화)
```

**핵심 동작:** 먼저 기존 메모의 `Decision Frame`, `DART Recheck`, `Structured Stance`, `Follow-up Research Prompts`, `Update Log` 상태를 읽고 follow-up을 `answer-now` / `refresh-now` / `wait-for-event` / `ask-user`로 분류 → `refresh-now`일 때만 메모 `기준일` 이후 회사 공시·IR 자료·뉴스를 검토 → 기본은 날짜 표시된 Update Log 블록만 추가/교체 → material thesis delta가 있으면 허용된 본문 섹션만 제한 동기화.

---

#### 3. 외국계 IB 컨센서스 트래킹 (3분, KrResearchKit USP)

**페르소나**: 보유 종목에 대해 모건스탠리/골드만/JPM 등 외국계 시각이 한국 시장과 얼마나 다른지 매주 점검하는 셀사이드 애널리스트.

**프롬프트:**

```text
/kr-foreign-analyst 삼성전자(005930)에 대한 외국계 IB(MS, GS, JPM, Nomura, CLSA, UBS, HSBC 등) 최근 6개월 커버리지를 한국 뉴스에서 수집해서 ## Street / Alternative Views 블록으로 정리해줘. 모든 view는 날짜·broker·rating·TP·한국 뉴스 URL과 1:1 매칭되게 해줘.
```

**핵심 차별점:** 다른 도구는 영문 reports.com이나 SEC filings에 의존하지만, 한국 시장은 외국계 IB가 한국어 보도자료를 통해 view를 흘리는 경우가 많음. 이 스킬은 그 흐름을 직접 캐치.

**산출물:** `## Street / Alternative Views` Markdown 블록 — 메모에 그대로 붙여넣기 가능.

---

#### 4. DART 단일판매·공급계약 시계열 정리 (5분, 셀사이드용)

**페르소나**: 산업재·방산·조선 같이 수주 기반 비즈니스의 backlog coverage를 점검해야 하는 바이사이드 애널리스트.

**프롬프트:**

```text
/kr-stock-dart-analysis 한미글로벌이 최근 24개월 동안 공시한 단일판매·공급계약을 모두 행별로 정리하고, 현재 유효 계약 금액 중 2027년까지, 2028년까지, 그리고 그 이후 연도별로 얼마나 종료되는지 만기 분포 표도 추가해줘. 공시에서 수주잔고를 따로 밝히지 않으면 정식 backlog가 아니라 계약 기간 기준 커버리지라는 점을 분명히 적어줘.
```

**핵심 동작:** OpenDART API로 단일계약공시(`tesstkAcqsDspsSttus` + 정기공시 첨부)를 시계열로 정리 → 만기 분포 표 + "추정 vs 공시" 구분 표기. 추정값 환각 없음.

**산출물:** `analysis-example/kr/한미글로벌/수주계약리스트.md` (같은 워크플로 사례)

---

#### 5. KOSPI + KOSDAQ 매일 리더십 스크리닝 (2분)

**페르소나**: 매일 아침 한국 시장 leading stocks를 점검하고 어제 대비 신규 진입 종목을 발견하는 단기 트레이더.

**프롬프트:**

```text
/kr-market-leaders 오늘 기준 KOSPI + KOSDAQ 통합 universe에서 단기·중기·구조 lens별 leadership 스크리닝 돌려줘. RS, 거래량, 52주 신고가 트리거 포함하고, 어제 leaders-2026-06-26.md와 비교해서 오늘 신규 진입한 top-20 종목을 별도 표로 정리해줘.
```

**산출물:**
- `analysis-example/kr-market/leaders-YYYY-MM-DD.md` — 단기/중기/구조/composite lens별 top-N 표
- `analysis-example/kr-market/leaders-YYYY-MM-DD.json` — 캐시 (다음날 비교용)

---

#### 6. 섹터 비교 리서치 — "데이터센터 vs 2차전지" (15분)

**페르소나**: 두 테마 사이에서 자금 배분을 고민하는 PM.

**프롬프트:**

```text
/kr-sector-compare 국내 데이터센터와 국내 2차전지 섹터를 2026-06-27 기준으로 비교해줘. 시장 구조, 정책 tailwind, 상장 노출 깨끗함, 단기 positioning, 밸류에이션, 다운사이드 리스크 다섯 축으로 평가하고, 각 축마다 "어느 쪽이 우위인지" 명시해줘.
```

**내부 체인:** `kr-sector-plan` → 두 섹터에 대해 병렬 `kr-sector-data-pack` → `kr-sector-compare` (같은 날짜 기준 비교)

**산출물:** `analysis-example/kr-sector/데이터센터-vs-2차전지-2026-06-27.md`

---

#### 7. 포트폴리오 헬스 체크 (1분)

**페르소나**: 키움 계좌에 12–20 종목 보유 중, 매주 월요일 SMA20 이격도와 RSI14 기반으로 과열·과매도 종목만 필터링하고 싶은 개인 투자자.

**프롬프트:**

```text
/kr-portfolio-monitor 현재 키움 지원 KRX 보유 종목을 점검하고, 각 종목의 SMA20 이격도(%)와 RSI14를 계산해서 결과를 analysis-example/kr/portfolio-snapshot.md에 작성해줘. RSI14 > 70 또는 SMA20 이격도 > +15%인 종목은 "과열" 플래그, RSI14 < 30 또는 SMA20 이격도 < -15%인 종목은 "과매도" 플래그로 표시해줘.
```

**필요 조건:** `kiwoom-mcp` 연결 (없으면 수동 JSON + Yahoo Finance fallback).

---

### 시나리오 외 — 자주 묻는 질문

- **"내 분석 스타일에 맞게 메모 헤더를 바꿀 수 있나?"** — 네. `skills/kr-stock-analysis/references/output-format.md`를 수정하면 모든 후속 메모에 반영됩니다.
- **"OpenDART 키 없이 시작할 수 있나?"** — 네. Chrome 확장(`integrations/claude-dart-extension/`)으로 DART 뷰어 페이지를 직접 추출하면 동일 스키마(`dart-browser-export.json`)로 흐름이 이어집니다.
- **"Naver 자동 게시가 정책 위반은 아닌가?"** — `kr-naver-blog-publish`는 사용자 직접 운영하는 본인 계정에서, 발행 직전 미리보기 승인 게이트를 반드시 거치도록 설계되어 있습니다. 자동 스팸·대량 게시 시나리오는 차단됩니다.
- **"한국어 차트 깨짐 방지는?"** — 한글 폰트 자동 탐지 (macOS AppleSDGothicNeo, Linux Noto CJK/Nanum, Windows Malgun/Noto KR). 미감지 시 번들된 NotoSansKR 사용. `KR_STOCK_CHART_FONT` 환경변수로 강제 지정 가능.

## 3. OpenAI Codex catalog (`openai/skills`)

Per Codex docs (developers.openai.com/codex/skills, June 2026), self-publishing
to the public directory is **"coming soon"**. Current options:

- **PR to `github.com/openai/skills`**: 38 curated skills as of mid-2026.
  PR adds a skill subdirectory under the catalog repo. Each KR skill in this
  repo already follows the OpenAI format (`SKILL.md` + `scripts/` +
  `references/` + `agents/openai.yaml`), so PRs are technically ready — but
  the catalog appears to be Anthropic-style curated and may decline scope
  outside generic developer workflows.
- **Wait for self-publish**: monitor https://developers.openai.com/codex/changelog
  for the self-publish endpoint. Until then, primary Codex distribution is
  the same direct-install path users already use:

  ```bash
  bash ./scripts/install-all-skills.sh
  ```

## 4. agentskills.io (open standard)

Per Anthropic engineering blog, the Agent Skills format is an open standard
adopted by ~40 clients (GitHub Copilot, VS Code, Cursor, OpenAI Codex, Gemini
CLI) as of June 2026. Listing on agentskills.io exposes the pack to all of
them. Verify the current submission flow at https://agentskills.io before
submit — the showcase list and submission process were not fully documented
when this guide was written.

## Open items needing verification before submit

- [ ] Confirm exact submission URL is still live (the form URLs above were
  captured June 2026 via the docs page at code.claude.com/docs/en/plugins).
- [ ] Run `claude plugin validate` once Claude Code CLI is available locally.
- [ ] Confirm the Anthropic community catalog accepts the `skills[]` field
  inside a marketplace plugin entry as a scoping mechanism for the published
  Korean + U.S. skill subset — see `.claude-plugin/marketplace.json`.
- [ ] Decide whether to file a PR to `openai/skills` or hold for self-publish.

## References

- Claude Code plugin marketplaces — https://code.claude.com/docs/en/plugin-marketplaces
- Claude Code plugins — https://code.claude.com/docs/en/plugins
- Claude community submission form (claude.ai) — https://claude.ai/admin-settings/directory/submissions/plugins/new
- Claude community submission form (Console) — https://platform.claude.com/plugins/submit
- Official marketplace repo — https://github.com/anthropics/claude-plugins-official
- Community marketplace catalog — https://github.com/anthropics/claude-plugins-community/blob/main/.claude-plugin/marketplace.json
- OpenAI Codex skills — https://developers.openai.com/codex/skills
- OpenAI skills catalog — https://github.com/openai/skills
- Agent Skills standard — https://agentskills.io
