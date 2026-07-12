# KrResearchKit — Korean + U.S. Equity Research

AI skills for U.S. and Korean stock analysis, KRX portfolio monitoring, and Korea-focused sector research. Native to both **Claude Code** and **OpenAI Codex CLI**.

Languages:

- English — [README.md](README.md)
- 한국어 — [README-kr.md](README-kr.md)

Strongest with Korean equities, now with a U.S. SEC precision stage: one Korean ticker question goes through DART filings, KRX chart pack, sell-side consensus, foreign-IB coverage, trade-flow proxy checks, and Naver-blog publishing; U.S. stock work can start from SEC EDGAR/XBRL evidence packs before the final memo. Stock artifacts land in `analysis-example/<market>/<company>/memo.md`.

Recent example: [부국증권 보통주·우선주 결정 메모](<analysis-example/kr/부국증권/memo.md>).

## Quick Install

In Claude Code:

```text
/plugin marketplace add ray5273/kr-research-kit
/plugin install kr-research-kit@kr-research-kit-marketplace
```

Anthropic community marketplace submission is in review — the same plugin will be discoverable from the official catalog once approved. See [docs/MARKETPLACE.md](docs/MARKETPLACE.md).

<details>
<summary>Manual install (Codex or Claude Code git clone)</summary>

Codex:

```bash
git clone --single-branch --depth 1 https://github.com/ray5273/kr-research-kit ~/.codex/src/kr-research-kit
cd ~/.codex/src/kr-research-kit && bash ./scripts/install-all-skills.sh
```

Claude Code:

```bash
git clone --single-branch --depth 1 https://github.com/ray5273/kr-research-kit ~/.claude/src/kr-research-kit
cd ~/.claude/src/kr-research-kit && bash ./scripts/install-all-claude-skills.sh
```

OpenDART API key, SEC EDGAR `User-Agent`, macOS Naver fallback, Windows PowerShell, custom install targets, and the Chrome extension DART path are all in [docs/INSTALL.md](docs/INSTALL.md).

</details>

## Use Cases

Seven end-to-end scenarios. Each prompt works as-is in Claude Code (`/skill`) or Codex (`$skill`).

### 1. Naver KOL — one cycle from ticker to blog post (10 min)

```text
/kr-stock-plan SOOP(067160) 결정 메모 작성한 다음, 차트·DART·증권사·외국계 IB·블로거 인사이트까지 채우고, 마지막에 Naver 블로그에 올려줘 (게시 직전에 미리보기 보여줘)
```

Chain: `kr-stock-plan` → `kr-stock-chart` → `kr-stock-dart-analysis` → `kr-foreign-analyst` + `kr-analyst-report-*` → `kr-naver-blogger` + `kr-naver-insight` → `kr-stock-analysis` → `kr-naver-blog-publish` (publish requires explicit user approval via screenshot review — never auto-publishes).

Output: a complete memo + 5-panel charts + Naver SmartEditor draft. See [HMM memo example](analysis-example/kr/HMM/memo.md).

### 2. Foreign-IB consensus tracking (3 min, USP)

```text
/kr-foreign-analyst 삼성전자(005930)에 대한 외국계 IB 최근 6개월 커버리지를 한국 뉴스에서 수집해 ## Street / Alternative Views 블록으로 정리해줘. 모든 view는 날짜·broker·rating·TP·한국 뉴스 URL과 1:1 매칭되게 해줘.
```

Why this matters: foreign IBs in Korea leak views through Korean-language news, not English research portals. This skill captures Morgan Stanley / Goldman / JPM / Nomura / CLSA / UBS / HSBC / Macquarie / Citi / BofA / Daiwa coverage directly. Every view links to a dated Korean news URL.

### 3. DART single-supply contract timeline (5 min)

```text
/kr-stock-dart-analysis 한미글로벌이 최근 24개월 동안 공시한 단일판매·공급계약을 모두 행별로 정리하고, 현재 유효 계약 금액 중 2027년까지, 2028년까지, 그 이후 연도별로 얼마나 종료되는지 만기 분포 표도 추가해줘. 공시에서 수주잔고를 따로 밝히지 않으면 정식 backlog가 아니라 계약 기간 기준 커버리지라는 점을 분명히 적어줘.
```

Output: row-by-row contract timeline + maturity distribution + explicit "disclosed vs derived" labels. Sample: [한미글로벌 수주계약리스트](<analysis-example/kr/한미글로벌/수주계약리스트.md>).

### 4. Daily KOSPI + KOSDAQ leadership screen (2 min)

```text
/kr-market-leaders 오늘 기준 KOSPI + KOSDAQ 통합 universe에서 단기·중기·구조 lens별 leadership 스크리닝 돌려줘. RS, 거래량, 52주 신고가 트리거 포함하고, 어제 leaders-YYYY-MM-DD.md와 비교해서 오늘 신규 진입한 top-20 종목을 별도 표로 정리해줘.
```

Output: `analysis-example/kr-market/leaders-<YYYY-MM-DD>.md` + `.json` cache with prior-day diff. Daily artifact, regenerated each run. Example: [leaders-2026-07-04](analysis-example/kr-market/leaders-2026-07-04.md).

Optional Telegram delivery is a separate post-processing step, never part of collection or Naver publishing:

```bash
node skills/telegram-report-sender/scripts/send-telegram.js --input analysis-example/kr-market/leaders-2026-07-04.json --dry-run
```

### 5. Undisclosed customer / end-demand reverse tracking (CSV-first)

```text
/kr-trade-flow-analysis 엘앤에프(066970)의 중국 NCM 관련 수출입 CSV를 trade-flow-data.json으로 정규화하고, DART/peer/기존 공급계약과 교차검증해서 공시 확인 사실과 high-confidence investment inference를 분리한 trade-flow-analysis.md를 작성해줘. Tesla EV LFP는 제외하고 Samsung SDI/미국향 ESS LFP는 별도 thesis로 추적해줘.
```

Output: `analysis-example/kr/<company>/trade-flow-analysis.md` + `trade-flow-data.json`. Use case: 비공개 고객사/최종 수요를 수출입 지표로 역추적하되, `Trade Flow Inference`와 `confirmed disclosure`를 분리한다. Skill files: [kr-trade-flow-analysis](skills/kr-trade-flow-analysis/SKILL.md), [output format](skills/kr-trade-flow-analysis/references/output-format.md).

Example: [엘앤에프 trade-flow-analysis.md](analysis-example/kr/엘앤에프/trade-flow-analysis.md), [trade-flow-data.json](analysis-example/kr/엘앤에프/trade-flow-data.json).

### 6. Korean brokerage report watch

```text
Use $kr-analyst-report-watch in daily mode for today's Korean brokerage report flow. Summarize the Top 10 public reports, compare narrative changes by topic, and write analysis-example/kr-reports/report-watch-daily-YYYY-MM-DD.md and .json.
```

Output: `analysis-example/kr-reports/report-watch-<mode>-<YYYY-MM-DD>.md` + `.json`, with topic keys, narrative delta labels, source quality gaps, and links back to public report sources. Skill files: [kr-analyst-report-watch](skills/kr-analyst-report-watch/SKILL.md), [output format](skills/kr-analyst-report-watch/references/output-format.md).

To send the report summary and attachment to Telegram after generation, configure [`.env.telegram.example`](.env.telegram.example) values in the `telegram-report-sender` skill folder's gitignored `.env`, then run `node skills/telegram-report-sender/scripts/send-telegram.js --input <artifact>`.

### 7. Codex Desktop daily market-news automation

```text
Use $kr-daily-market-news to create today's Korean market-wide and sector daily news report for blog publication. Write analysis-example/kr-market/daily-news-YYYY-MM-DD.md and .json, then use $kr-naver-blog-publish in scheduled mode.
```

Output: `analysis-example/kr-market/daily-news-<YYYY-MM-DD>.md` + `.json` and a dated Naver publish manifest. Examples: [daily-news-2026-06-28](analysis-example/kr-market/daily-news-2026-06-28.md), [daily-news-2026-06-29](analysis-example/kr-market/daily-news-2026-06-29.md), [daily-news-2026-07-02](analysis-example/kr-market/daily-news-2026-07-02.md), [2026-06-29 Naver post](analysis-example/kr-market/naver-post-2026-06-29.md), [2026-07-02 Naver post](analysis-example/kr-market/naver-post-2026-07-02.md), [2026-06-29 publish manifest](analysis-example/kr-market/naver-publish-2026-06-29.json), [2026-07-02 publish manifest](analysis-example/kr-market/naver-publish-2026-07-02.json). Sector collection uses the default seed list at [examples/kr/daily-sector-stocks.json](examples/kr/daily-sector-stocks.json).

U.S. daily market news uses the same artifact contract with U.S. sources, New York date filtering, and GICS-style sector seeds:

```text
Use $us-daily-market-news to create today's U.S. market-wide and sector daily news report for blog publication. Write analysis-example/us-market/daily-news-YYYY-MM-DD.md and .json, then use $kr-naver-blog-publish in scheduled mode.
```

Sector collection uses [examples/us/daily-sector-stocks.json](examples/us/daily-sector-stocks.json) and the optional watchlist compatibility file at [examples/us/daily-watchlist.json](examples/us/daily-watchlist.json). The evidence-first workflow writes an editorial queue; reviewed Korean copy must cite body evidence IDs using [daily-market-editorial.example.json](examples/us/daily-market-editorial.example.json).

U.S. examples: [2026-07-09 daily report](analysis-example/us-market/daily-news-2026-07-09.md), [2026-07-10 daily report](analysis-example/us-market/daily-news-2026-07-10.md), [2026-07-09 Naver post](analysis-example/us-market/naver-post-2026-07-09.md), and [2026-07-09 publish manifest](analysis-example/us-market/naver-publish-2026-07-09.json).

Telegram delivery is available for Korean/U.S. daily-news JSON or Markdown artifacts as an explicit follow-up command. It sends a short summary plus the matching `.md` file when present:

```bash
node skills/telegram-report-sender/scripts/send-telegram.js --input analysis-example/kr-market/daily-news-2026-07-02.json --dry-run
node skills/telegram-report-sender/scripts/send-telegram.js --input analysis-example/us-market/daily-news-2026-07-02.json --summary-only
```

Remove `--dry-run` only after `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` are set in the sender skill folder `.env` or passed with CLI flags.

U.S. SEC filing precision uses official SEC submissions, companyfacts, and filing archive documents:

```text
Use $us-sec-analysis for AAPL and create a Korean SEC evidence pack from the latest 10-K and 10-Q with XBRL facts and Source Map.
```

Output: `analysis-example/us/<company>/sec-analysis.md` plus optional `sec-reference.md` and `sec-cache.json`. Examples: [Tesla SEC analysis](analysis-example/us/Tesla/sec-analysis.md) and [Tesla full memo](analysis-example/us/Tesla/memo.md). Offline validation fixtures: [AAPL submissions sample](examples/us-sec-analysis/submissions-aapl-sample.json), [AAPL companyfacts sample](examples/us-sec-analysis/companyfacts-aapl-sample.json), and [AAPL 10-K HTML sample](examples/us-sec-analysis/filing-10k-aapl-sample.html).

More scenarios (sector compare, portfolio health, post-earnings update) → [docs/MARKETPLACE.md § Use cases](docs/MARKETPLACE.md). Full prompt catalog for every shipped skill → [docs/USAGE.md](docs/USAGE.md).

## Outputs Preview

Memos lead with the decision question, not a generic company description. From HD현대중공업:

> 무엇이 투자판단을 가장 크게 바꾸나? 2026년 하반기에도 1Q26의 15%대 OPM이 유지되는지, 그리고 고선가/엔진/해양/특수선 옵션이 실제 이익으로 이어지는지가 핵심이다.

DART recheck distinguishes `confirmed`, `partially supported`, and `not separately disclosed` claims before moving to valuation and stance. Chart artifacts ship alongside the memo so the writeup and visuals stay in sync:

![HD현대중공업 main trend chart](analysis-example/kr/HD현대중공업/assets/HD현대중공업-chart.png)

![HD현대중공업 momentum chart](analysis-example/kr/HD현대중공업/assets/HD현대중공업-chart-momentum.png)

Full index of 35+ example artifacts and fixtures (memos, Naver posts, DART references, SEC fixtures, chart packs, sector reports) → [docs/EXAMPLES.md](docs/EXAMPLES.md).

## What's Inside

30 skills. Korean stock pipeline: `kr-stock-plan → kr-stock-chart → kr-stock-dart-analysis → kr-trade-flow-analysis → kr-stock-data-pack → kr-stock-analysis`. Daily market workflows: `kr-daily-market-news` / `us-daily-market-news → kr-naver-blog-publish`; report monitoring: `kr-analyst-report-watch`; Telegram follow-up: `telegram-report-sender`. U.S. stocks: `us-sec-analysis → us-stock-analysis`. Sector workflow: `kr-sector-plan / -data-pack / -analysis / -compare / -audit / -update`.

Full catalog + per-skill behavior + bundled helpers → [docs/SKILLS.md](docs/SKILLS.md).

## Docs

- Installation (Plugin / Codex / Claude Code / OpenDART / SEC User-Agent / Chrome extension / fonts / known issues) — [docs/INSTALL.md](docs/INSTALL.md)
- Skills catalog & behavior — [docs/SKILLS.md](docs/SKILLS.md)
- Prompt catalog for every skill — [docs/USAGE.md](docs/USAGE.md)
- Analysis examples index — [docs/EXAMPLES.md](docs/EXAMPLES.md)
- Marketplace submission tracker — [docs/MARKETPLACE.md](docs/MARKETPLACE.md)
- Quality rubrics for memo audits — [docs/quality-rubrics.md](docs/quality-rubrics.md)

## Validation

```bash
bash ./scripts/validate-skills.sh        # Linux / macOS
.\scripts\validate-skills.ps1            # Windows PowerShell
```

Validation covers skill spec checks, strict YAML frontmatter parsing, output-path contracts, README local-link verification, and golden example audits.
