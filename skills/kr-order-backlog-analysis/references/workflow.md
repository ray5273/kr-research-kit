# Workflow Reference

## Order-Driven Classification Gate

Classify the company before routing.

### `yes`

Use `yes` only when both conditions hold:

1. A material business line recognizes revenue through customer-specific contracts, milestones, construction progress, manufacturing lead times, or long-duration service obligations.
2. DART/KRX provides at least one auditable evidence path: official order backlog, contract balance, remaining performance obligation, project-level remaining order amount, or material single-sales/supply-contract disclosures.

Typical candidates include shipbuilding, marine engines, defense, construction, EPC, power equipment, industrial machinery, rolling stock, and long-duration system integration. The examples are signals, not automatic classifications.

### `no`

Use `no` when ordinary inventory sales, spot transactions, subscriptions, or short-cycle purchase orders dominate and backlog is not a decision-useful disclosed KPI. Do not route merely because management uses words such as `수주`, `계약`, or `파이프라인`.

### `deferred`

Use `deferred` when the business appears contract-driven but the current filing coverage is incomplete, the listing/segment scope is ambiguous, or the quantitative evidence cannot yet be distinguished from sales pipeline, LOI/MOU, license milestones, or nonbinding awards. Complete DART extraction before deciding.

## Evidence Hierarchy

Choose one primary chart basis.

1. `official-revenue-schedule`
   Use when the filing directly states how official backlog or remaining performance obligations are expected to convert into revenue by year or period.
2. `official-contract-end-year`
   Use when DART provides project-level remaining order amounts plus contract/completion dates. Group the remaining amount by disclosed end year.
3. `contract-disclosure-maturity-proxy`
   Use when only the latest effective `단일판매ㆍ공급계약체결` states can be grouped by end year. This is a maturity distribution of total disclosed contract amounts, not official remaining backlog.
4. `official-total-only`
   Use when DART discloses an official backlog total but not a defensible year allocation. Render one `연도 미공시` bar; do not create synthetic year buckets.

Do not mix bases in the same series. If an official total and a contract-disclosure proxy are both useful, keep the official total as a separate reference metric and explain why the proxy does not reconcile to it.

## DART Extraction Checklist

Verify:

- exact filing name, filing date, reporting period, table name, currency, and unit
- consolidated, separate, subsidiary, or operating-segment scope
- beginning backlog, additions/changes, revenue recognized, cancellations, and ending backlog when disclosed
- original contract amount versus remaining order amount
- contract start date, end date, expected revenue-recognition year, and undated status
- original notice, latest correction/amendment, termination, and effective state
- public-withheld amounts and the number of affected contracts
- whether the table includes VAT, foreign-currency translation, affiliates, options, or service periods

For long annual filings, inherit the section-coverage status from `kr-stock-dart-analysis`. Do not convert `missing` or `needs_review` into nondisclosure.

## Chart Discipline

- Require one numeric bucket for chart generation.
- Sort dated buckets ascending and keep `연도 미공시` or `종료일 미정` last.
- Show period bars and, when at least two dated buckets exist, a cumulative line.
- Exclude unknown-date amounts from the cumulative dated line while keeping their bar visible.
- Keep undisclosed amounts out of numeric sums and report their contract count next to the chart.
- If `officialBacklog` differs from the bucket sum, report the reconciliation gap; do not silently scale the bars.
- For a maturity proxy, use visible wording equivalent to `개별 계약공시 총액의 종료연도 분포 — 공식 잔여 수주잔고 아님`.
- For total-only disclosure, use one `연도 미공시` bucket and explain that the final conversion year is unknown.
- Use Korean for explanatory title text, the legend, axes, date labels, footnotes, and summary labels in the PNG. Preserve official company names, brands, product names, and unavoidable abbreviations in their published form even when they contain Latin characters.
- If a distant end year comes from a long-duration operations or maintenance agreement, label it `장기 운영` and use a separate bar color instead of presenting it as ordinary equipment backlog.
- Add a `생산능력 참고` line only when a primary source states the amount, volume, or utilization. Keep the period and scope visible and do not divide backlog by a half-year capacity amount as if it were annual capacity.

## Memo Routing

For `Order-driven company: yes`, require the downstream memo to include:

- `## Order Backlog and Revenue Visibility`
- the PNG image
- a compact table with official total, dated/undated split, final disclosed year, and backlog/revenue coverage
- a basis label: official schedule, official end-year backlog, contract-maturity proxy, or total-only
- a sentence stating what cannot be inferred about margin, cancellation, timing, and cash conversion

For `deferred`, keep the route open and list the DART section or contract chain required to decide. For `no`, omit the section unless the user explicitly asks for contract detail.

## Update Behavior

When a later filing or correction arrives:

1. Preserve the original memo `기준일` and update `최근 업데이트일`.
2. Replace the latest effective contract state rather than double-counting the amendment.
3. Rebuild `order-backlog-data.json` and the PNG together.
4. Update the dated memo block under `## Update Log` and refresh `## Order Backlog and Revenue Visibility` only when the evidence changes materially.

## Failure Modes To Avoid

- treating sector membership as proof that backlog is material
- calling sales pipeline, bids, MOU/LOI, framework maximums, or license milestones official backlog
- grouping original contract amounts as remaining backlog
- spreading a total-only backlog across assumed years
- mixing consolidated backlog with segment revenue in a coverage ratio
- double-counting amended contract notices
- hiding undated or undisclosed-amount contracts
- presenting a cumulative maturity proxy as future annual revenue
