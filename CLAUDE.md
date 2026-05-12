# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Purpose

This repository provides AI skills for producing dated, source-backed equity research analysis for Korean (KRX) and U.S. markets. Skills work with both **Codex** (`$CODEX_HOME/skills/`, default `~/.codex/skills/`) and **Claude Code** (`$CLAUDE_HOME/skills/`, default `~/.claude/skills/`).

## Commands

**Validate skills (checks SKILL.md format, JS syntax, chart generation; warns if openai.yaml missing):**
```bash
bash ./scripts/validate-skills.sh        # Linux/macOS
.\scripts\validate-skills.ps1            # Windows PowerShell
```

**Install a single skill (Codex):**
```bash
bash ./scripts/install-skill.sh kr-stock-analysis
bash ./scripts/install-skill.sh kr-stock-update
bash ./scripts/install-skill.sh kr-portfolio-monitor
bash ./scripts/install-skill.sh us-stock-analysis
bash ./scripts/install-skill.sh kr-naver-browse
bash ./scripts/install-skill.sh kr-naver-blogger
bash ./scripts/install-skill.sh kr-naver-insight
bash ./scripts/install-skill.sh kr-web-browse
bash ./scripts/install-skill.sh kr-analyst-report-discover
bash ./scripts/install-skill.sh kr-analyst-report-fetch
bash ./scripts/install-skill.sh kr-analyst-report-insight
bash ./scripts/install-skill.sh kr-foreign-analyst
```

**Install all skills (Codex):**
```bash
bash ./scripts/install-all-skills.sh
```

**Install a single skill (Claude Code):**
```bash
bash ./scripts/install-claude-skill.sh kr-stock-analysis
bash ./scripts/install-claude-skill.sh kr-stock-update
bash ./scripts/install-claude-skill.sh kr-portfolio-monitor
bash ./scripts/install-claude-skill.sh us-stock-analysis
bash ./scripts/install-claude-skill.sh kr-naver-browse
bash ./scripts/install-claude-skill.sh kr-naver-blogger
bash ./scripts/install-claude-skill.sh kr-naver-insight
bash ./scripts/install-claude-skill.sh kr-web-browse
bash ./scripts/install-claude-skill.sh kr-analyst-report-discover
bash ./scripts/install-claude-skill.sh kr-analyst-report-fetch
bash ./scripts/install-claude-skill.sh kr-analyst-report-insight
bash ./scripts/install-claude-skill.sh kr-foreign-analyst
```

**Install all skills (Claude Code):**
```bash
bash ./scripts/install-all-claude-skills.sh
```

**Run a bundled script directly (Node.js, no npm install needed):**
```bash
node skills/kr-stock-analysis/scripts/chart-basics.js --input examples/kr/chart-sample.json --png-out chart.png
node skills/kr-stock-analysis/scripts/peer-valuation.js --input examples/kr/peer-sample.json
node skills/kr-stock-analysis/scripts/fetch-kr-chart.js --ticker 066970 --range 3mo
node skills/kr-stock-analysis/scripts/portfolio-snapshot.js --input examples/kr/portfolio-sample.json
node skills/kr-stock-dart-analysis/scripts/normalize-browser-dart-export.js --input examples/kr-stock-dart-analysis/dart-browser-export-sample.json --output dart-text.txt
OPENDART_API_KEY=<key> node skills/kr-stock-dart-analysis/scripts/fetch-opendart.js --ticker 010950 --year 2025 --report-code 11011 --output analysis-example/kr/S-Oil/
node skills/kr-stock-dart-analysis/scripts/fetch-nps-holdings.js --lookback-days 90 --output /tmp/nps-holdings/   # reads OPENDART_API_KEY from .env or env
node skills/kr-stock-analysis/scripts/valuation-chart.js --input examples/kr-stock-analysis/valuation-band-sample.json --png-out valuation.png
node skills/kr-naver-browse/scripts/browse-naver.js --test
node skills/kr-naver-blogger/scripts/build-query-set.js --company "엘앤에프" --ticker 066970 --output /tmp/queries.json
node skills/kr-naver-blogger/scripts/discover-bloggers.js --company "엘앤에프" --ticker 066970 --output /tmp/bloggers.json
node skills/kr-naver-insight/scripts/fetch-blog-posts.js --input /tmp/bloggers.json --company "엘앤에프" --output /tmp/posts.json
node skills/kr-naver-insight/scripts/summarize-insights.js --input /tmp/posts.json --output /tmp/insights.md
node skills/kr-analyst-report-discover/scripts/discover-reports.js --company "엘앤에프" --ticker 066970 --output /tmp/analyst-index.json
node skills/kr-analyst-report-fetch/scripts/fetch-reports.js --input /tmp/analyst-index.json --output /tmp/analyst-extracted.json
node skills/kr-analyst-report-insight/scripts/summarize-reports.js --input /tmp/analyst-extracted.json --output /tmp/analyst-digest.md
node skills/kr-foreign-analyst/scripts/fetch-analyst-coverage.js --company "삼성전자" --ticker 005930 --output /tmp/foreign-coverage.json --allow-empty
node skills/kr-foreign-analyst/scripts/summarize-analyst-views.js --input /tmp/foreign-coverage.json --output /tmp/foreign-views.md
```

## Architecture

### Skill Structure

Each skill under `skills/<name>/` follows this layout:
- `SKILL.md` — frontmatter (`name:`, `description:`) + full skill prompt (workflow, rules, source hierarchy, output spec)
- `agents/openai.yaml` — Codex agent interface config (`display_name`, `short_description`, `allow_implicit_invocation`)
- `scripts/` — Node.js analysis scripts (no external npm dependencies; pure Node stdlib)
- `references/` — Reference docs loaded as context: `workflow.md`, `output-format.md`, `script-inputs.md`, plus market-specific checklists

### Bundled Scripts

All scripts accept JSON via `--input` and output Markdown or PNG. They use only Node stdlib (fs, https, path, zlib, Intl).

| Script | Purpose |
|---|---|
| `peer-valuation.js` | Markdown comparison table from peer metrics JSON |
| `etf-overlap.js` | Weighted overlap % between two ETF holdings JSON files |
| `chart-basics.js` | Technical summary (SMA20/50, RSI14, volume) + PNG chart from OHLCV JSON |
| `fetch-kr-chart.js` | Fetch KRX OHLCV from Yahoo Finance → JSON for chart-basics (kr only) |
| `valuation-bands.js` | ASCII valuation band charts from historical P/E, EV/EBITDA, P/B JSON (kr only) |
| `valuation-chart.js` | PNG valuation band time-series charts (P/E, P/B, EV/EBITDA) from historical JSON (kr only) |
| `extract-report-baseline.js` | Parse an existing KR memo into baseline metadata for follow-up updates |
| `normalize-update-log.js` | Render or append a dated update block to an existing KR memo |
| `portfolio-snapshot.js` | SMA20 deviation + RSI14 snapshot table across multiple KRX positions from JSON (kr only, MCP fallback) |
| `normalize-browser-dart-export.js` | Convert a Chrome extension DART viewer export into plain text for section parsing |
| `fetch-opendart.js` | OpenDART API alternative to the Chrome extension. Resolves `--ticker` to corp_code, downloads the latest 정기공시 `document.xml` ZIP + structured endpoints (majorshareholder, alotMatter, tesstkAcqsDspsSttus, irdsSttus, cpndlhCmpsBoardCo, fnlttSinglAcntAll), produces the same `dart-browser-export.json` schema. Requires `OPENDART_API_KEY` env var. Caches to `.tmp/opendart-cache/`. |
| `fetch-nps-holdings.js` | Sweep 지분공시 (pblntf_ty=D) via OpenDART `list.json` over a lookback window (default 90d, chunked into ≤80d slices to satisfy the 3-month range cap), filter to filings where `flr_nm` contains "국민연금", then enrich with `majorstock.json` (5%룰) and `elestock.json` (임원·주요주주) keyed by `rcept_no`. Writes `nps-holdings.json` + `nps-holdings.md`. Auto-loads `OPENDART_API_KEY` from repo-root `.env`. |
| `opendart-zip.py` | Python3 stdlib helper for `fetch-opendart.js`: ZIP extraction (preserves cp949 Korean filenames) + `dart4.xsd` XML pre-processing into HTML so the generic HTMLParser can extract narrative text |
| `browse-naver.js` | Naver search + blog navigation helpers via gstack `browse` binary (required by other Naver skills) |
| `build-query-set.js` | Build dynamic search queries from Naver News trends and DART product keywords for blogger discovery |
| `discover-bloggers.js` | Find and rank Naver bloggers covering a KRX company (uses dynamic queries + in-blog search) |
| `fetch-blog-posts.js` | Fetch and cache Naver blog posts filtered by company mention |
| `summarize-insights.js` | Render a Markdown digest of Naver blog posts for the Street / Alternative Views section |
| `browse-web.js` | Generic (non-Naver) helpers that reuse the gstack `browse` binary plus a Node-stdlib `downloadFile` (used by the analyst-report chain) |
| `discover-reports.js` | Scrape consensus.hankyung.com (primary) + finance.naver.com/research (fallback) for sell-side analyst reports over a lookback window (default 365 days) |
| `fetch-reports.js` | Download PDFs from the discover index, extract plain text via shared `kr-stock-dart-analysis/scripts/extract-pdf-text.py` helper, and cache per-report |
| `summarize-reports.js` | Render a 7-section Markdown digest of sell-side coverage (consensus, broker table, recent reports with verbatim bullets, divergences, TP trajectory, source quality) |
| `fetch-analyst-coverage.js` | Collect foreign-IB coverage of a KRX company from Korean news and extract broker, rating, target price, date, and snippet metadata |
| `summarize-analyst-views.js` | Render foreign-IB coverage JSON as a `## Street / Alternative Views` Markdown block |

Input JSON schemas are documented in `references/script-inputs.md` with sample files under `examples/<market>/`.

### Harness

`scripts/harness.js` automates script chaining and memo quality validation:

```bash
node scripts/harness.js --mode chart   --ticker 066970 --company "LG CNS"
node scripts/harness.js --mode dart    --ticker 066970 --company "LG CNS" --dart-input export.json
node scripts/harness.js --mode gate    --company "LG CNS"
node scripts/harness.js --mode all     --ticker 066970 --company "LG CNS" --dart-input export.json
node scripts/harness.js --mode all     --ticker 066970 --company "엘앤에프" --with-blog
node scripts/harness.js --mode all     --ticker 066970 --company "엘앤에프" --with-blog --with-analyst
node scripts/harness.js --mode blog    --ticker 066970 --company "엘앤에프"
node scripts/harness.js --mode analyst --ticker 066970 --company "엘앤에프"
node scripts/harness.js --mode foreign --ticker 005930 --company "삼성전자"
node scripts/harness.js --mode all     --ticker 005930 --company "삼성전자" --with-foreign
node scripts/harness.js --mode regression --ticker 066970 --company "엘앤에프" --dart-input export.json
```

| Mode | What it does |
|---|---|
| `chart` | fetch-kr-chart.js → chart-basics.js (OHLCV fetch + PNG charts in one step) |
| `dart` | normalize → extract → verify → build-reference (full DART browser export pipeline) |
| `gate` | 9 structural quality checks on a finished memo (required sections, 기준일, chart PNGs, DART Recheck, valuation metrics, source dates) |
| `blog` | discover-bloggers.js → fetch-blog-posts.js → summarize-insights.js (Naver blogger discovery + insights digest) |
| `analyst` | discover-reports.js → fetch-reports.js → summarize-reports.js (Hankyung/Naver analyst-report chain) |
| `foreign` | fetch-analyst-coverage.js → summarize-analyst-views.js (foreign-IB coverage from Korean news → Street / Alternative Views block) |
| `all` | chart + dart (if `--dart-input`) + blog (if `--with-blog`) + analyst (if `--with-analyst`) + foreign (if `--with-foreign`) + gate sequentially |
| `regression` | Run every routed skill end-to-end (chart → dart → analyst → blog → gate) with artifact + section assertions; designed to catch wiring regressions in the full `kr-stock-plan` chain |

The quality gate is available on demand via `node scripts/harness.js --mode gate --company <name>`. It is not run as part of `validate-skills.sh` / `.ps1` (removed to keep CI tolerant of older example memos with different section templates).

### Claude.ai DART Viewer Integration

- The Chrome extension lives under `integrations/claude-dart-extension/`.
- It targets `https://dart.fss.or.kr/dsaf001/main.do*` and auto-attempts extraction when the viewer page loads.
- The popup exposes `Save Export` and `Retry` instead of using a separate fallback path.
- The saved `dart-browser-export.json` should be normalized with `skills/kr-stock-dart-analysis/scripts/normalize-browser-dart-export.js` before running section extraction and coverage verification.

### Skill Prompt Design

`SKILL.md` is the authoritative skill definition. It encodes:
1. A 6-step workflow (define scope → gather data → build snapshot → stress-test → value → write)
2. Source priority hierarchy (primary filings first, news last)
3. Operating rules (cite sources, exact dates, separate facts from inference)
4. Minimum output standard (mandatory sections every memo must include)
5. Market-specific checklists (governance structures, KRX vs. SEC filing conventions)

### Analysis Examples

`analysis-example/<market>/<company>.md` are live example memos that demonstrate expected skill output. Per `AGENTS.md`: refresh prices/metrics/dates before committing, synchronize embedded PNG charts with the markdown, and use primary sources only. These examples drive the expected output shape — update them when skill output format changes.

## Key Constraints

- **SKILL.md frontmatter is required**: must open and close with `---` and contain `name:` and `description:` fields. Validation will fail otherwise.
- **No npm packages**: all scripts must work with `node` alone. Do not add `require()` calls for non-stdlib modules.
- **Korean tickers**: `fetch-kr-chart.js` accepts bare numeric codes (e.g. `066970`) or explicit `.KS`/`.KQ` suffixes; it retries with `.KS` then `.KQ` automatically.
- **Cross-platform scripts**: every `.sh` script should have a `.ps1` counterpart in `scripts/` for Windows users who run scripts locally, but CI only runs on Ubuntu (Linux). The `.ps1` files are no longer exercised by CI.
- **PDF extraction**: both `kr-stock-dart-analysis` and `kr-analyst-report-fetch` call `skills/kr-stock-dart-analysis/scripts/extract-pdf-text.py` via `child_process`, which requires `python3 -m pip install pypdf` on the host before running the fetch chain.
- **Korean chart fonts**: PNG charts (`chart-basics.js`, `valuation-chart.js`) auto-discover a Korean font on every platform — macOS (AppleSDGothicNeo by default), Linux (Noto CJK / Nanum via standard paths or `fc-match :lang=ko`), Windows (Malgun / Nanum / Noto KR via `C:\Windows\Fonts` and `%LOCALAPPDATA%\Microsoft\Windows\Fonts` directory scan). Rendering also needs Pillow (`python3 -m pip install pillow`) on Mac/Linux; Windows uses built-in GDI. When no Korean font is found (or Pillow is missing), charts fall back to a 47-jamo bitmap with incomplete Hangul coverage, and `validate-skills.sh` / `.ps1` prints a warning per chart script. Recommended installs: Linux `apt install fonts-noto-cjk` / `dnf install google-noto-cjk-fonts`; English-locale Windows install Noto Sans KR or Malgun Gothic. Override anywhere with `KR_STOCK_CHART_FONT=/path/to/font.ttf`.
- **Analyst-report chain**: `kr-analyst-report-*` skills share the gstack `browse` binary vendored under `kr-naver-browse` (via `kr-web-browse`). Install `kr-naver-browse` first so the binary is resolvable. Source priority is Hankyung Consensus first, Naver Pay Research as fallback; default lookback is 365 days; login-gated reports are skipped in v1. PDFs are downloaded into a scratch tempdir, extracted, and deleted — only the extracted `.txt` is cached under `.tmp/analyst-report-cache/text/<ticker>/`.
- **Regression extensibility**: `--mode regression` iterates a `ROUTED_STEPS` registry at the top of `scripts/harness.js` and runs every routed leg with artifact + section assertions. When `kr-stock-plan` gains a new routed skill, add a one-line entry to `ROUTED_STEPS` (`{ name, run, requires, cleanCache, artifacts, assert }`) and the regression mode picks it up automatically. A full (non-dry) regression needs network access + `pypdf`; `validate-skills.sh` only runs `--dry-run` so CI stays offline.

## gstack

This project recommends [gstack](https://github.com/garrytan/gstack) for team-wide AI-assisted workflows.

Install it globally:

```bash
git clone --single-branch --depth 1 https://github.com/garrytan/gstack.git ~/.claude/skills/gstack
cd ~/.claude/skills/gstack && ./setup --team
```

Use the `/browse` skill from gstack for all web browsing. Never use `mcp__claude-in-chrome__*` tools.

Available gstack skills:

- `/office-hours`
- `/plan-ceo-review`
- `/plan-eng-review`
- `/plan-design-review`
- `/design-consultation`
- `/design-shotgun`
- `/design-html`
- `/review`
- `/ship`
- `/land-and-deploy`
- `/canary`
- `/benchmark`
- `/browse`
- `/connect-chrome`
- `/qa`
- `/qa-only`
- `/design-review`
- `/setup-browser-cookies`
- `/setup-deploy`
- `/retro`
- `/investigate`
- `/document-release`
- `/codex`
- `/cso`
- `/autoplan`
- `/plan-devex-review`
- `/devex-review`
- `/careful`
- `/freeze`
- `/guard`
- `/unfreeze`
- `/gstack-upgrade`
- `/learn`

## Skill routing

When the user's request matches an available skill, ALWAYS invoke it using the Skill
tool as your FIRST action. Do NOT answer directly, do NOT use other tools first.
The skill has specialized workflows that produce better results than ad-hoc answers.

Key routing rules:
- Product ideas, "is this worth building", brainstorming → invoke office-hours
- Bugs, errors, "why is this broken", 500 errors → invoke investigate
- Ship, deploy, push, create PR → invoke ship
- QA, test the site, find bugs → invoke qa
- Code review, check my diff → invoke review
- Update docs after shipping → invoke document-release
- Weekly retro → invoke retro
- Design system, brand → invoke design-consultation
- Visual audit, design polish → invoke design-review
- Architecture review → invoke plan-eng-review
- Save progress, checkpoint, resume → invoke checkpoint
- Code quality, health check → invoke health
