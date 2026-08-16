---
name: kr-order-backlog-analysis
description: "Analyze DART-backed order backlog for KRX-listed order-driven companies and render the required year/maturity chart. Use when a Korean stock depends on shipbuilding, defense, construction, EPC, power equipment, industrial machinery, long-duration SI, or another contract-based business; when the user asks how much backlog remains through each year; or when `kr-stock-plan` classifies `Order-backlog route: yes`. Distinguish official backlog schedules from contract-maturity proxies and never invent a yearly allocation from a total-only disclosure."
---

# Korean Order Backlog Analysis

Use this skill after `kr-stock-dart-analysis` to turn filing-backed order or contract data into a decision-ready backlog artifact with a mandatory chart.

## Quick Start

- Lock the exact company, ticker, filing date, reporting scope, currency, and unit.
- Classify `Order-driven company: yes / no / deferred` with the gate in `references/workflow.md`; do not rely on a sector label alone.
- Prefer `dart-analysis.md` and `dart-cache.json` from `kr-stock-dart-analysis`. Return upstream when the relevant DART section is `missing`, `partial`, or `needs_review`.
- Choose exactly one chart basis in descending evidence order:
  1. `official-revenue-schedule`
  2. `official-contract-end-year`
  3. `contract-disclosure-maturity-proxy`
  4. `official-total-only`
- When the route is `yes` and at least one DART/KRX-backed amount exists, always write:
  - `analysis-example/kr/<company>/order-backlog-data.json`
  - `analysis-example/kr/<company>/order-backlog-analysis.md`
  - `analysis-example/kr/<company>/assets/<company>-order-backlog.png`
- Embed the PNG in both the backlog artifact and the downstream memo.
- Render explanatory graph labels in Korean by default. Preserve official company names, brands, product names, and unavoidable abbreviations exactly as published, including Latin characters such as `LS일렉트릭`; do not transliterate an official name merely to make every character Hangul. Use a Korean system font through Pillow.
- When DART or another primary company source discloses a comparable production-capacity figure, add a one-line `생산능력 참고` box with its exact period and scope. Never estimate missing capacity.
- If the company is order-driven but no quantitative backlog or effective contract amount is disclosed, do not fabricate a chart. Set `Chart status: unavailable-no-quantifiable-disclosure`, name the DART sections checked, and make the disclosure gap visible in the memo.

## Workflow

1. Apply the order-driven gate.
   Confirm that material revenue is fulfilled over contracts or milestones and that DART/KRX provides a backlog, contract-balance, remaining-performance, project-order, or material-contract evidence path.
2. Verify the filing evidence.
   Use `kr-stock-dart-analysis` to extract the latest effective state, amendments, cancellations, reporting scope, table unit, and source map.
3. Select the strongest honest basis.
   Use an official revenue-conversion schedule before an end-year grouping. Use individual contract disclosures only as a labeled maturity proxy. Use `official-total-only` when the filing gives a total but no defensible year split.
4. Normalize the chart input.
   Write `order-backlog-data.json` using `references/script-inputs.md`. Keep undisclosed amounts and unknown dates outside dated sums.
5. Render the chart.
   Run `node scripts/render-order-backlog.js --input <json> --png-out <png> --summary-out <json>`. The bars show per-period amounts; the line shows cumulative project amounts when meaningful and excludes separately classified long-term service contracts.
6. Write the analysis artifact.
   Follow `references/output-format.md`, state what the chart does and does not measure, and link every material amount to DART/KRX evidence.
7. Hand off downstream.
   Give `kr-stock-data-pack` the JSON/report paths and require `kr-stock-analysis` to embed the PNG under `## Order Backlog and Revenue Visibility` for order-driven names.

Read [references/workflow.md](references/workflow.md) for the classification and evidence hierarchy.
Read [references/output-format.md](references/output-format.md) for the required report shape.
Read [references/script-inputs.md](references/script-inputs.md) before rendering.

## Operating Rules

- Treat `official backlog`, `remaining performance obligation`, `project-level remaining order amount`, and `individual contract disclosure amount` as different measures.
- Never spread a total backlog evenly across years or infer a revenue-recognition schedule from contract dates alone.
- In `contract-disclosure-maturity-proxy` mode, chart the latest effective contract amounts by end year and label them as total contract amounts, not remaining revenue or official backlog.
- In `official-contract-end-year` mode, group the disclosed remaining order amount, not the original contract amount.
- Keep amended, terminated, undisclosed-amount, and undated contracts visible. Exclude them from sums only with an explicit reason.
- Visually separate long-duration operations and maintenance contracts from equipment, EPC, and project-delivery backlog so a distant service end year is not mistaken for a manufacturing delivery year.
- Calculate backlog/revenue coverage only on a like-for-like company or segment basis and label it as derived.
- Do not describe backlog as guaranteed revenue, profit, cash flow, or guidance.
- Keep exact source dates visible. If several metric blocks refresh on different dates, state each date separately.
- Preserve the standard file names so planning, data-pack, memo, and update skills can discover the artifacts.

## Standard Handoff

Return:

- classification and one-line rationale
- selected chart basis and confidence
- official backlog total, dated amount, undated amount, and undisclosed-amount contract count
- final disclosed or proxied end year
- backlog/revenue coverage when comparable
- absolute paths to the Markdown, JSON, and PNG artifacts
- unresolved DART coverage gaps
