---
name: kr-stock-analysis
description: Build dated, source-backed analysis for KRX-listed companies. Use when analyzing a Korean ticker, writing a quick view, a full decision memo, a pre-earnings note, a post-earnings note, or a same-date pair compare for KRX-listed operating companies, holding companies, or preferred-share lines using DART, KRX, company IR materials, valuation checks, chart context, and, for full memos, uncomfortable questions, decision-changing issues, structured stance, and company-specific follow-up research prompts. Do not use for ETF analysis, portfolio monitoring, scope-only planning, or incremental memo updates.
---

# Korean Stock Analysis

Use this skill to write the final Korean stock memo or event note.

For `full memo` work, the target is not a generic long report. The target is a dated decision memo that helps a personal investor decide what matters, what is still missing, and what would actually change the view.

## Quick Start

- Treat prices, market caps, earnings, guidance, shareholder return policy, regulations, and company news as time-sensitive.
- If the final deliverable shape or emphasis is still unclear, ask the user the shortest clarifying questions first: what decision they are making, what depth they want, and which sections matter most.
- Prefer using a scoped brief from `kr-stock-plan` and a fact pack from `kr-stock-data-pack` before drafting.
- When the latest filing details are central to the conclusion, strongly prefer a `kr-stock-dart-analysis` pass before drafting so segment, margin, and disclosure wording stay exact.
- For annual-filing-backed memo work, treat DART recheck as mandatory for thesis-critical claims instead of an optional extra step.
- Route the output mode early.
  - `quick view` for compact decision support
  - `full memo` for a deeper decision memo with a clear stance and explicit disconfirming evidence
  - `pre-earnings note` or `post-earnings note` for event reads
  - `pair compare` for same-date stock comparisons
- If the workspace is writable, create or update `analysis-example/kr/<company>/memo.md`.
- State an explicit `기준일` in the memo and keep each metric block honest about its source date.
- If the user supplied a specific question, treat it as the priority lens for section ordering, evidence selection, and final stance.
- For a `full memo`, lead with `Decision Frame`, classify the company archetype before generating `Uncomfortable Questions`, and end with `Follow-up Research Prompts` that turn the biggest evidence gaps into next-step diligence.

## Workflow

The 11 steps below are the canonical work order. Group them into the 3 phases described in `## Parallel Dispatch` below: Steps 1, 2, 4 belong to Phase A; the data-gathering parts of Steps 3 and 5 belong to Phase B and must be dispatched as parallel subagents in a single turn; Steps 3 (final pack assembly), 6-11 belong to Phase C.

1. Lock the mode.
   Confirm whether the user wants a quick view, full memo, event note, or pair compare.
2. Load prior work.
   Reuse the planning brief, `kr-stock-dart-analysis` output, and data pack when available instead of re-scoping from scratch.
3. Refresh material facts.
   Verify the latest company facts needed to support the conclusion and anchor material numbers to primary sources. The DART, chart, and external-view fetches that feed the data pack must be dispatched as parallel subagents — see `## Parallel Dispatch`. Run `kr-stock-data-pack` itself only after those subagents return, so it can ingest their artifacts.
4. Classify the archetype.
   Decide which business archetype best fits the company and use that choice to drive the uncomfortable-question set.
5. Scan outside views.
   Pull sell-side notes, specialist media, or independent long-form analysis to surface market framing, disagreements, and open questions. When independent Naver coverage is available, use `kr-naver-blogger` to identify specialists for the ticker and `kr-naver-insight` to fetch and digest their recent posts as source type 4 material. All three outside-view channels (sell-side, Naver, foreign IB) must be dispatched as parallel subagents alongside the Step 3 data fetches — see `## Parallel Dispatch`.
6. Build the memo.
   Separate verified facts from inference, keep section boundaries clean, and label what came from primary sources versus outside interpretation.
   Put customs, KITA, UN Comtrade, or overseas trade-stat claims in a standalone `Trade Flow Inference` block. Run DART recheck separately for any disclosure-backed component, and never present trade-flow inference as a confirmed filing fact.
7. Run DART recheck on key claims.
   Before finalizing the memo, convert the 3-8 most important business, customer, segment, backlog, related-party, capital-allocation, or governance claims into a DART verification list and route them through `kr-stock-dart-analysis` or an existing `dart-cache.json`.
8. Attack the thesis.
   Add default disconfirming evidence, uncomfortable questions, and decision-changing issues instead of letting the memo drift into a one-sided argument.
9. Surface follow-up diligence.
   Review the draft for missing disclosures, unverified assumptions, rerating conditions, and unresolved outside claims, then convert only the highest-impact gaps into company-specific research prompts.
10. Use the right helpers.
   Pull chart, valuation-band, and peer-comparison helpers only when they materially improve the output.
11. Write the file deliverable.
   Keep the markdown memo synchronized with the final answer.

Read [references/workflow.md](references/workflow.md) for the analysis checklist.
Read [references/kr-market-checklists.md](references/kr-market-checklists.md) when analyzing Korean growth stocks, value stocks, exporters, or holding companies.
Read [references/output-format.md](references/output-format.md) for the default memo shapes.
Read [references/blended-source-notes.md](references/blended-source-notes.md) when you need to balance primary filings with sell-side, specialist-media, or independent views.
Read [references/uncomfortable-question-rubric.md](references/uncomfortable-question-rubric.md) to map the company archetype to the right uncomfortable questions.
Read [references/script-inputs.md](references/script-inputs.md) when using the bundled scripts with structured JSON inputs.

## Parallel Dispatch

The 11-step workflow groups into 3 execution phases. Phase B is the only phase that must be parallelized — running its 5 channels sequentially burns the main agent's context with raw filing, PDF, and blog text and slows the memo turn dramatically.

### Phase A — Scope (sequential, main agent)
Steps 1, 2, 4. Lock mode, load prior work from the company directory, form an initial archetype hypothesis. Cheap and conversational; do not delegate.

### Phase B — Independent data gathering (parallel subagents, single turn)
In one assistant turn, dispatch the channels below as separate `Agent` calls in parallel — multiple `Agent` tool uses in the same response, not sequential turns. Skipping this rule is the single biggest cause of context bloat in this skill.

| Channel | Sub-skill / scripts | Standard artifact (in `analysis-example/kr/<company>/`) |
|---|---|---|
| DART | `kr-stock-dart-analysis` | `dart-analysis.md`, `dart-cache.json` |
| Chart | `scripts/fetch-kr-chart.js` → `scripts/chart-basics.js` | `chart-data.json`, `assets/<company>-chart*.png` |
| Sell-side | `kr-analyst-report-discover` → `kr-analyst-report-fetch` → `kr-analyst-report-insight` | `analyst-report-insight.md` |
| Naver blogger | `kr-naver-blogger` → `kr-naver-insight` | `naver-insights.md` |
| Foreign IB | `kr-foreign-analyst` | `foreign-views.md` (or inline block for `Street / Alternative Views`) |

Channel selection by mode:
- `quick view`: Chart + DART only.
- `full memo`: all 5 channels.
- `pre-earnings note`: DART + Chart + Sell-side. Skip Naver and Foreign unless the user asked for sentiment.
- `post-earnings note`: DART + Sell-side + Foreign. Chart optional.
- `pair compare`: run the 5-channel set per company in parallel; do not interleave per-company sequentially.

`subagent_type` for each Phase B call: use `general-purpose` by default. Use `Explore` only when a channel reduces to read-only file/symbol lookup (rare here).

Subagent prompt template — paste this verbatim into each `Agent` call, substituting the bracketed values:

```
You are a data-gathering subagent for a KRX stock memo on <company> (<ticker>).

Goal: invoke the <sub-skill name> skill and persist its output to disk.

Inputs:
- ticker: <ticker>
- company: <company>
- output dir: analysis-example/kr/<company>/

Required actions:
1. Invoke the <sub-skill name> skill via the Skill tool with the inputs above.
2. Make sure the skill's standard artifact (<artifact filename>) lands in the output dir.
3. Do not dump raw filing, PDF, or blog text into your reply.

Return to me, in <=200 words:
- absolute path of the artifact you wrote
- the 3 most decision-relevant findings (one bullet each, with a date)
- any gaps the main agent should know about (auth-walled report, missing filing, empty Naver result, etc.)
```

### Phase C — Synthesis (sequential, main agent)
After Phase B returns, run `kr-stock-data-pack` (it auto-ingests `analyst-report-insight.md` and `naver-insights.md` when present), then continue with Steps 6-11: build the memo, run DART recheck on thesis-critical claims, attack the thesis, surface follow-up prompts, run helper scripts, and write the deliverable. The main agent reads the Phase B artifacts on demand via `Read` instead of carrying them in context.

If a Phase B subagent returns a gap (e.g. Naver returned 0 specialist hits, foreign IB had no recent coverage, an analyst PDF was auth-walled), record the gap in the memo's `Decision-Changing Issues` or `Follow-up Research Prompts` section rather than retrying the whole channel.

## Bundled Scripts

- Use `scripts/peer-valuation.js` when the user provides peer metrics and you need a consistent markdown comparison table.
- Use `scripts/fetch-kr-chart.js` when you need current KRX daily bars and the user did not already provide OHLCV history.
- Use `scripts/chart-basics.js` when you need a technical read plus four-part PNG charts that separate the main price trend, heavier overlay indicators, momentum panels for `MACD` and `ADX/DMI`, and a structure chart that pairs candles with a horizontal 매물대 (volume-by-price) gutter and ATR-tolerance clustered horizontal 지지/저항 zone(최대 3+3개, 현재가 ±30% 이내)을 사용한다. 보조로 `*-structure-zones.csv` 파일에 broken/거리필터 zone까지 포함한 전체 roster가 8개 컬럼(type, zone_low, zone_high, center_price, touch_count, last_touch_date, score, status)으로 동시 출력된다.
- Use `scripts/build-kr-universe-rs-cache.js` when the memo needs an integrated KOSPI+KOSDAQ RS percentile cache for same-date rule checks.
- Use `scripts/kr-trend-rules.js` when the memo needs a `Rule Screen` block with `Minervini Trend Template` pass/fail plus the `KRX 52주 신고가 리더십 점수`.
- Use `scripts/valuation-bands.js` when the user provides 3-5 years of historical valuation multiples and you need markdown tables plus ASCII band charts for P/E, EV/EBITDA, and P/B.
- Use `scripts/valuation-chart.js` when the user provides 3-5 years of historical valuation multiples and you need PNG time-series charts for P/E, P/B, and EV/EBITDA bands that can be embedded in a markdown memo. Accepts the same input JSON as `valuation-bands.js`. Requires at least 3 years of data per metric; defaults to a 5-year window.
- Run all bundled scripts with `node`.
- PNG chart labels render Hangul with `KR_STOCK_CHART_FONT` first, then the bundled `assets/fonts/NotoSansKR-Regular.ttf`, then OS font discovery. The bundled Noto Korean Regular face is sourced from the official `notofonts/noto-cjk` distribution and ships with `assets/fonts/LICENSE-NotoSansKR.txt` under the SIL Open Font License. The install hook verifies Pillow and a bundled-font text-mask smoke test; set `SKILL_INSTALL_SKIP_LINUX_DEPS=1` to avoid automatic Linux dependency installation attempts.

## Operating Rules

- Cite where each important factual claim came from.
- Ask a short user-need check before drafting when the active brief does not already define the mode, must-answer questions, or section priorities.
- Keep raw filing text, raw PDF text, raw blog post bodies, and raw news article bodies inside Phase B subagents — never read them into the main agent's context. The main agent works from the artifact files those subagents wrote and from their <=200-word return summaries.
- Use exact dates for disclosures, earnings, guidance, and news.
- Separate verified facts from your inference.
- A thesis-critical statement is not fully verified until it survives the DART recheck step when a relevant filing exists.
- Use primary sources to anchor core numbers, customer concentration, capital allocation facts, and governance facts.
- Use outside research to capture framing, disagreement, and thesis pressure points instead of repeating company marketing language.
- Label outside interpretation as `Street view`, `Specialist media`, `Independent view`, or `Not separately disclosed` when the distinction matters.
- Label trade-stat interpretation as `Trade Flow Inference` with its confidence grade (`high-confidence inference`, `medium-confidence proxy`, `weak proxy`, or `contradicted`) when the company, customer, geography, or product mix is not separately disclosed.
- Prefer ranges and scenarios over false precision.
- Say when data is missing or uncertain.
- If revenue mix, customer concentration, or a valuation metric is not disclosed cleanly, say so and explain what the current source set does and does not provide.
- Do not let one broker note, one blog post, or one media article become the sole basis for the conclusion.
- For full memos, use `Decision Frame` as the fixed front section. It should tell the reader what is most likely to change the investment decision before the long memo starts.
- For full memos, classify the company archetype explicitly enough that the uncomfortable questions are not generic.
- For full memos, attack the thesis by default. Do not wait for the user to ask for the bear case.
- For full memos, turn material evidence gaps into concrete follow-up research prompts instead of leaving them implicit.
- For full memos, use `Street / Alternative Views` to show where the market view agrees, disagrees, or runs ahead of what the filing proves.
- For full memos, attach a short `DART Recheck` block that shows which key claims were confirmed, weakened, contradicted, or left not separately disclosed.
- Keep `Uncomfortable Questions`, `Decision-Changing Issues`, `Structured Stance`, and `Follow-up Research Prompts` as fixed section headers for full memos so follow-up routing can find them reliably.
- `Structured Stance` should say what the current stance is, why the memo stops there, and what would change that stance. Do not collapse it into a blunt buy or sell call unless the user explicitly asked for that level of force.
- Keep `Follow-up Research Prompts` company-specific and avoid repeating catalysts, risks, or generic diligence prompts.
- Distinguish ordinary shares, preferred shares, holding companies, and operating subsidiaries when the listing structure matters.
- If you produced a full single-stock memo, keep the file deliverable synchronized with the final chat answer rather than letting the report drift.
- Route ETF work elsewhere instead of bending this skill back into mixed security coverage.

## Source Roles

1. Primary company sources
   DART filings, KRX disclosures, official IR decks, audit reports, governance pages, shareholder-return materials, and exchange notices. Use these to confirm material numbers and formal facts.
2. Sell-side and transcript summaries
   Brokerage notes, earnings-commentary summaries, or transcript recaps. Use these to surface what the market is debating, not to replace primary-source verification.
3. Specialist media and industry reporting
   Reputable local financial media, trade press, and specialist interviews. Use these for competitive framing, end-market context, and reported customer or industry commentary.
4. Independent long-form analysis
   Blogs, newsletters, or detailed independent writeups. Use these as idea sources and stress tests, but keep them clearly labeled and secondary to verified facts.

If a secondary source provides a number that matters to the conclusion, trace it back to a primary source when possible or mark it as unverified.

## Full Memo Minimum Output Standard

The list below applies to `full memo` outputs. Use the compact templates in `references/output-format.md` for `quick view`, `pre-earnings note`, `post-earnings note`, and `pair compare`.

- Summary judgment
- `Decision Frame` that surfaces the few issues most likely to change the investment decision
- What the business does and what matters most
- Revenue mix across product or segment, geography, and customer concentration when disclosed
- Evidence from current results, balance sheet, and capital allocation
- A short `DART Recheck` table for the most thesis-critical claims
- A `Street / Alternative Views` section that captures sell-side, specialist-media, or independent takes and labels what is confirmed versus inference
- Current valuation snapshot with price, market cap, trailing PER, forward PER, EV/EBITDA, P/B, and FCF yield
- Historical valuation bands for P/E, EV/EBITDA, and P/B over 3-5 years when the data can be assembled
- Chart and positioning context with MA5, MA20, MA60, MA120, Bollinger Bands, Ichimoku, RSI, volume regime, key levels, and a chart-only flow conclusion when price history can be assembled
- A `Rule Screen` block inside `Chart and Positioning` that reports `Minervini Trend Template` pass/fail or incomplete, `KRX 52주 신고가 리더십 점수`, and the detailed sub-rule checks when chart history is sufficient
- A PNG chart reference in markdown when enough price history can be fetched or assembled for a memo file
- Governance and structure checks with why they matter
- Catalysts
- Risks and disconfirming evidence
- `Uncomfortable Questions` that reflect the company archetype instead of a generic risk checklist
- `Decision-Changing Issues` that rank the 3-5 evidence gaps or swing factors most likely to alter the stance
- `Structured Stance` with the current stance, why the memo stops there, and what would change the view
- `Follow-up Research Prompts` with 4-8 company-specific next-step questions and why each matters
