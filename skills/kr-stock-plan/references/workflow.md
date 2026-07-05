# Workflow Reference

## Goal

This skill starts with scoping, but when the user wants actual stock work it should also route and continue the downstream workflow instead of stopping at the brief.

The output should make a downstream stock analyst answerable on:

- what security is in scope
- what time frame matters
- what output shape is needed
- what questions must be answered

## Security Definition

Before handing off:

1. Lock the exact ticker and market.
2. Lock the share class.
3. State whether the listing is an operating company, holding company, preferred line, or restructuring case.
4. Note any obvious confusion risk with similarly named listings or subsidiaries.

## User-Need Check

Before finalizing the brief, ask the minimum clarifying questions needed to learn:

- what decision the user is trying to make
- whether they want planning only or the full workflow executed now
- what depth they expect: quick view, full memo, event note, or compare
- whether filing precision, valuation, chart work, peers, backlog, or contract detail must be included
- what should explicitly stay out of scope

## Scope Questions

Set the minimum boundary for the downstream work:

- horizon: trading, event, 12-24 months, or multi-year view
- deliverable: quick view, full memo, pre-earnings note, post-earnings note, or pair compare
- peer set: none, optional, or required
- chart work: optional or required
- valuation depth: snapshot only or snapshot plus historical bands

## What To Include

The brief should usually state:

- security and structure
- user goal
- horizon
- comparison set when relevant
- mode
- recommended workflow steps
- required sections
- optional sections
- explicit exclusions

## Workflow Routing

Route the downstream work explicitly instead of leaving the sequence implicit, and continue into it in the same turn unless the user asked to stop after planning.

- Default stock workflow: `kr-stock-plan -> kr-stock-data-pack -> kr-stock-analysis`
- Filing-heavy workflow: `kr-stock-plan -> kr-stock-dart-analysis -> kr-stock-data-pack -> kr-stock-analysis`
- Direct filing-to-memo workflow is acceptable only when the user wants filing-grounded interpretation immediately and the extra fact-pack layers are not necessary.

Execution rule:

- If the user invoked `kr-stock-plan` to solve a stock question, treat the brief as an internal control step and then run the recommended downstream path yourself.
- Stop after the brief only when the user explicitly asks for `plan only`, `brief only`, or equivalent.

- Outside-views-aware workflow: `kr-stock-plan -> kr-stock-dart-analysis (optional) -> kr-naver-blogger -> kr-naver-insight -> kr-stock-data-pack -> kr-stock-analysis`
- Naver-first exploratory workflow: `kr-stock-plan -> kr-naver-blogger -> kr-naver-insight -> kr-stock-data-pack -> kr-stock-analysis`
- Analyst-report-aware workflow: `kr-stock-plan -> kr-stock-dart-analysis (optional) -> kr-analyst-report-discover -> kr-analyst-report-fetch -> kr-analyst-report-insight -> kr-stock-data-pack -> kr-stock-analysis`
- Full outside-views workflow: `kr-stock-plan -> kr-stock-dart-analysis (optional) -> kr-analyst-report-discover -> kr-analyst-report-fetch -> kr-analyst-report-insight -> kr-naver-blogger -> kr-naver-insight -> kr-stock-data-pack -> kr-stock-analysis` (run the analyst pass and the Naver pass independently; they feed different memo sections — sell-side consensus vs independent retail voices)

The Naver-first path applies when the user's ask is explicitly about what Naver bloggers or the retail community thinks, not about a filing-grounded decision memo.

## Follow-up Classification Loop

When an existing `analysis-example/kr/<company>/memo.md` is found, classify the follow-up before routing:

- `answer-now`: the existing memo state is enough to answer the user question. Legacy alias: `memo-only`.
- `refresh-now`: new post-memo disclosures, IR materials, or company-specific news are required. Legacy alias: `refresh-needed`.
- `wait-for-event`: the right next action is to wait for a named filing, earnings release, IR deck, KRX disclosure, or source update.
- `ask-user`: the memo target, event, time window, or desired depth is ambiguous enough that routing would be risky.

Route `refresh-now` to `kr-stock-update`. Route `answer-now` to memo-context answer or `kr-stock-analysis` only if an analytical rewrite is requested. Route `wait-for-event` to a concise trigger note. Route `ask-user` to the shortest clarifying question.

Prefer the filing-heavy workflow when the request depends on:

- latest quarter or half-year numbers
- standalone-quarter derivation from cumulative filing data
- segment, geography, or customer-concentration precision
- backlog, contract-disclosure, or related-party detail
- exact disclosure wording that will materially affect the conclusion

## Outside Views Decision

Decide whether the downstream workflow should include a Naver blog pass (`kr-naver-blogger` → `kr-naver-insight`) before `kr-stock-data-pack`.

Recommend a Naver pass when **all** of these are true:

- Output mode is `full memo` (not quick view, not event note, not pair compare).
- User has not explicitly said "skip outside views", "company only", "filing only", or equivalent.
- At least one trigger applies:
  - User explicitly asked for independent, alternative, retail, or 네이버 블로그 views.
  - The company is in a retail-favored sector: batteries, semiconductors, biotech, defense, space, EV, theme plays, small/mid-cap growth.
  - The user's priority question is about market framing, sentiment, price-action rationale, or peer positioning where sell-side coverage is thin.

Also recommend a Naver pass when the user's request is exploratory ("네이버 블로거들이 이 종목 어떻게 보고 있어?"). In that case the brief can route Naver-first and downgrade the filing depth.

**Default stance for full memos of retail-favored names:** propose `Naver blog pass: yes` and let the user veto. For everything else, default to `no`.

The `naver-insights.md` digest lands in `analysis-example/kr/<company>/` and `kr-stock-data-pack` ingests its rows into `External Views` with `Source role: independent analysis`.

## Analyst Report Decision

Decide whether the downstream workflow should include an analyst-report pass (`kr-analyst-report-discover` → `kr-analyst-report-fetch` → `kr-analyst-report-insight`) before `kr-stock-data-pack`.

Recommend an analyst-report pass when **any** of these are true:

- User explicitly asked about sell-side consensus, target price, broker coverage, 증권사 리포트, 컨센서스, or 애널리스트 TP.
- Output mode is `full memo` or `pre-earnings note` AND the company has meaningful sell-side coverage (KOSPI mid/large cap, well-covered KOSDAQ names). Retail-only small-caps with near-zero coverage can skip.
- Output mode is `post-earnings note` and the user wants consensus-vs-print framing.
- The user's priority question is about relative valuation anchoring against street TPs.

Default to `no` when:

- Output mode is `quick view`.
- Company has little or no sell-side coverage (obscure small-caps, recent relistings, holding shells).
- User explicitly said "skip sell-side", "company only", "filing only".

The analyst pass is independent of the Naver pass — both can run in the same brief; they feed distinct memo sections (`Street / Sell-Side View` vs `Alternative Views`). Decide each gate on its own criteria.

The `analyst-report-insight.md` digest lands in `analysis-example/kr/<company>/` and `kr-stock-data-pack` ingests its rows into `External Views` with `Source role: sell-side consensus`.

## Failure Modes To Avoid

- leaving ticker or share class ambiguous
- mixing operating company analysis with holding-company logic without saying so
- asking the downstream writer to decide the output mode
- sneaking thesis conclusions into the planning artifact
- skipping the analyst-report pass when the user explicitly asked about 컨센서스 / TP / 증권사 coverage
