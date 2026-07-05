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
4. Apply gated upstream skill calls.
   Always prioritize DART/KRX/company sources. Add sell-side, Naver, or foreign-IB passes only when the user asked, the memo has an external-view gap, the sector is retail-favored, an earnings/consensus event requires it, or an existing `Street / Alternative Views` claim is unresolved.
5. Judge materiality and thesis delta.
   Use `stronger`, `weaker`, `unchanged`, or `unclear`. Do not turn every headline into a thesis change.
6. Write an update packet.
   Use the v2 JSON shape in `references/script-inputs.md`, including classification, thesis delta, event keys, follow-up resolutions, DART recheck rows, signals, and sources.
7. Write back idempotently.
   Run `scripts/normalize-update-log.js` to refresh `최근 업데이트일` and append or replace the dated block. Run `scripts/apply-memo-section-updates.js` only when the hybrid gate allows selected section sync.
8. Answer the user.
   Lead with classification, material changes, unchanged thesis points, and whether any upstream memo sections were synchronized.

Read [references/workflow.md](references/workflow.md) for the detailed checklist.
Read [references/output-format.md](references/output-format.md) for the expected update-block shape.
Read [references/script-inputs.md](references/script-inputs.md) when using the bundled scripts with structured JSON inputs.

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
- Mark whether chart or valuation assets need refresh when price, valuation, or technical claims are reused.

## Hybrid Section Sync Gate

Keep section sync narrow. Update `Summary`, `Structured Stance`, `Decision-Changing Issues`, `Follow-up Research Prompts`, `DART Recheck`, `Decision Frame`, or `guard-decision` only when at least one trigger applies:

- `thesisDelta` is `stronger`, `weaker`, or `unclear`
- DART recheck changes a thesis-critical claim to `contradicted` or `partially supported`
- `guard-decision` trigger or `review_by` is stale
- a tracked follow-up prompt was resolved or became obsolete

Do not rewrite `Sources`, `Update Log`, valuation tables, chart sections, or the whole memo through the section updater.

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
- A statement of whether body sections were left unchanged or synchronized under the hybrid gate
