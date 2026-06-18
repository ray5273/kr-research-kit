# Stock, Portfolio, And Sector Analysis Skill

AI skills for U.S. and Korean stock analysis, KRX portfolio monitoring, and Korea-focused sector research. Compatible with both **Codex** and **Claude Code** (Anthropic CLI).

Language docs:

- English: [README.md](README.md)
- Korean: [README-kr.md](README-kr.md)

## What You Get

This repo turns a ticker or sector question into dated research artifacts on disk, not just a chat answer. For Korean equities, the strongest workflow is:

```text
one stock question
  -> DART filing checks
  -> KRX chart package
  -> sell-side / Naver / foreign-IB outside views
  -> analysis-example/kr/<company>/memo.md
```

한국 주식 리서치를 할 때 특히 강합니다. DART 원문, 차트, 밸류에이션, 증권사/블로그/외국계 관점을 한 파일에 모아 `Decision Frame`, `DART Recheck`, `Street / Alternative Views`, `Structured Stance`까지 남깁니다.

Representative outputs:

| Output | Why it is worth opening |
| --- | --- |
| [HD현대중공업 full decision memo](<analysis-example/kr/HD현대중공업/memo.md>) | Shows the full KRX memo shape: decision frame, DART recheck, valuation snapshot, five chart panels, rule screen, and follow-up prompts. |
| [리가켐바이오 platform memo](<analysis-example/kr/리가켐바이오/memo.md>) | Shows how the skill handles a loss-making biotech where pipeline value, cash burn, DART facts, and independent views have to be separated. |
| [엘앤에프 chart analysis](<analysis-example/kr/엘앤에프/chart-analysis.md>) | Shows the chart-only output with moving averages, structure zones, pattern/wave sidecars, and reusable PNG artifacts. |
| [국내 데이터센터 sector report](analysis-example/kr-sector/국내%20데이터센터.md) | Shows the sector workflow for policy, value chain, listed exposure, constraints, and source-dated market structure. |

### Result Preview

From the HD현대중공업 memo, the output starts with the decision question instead of a generic company description:

> 무엇이 투자판단을 가장 크게 바꾸나? 2026년 하반기에도 1Q26의 15%대 OPM이 유지되는지, 그리고 고선가/엔진/해양/특수선 옵션이 실제 이익으로 이어지는지가 핵심이다.

The same memo keeps thesis-critical facts honest with a DART recheck table, for example distinguishing `confirmed`, `partially supported`, and `not separately disclosed` claims before moving to valuation and stance.

Chart artifacts are saved alongside the memo so the writeup and visuals stay in sync:

![HD현대중공업 main trend chart](analysis-example/kr/HD현대중공업/assets/HD현대중공업-chart.png)

![HD현대중공업 momentum chart](analysis-example/kr/HD현대중공업/assets/HD현대중공업-chart-momentum.png)

![엘앤에프 pattern wave chart](analysis-example/kr/assets/엘앤에프-chart-pattern.png)

Try it from Codex:

```text
Use $kr-stock-plan as the entry point for HD현대중공업. First ask what I actually need, scope it into a 12-24 month full decision memo, run $kr-stock-chart if chart work is required, route through $kr-stock-dart-analysis if filing precision matters, gather sell-side and outside-view inputs when available, then finish with $kr-stock-analysis and write the memo file.
```

## Install

### Codex

Install target: `$CODEX_HOME/skills/<skill-name>` (default: `~/.codex/skills/`)

Open Codex anywhere and paste this. Codex should do the rest.

> Install the Codex skills from `https://github.com/ray5273/stock-analysis-skill`. Use the local repo path `~/.codex/src/stock-analysis-skill`. If `~/.codex/src/stock-analysis-skill/.git` does not exist, create `~/.codex/src` and clone the repository there. If the repo already exists, update it with `git -C ~/.codex/src/stock-analysis-skill pull --ff-only`. Then run `cd ~/.codex/src/stock-analysis-skill && bash ./scripts/install-all-skills.sh`. If this is macOS and the Naver stack needs the Codex-specific fallback path, run `cd ~/.codex/src/stock-analysis-skill && bash ./scripts/install-codex-mac-naver.sh` instead. After install, confirm the skills were copied under `${CODEX_HOME:-~/.codex}/skills/` and continue using the installed skills.

If you want to run the commands yourself instead of pasting the prompt:

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

macOS Naver-only recovery path:

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

Custom target:

```bash
CODEX_HOME=/tmp/codex-home bash ./scripts/install-all-skills.sh
```

### Claude Code

Install target: `$CLAUDE_HOME/skills/<skill-name>` (default: `~/.claude/skills/`)

Open Claude Code anywhere and paste this prompt. Claude Code will do the rest.

> Install the Claude Code skills from `https://github.com/ray5273/stock-analysis-skill`. Use the local repo path `~/.claude/src/stock-analysis-skill`. If `~/.claude/src/stock-analysis-skill/.git` does not exist, create `~/.claude/src` and clone the repository there. If the repo already exists, update it with `git -C ~/.claude/src/stock-analysis-skill pull --ff-only`. Then run `cd ~/.claude/src/stock-analysis-skill && bash ./scripts/install-all-claude-skills.sh`. After install, confirm the skills were copied under `${CLAUDE_HOME:-~/.claude}/skills/` and continue using the installed skills.

If you want to run the commands yourself instead of pasting the prompt:

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

Custom target:

```bash
CLAUDE_HOME=/tmp/claude-home bash ./scripts/install-all-claude-skills.sh
```

## Included Skills

Korean stock workflow shorthand: `kr-stock-plan -> kr-stock-chart -> kr-stock-dart-analysis -> kr-stock-data-pack -> kr-stock-analysis`

`kr-stock-plan` should act as the entry-point orchestrator: if the user starts there and did not explicitly ask for `plan only`, it should ask a short needs check, build the brief, decide whether this is a fresh memo, follow-up, or dated update, and continue through the downstream skills automatically.

Suggested handoff prompt:

```text
Use $kr-stock-plan as the entry point for Korean stock work. Have it first ask what the user actually needs, scope the request, treat my main question as the priority lens, route through $kr-stock-chart when chart work is needed, route through $kr-stock-dart-analysis when filing precision matters, then build the dated fact base with $kr-stock-data-pack, and finish with $kr-stock-analysis unless the user explicitly asks to stop after planning.
```

Concrete example:

```text
Use $kr-stock-plan as the entry point for LG CNS. First ask what the user actually needs, scope it into a 12-24 month full decision memo, run $kr-stock-chart if chart work is required, route through $kr-stock-dart-analysis if the latest filing basis, segment detail, backlog, or contract disclosures are important, then use $kr-stock-data-pack to assemble dated price, governance, valuation, chart, and outside-view inputs, and finish with $kr-stock-analysis for the final memo.
```

- `us-stock-analysis` for U.S. stocks and U.S.-listed ETFs
- `kr-stock-plan` for scoping Korean stock research into an execution-ready brief and acting as the default entry-point orchestrator for fresh memos, follow-up questions, and dated updates
- `kr-stock-chart` for chart-only KRX output and reusable chart artifacts including `chart-data.json`, `chart-analysis.md`, five PNG panels, CSV sidecars, and optional rule-screen outputs
- `kr-stock-dart-analysis` for precise DART filing extraction before broader Korean stock interpretation
- `kr-stock-data-pack` for gathering structured company fact packs before drafting, including optional outside-view inputs
- `kr-stock-analysis` for Korean stock quick views, full decision memos, event notes, pair compares, archetype-specific uncomfortable questions, decision-changing issues, structured stance, and follow-up research prompts
- `kr-stock-update` for dated follow-up updates to an existing Korean stock memo
- `kr-foreign-analyst` for collecting foreign-IB coverage of a KRX company from Korean news and rendering a `## Street / Alternative Views` Markdown block
- `kr-portfolio-monitor` for multi-position KRX portfolio snapshots via Kiwoom REST API or Yahoo fallback
- `kr-sector-plan` for scoping Korea sector research into an execution-ready brief
- `kr-sector-data-pack` for gathering structured sector fact packs before drafting
- `kr-sector-analysis` for Korea sector quick briefs and full reports
- `kr-sector-compare` for same-date Korea sector comparisons
- `kr-sector-audit` for findings-first review of an existing Korea sector memo
- `kr-sector-update` for dated incremental updates to an existing Korea sector memo

## How The Skills Work

These skills are designed to avoid stale-memory analysis.

Shared behavior:

- They are invoked explicitly through their skill names in Codex and Claude Code.
- Stock and portfolio skills treat prices, valuation, filings, guidance, portfolio positions, and news as time-sensitive, so the workflow starts by verifying current sources instead of relying on memory.
- Korea sector skills treat market metrics, policy changes, regulations, company exposure, and industry news as time-sensitive and keep source dates visible.
- When the workspace is writable, the default deliverable is a markdown report file in `analysis-example/<market>/<company>/memo.md` for stock work or `analysis-example/kr-sector/<sector>.md` for sector work, not just a chat answer.
- The report file should stay synchronized with the final answer, with an explicit "as of" date.

### `us-stock-analysis`

Primary instructions:

- [skills/us-stock-analysis/SKILL.md](skills/us-stock-analysis/SKILL.md)
- [skills/us-stock-analysis/references/workflow.md](skills/us-stock-analysis/references/workflow.md)
- [skills/us-stock-analysis/references/output-format.md](skills/us-stock-analysis/references/output-format.md)

Current behavior:

1. Define scope first: ticker, exchange, time horizon, comparison set, and whether the request is a full memo, comparison, pre-earnings note, or post-earnings note.
2. Verify fresh inputs from primary sources, starting with SEC filings and investor relations materials, then company news and market data checks.
3. Build a thesis around business quality, financial quality, capital allocation, catalysts, and risks.
4. Apply a valuation method that fits the company instead of forcing one template across all business models.
5. Write the final output in the default memo format when appropriate: summary, business and thesis, latest results, valuation, catalysts, risks, and what would change the view.

Bundled helpers:

- `scripts/peer-valuation.js` for comparable-company valuation tables
- `scripts/etf-overlap.js` for ETF overlap analysis
- `scripts/chart-basics.js` for basic technical trend and momentum reads from provided OHLCV data

### Korean Stock Skills

Primary instructions:

- [skills/kr-stock-plan/SKILL.md](skills/kr-stock-plan/SKILL.md)
- [skills/kr-stock-dart-analysis/SKILL.md](skills/kr-stock-dart-analysis/SKILL.md)
- [skills/kr-stock-dart-analysis/references/script-inputs.md](skills/kr-stock-dart-analysis/references/script-inputs.md)
- [skills/kr-stock-data-pack/SKILL.md](skills/kr-stock-data-pack/SKILL.md)
- [skills/kr-stock-analysis/SKILL.md](skills/kr-stock-analysis/SKILL.md)
- [skills/kr-stock-analysis/references/blended-source-notes.md](skills/kr-stock-analysis/references/blended-source-notes.md)
- [skills/kr-stock-update/SKILL.md](skills/kr-stock-update/SKILL.md)
- [skills/kr-web-browse/SKILL.md](skills/kr-web-browse/SKILL.md)
- [skills/kr-analyst-report-discover/SKILL.md](skills/kr-analyst-report-discover/SKILL.md)
- [skills/kr-analyst-report-fetch/SKILL.md](skills/kr-analyst-report-fetch/SKILL.md)
- [skills/kr-analyst-report-insight/SKILL.md](skills/kr-analyst-report-insight/SKILL.md)
- [skills/kr-foreign-analyst/SKILL.md](skills/kr-foreign-analyst/SKILL.md)
- [skills/kr-foreign-analyst/references/output-format.md](skills/kr-foreign-analyst/references/output-format.md)

Current behavior:

1. `kr-stock-plan` now starts with a short user-needs check, converts a vague Korean stock request into a clear security definition, output mode, key questions, and a recommended workflow, classifies the task as fresh memo versus follow-up versus dated update, and should continue into the downstream skills automatically unless the user asked for planning only.
2. `kr-stock-chart` owns KRX chart generation. It fetches about 2 years of daily bars by default, writes `chart-data.json` and `chart-analysis.md`, renders the five PNG chart panels plus CSV sidecars, and can add a rule-screen block when requested. The technical read now surfaces today's `MA5 / 20 / 60 / 120 / 200` price levels explicitly.
3. `kr-stock-dart-analysis` acts as the filing-precision stage when the work depends on exact DART-backed result, segment, customer, backlog, contract, or disclosure wording detail, and should first ask a short filing-needs check when the target slice is still unclear.
   For long annual filings, it should also keep a `dart-reference.md` digest and `dart-cache.json` coverage cache so later updates can reuse section-level verification instead of re-reading the entire filing blindly.
   When the filing supports a broader stock memo, it should also run a DART recheck loop for thesis-critical claims instead of treating deep verification as optional.
4. `kr-stock-data-pack` collects dated price context, filings, results, governance facts, valuation inputs, chart inputs, and optional outside-view inputs before drafting, and should ingest `kr-stock-chart` artifacts rather than rebuilding them.
5. `kr-stock-analysis` writes the final output as a `quick view`, `full memo`, `pre-earnings note`, `post-earnings note`, or `pair compare` for KRX-listed companies, and should first confirm the final decision frame or section priorities when they are still ambiguous.
   Full memos now behave like decision memos: they lead with `Decision Frame`, then surface `Uncomfortable Questions`, `Decision-Changing Issues`, `Structured Stance`, and `Follow-up Research Prompts` as fixed headers.
6. `kr-stock-update` preserves the original memo date, refreshes `최근 업데이트일`, and appends or replaces dated follow-up blocks under `## Update Log`.

Recommended pipeline:

```text
kr-stock-plan
  -> ask user needs, then lock security, mode, must-answer questions, and the user's priority question
  -> decide fresh memo vs follow-up vs dated update
  -> if chart work matters: kr-stock-chart
  -> if filing precision matters: kr-stock-dart-analysis
  -> if sell-side consensus matters: kr-analyst-report-discover -> kr-analyst-report-fetch -> kr-analyst-report-insight
  -> if foreign-IB views matter: kr-foreign-analyst
  -> if independent retail voices matter: kr-naver-blogger -> kr-naver-insight
  -> kr-stock-data-pack
  -> kr-stock-analysis
```

Analyst-report pipeline details:

- `kr-web-browse` is a thin non-Naver browser wrapper; it reuses the gstack `browse` binary vendored under `kr-naver-browse` and exposes `browseText`, `browseLinks`, and `downloadFile` for sibling skills.
- `kr-analyst-report-discover` scrapes sell-side reports from `consensus.hankyung.com` (primary) with `finance.naver.com/research` as fallback. Default lookback is 365 days (`--lookback-days` overrides). Login-gated reports are kept with `requiresAuth: true`. Output: `.tmp/analyst-report-cache/index/<ticker>/<YYYY-MM-DD>.json`.
- `kr-analyst-report-fetch` downloads each non-auth PDF and extracts text via the shared `skills/kr-stock-dart-analysis/scripts/extract-pdf-text.py` helper (requires `pypdf`). Output: `.tmp/analyst-report-cache/extracted/<ticker>/<YYYY-MM-DD>.json`.
- `kr-analyst-report-insight` renders a 7-section Markdown digest (consensus snapshot, broker table, recent reports with verbatim key-point bullets, divergences, TP trajectory with ASCII sparkline, source-quality footer). Snippets are quoted verbatim at ~1500 chars per report; it is a standalone deliverable and also the ingestion source for `kr-stock-data-pack` → `External Views` with `Source role: sell-side consensus`.
- `kr-foreign-analyst` searches Korean news for foreign investment-bank coverage, extracts broker / rating / target-price / date metadata from article text, and renders a memo-ready `## Street / Alternative Views` block. Treat it as secondary news-sourced evidence, not a primary report or filing fact.

Routing guide:

- Start with `kr-stock-plan` when the request is still ambiguous on ticker, share class, horizon, compare mode, deliverable shape, or whether the user wants a fresh memo versus a follow-up. If the user started there for actual analysis work, continue automatically after the brief instead of waiting for another manual skill call.
- Insert `kr-stock-chart` when the user wants chart-only output or when the memo should ingest reusable chart artifacts.
- Insert `kr-stock-dart-analysis` when the conclusion depends on exact DART wording, standalone-quarter derivation, segment detail, customer concentration, backlog, or contract disclosures.
- Use `kr-stock-data-pack` to assemble the dated fact base around price, governance, valuation, chart, and outside-view inputs.
- Finish with `kr-stock-analysis` for the final memo, event note, quick view, or pair compare. For full memos, keep `analysis-example/kr/<company>/memo.md` as the canonical state artifact for later follow-up work.

Bundled helpers:

- `skills/kr-stock-chart/scripts/fetch-kr-chart.js` for current KRX daily bars with a default `2y` range
- `skills/kr-stock-chart/scripts/chart-basics.js` for technical reads plus five-part PNG chart output that separates the main trend view, heavier overlays, momentum panels for `MACD` and `ADX/DMI`, structure zones with volume-by-price, and candidate wave/Fibonacci context
- `skills/kr-stock-chart/scripts/chart-basics.js` now draws KR main charts with candlesticks, a close line, a current-price guide, `MA5/20/60/120/200`, and an explicit latest moving-average summary in the markdown interpretation
- `skills/kr-stock-chart/scripts/chart-basics.js` writes the requested `--png-out` path as the main trend chart and writes sibling `*-overlay.png`, `*-momentum.png`, `*-structure.png`, and `*-pattern.png` files, plus `*-structure-zones.csv` and `*-pattern-waves.csv` sidecars
- `scripts/valuation-chart.js` uses the same bundled Korean font path for P/E, P/B, and EV/EBITDA PNG labels. The bundled Noto Korean Regular font comes from the official `notofonts/noto-cjk` distribution and is included with `LICENSE-NotoSansKR.txt` under the SIL Open Font License.
- `skills/kr-stock-chart/scripts/build-kr-universe-rs-cache.js` for integrated `KOSPI + KOSDAQ` relative-strength percentile cache files under `.tmp/kr-rs-cache/<YYYY-MM-DD>.json`
- `skills/kr-stock-chart/scripts/kr-trend-rules.js` for `Minervini Trend Template` pass/fail plus `KRX 52주 신고가 리더십 점수` markdown blocks that can be embedded in the memo's `Chart and Positioning` section
- `scripts/valuation-bands.js` for 3-5 year valuation band summaries
- `scripts/peer-valuation.js` for comparable-company valuation tables
- `skills/kr-stock-dart-analysis/scripts/extract-dart-sections.js` for building a section index from a text export of a DART filing
- `skills/kr-stock-dart-analysis/scripts/normalize-browser-dart-export.js` for converting a Chrome extension browser export into the text format used by DART section extraction
- `skills/kr-stock-dart-analysis/scripts/fetch-opendart.js` for the OpenDART API alternative to the Chrome extension: resolves `--ticker` to corp_code, downloads the latest 정기공시 (사업/반기/분기) `document.xml` ZIP plus structured endpoints (majorshareholder, alotMatter, tesstkAcqsDspsSttus, irdsSttus, cpndlhCmpsBoardCo, fnlttSinglAcntAll), and emits the same `dart-browser-export.json` schema so the downstream `normalize → extract → verify → build` chain runs unchanged. Requires `OPENDART_API_KEY` in env (a `.env` file at the repo root is honored and is gitignored). Caches under `.tmp/opendart-cache/`.
- `skills/kr-stock-dart-analysis/scripts/opendart-zip.py` Python3 stdlib helper used by `fetch-opendart.js` for cp949-safe ZIP extraction and `dart4.xsd` XML pre-processing
- `skills/kr-stock-dart-analysis/scripts/verify-dart-coverage.js` for checking whether the filing TOC was fully parsed
- `skills/kr-stock-dart-analysis/scripts/build-dart-reference.js` for generating `dart-reference.md` and `dart-cache.json`
- `dart-cache.json` now reserves a `verifiedClaims` block for memo-critical claim verification results
- `skills/kr-stock-update/scripts/extract-report-baseline.js` for parsing memo metadata, update dates, and existing source URLs
- `skills/kr-stock-update/scripts/normalize-update-log.js` for rendering a normalized dated update block and writing it back into the memo

### `kr-portfolio-monitor`

Primary instructions:

- [skills/kr-portfolio-monitor/SKILL.md](skills/kr-portfolio-monitor/SKILL.md)
- [skills/kr-portfolio-monitor/references/workflow.md](skills/kr-portfolio-monitor/references/workflow.md)
- [skills/kr-portfolio-monitor/references/output-format.md](skills/kr-portfolio-monitor/references/output-format.md)
- [skills/kr-portfolio-monitor/references/mcp-setup.md](skills/kr-portfolio-monitor/references/mcp-setup.md)

Current behavior:

1. Check `kiwoom-mcp` connectivity first, then retrieve account balance, live prices, and 30-day daily bars in one pass.
2. Restrict live coverage to domestic KRX holdings supported by Kiwoom REST API. Overseas stocks are out of scope for this skill and must not be implied as covered.
3. Compute SMA20 deviation and RSI14 per holding, flag stretched positions, and summarize total unrealized P&L.
4. Write the rolling snapshot to `analysis-example/kr/portfolio-snapshot.md` when the workspace is writable.
5. If live MCP access is unavailable, fall back to `portfolio-snapshot.js` with manual KRX holdings JSON and Yahoo Finance market data.

Bundled helpers:

- `skills/kr-stock-analysis/scripts/portfolio-snapshot.js` for KRX portfolio snapshots from manual JSON input
- `scripts/test-kiwoom-token.js` for checking Kiwoom OAuth token issuance from `.env.kiwoom`
- `scripts/run-kiwoom-mcp.js` for launching `kiwoom-mcp` locally with repo-managed environment variables

### Korea Sector Skills

Primary instructions:

- [skills/kr-sector-plan/SKILL.md](skills/kr-sector-plan/SKILL.md)
- [skills/kr-sector-data-pack/SKILL.md](skills/kr-sector-data-pack/SKILL.md)
- [skills/kr-sector-analysis/SKILL.md](skills/kr-sector-analysis/SKILL.md)
- [skills/kr-sector-compare/SKILL.md](skills/kr-sector-compare/SKILL.md)
- [skills/kr-sector-audit/SKILL.md](skills/kr-sector-audit/SKILL.md)
- [skills/kr-sector-update/SKILL.md](skills/kr-sector-update/SKILL.md)

Current behavior:

1. `kr-sector-plan` converts a vague Korea sector request into a clear scope, output mode, and section outline.
2. `kr-sector-data-pack` collects dated market metrics, policy events, regulation changes, value-chain facts, and representative public-company references.
3. `kr-sector-analysis` writes either a `quick brief` or a `full report` under `analysis-example/kr-sector/<sector>.md`.
4. `kr-sector-compare` keeps cross-sector comparisons on a same-date basis and ranks the setup only when the evidence supports it.
5. `kr-sector-audit` reviews an existing memo with findings first, prioritizing source, date, and logic integrity over style comments.
6. `kr-sector-update` preserves the original memo date, refreshes `최근 업데이트일`, and appends or replaces a dated block under `## Update Log`.

Example research brief:

- [analysis-example/kr-sector/국내 데이터센터-리서치브리프.md](analysis-example/kr-sector/국내%20데이터센터-리서치브리프.md)

Example full report:

- [analysis-example/kr-sector/국내 데이터센터.md](analysis-example/kr-sector/국내%20데이터센터.md)

## Usage

### Codex

```text
Use $us-stock-analysis for NVDA and write a dated investment memo with valuation, catalysts, risks, and chart context.
```

```text
Use $kr-stock-plan as the entry point for 064400.KS. First ask what I actually need, lock the ticker, share class, horizon, output mode, and key questions, treat my main question as the priority lens, then continue through the downstream Korean stock workflow automatically unless I ask for plan only.
```

```text
Use $kr-stock-dart-analysis for LG CNS and extract a filing-grounded summary covering the latest quarterly or half-year revenue, operating profit, segment differences, customer concentration, and any standalone-quarter derivations needed from cumulative DART figures.
```

```text
Use $kr-stock-dart-analysis to check a Korean company's disclosed order backlog, compare it with same-basis annual revenue, and report backlog coverage in Korean with clear source mapping and an explicit note that the ratio is derived rather than a formally disclosed KPI.
```

```text
Use $kr-stock-dart-analysis to list every disclosed single-sales or supply contract for a Korean company over the last 12 months, keeping original notices, amendments, counterparties, amounts, sales ratios, contract periods, and latest status visible row by row.
```

```text
Use $kr-stock-dart-analysis to list every disclosed single-sales or supply contract for a Korean company and add a maturity table showing how much of the current effective contract amount ends by 2027, by 2028, and by each later year, clearly labeled as contract-period coverage rather than formal backlog unless the filing discloses backlog.
```

```text
Use $kr-stock-data-pack for LG CNS and gather a dated company fact pack with price context, filings, latest results, governance facts, valuation inputs, chart inputs, and outside-view inputs from sell-side or specialist media.
```

```text
Use $kr-stock-analysis for 005930.KS and write a decision memo with DART-based evidence, street or alternative views, valuation, governance checks, catalysts, chart context, archetype-specific uncomfortable questions, decision-changing issues, structured stance, and follow-up research prompts.
```

```text
Use $kr-stock-update to refresh analysis-example/kr/엘앤에프/memo.md with company-specific disclosures, IR materials, and news published after the memo date, and append a dated update block to the same file.
```

```text
Use $kr-portfolio-monitor to scan current Kiwoom-supported KRX holdings, compute SMA20 deviation and RSI14, and write the snapshot to analysis-example/kr/portfolio-snapshot.md.
```

```text
Use $kr-sector-plan to scope a Korea data center sector report into a clean research brief with clear boundaries, key questions, and the right output mode.
```

```text
Use $kr-sector-data-pack to gather a Korea-focused fact pack for the waste-battery sector with dated policy events, market metrics, and representative listed companies.
```

```text
Use $kr-sector-analysis to write a Korea security-operations market report with market definition, drivers, constraints, value chain, regulation, company map, and source-dated facts.
```

```text
Use $kr-sector-compare to compare Korean robotics and smart-factory sectors on a same-date basis and explain which setup has the cleaner listed-company exposure.
```

```text
Use $kr-sector-audit to review analysis-example/kr-sector/국내 데이터센터.md for unsupported market claims, stale dates, and overstated listed-company exposure.
```

```text
Use $kr-sector-update to update analysis-example/kr-sector/국내 데이터센터.md with policy, regulation, and company developments published after the memo date, and append a dated update block.
```

### Claude Code

```text
/us-stock-analysis write a dated investment memo for NVDA with valuation, catalysts, risks, and chart context.
```

```text
/kr-stock-plan use 064400.KS as the entry point, ask what I actually need first, lock the ticker, share class, horizon, output mode, and key questions, treat my main question as the priority lens, then continue through the downstream Korean stock workflow automatically unless I ask for plan only.
```

```text
/kr-stock-dart-analysis extract a filing-grounded summary for LG CNS covering the latest quarterly or half-year revenue, operating profit, segment differences, customer concentration, and any standalone-quarter derivations needed from cumulative DART figures.
```

### Claude.ai DART Browser Workflow

When Codex or Claude Code cannot directly drive the DART viewer, use the Chrome extension under [`integrations/claude-dart-extension/`](integrations/claude-dart-extension/README.md).

1. Open a supported DART viewer page: `https://dart.fss.or.kr/dsaf001/main.do*`
2. Let the extension auto-extract the page
3. Click `Save Export` when the popup shows `Export ready`
4. Normalize the saved file:

```text
node skills/kr-stock-dart-analysis/scripts/normalize-browser-dart-export.js --input dart-browser-export.json --output dart-text.txt
node skills/kr-stock-dart-analysis/scripts/extract-dart-sections.js --input dart-text.txt --output sections.json
node skills/kr-stock-dart-analysis/scripts/verify-dart-coverage.js --input sections.json --output coverage.json
```

5. Attach the JSON export in Claude.ai or continue the downstream DART scripts locally

Reference files:

- [Claude DART Extractor README](integrations/claude-dart-extension/README.md)
- [Sample browser export JSON](examples/kr-stock-dart-analysis/dart-browser-export-sample.json)

### OpenDART API Workflow

When `OPENDART_API_KEY` is available, prefer the API path over the Chrome extension. `fetch-opendart.js` produces the same `dart-browser-export.json` schema, so the rest of the pipeline (`normalize → extract → verify → build-reference`) is unchanged.

```bash
# put the key in a gitignored .env file at the repo root, or export it inline
export OPENDART_API_KEY=<your_key>
node skills/kr-stock-dart-analysis/scripts/fetch-opendart.js --ticker 267250 --year 2025 --report-code 11011 --output analysis-example/kr/HD현대/
node skills/kr-stock-dart-analysis/scripts/normalize-browser-dart-export.js --input analysis-example/kr/HD현대/dart-browser-export.json --output analysis-example/kr/HD현대/dart-text.txt
node skills/kr-stock-dart-analysis/scripts/extract-dart-sections.js --input analysis-example/kr/HD현대/dart-text.txt --output analysis-example/kr/HD현대/dart-sections.json
node skills/kr-stock-dart-analysis/scripts/verify-dart-coverage.js --input analysis-example/kr/HD현대/dart-sections.json --output analysis-example/kr/HD현대/dart-coverage.json
node skills/kr-stock-dart-analysis/scripts/build-dart-reference.js --sections analysis-example/kr/HD현대/dart-sections.json --coverage analysis-example/kr/HD현대/dart-coverage.json --output analysis-example/kr/HD현대/dart-reference.md --company "HD현대" --ticker 267250 --filing-title "사업보고서 (2025.12)" --filing-date 2026-03-20 --as-of 2026-05-10
```

`--report-code` is `11011` (사업보고서), `11012` (반기보고서), `11013` (분기보고서, Q1), `11014` (분기보고서, Q3). Cache lives in `.tmp/opendart-cache/` (gitignored). The script never logs the API key.

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
/kr-stock-analysis analyze 005930.KS with DART-based evidence, street or alternative views, valuation, governance checks, catalysts, chart context, archetype-specific uncomfortable questions, decision-changing issues, structured stance, and follow-up research prompts.
```

```text
/kr-stock-update update analysis-example/kr/엘앤에프/memo.md with company-specific disclosures, IR materials, and news after the memo date, and append a dated update block to the same file.
```

```text
/kr-portfolio-monitor scan current Kiwoom-supported KRX holdings, compute SMA20 deviation and RSI14, and write the result to analysis-example/kr/portfolio-snapshot.md.
```

```text
/kr-sector-plan scope a Korea data center sector report into a clean research brief with boundaries, key questions, and the right output mode.
```

```text
/kr-sector-data-pack gather a Korea-focused fact pack for the waste-battery sector with dated policy events, market metrics, and representative listed companies.
```

```text
/kr-sector-analysis write a Korea security-operations market report with market definition, drivers, constraints, value chain, regulation, company map, and source-dated facts.
```

```text
/kr-sector-compare compare Korean robotics and smart-factory sectors on a same-date basis and explain which setup has the cleaner listed exposure.
```

```text
/kr-sector-audit review analysis-example/kr-sector/국내 데이터센터.md for unsupported market claims, stale dates, and listed-exposure overreach.
```

```text
/kr-sector-update update analysis-example/kr-sector/국내 데이터센터.md with policy, regulation, and company developments after the memo date, and append a dated update block.
```

## Analysis Examples

The links below are grouped by the question each artifact answers. They are kept to audited golden examples and reusable fixtures so validation can keep them in sync.

**Full decision memos: start here if you want to see the end product**

- [KR - HD현대중공업 Memo](<analysis-example/kr/HD현대중공업/memo.md>) for a full shipbuilding-cycle decision memo with DART recheck, valuation bands, five chart panels, and rule screen.
- [KR - 리가켐바이오 Memo](<analysis-example/kr/리가켐바이오/memo.md>) for a biotech platform memo that separates disclosed facts, pipeline option value, burn rate, and independent views.
- [KR - 한화오션 Memo](<analysis-example/kr/한화오션/memo.md>) for a shipbuilding memo with sell-side consensus and alternative-view inputs.
- [KR - HMM Memo](<analysis-example/kr/HMM/memo.md>) for a cyclical shipping memo backed by data pack, DART work, and analyst-report insight.
- [KR - 엘앤에프 Memo](<analysis-example/kr/엘앤에프/memo.md>) for a battery-materials memo with chart package and sell-side insight.
- [KR - LG CNS Memo](<analysis-example/kr/LG CNS/memo.md>) for an IT services / cloud example with DART references and contract-oriented context.
- [KR - 삼성SDS Memo](<analysis-example/kr/삼성SDS/memo.md>) for an enterprise IT example with valuation history and Naver outside views.
- [KR - 현대오토에버 Memo](<analysis-example/kr/현대오토에버/memo.md>) for an auto software / IT services example with valuation chart artifacts.
- [KR - LIG넥스원 Memo](<analysis-example/kr/LIG넥스원/memo.md>) for a defense-stock memo with filing-backed context.
- [KR - 대양전기공업 Memo](<analysis-example/kr/대양전기공업/memo.md>) for a smaller KRX company example.
- [KR - 삼성전자 Sell-Side Count Memo](<analysis-example/kr/삼성전자/memo.md>) and [KR - SK하이닉스 Sell-Side Count Memo](<analysis-example/kr/SK하이닉스/memo.md>) for semiconductor examples focused on sell-side coverage count and market framing.
- [KR - HD현대 Memo](<analysis-example/kr/HD현대/memo.md>) for an OpenDART-backed holding-company example.

**DART filing extraction and data packs: check how raw filings become memo-ready evidence**

- [KR - 리가켐바이오 리서치 브리프](<analysis-example/kr/리가켐바이오/리서치브리프.md>)
- [KR - 리가켐바이오 DART 분석](<analysis-example/kr/리가켐바이오/dart-analysis.md>)
- [KR - 리가켐바이오 DART Reference](<analysis-example/kr/리가켐바이오/dart-reference.md>)
- [KR - 리가켐바이오 Data Pack](<analysis-example/kr/리가켐바이오/data-pack.md>)
- [KR - LG CNS DART Reference](<analysis-example/kr/LG CNS/dart-reference.md>)
- [KR - LIG넥스원 리서치 브리프](<analysis-example/kr/LIG넥스원/리서치브리프.md>)
- [KR - HMM Data Pack](<analysis-example/kr/HMM/data-pack.md>)
- [KR - HMM DART 분석](<analysis-example/kr/HMM/dart-analysis.md>)
- [KR - HMM Analyst Report Insight](<analysis-example/kr/HMM/analyst-report-insight.md>)
- [KR - 한화오션 Analyst Report Insight](<analysis-example/kr/한화오션/analyst-report-insight.md>)
- [KR - HD현대 DART Reference (OpenDART)](<analysis-example/kr/HD현대/dart-reference.md>)
- [KR - HD현대 DART Coverage](<analysis-example/kr/HD현대/dart-coverage.json>)

**Chart package: see the reusable KRX chart artifacts**

- [KR - 엘앤에프 Chart Analysis](<analysis-example/kr/엘앤에프/chart-analysis.md>) for the markdown technical read.
- [KR - 엘앤에프 Pattern/Wave Chart PNG](<analysis-example/kr/assets/엘앤에프-chart-pattern.png>) and [Pattern/Wave CSV](<analysis-example/kr/assets/엘앤에프-chart-pattern-waves.csv>) for the wave/Fibonacci sidecar output.
- [KR - HD현대중공업 Main Chart PNG](<analysis-example/kr/HD현대중공업/assets/HD현대중공업-chart.png>), [Overlay](<analysis-example/kr/HD현대중공업/assets/HD현대중공업-chart-overlay.png>), [Momentum](<analysis-example/kr/HD현대중공업/assets/HD현대중공업-chart-momentum.png>), [Structure](<analysis-example/kr/HD현대중공업/assets/HD현대중공업-chart-structure.png>), and [Pattern](<analysis-example/kr/HD현대중공업/assets/HD현대중공업-chart-pattern.png>) for the full five-panel chart package.
- [KR - HD현대 Chart PNG](<analysis-example/kr/assets/HD현대-chart.png>)
- [KR - HD현대 Overlay Chart PNG](<analysis-example/kr/assets/HD현대-chart-overlay.png>)
- [KR - HD현대 Momentum Chart PNG](<analysis-example/kr/assets/HD현대-chart-momentum.png>)

**Contract and backlog analysis: inspect disclosed order and supply-contract work**

- [KR - 두산에너빌리티 수주통합분석](<analysis-example/kr/두산에너빌리티/수주통합분석.md>)
- [KR - 한미글로벌 수주계약리스트](<analysis-example/kr/한미글로벌/수주계약리스트.md>)
- [KR - 한전KPS 수주계약리스트](<analysis-example/kr/한전KPS/수주계약리스트.md>)

**Street / Alternative Views: compare filings against outside narratives**

- [KR - 삼성SDS Naver Insights](<analysis-example/kr/삼성SDS/naver-insights.md>)
- [KR - 엘앤에프 Naver Insights](<analysis-example/kr/엘앤에프/naver-insights.md>)
- [KR - 알테오젠 Naver Insights](<analysis-example/kr/알테오젠/naver-insights.md>)
- [KR - GRT Naver Insights](<analysis-example/kr/GRT/naver-insights.md>)
- [KR - 리가켐바이오 Naver Insights](<analysis-example/kr/리가켐바이오/naver-insights.md>)
- [KR - HMM Naver Insights](<analysis-example/kr/HMM/naver-insights.md>)
- [KR - 리가켐바이오 Naver Posts](<analysis-example/kr/리가켐바이오/naver-posts.json>)
- [KR - 리가켐바이오 Naver Blogger Candidates](<analysis-example/kr/리가켐바이오/naver-bloggers.json>)
- [KR - 삼성SDS Naver Blogger Candidates](<analysis-example/kr/삼성SDS/naver-bloggers.json>)

**Sector research: see the same dated-source discipline applied outside single stocks**

- [KR Sector - 국내 데이터센터](analysis-example/kr-sector/국내%20데이터센터.md) for a full Korea sector report with policy, value chain, listed-company exposure, and constraints.
- [KR Sector - 국내 데이터센터 리서치 브리프](analysis-example/kr-sector/국내%20데이터센터-리서치브리프.md) for the scoped planning artifact.

**Known issue: Naver browse in sandbox**

- `kr-naver-browse`, `kr-naver-blogger`, and `kr-naver-insight` depend on a
  local gstack `browse` server that binds to `127.0.0.1`.
- In some Codex sandbox environments, local listen is blocked with `EPERM`.
  When that happens, Naver workflows can fail with messages like
  `No available port after 5 attempts` or
  `listen EPERM: operation not permitted 127.0.0.1:<port>`.
- In that case, rerun the Naver fetch step outside the sandbox or with
  elevated execution. Do not assume `0 posts` means the bloggers or posts do
  not exist until the runtime issue is excluded.
- On Linux/WSL installs, the `kr-naver-browse` post-install hook tries
  `bunx playwright install-deps chromium` before installing Chromium. Set
  `SKILL_INSTALL_SKIP_LINUX_DEPS=1` to skip automatic system dependency
  installation.

**Fixtures:**

- [KR - DART browser export sample](examples/kr-stock-dart-analysis/dart-browser-export-sample.json)

## Validation

Windows:

```powershell
.\scripts\validate-skills.ps1
```

Linux or macOS:

```bash
bash ./scripts/validate-skills.sh
```

Validation now includes:

- Skill spec checks
- Strict YAML parsing for skill frontmatter
- Output-path contract checks across docs and agent prompts
- README local-link verification
- Golden example audits using the rubric in [docs/quality-rubrics.md](docs/quality-rubrics.md)
