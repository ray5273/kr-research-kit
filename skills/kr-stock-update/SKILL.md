---
name: kr-stock-update
description: Maintain an existing Korean stock memo by reading the current memo state, classifying the follow-up request, refreshing only post-memo company-specific evidence when needed, and writing an idempotent dated update. Default behavior is Update Log only, with limited upstream section sync when material thesis deltas require it.
---

# Korean Stock Update

Use this skill when the user already has a Korean stock memo and wants follow-up analysis, an event refresh, or a maintenance update without rebuilding the full memo from scratch.

## Quick Start

- Start from an existing markdown memo file, usually `analysis-example/kr/<company>/memo.md`.
- If a matching `analysis-example/kr/<company>/dart-reference.md` or `dart-cache.json` exists, read it together with the memo so the update can reuse prior filing coverage and recheck only the sections that changed.
- Treat disclosures, earnings, capital allocation, governance moves, and company news as time-sensitive. Verify current sources before using them when the classification requires refresh.
- Use the memo's `기준일` as the minimum source date for the follow-up search.
- Deduplicate against the memo's existing `Update Log` dates and source URLs when possible.
- Update the existing memo file instead of creating a separate report by default.
- Preserve the original `기준일` and maintain a separate `최근 업데이트일`.
- Default to `Hybrid` + `Gated`: normally update only `## Update Log`; refresh selected upstream memo sections only when the thesis delta is material.
- If the memo does not exist yet, use `kr-stock-plan`, `kr-stock-dart-analysis`, and `kr-stock-analysis` as needed to create the initial report.

## Workflow

1. Extract baseline state.
   Use `scripts/extract-report-baseline.js` to parse memo dates, fixed memo sections, DART recheck rows, `guard-decision`, existing update blocks, event keys, source URLs, chart assets, and sibling artifacts.
2. Classify the request.
   Use `answer-now`, `refresh-now`, `wait-for-event`, or `ask-user`. Legacy aliases remain valid: `memo-only` means `answer-now`; `refresh-needed` means `refresh-now`.
3. Refresh sources only when needed.
   For `refresh-now`, read DART/KRX/company IR/news published after the original `기준일`, then deduplicate by event key and source URL. For `answer-now`, answer from existing memo state and log only if the user wants persistent state.
   If the memo has unresolved customer, geography, or product-mix gaps and a `trade-flow-analysis.md` artifact exists or the user asks for customs/export proxy work, use `kr-trade-flow-analysis` as a follow-up evidence source. Search only post-`기준일` company-specific disclosures, IR, and news for confirmation; keep the trade-stat result labeled as inference.
4. Run the Price & Chart Freshness Gate.
   MANDATORY whenever the update is `refresh-now`, the memo will be published (e.g. handed to `kr-naver-blog-publish`), or the user asks anything about price, valuation, target price, or upside. Fetch the live close, compare it to the memo's last-stated price, and if the gate triggers, regenerate the chart artifacts and recompute every price-derived fact. See [Price & Chart Freshness Gate](#price--chart-freshness-gate-mandatory) below.
5. Apply gated upstream skill calls.
   Always prioritize DART/KRX/company sources. Add sell-side, Naver, or foreign-IB passes only when the user asked, the memo has an external-view gap, the sector is retail-favored, an earnings/consensus event requires it, or an existing `Street / Alternative Views` claim is unresolved.
6. Judge materiality and thesis delta.
   Use `stronger`, `weaker`, `unchanged`, or `unclear`. Do not turn every headline into a thesis change.
7. Write an update packet.
   Use the v2 JSON shape in `references/script-inputs.md`, including classification, thesis delta, event keys, follow-up resolutions, DART recheck rows, signals, sources, and the freshness-gate result (`priceAsOf`, `priceMovePct`, `chartsRegenerated`, `valuationRecomputed`).
8. Write back idempotently.
   Run `scripts/normalize-update-log.js` to refresh `최근 업데이트일` and append or replace the dated block. Run `scripts/apply-memo-section-updates.js` when the hybrid gate allows selected section sync OR the freshness gate requires refreshing price-derived sections.
9. Answer the user.
   Lead with classification, the price as-of date and move since the memo, material changes, unchanged thesis points, and whether charts/valuation and any upstream memo sections were synchronized.

Read [references/workflow.md](references/workflow.md) for the detailed checklist.
Read [references/output-format.md](references/output-format.md) for the expected update-block shape.
Read [references/script-inputs.md](references/script-inputs.md) when using the bundled scripts with structured JSON inputs.

## Price & Chart Freshness Gate (MANDATORY)

A memo's price, market cap, PER/PBR, valuation snapshot, target-price upside, and conclusion are all derived from one number: the last close the memo was written against. When that close is stale, every derived number and the 결론 are silently wrong. A KRX name can move 40% between the memo date and the update, so you cannot reuse the old valuation. This gate is not optional section sync — it is a data-staleness correction that runs before you write anything.

**Trigger predicate (observable — do not skip on judgment):**

Run the gate whenever ANY of these is true:

- classification is `refresh-now`
- the memo will be published or exported (any `kr-naver-blog-publish` handoff, PDF, or shared post)
- the user asked anything about price, valuation, multiple, target price, upside, or 결론
- the live close differs from the memo's last-stated close by **≥ 5%**
- the memo's last price date is **more than 5 trading days** before today

If you cannot fetch a live price, say so explicitly in the update block and mark the valuation as `stale — not refreshed`. Never present a stale multiple as current.

**Required actions when the gate triggers (do all — this is the contract):**

1. **Fetch the live close.** Regenerate chart artifacts with the real scripts, do not hand-edit numbers:
   ```bash
   node scripts/harness.js --mode chart --ticker <code> --company "<name>"
   # or directly:
   node skills/kr-stock-analysis/scripts/fetch-kr-chart.js --ticker <code> --range 1y
   node skills/kr-stock-analysis/scripts/chart-basics.js --input <chart-data.json> --png-out <assets/…>.png
   ```
   This overwrites `chart-data.json`, `chart-analysis.md`, and the linked `*-chart*.png` panels beside the memo.
2. **Recompute every price-derived fact** against the new close: 현재가, 시가총액, PER/PBR/EV·EBITDA, 밸류에이션 스냅샷 표, 목표주가 대비 upside, and any band/technical read.
3. **Revisit the 결론 / Structured Stance / Decision Frame.** If the price moved enough to change the risk-reward (e.g. a name that was "추격 보류 (고평가)" fell 40%), the conclusion may flip. State the new price basis explicitly, e.g. `2026-07-07 종가 99,500원 기준`.
4. **Record the gate result** in the update packet: `priceAsOf`, `priceMovePct`, `chartsRegenerated: true`, `valuationRecomputed: true`.

**Red flags — STOP, you are about to ship a stale memo:**

- Reusing a market cap or PER whose price date is older than the memo's `최근 업데이트일`.
- Publishing to Naver Blog without regenerating the chart PNGs first.
- Writing a valuation or 결론 sentence that cites a price you did not fetch this session.
- Thinking "the charts probably didn't change much" — regenerate and verify, don't assume.
- Leaving `Decision Frame` quoting an old 종가 while the Update Log quotes a new one (internal contradiction).

## Bundled Scripts

- Use `scripts/extract-report-baseline.js` to parse an existing markdown memo into structured baseline metadata.
- Use `scripts/normalize-update-log.js` to render a dated update block and optionally write it back into the memo file.
- Use `scripts/apply-memo-section-updates.js` to replace only allowed upstream memo sections when the materiality gate permits it.
- Run all bundled scripts with `node`.
- If a DART reference digest exists, use it to identify which annual-filing sections were already parsed, which were partial, and which still need review.

## Operating Rules

- Preserve the original memo body unless the new information clearly changes the thesis or resolves a tracked follow-up issue.
- Keep the original `기준일` line and update only `최근 업데이트일`.
- Append dated updates under `## Update Log`. If the same date already exists, replace that dated block instead of duplicating it.
- Recognize existing dated blocks headed as `### YYYY-MM-DD`, `### YYYY-MM-DD Update`, backticked dates, bullet dates, or numbered dated headings.
- Cite every material factual claim in the dated update block.
- Use exact dates for disclosures, results, investor events, and news.
- Separate verified facts from inference.
- Append trade-flow updates as `Trade Flow Inference` with the confidence grade. Do not rewrite original customer or revenue-mix sections as confirmed unless DART/IR/company disclosures explicitly confirm them.
- Prefer saying `no material change` over forcing a narrative.
- If a requested update window has no material company-specific developments, add a short dated note saying so.
- Write event keys for material events when possible so future updates can deduplicate repeated coverage.
- Whenever the Price & Chart Freshness Gate triggers, regenerate the chart artifacts and recompute every price-derived fact (현재가, 시가총액, PER/PBR, 밸류에이션 표, 목표주가 upside, 결론). Never reuse a multiple or market cap tied to a price you did not fetch this session.

## Hybrid Section Sync Gate

Keep section sync narrow. Update `Summary`, `Structured Stance`, `Decision-Changing Issues`, `Follow-up Research Prompts`, `DART Recheck`, `Decision Frame`, or `guard-decision` only when at least one trigger applies:

- `thesisDelta` is `stronger`, `weaker`, or `unclear`
- DART recheck changes a thesis-critical claim to `contradicted` or `partially supported`
- `guard-decision` trigger or `review_by` is stale
- a tracked follow-up prompt was resolved or became obsolete

Do not rewrite `Sources`, `Update Log`, or the whole memo through the section updater. Valuation tables, the valuation snapshot, market cap, and chart sections are the one exception: when the Price & Chart Freshness Gate triggers you MUST refresh them against the newly fetched close (regenerate chart PNGs/JSON, recompute multiples), because leaving them stale ships a wrong 결론. This refresh is required, not gated by thesis delta.

## Source Priority

1. DART filings, KRX disclosures, and official company IR materials
2. Exchange notices, shareholder-return disclosures, and governance pages
3. Reputable local financial media for context when primary sources do not fully explain the move
4. Gated outside views: sell-side reports, Naver blogger views, or foreign-IB news only when the outside-view gate triggers

## Minimum Output Standard

- A statement of whether the base view strengthened, weakened, or stayed intact
- What happened after the memo date
- Why it matters
- What changed in the thesis
- What did not change
- Signals to watch next
- A dated source list
- An updated memo file when the workspace is writable
- The price as-of date and the move since the memo, plus whether charts and valuation were regenerated (or an explicit `stale — not refreshed` note if a live price could not be fetched)
- A statement of whether body sections were left unchanged or synchronized under the hybrid gate
