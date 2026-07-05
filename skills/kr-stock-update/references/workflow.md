# Workflow Reference

## Goal

This skill is for memo maintenance, not for rebuilding the full initiation memo from scratch.

The core question is:

- what happened after the original memo date
- whether those events changed the thesis
- what to watch next
- whether the existing memo state already answers the follow-up question
- whether a limited upstream section sync is justified

## Baseline Step

Before searching for new information:

1. Open the existing memo file.
2. Parse the `기준일`.
3. Parse `최근 업데이트일` if present.
4. Parse existing `Update Log` dates and source URLs.
5. Parse existing update block headings even when they use `### YYYY-MM-DD`, `### YYYY-MM-DD Update`, backticked dates, bullet dates, or numbered headings.
6. Read the existing `Decision Frame`, `Summary`, `DART Recheck`, `Street / Alternative Views`, `Decision-Changing Issues`, `Structured Stance`, and `Follow-up Research Prompts` sections so you know what the original thesis and unresolved work were.
7. Parse `guard-decision` or `Decision Block` if present.
8. Identify linked chart/valuation assets and sibling artifacts (`data-pack.md`, `dart-reference.md`, `dart-cache.json`, `chart-analysis.md`, outside-view digests).
9. If `dart-reference.md` or `dart-cache.json` exists, also parse:
   - `reference 기준일`
   - `최근 확인일`
   - `마지막 반영 공시일`
   - missing, partial, and review-needed sections

Use `scripts/extract-report-baseline.js` when possible so the baseline metadata is explicit.

## Follow-up Classification

Classify the request before fetching new sources:

- `answer-now`: the existing memo state can answer the user question without fresh source refresh. Legacy alias: `memo-only`.
- `refresh-now`: new post-`기준일` disclosures, IR materials, or news are required. Legacy alias: `refresh-needed`.
- `wait-for-event`: no useful update should be written until a named event or source exists; record the event trigger and required source if persistence is useful.
- `ask-user`: the target company, memo path, event, or required output cannot be inferred safely.

Do not run broad source collection for `answer-now`. Do not invent an event for `wait-for-event`; state the concrete trigger and source to check later.

## Source Window

Default source window:

- start date: the memo's `기준일`
- end date: now

The update process should search the full window after `기준일`, then avoid duplicate write-back by checking whether the same event date or source URL already appears in the memo.

If a DART cache is available, use it to focus the filing recheck:

- prioritize sections that were previously `missing`, `partial`, or `needs_review`
- if a new annual or quarterly filing arrived after `lastFilingChecked`, rerun the section coverage check before treating old `not separately disclosed` judgments as still valid
- keep the memo update and the filing-reference refresh connected but conceptually separate

This is intentional:

- a strict `last update date` filter can miss material items that were not logged before
- a `memo date` filter plus deduplication is safer for memo maintenance

## Source Refresh Gate

Default refresh set for `refresh-now`:

1. DART filings
2. KRX disclosures
3. Company IR pages, results materials, governance pages, and official financial statements
4. Company-specific news that explains the primary-source event

Run sell-side / Naver / foreign-IB refresh only when at least one gate triggers:

- the user explicitly asked for consensus, outside views, Naver blogger views, or foreign-IB views
- the existing memo has no meaningful `Street / Alternative Views` evidence and the output mode is full-memo maintenance
- the company is in a retail-favored sector where Naver voices are likely to affect the alternative-view section
- an earnings, guidance, or consensus event makes sell-side delta relevant
- an existing `Street / Alternative Views` bullet has an unresolved or stale claim

## Materiality Filter

Prioritize:

- earnings releases and result commentary
- formal guidance changes
- order wins, order cancellations, or large contracts
- capital raises, CB or BW issues, and dilution-related events
- treasury share buybacks, disposals, or cancellations
- dividend and shareholder return policy changes
- controlling shareholder or insider ownership changes
- governance or board structure changes
- plant disruptions, regulatory actions, or litigation that changes the operating outlook

Usually exclude:

- generic market recaps
- price-action-only articles
- duplicate media write-ups of the same filing
- weak rumor-based headlines

## Thesis Delta

For every material event, answer:

1. Is this new information or only a restatement of what the memo already knew?
2. Does it affect earnings power, cash conversion, capital allocation, governance, or timing?
3. Does it strengthen the base case, weaken it, or leave it unchanged?
4. Does it change the required monitoring list?

Do not label something as a thesis change unless it changes the investment case, downside, or monitoring framework in a concrete way.

## Thesis Delta Labels

Use exactly one:

- `stronger`: new evidence improves the base case or reduces a key risk.
- `weaker`: new evidence damages the base case, timing, or downside profile.
- `unchanged`: material events occurred but do not change the thesis.
- `unclear`: new evidence is important but not enough to classify direction.

Use `no material update` when no company-specific event passed the filter.

## Hybrid Writeback Gate

Default writeback is `Update Log` only. Use `scripts/apply-memo-section-updates.js` for limited body-section sync only when one of these is true:

- `thesisDelta` is `stronger`, `weaker`, or `unclear`
- DART recheck changes a core claim to `contradicted` or `partially supported`
- `guard-decision` trigger or `review_by` is stale
- a follow-up prompt is resolved, downgraded, or replaced

Allowed sections for section sync:

- `Summary`
- `Structured Stance`
- `Decision-Changing Issues`
- `Follow-up Research Prompts`
- `DART Recheck`
- `Decision Frame`
- `guard-decision` / `Decision Block`

Do not use section sync for `Update Log`, `Sources`, chart/valuation assets, or unrelated rewrites. If chart or valuation data is stale, mark asset refresh as required in the update block and refresh the actual PNG/JSON only when the user requested it or the memo relies on it.

## File Update Rules

When updating the memo file:

- keep the original title and memo body
- keep the original `기준일`
- add or refresh `최근 업데이트일`
- add `## Update Log` if missing
- add one block per date using `### YYYY-MM-DD Update`
- replace the same-date block if it already exists, including old-style headings
- keep the latest block at the bottom in chronological order of write operations
- include event keys where possible for duplicate detection
- include follow-up prompt resolution status when a tracked prompt was answered

If the new information materially changes the original conclusion, use the section updater to refresh only the allowed body sections needed to keep the memo state coherent.

## Failure Modes To Avoid

- rewriting the whole memo when only an incremental update was requested
- including news published before the memo date
- duplicating the same source URLs across repeated updates on the same event
- turning every headline into a thesis change
- dropping the old thesis context and writing a disconnected news digest
- running outside-view pipelines on every minor update
- silently changing `기준일`
- rewriting the full memo when a gated section sync would be enough
