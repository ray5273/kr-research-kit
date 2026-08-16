# Skills Catalog & Behavior

35 skills shipped in `kr-research-kit`. Korean stock workflow shorthand:

```text
kr-stock-plan -> kr-stock-chart -> kr-stock-dart-analysis -> kr-order-backlog-analysis -> kr-trade-flow-analysis -> kr-stock-data-pack -> kr-stock-analysis
```

U.S. stock workflow shorthand:

```text
us-sec-analysis -> us-stock-analysis
```

`kr-stock-plan` should act as the entry-point orchestrator: if the user starts there and did not explicitly ask for `plan only`, it should ask a short needs check, build the brief, decide whether this is a fresh memo, follow-up, or dated update, and continue through the downstream skills automatically.

Suggested handoff prompt:

```text
Use $kr-stock-plan as the entry point for Korean stock work. Have it first ask what the user actually needs, scope the request, treat my main question as the priority lens, route through $kr-stock-chart when chart work is needed, route through $kr-stock-dart-analysis when filing precision matters, and classify every operating company as `Order-driven company: yes / no / deferred`. When yes, run $kr-order-backlog-analysis and require its backlog PNG if DART/KRX provides a quantitative amount. Then build the dated fact base with $kr-stock-data-pack and finish with $kr-stock-analysis unless the user explicitly asks to stop after planning.
```

## Skill list

- `us-stock-analysis` — U.S. stocks and U.S.-listed ETFs.
- `us-sec-analysis` — SEC EDGAR filing-precision packs for U.S. companies, including latest 10-K/10-Q, latest 8-K metadata, filing text, XBRL companyfacts, and Source Map.
- `kr-stock-plan` — scopes Korean stock research into an execution-ready brief and acts as the default entry-point orchestrator for fresh memos, follow-up questions, and dated updates.
- `kr-market-leaders` — integrated KOSPI + KOSDAQ technical leadership screens across 1D/7D, 30D/60D, and 120D/252D lenses.
- `kr-daily-market-news` — daily Korean market-wide plus watchlist news report for Codex Desktop Automation, with dated Markdown/JSON artifacts and a Naver Blog publish manifest.
- `kr-analyst-report-watch` — daily/weekly Korean brokerage report monitor that summarizes Top N reports and flags narrative changes by topic.
- `telegram-report-sender` — explicit Telegram post-processing sender for generated report artifacts; reads credentials from the sender skill folder or CLI flags.
- `us-daily-market-news` — daily U.S. market-wide and sector news report for Codex Desktop Automation, with U.S. RSS sources, New York date filtering, dated Markdown/JSON artifacts, and a Naver Blog publish manifest.
- `kr-stock-chart` — chart-only KRX output and reusable chart artifacts (`chart-data.json`, `chart-analysis.md`, five PNG panels, CSV sidecars, optional rule-screen outputs).
- `kr-stock-dart-analysis` — precise DART filing extraction before broader Korean stock interpretation.
- `kr-order-backlog-analysis` — classifies order-driven KRX companies, normalizes DART/KRX backlog evidence, and renders the required year/maturity PNG without inventing annual allocations.
- `kr-trade-flow-analysis` — CSV-first customs/KITA/UN Comtrade proxy analysis for undisclosed customer, geography, or product mix; writes `trade-flow-data.json` and `trade-flow-analysis.md` with explicit evidence grades.
- `kr-stock-data-pack` — structured company fact packs before drafting, including optional outside-view inputs.
- `kr-stock-analysis` — Korean stock quick views, full decision memos, event notes, pair compares, archetype-specific uncomfortable questions, decision-changing issues, structured stance, and follow-up research prompts.
- `kr-stock-update` — baseline-aware maintenance updates to an existing Korean stock memo, defaulting to Update Log only with gated thesis-section sync.
- `kr-foreign-analyst` — collects foreign-IB coverage of a KRX company from Korean news and renders a `## Street / Alternative Views` Markdown block.
- `kr-portfolio-monitor` — multi-position KRX portfolio snapshots via Kiwoom REST API or Yahoo fallback.
- `kr-analyst-report-discover` / `kr-analyst-report-fetch` / `kr-analyst-report-insight` — Hankyung Consensus + Naver Pay Research analyst-report pipeline.
- `kr-naver-browse` / `kr-naver-blogger` / `kr-naver-insight` — Naver browser wrapper + blogger discovery + insight digest.
- `kr-naver-blog-publish` — converts a memo or daily market-news manifest to a Naver SmartEditor draft; stock memos require explicit approval, while daily reports can use the scheduled-only safety gate.
- `kr-web-browse` — generic non-Naver browser wrapper used by the analyst-report chain.
- `kr-sector-plan` / `kr-sector-data-pack` / `kr-sector-analysis` / `kr-sector-compare` / `kr-sector-audit` / `kr-sector-update` — Korea sector workflow (brief, fact pack, full report, same-date compare, audit, dated update).

## How the skills work

These skills are designed to avoid stale-memory analysis. Shared behavior:

- Invoked explicitly through their skill names in Codex and Claude Code.
- Stock and portfolio skills treat prices, valuation, filings, guidance, portfolio positions, and news as time-sensitive — the workflow starts by verifying current sources instead of relying on memory.
- Korea sector skills treat market metrics, policy changes, regulations, company exposure, and industry news as time-sensitive and keep source dates visible.
- When the workspace is writable, the default deliverable is a markdown report file in `analysis-example/<market>/<company>/memo.md` for stock work or `analysis-example/kr-sector/<sector>.md` for sector work — not just a chat answer.
- The report file stays synchronized with the final answer, with an explicit "as of" date.

### U.S. stock skills

Primary instructions:

- [skills/us-stock-analysis/SKILL.md](../skills/us-stock-analysis/SKILL.md)
- [skills/us-stock-analysis/references/workflow.md](../skills/us-stock-analysis/references/workflow.md)
- [skills/us-stock-analysis/references/output-format.md](../skills/us-stock-analysis/references/output-format.md)
- [skills/us-sec-analysis/SKILL.md](../skills/us-sec-analysis/SKILL.md)
- [skills/us-sec-analysis/references/workflow.md](../skills/us-sec-analysis/references/workflow.md)
- [skills/us-sec-analysis/references/output-format.md](../skills/us-sec-analysis/references/output-format.md)
- [skills/us-sec-analysis/references/script-inputs.md](../skills/us-sec-analysis/references/script-inputs.md)

Current behavior:

1. `us-sec-analysis` acts as the SEC filing-precision stage when exact 10-K/10-Q facts, MD&A, Risk Factors, liquidity, controls, XBRL companyfacts, or latest 8-K metadata matter. It writes `sec-analysis.md`, `sec-reference.md`, and `sec-cache.json` when a reusable evidence pack is needed.
2. `us-stock-analysis` defines scope first: ticker, exchange, time horizon, comparison set, and whether the request is a full memo, comparison, pre-earnings note, or post-earnings note.
3. `us-stock-analysis` verifies fresh inputs from primary sources, starting with SEC evidence artifacts and IR materials, then company news and market data checks.
4. It builds a thesis around business quality, financial quality, capital allocation, catalysts, and risks.
5. It applies a valuation method that fits the company instead of forcing one template across all business models.
6. It writes the final output in the default memo format when appropriate: summary, business and thesis, latest results, valuation, catalysts, risks, and what would change the view.

Bundled helpers: `us-stock-analysis/scripts/peer-valuation.js`, `us-stock-analysis/scripts/etf-overlap.js`, `us-stock-analysis/scripts/chart-basics.js`, `us-sec-analysis/scripts/fetch-sec-edgar.js`, `us-sec-analysis/scripts/extract-sec-sections.js`, `us-sec-analysis/scripts/build-sec-reference.js`.

### Korean stock skills

Primary instructions:

- [skills/kr-stock-plan/SKILL.md](../skills/kr-stock-plan/SKILL.md)
- [skills/kr-stock-dart-analysis/SKILL.md](../skills/kr-stock-dart-analysis/SKILL.md)
- [skills/kr-stock-dart-analysis/references/script-inputs.md](../skills/kr-stock-dart-analysis/references/script-inputs.md)
- [skills/kr-order-backlog-analysis/SKILL.md](../skills/kr-order-backlog-analysis/SKILL.md)
- [skills/kr-order-backlog-analysis/references/script-inputs.md](../skills/kr-order-backlog-analysis/references/script-inputs.md)
- [skills/kr-trade-flow-analysis/SKILL.md](../skills/kr-trade-flow-analysis/SKILL.md)
- [skills/kr-trade-flow-analysis/references/output-format.md](../skills/kr-trade-flow-analysis/references/output-format.md)
- [skills/kr-stock-data-pack/SKILL.md](../skills/kr-stock-data-pack/SKILL.md)
- [skills/kr-stock-analysis/SKILL.md](../skills/kr-stock-analysis/SKILL.md)
- [skills/kr-stock-analysis/references/blended-source-notes.md](../skills/kr-stock-analysis/references/blended-source-notes.md)
- [skills/kr-stock-update/SKILL.md](../skills/kr-stock-update/SKILL.md)
- [skills/kr-web-browse/SKILL.md](../skills/kr-web-browse/SKILL.md)
- [skills/kr-analyst-report-discover/SKILL.md](../skills/kr-analyst-report-discover/SKILL.md)
- [skills/kr-analyst-report-fetch/SKILL.md](../skills/kr-analyst-report-fetch/SKILL.md)
- [skills/kr-analyst-report-insight/SKILL.md](../skills/kr-analyst-report-insight/SKILL.md)
- [skills/kr-analyst-report-watch/SKILL.md](../skills/kr-analyst-report-watch/SKILL.md)
- [skills/kr-foreign-analyst/SKILL.md](../skills/kr-foreign-analyst/SKILL.md)
- [skills/kr-foreign-analyst/references/output-format.md](../skills/kr-foreign-analyst/references/output-format.md)

Current behavior:

1. `kr-stock-plan` starts with a short user-needs check, converts a vague Korean stock request into a clear security definition, output mode, key questions, and a recommended workflow, classifies the task as fresh memo vs follow-up vs dated update, and continues into the downstream skills automatically unless the user asked for planning only.
2. `kr-stock-chart` owns KRX chart generation. It fetches about 2 years of daily bars by default, writes `chart-data.json` and `chart-analysis.md`, renders the five PNG chart panels plus CSV sidecars, and can add a rule-screen block when requested. The technical read surfaces today's `MA5 / 20 / 60 / 120 / 200` price levels explicitly.
3. `kr-stock-dart-analysis` acts as the filing-precision stage when the work depends on exact DART-backed result, segment, customer, backlog, contract, or disclosure wording detail, and first asks a short filing-needs check when the target slice is still unclear. For long annual filings, it keeps a `dart-reference.md` digest and `dart-cache.json` coverage cache so later updates can reuse section-level verification instead of re-reading the entire filing blindly. When the filing supports a broader stock memo, it also runs a DART recheck loop for thesis-critical claims instead of treating deep verification as optional.
4. `kr-order-backlog-analysis` runs after DART for `Order-driven company: yes`, selects the strongest honest basis, writes `order-backlog-data.json` and `order-backlog-analysis.md`, and renders `assets/<company>-order-backlog.png`. A total-only disclosure becomes one `연도 미공시` bar, never a synthetic schedule.
5. `kr-trade-flow-analysis` normalizes official or manual trade-stat CSVs and scores whether HS-code / country / region / plant-cluster movement can support `Trade Flow Inference` for undisclosed customer, geography, or product mix. It never upgrades a proxy to `confirmed disclosure` without DART/IR support.
6. `kr-stock-data-pack` collects dated price context, filings, results, governance facts, valuation inputs, chart inputs, optional outside-view inputs, and optional trade-flow proxy rows before drafting, and ingests `kr-stock-chart` artifacts rather than rebuilding them.
7. `kr-stock-analysis` writes the final output as a `quick view`, `full memo`, `pre-earnings note`, `post-earnings note`, or `pair compare` for KRX-listed companies, and first confirms the final decision frame or section priorities when they are still ambiguous. Full memos lead with `Decision Frame`, then surface `Uncomfortable Questions`, `Decision-Changing Issues`, `Structured Stance`, and `Follow-up Research Prompts` as fixed headers. Order-driven memos also include the required `Order Backlog and Revenue Visibility` section and PNG.
8. `kr-stock-update` preserves the original memo date, classifies follow-ups as `answer-now`, `refresh-now`, `wait-for-event`, or `ask-user`, refreshes `최근 업데이트일`, and appends or replaces dated follow-up blocks under `## Update Log`. It synchronizes gated thesis sections only when a material delta requires it and refreshes the backlog JSON/Markdown/PNG package together after a material order-state change.

Recommended pipeline:

```text
kr-stock-plan
  -> ask user needs, then lock security, mode, must-answer questions, and the user's priority question
  -> decide fresh memo vs follow-up vs dated update
  -> if chart work matters: kr-stock-chart
  -> if filing precision matters: kr-stock-dart-analysis
  -> if Order-driven company is yes: kr-order-backlog-analysis
  -> if undisclosed mix can be proxied by customs/trade statistics: kr-trade-flow-analysis
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
- `kr-analyst-report-watch` monitors broad daily/weekly Korean brokerage flow without requiring a ticker, writes `analysis-example/kr-reports/report-watch-<mode>-<YYYY-MM-DD>.md` and `.json`, and compares each topic key with the newest prior watch artifact to emphasize narrative deltas.
- `kr-foreign-analyst` searches Korean news for foreign investment-bank coverage, extracts broker / rating / target-price / date metadata from article text, and renders a memo-ready `## Street / Alternative Views` block. Treat it as secondary news-sourced evidence, not a primary report or filing fact.

Routing guide:

- Start with `kr-stock-plan` when the request is still ambiguous on ticker, share class, horizon, compare mode, deliverable shape, or whether the user wants a fresh memo vs a follow-up. If the user started there for actual analysis work, continue automatically after the brief instead of waiting for another manual skill call.
- Insert `kr-stock-chart` when the user wants chart-only output or when the memo should ingest reusable chart artifacts.
- Insert `kr-stock-dart-analysis` when the conclusion depends on exact DART wording, standalone-quarter derivation, segment detail, customer concentration, backlog, or contract disclosures.
- Insert `kr-order-backlog-analysis` after DART for order-driven companies. Its PNG is mandatory whenever a quantitative DART/KRX amount exists.
- Insert `kr-trade-flow-analysis` when the company is export-driven and undisclosed customer, geography, or product mix can be triangulated from official trade-flow CSVs plus DART, peer, and contract evidence.
- Use `kr-stock-data-pack` to assemble the dated fact base around price, governance, valuation, chart, and outside-view inputs.
- Finish with `kr-stock-analysis` for the final memo, event note, quick view, or pair compare. For full memos, keep `analysis-example/kr/<company>/memo.md` as the canonical state artifact for later follow-up work.

### Bundled helpers

- `skills/kr-stock-chart/scripts/fetch-kr-chart.js` — current KRX daily bars with a default `2y` range
- `skills/kr-stock-chart/scripts/chart-basics.js` — technical reads plus five-part PNG chart output (main trend, overlays, momentum panels for `MACD` and `ADX/DMI`, structure zones with volume-by-price, candidate wave/Fibonacci context); writes the main trend chart at `--png-out` plus sibling `*-overlay.png`, `*-momentum.png`, `*-structure.png`, `*-pattern.png` files and `*-structure-zones.csv`, `*-pattern-waves.csv` sidecars
- `skills/kr-stock-chart/scripts/build-kr-universe-rs-cache.js` — integrated `KOSPI + KOSDAQ` relative-strength percentile cache files under `.tmp/kr-rs-cache/<YYYY-MM-DD>.json`
- `skills/kr-market-leaders/scripts/screen-kr-market-leaders.js` — market-wide KRX leadership reports under `analysis-example/kr-market/leaders-<YYYY-MM-DD>.md` and `.json`
- `skills/kr-daily-market-news/scripts/fetch-daily-market-news.js` and `render-daily-report.js` — daily market-news artifacts under `analysis-example/kr-market/daily-news-<YYYY-MM-DD>.md` / `.json` plus a dated Naver publish manifest.
- `skills/kr-analyst-report-watch/scripts/discover-watch-reports.js` — broad Korean sell-side report monitor with fixture-testable parsing, dedupe, topic classification, prior-artifact comparison, and Markdown/JSON rendering.
- `skills/us-daily-market-news/scripts/fetch-daily-market-news.js` and `render-daily-report.js` — U.S. daily market-news artifacts under `analysis-example/us-market/daily-news-<YYYY-MM-DD>.md` / `.json` plus a dated Naver publish manifest.
- `skills/us-sec-analysis/scripts/fetch-sec-edgar.js` — resolves ticker/CIK, fetches SEC submissions and companyfacts with declared `User-Agent`, downloads selected filing HTML, writes text exports, and emits `sec-filing-export.json` plus `sec-companyfacts.json`.
- `skills/us-sec-analysis/scripts/extract-sec-sections.js` — parses 10-K/10-Q Item headings and emits section coverage as `parsed`, `partial`, `missing`, or `needs_review`.
- `skills/us-sec-analysis/scripts/build-sec-reference.js` — generates `sec-reference.md` and `sec-cache.json` for downstream `us-stock-analysis` reuse.
- `skills/kr-stock-chart/scripts/kr-trend-rules.js` — `Minervini Trend Template` pass/fail plus `KRX 52주 신고가 리더십 점수` markdown blocks embeddable in the memo's `Chart and Positioning` section
- `scripts/valuation-bands.js` — 3–5 year valuation band summaries
- `scripts/peer-valuation.js` — comparable-company valuation tables
- `scripts/valuation-chart.js` — bundled Korean font path for P/E, P/B, EV/EBITDA PNG labels (NotoSansKR Regular under SIL Open Font License, included with `LICENSE-NotoSansKR.txt`)
- `skills/kr-stock-dart-analysis/scripts/extract-dart-sections.js` — section index from a text export of a DART filing
- `skills/kr-stock-dart-analysis/scripts/normalize-browser-dart-export.js` — converts a Chrome extension browser export into the text format used by DART section extraction
- `skills/kr-stock-dart-analysis/scripts/fetch-opendart.js` — OpenDART API alternative to the Chrome extension; resolves `--ticker` to corp_code, downloads the latest 정기공시 (사업/반기/분기) `document.xml` ZIP plus structured endpoints (majorshareholder, alotMatter, tesstkAcqsDspsSttus, irdsSttus, cpndlhCmpsBoardCo, fnlttSinglAcntAll), and emits the same `dart-browser-export.json` schema so the downstream `normalize → extract → verify → build` chain runs unchanged. Requires `OPENDART_API_KEY` in env. Caches under `.tmp/opendart-cache/`.
- `skills/kr-stock-dart-analysis/scripts/opendart-zip.py` — Python3 stdlib helper used by `fetch-opendart.js` for cp949-safe ZIP extraction and `dart4.xsd` XML pre-processing
- `skills/kr-stock-dart-analysis/scripts/verify-dart-coverage.js` — checks whether the filing TOC was fully parsed
- `skills/kr-stock-dart-analysis/scripts/build-dart-reference.js` — generates `dart-reference.md` and `dart-cache.json`. `dart-cache.json` reserves a `verifiedClaims` block for memo-critical claim verification results
- `skills/kr-order-backlog-analysis/scripts/render-order-backlog.js` — Pillow-backed Korean PNG renderer for official year schedules, official project-level remaining backlog by end year, contract-maturity proxies, and total-only disclosure
- `skills/kr-trade-flow-analysis/scripts/normalize-trade-flow.js` — converts 관세청/KITA, UN Comtrade, or manual CSV rows into `trade-flow-data.json`
- `skills/kr-trade-flow-analysis/scripts/score-trade-inference.js` — scores trade-flow inference confidence from trade movement, company results, peer divergence, contract-scale fit, and contradiction checks
- `skills/kr-stock-update/scripts/extract-report-baseline.js` — parses memo metadata, fixed memo sections, update blocks, event keys, existing source URLs, DART state, chart assets, and sibling artifacts
- `skills/kr-stock-update/scripts/normalize-update-log.js` — renders a normalized dated update block and writes it back into the memo
- `skills/kr-stock-update/scripts/apply-memo-section-updates.js` — replaces only gated thesis-maintenance sections while preserving `기준일`

### `kr-portfolio-monitor`

Primary instructions:

- [skills/kr-portfolio-monitor/SKILL.md](../skills/kr-portfolio-monitor/SKILL.md)
- [skills/kr-portfolio-monitor/references/workflow.md](../skills/kr-portfolio-monitor/references/workflow.md)
- [skills/kr-portfolio-monitor/references/output-format.md](../skills/kr-portfolio-monitor/references/output-format.md)
- [skills/kr-portfolio-monitor/references/mcp-setup.md](../skills/kr-portfolio-monitor/references/mcp-setup.md)

Current behavior:

1. Check `kiwoom-mcp` connectivity first, then retrieve account balance, live prices, and 30-day daily bars in one pass.
2. Restrict live coverage to domestic KRX holdings supported by Kiwoom REST API. Overseas stocks are out of scope.
3. Compute SMA20 deviation and RSI14 per holding, flag stretched positions, and summarize total unrealized P&L.
4. Write the rolling snapshot to `analysis-example/kr/portfolio-snapshot.md` when the workspace is writable.
5. If live MCP access is unavailable, fall back to `portfolio-snapshot.js` with manual KRX holdings JSON and Yahoo Finance market data.

Bundled helpers: `skills/kr-stock-analysis/scripts/portfolio-snapshot.js`, `scripts/test-kiwoom-token.js`, `scripts/run-kiwoom-mcp.js`.

### Korea sector skills

Primary instructions:

- [skills/kr-sector-plan/SKILL.md](../skills/kr-sector-plan/SKILL.md)
- [skills/kr-sector-data-pack/SKILL.md](../skills/kr-sector-data-pack/SKILL.md)
- [skills/kr-sector-analysis/SKILL.md](../skills/kr-sector-analysis/SKILL.md)
- [skills/kr-sector-compare/SKILL.md](../skills/kr-sector-compare/SKILL.md)
- [skills/kr-sector-audit/SKILL.md](../skills/kr-sector-audit/SKILL.md)
- [skills/kr-sector-update/SKILL.md](../skills/kr-sector-update/SKILL.md)

Current behavior:

1. `kr-sector-plan` converts a vague Korea sector request into a clear scope, output mode, and section outline.
2. `kr-sector-data-pack` collects dated market metrics, policy events, regulation changes, value-chain facts, and representative public-company references.
3. `kr-sector-analysis` writes either a `quick brief` or a `full report` under `analysis-example/kr-sector/<sector>.md`.
4. `kr-sector-compare` keeps cross-sector comparisons on a same-date basis and ranks the setup only when the evidence supports it.
5. `kr-sector-audit` reviews an existing memo with findings first, prioritizing source, date, and logic integrity over style comments.
6. `kr-sector-update` preserves the original memo date, refreshes `최근 업데이트일`, and appends or replaces a dated block under `## Update Log`.

Example research brief: [analysis-example/kr-sector/국내 데이터센터-리서치브리프.md](<../analysis-example/kr-sector/국내 데이터센터-리서치브리프.md>)

Example full report: [analysis-example/kr-sector/국내 데이터센터.md](<../analysis-example/kr-sector/국내 데이터센터.md>)
