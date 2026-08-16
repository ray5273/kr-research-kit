---
name: kr-stock-dart-analysis
description: Extract structured, source-mapped evidence from Korean DART filings for a KRX-listed company. Use when the user needs precise filing-grounded summaries of quarterly or semiannual results, revenue and operating profit detail, segment differences, customer concentration, geography mix, capex, related-party disclosures, single-sales or supply-contract disclosure lists, or management-stated reasons before writing a broader stock memo. This is the filing-precision stage inside the broader `kr-stock-plan` -> `kr-stock-dart-analysis` -> `kr-stock-data-pack` -> `kr-stock-analysis` workflow. Do not use for ETF analysis, portfolio monitoring, broad sector reports, or a final investment memo unless the user explicitly wants filing-only analysis.
---

# Korean DART Analysis

Use this skill to turn Korean DART filings into a precise, reusable evidence pack before broader interpretation.

<!-- KR_DART_COVERAGE_SUMMARY_RULE -->

<!-- KR_DART_REFERENCE_DIGEST_RULE -->

<!-- KR_DART_COVERAGE_VERIFICATION_RULE -->

<!-- KR_DART_CLAIM_RECHECK_RULE -->

## Language

- Default to Korean for all user-facing output, headings, notes, and summaries unless the user explicitly asks for English.
- Keep official company names, filing names, ticker symbols, accounting labels, and quoted disclosure text exactly as disclosed when precision matters.
- Do not mix English section headings into the final artifact by default. English may appear only inside source titles, tickers, or unavoidable original names.

## Quick Start

- Start from the exact security, target period, and filing type before reading numbers.
- If the exact filing scope or output slice is still unclear, ask the user the shortest possible questions first: what they need from the filing, what period matters, and whether this is a filing-only deliverable or an input to a broader memo.
- Prefer the latest DART filing and its attached consolidated financial statements, notes, and business sections.
- For note-driven annual questions, DART is the mandatory starting point. Open the DART filing, attached audit report, or attached review report before using any company-site material.
- Determine `consolidated` versus `separate` and `cumulative` versus `standalone quarter` before quoting any result.
- If the filing discloses only cumulative quarterly or half-year figures, derive the standalone quarter by subtracting the prior cumulative filing and label it clearly as `derived from cumulative filing`.
- If the user asks only for `수주계약건` or `단일판매ㆍ공급계약` lists, switch into a disclosure-list mode and gather every relevant notice with original date, latest amendment status, counterparty, amount, sales ratio, and contract period.
- If the user asks `2027년까지 얼마`, `2028년까지 얼마`, or a similar remaining-contract question, produce a `계약 종료시점 분포`, a short `커버리지 요약`, and a full `누적 계약 커버리지` table from the latest effective contract state, while clearly noting that this is not the same as official unrecognized backlog unless the filing discloses backlog directly.
- Keep a source map for each material fact: document title, filing date, section or table label, and whether the number is directly disclosed or derived.
- If the workspace is writable and the user wants a reusable artifact, write the result to `analysis-example/kr/<company>/dart-analysis.md`.
- When the request depends on a long `사업보고서`, `감사보고서`, or note-heavy annual filing, also build `analysis-example/kr/<company>/dart-reference.md` and `analysis-example/kr/<company>/dart-cache.json` so the section sweep, coverage check, and dated cache remain reusable.
- When the user is working in `Claude.ai`, the preferred viewer-capture path is the Chrome extension under `integrations/claude-dart-extension/`: let the extension auto-extract the DART viewer page, save `dart-browser-export.json`, then run `normalize-browser-dart-export.js` before section extraction.
- When `OPENDART_API_KEY` is available in the environment, prefer `scripts/fetch-opendart.js` over the Chrome extension capture path. The fetcher resolves the corp_code from the ticker, downloads the latest 사업보고서/반기/분기 보고서 via OpenDART's `document.xml` ZIP, parses the `dart4.xsd` XML into Roman/decimal sections, and supplements with structured endpoints (majorshareholder, alotMatter, tesstkAcqsDspsSttus, irdsSttus, cpndlhCmpsBoardCo, fnlttSinglAcntAll). The output `dart-browser-export.json` shares the same schema as the Chrome extension capture, so the existing `normalize → extract → verify → build` chain runs unchanged. Cache lives in `.tmp/opendart-cache/` and is gitignored. Sample run: `node skills/kr-stock-dart-analysis/scripts/fetch-opendart.js --ticker 010950 --year 2025 --report-code 11011 --output analysis-example/kr/<company>/`.
- For annual `사업보고서`, `감사보고서`, or any memo-critical filing read, treat `deep-read mode` as the default rather than an optional fallback. Do not skip the full section sweep when the filing is long and thesis-critical.
- When upstream analysis, a data pack, or your own draft memo contains important claims, convert those claims into a DART recheck list and verify them against the filing before finalizing the output.
- For `수주계약건만`, `단일판매ㆍ공급계약만`, or similar requests, use the fixed Korean contract-list format from `references/output-format.md` unless the user explicitly asks for a different shape.
- If the user asks for `수주잔고 대비 매출`, `백로그 커버리지`, or similar backlog-coverage metrics, calculate them only on a like-for-like basis and label them as a derived coverage read rather than a formally disclosed KPI unless the company discloses the metric directly.
- If the user asks for both `수주잔고` and `계약 만기 분포`, use an integrated backlog mode that combines the official backlog table, contract-disclosure list, maturity buckets, and coverage metrics in one Korean artifact.
- When `kr-stock-plan` classifies `Order-backlog route: yes`, hand the verified backlog fields to `kr-order-backlog-analysis`. Keep official year schedules, project-level remaining amounts, contract-maturity proxies, and total-only disclosure clearly distinguishable so the downstream skill can render the mandatory chart without inventing a split.
- If the user asks about `특수관계자`, `관련당사자`, `내부거래`, `계열 매출`, or `내부그룹 매출 비중`, treat it as a note-driven task: locate the latest annual audit report or business-report notes first, check both the consolidated note and the separate-financial-statement note when available, then extract the revenue denominator, the related-party transaction note total, and any separately disclosed `대규모기업집단 계열회사` block before calculating any ratio.
- Treat these as `note-driven tasks` by default when the answer depends on annual notes, appendices, or audited tables: customer concentration, geography mix, related-party transactions, internal-group revenue, segment margin, capital-allocation notes, treasury-share detail, and any claim that depends on a filing footnote rather than a headline IR slide.
- If the user asks for `매출 비중`, `구성 비중`, `계약 비중`, or asks to analyze both together, switch into a `비중 통합 모드`: build one dated section for revenue mix ratios and one dated section for contract or backlog-related ratios, and keep scope mismatches explicit instead of forcing a single blended percentage.

## Workflow

1. Lock the filing scope.
   Confirm the company, ticker, report type, period, and whether the user wants a broad filing read, results summary, segment comparison, customer concentration check, contract list, or another filing-specific slice.
2. Build the filing set.
   Gather the target DART filing, the prior comparable filing needed for quarter-only derivations, and any attached audit or review reports that clarify disclosure gaps.
2A. Run a section sweep for long filings.
   For annual `사업보고서`, `감사보고서`, or similarly long filings, first build a TOC-level section index, parse every section you can reach, and verify coverage before writing the final analysis.
2B. Build a claim recheck queue.
   For any annual-filing analysis that feeds a broader stock memo, extract the 3-8 claims most likely to affect the thesis and verify them explicitly from DART before signing off.
2C. Enforce DART-first note completion.
   For note-driven tasks, do not treat company IR pages, newsroom pages, or third-party mirrors as substitutes for the DART filing path. Finish the DART viewer or attached-audit/PDF read first, then use other official materials only as supplemental commentary.
3. Determine the measurement basis.
   Decide which tables are consolidated versus separate and which values are cumulative versus quarter-only before extracting or deriving any metric.
4. Extract the results block.
   Pull revenue, operating profit, net profit, margins, and the company's explicitly stated reasons for change.
5. Extract mix and structure disclosures.
   Pull segment, geography, customer concentration, order backlog, capex, related-party, contract-disclosure, and other relevant blocks only when the filing actually discloses them.
6. Compare against prior periods.
   Summarize what changed versus the previous quarter, previous half, or previous year using the same accounting basis.
7. Separate disclosure from inference.
   Keep management wording, filing facts, and your derived comparisons distinct.
8. Hand off cleanly.
    Deliver a filing-grounded pack that `kr-order-backlog-analysis`, `kr-stock-data-pack`, or `kr-stock-analysis` can consume without re-reading the full filing, and keep it aligned with the scoped brief from `kr-stock-plan` when one exists.

Read [references/workflow.md](references/workflow.md) for the filing-extraction checklist.
Read [references/output-format.md](references/output-format.md) for the default evidence-pack shape.
Read [references/script-inputs.md](references/script-inputs.md) when using the bundled DART section, coverage, and reference scripts.

## Operating Rules

- Never present a derived standalone quarter as if the filing disclosed it directly.
- Default to consolidated figures. If only separate figures are available for a block, say that explicitly.
- Use the filing's exact period labels. Do not flatten `3Q cumulative`, `half-year cumulative`, and `annual` into one generic period.
- If a mix split, segment profit, customer concentration figure, or backlog figure is not separately disclosed in the filing set, write `not separately disclosed` instead of guessing.
- Do not write `not separately disclosed` for a long annual filing until the section coverage check is complete and the relevant section is not `missing` or `needs_review`.
- Do not satisfy a note-driven task from a company IR page when the relevant DART note, appendix, or attached audit report has not been checked yet.
- Use the company's stated reasons for growth or margin change only when the filing or attached official earnings material says them explicitly.
- If IR material adds color but DART is silent or less specific, anchor the number to DART and label the extra explanation as official IR commentary.
- If DART and IR differ, prefer the filing for formal numbers and note the mismatch.
- Keep restatements, accounting basis changes, and scope changes visible when they affect comparability.
- Ask a short user-need check before extraction when the must-answer filing questions are not already defined by `kr-stock-plan` or the active request.
- Use the latest annual audit report for customer concentration or segment-note detail when the current quarterly or half-year filing does not repeat it, but label the date mismatch.
- When the user asks for related-party or internal-group revenue share, prefer the latest annual audit report note even if the DART viewer is inconvenient, and accept the company IR `감사보고서` download page only as the same official audited-note route rather than a separate fallback workflow.
- When you use a company IR `감사보고서` or reviewed-financial-statements download page, treat it only as an alternate path to the same official DART-attached document. It does not relax the DART-first requirement.
- When the user asks for related-party or internal-group revenue share, check whether the filing provides both `연결` and `별도` notes. If both exist, show the connected but different meanings instead of stopping after the consolidated note.
- For memo-critical annual-filing work, do not stop after section extraction. Convert important claims into `confirmed`, `partially supported`, `contradicted`, or `not separately disclosed` using explicit filing evidence.
- If the note read is incomplete, hand off the item as `needs_review`, `partial`, or `not separately disclosed after DART check` rather than filling the gap with a company-site summary.
- When a result is only meaningful after subtracting prior cumulative figures, show the calculation path briefly.
- Separate `회계상 특수관계자 비중` from `대규모기업집단 계열회사 포함 내부그룹 비중` when the note discloses both. Do not collapse them into one unlabeled percentage.
- Separate `연결 기준 내부그룹 매출 비중` from `별도 기준 특수관계자 거래 구조`. The former is usually used for external revenue concentration, while the latter often includes transactions with subsidiaries.
- Separate `매출 비중` from `계약 비중`.
  Revenue mix can be based on annual segment or customer sales, while contract mix may be based on backlog, contract balance, or individual contract notices. Never imply these are the same denominator unless the filing explicitly supports that comparison.
- When listing contract disclosures, keep original notices, amendment notices, and termination or correction notices distinguishable instead of collapsing them into one unlabeled row.
- When the request is contract-only, use the exact section order and column order defined in `references/output-format.md`.
- Never present contract-period distribution as if it were formal remaining revenue or accounting backlog unless the filing explicitly says so.
- Never present `백로그 커버리지` as guaranteed future revenue or margin. It is only a ratio between disclosed backlog and same-basis revenue.
- Never allocate an official total backlog across years unless DART directly supplies a revenue schedule or project-level remaining amounts with defensible dates. Route total-only evidence as `official-total-only` with `연도 미공시`.

## Source Priority

1. DART filing tables and footnotes
   Use these for formal numbers, segment disclosures, geography mix, customer concentration, related-party transactions, and accounting basis.
2. Attached audit or review reports
   Use these when they clarify note detail, customer concentration, or accounting treatment not repeated elsewhere.
3. Official earnings-release or IR deck material
   Use these for management explanations or presentation tables, but do not let them override filing numbers.
4. KRX disclosures
   Use these for event timing, shareholder-return actions, exchange-level notices, and `단일판매ㆍ공급계약체결` style contract disclosures linked to the period.

For note-driven tasks, items 1 and 2 are mandatory before 3.

If a number matters to the conclusion, keep the filing citation visible. If you cannot trace a material number back to the filing set, mark it as outside the filing scope.

For long annual filings, keep the coverage-verification result visible enough that another analyst can distinguish `true nondisclosure` from `parse gap`.

## Minimum Output Standard

- Filing scope with exact document names and dates
- Results summary with revenue, operating profit, net profit, growth, and margin basis
- Standalone quarter derivation notes when needed
- Segment or business-unit differences when disclosed
- Geography, customer concentration, backlog, capex, or related-party blocks when disclosed and relevant
- Contract-disclosure lists when the user requested `수주계약건` or a filing-only contract screen
- Filing-stated reasons for change
- Clear `not separately disclosed` notes for missing but important items
- A source map another analyst can audit quickly
- A dated section-coverage check for long annual filings
- A reusable reference digest and cache when the document is large enough that downstream work should not re-read the whole filing
- A claim recheck block for the highest-impact memo claims when the filing work feeds a broader analysis
- An explicit unresolved-items block when any note-driven claim could not be completed from DART or the attached official audit or review documents
- For `Order-backlog route: yes`, a chart-ready handoff that identifies the selected evidence basis, amount unit, dated buckets, undated amount, undisclosed-amount contract count, official total, annual-revenue denominator, and source URLs

## Handoff Guidance

- Use `kr-order-backlog-analysis` immediately after this when `kr-stock-plan` classified the company as order-driven; that skill owns the normalized JSON, mandatory backlog PNG, and backlog report.
- Use `kr-stock-data-pack` after this when the downstream work still needs valuation, chart, governance, or outside-view inputs.
- Use `kr-stock-analysis` after this when the user wants a final thesis, valuation view, catalysts, risks, and conclusion.
- When a `kr-stock-plan` brief already exists, keep the filing extraction scoped to that brief's security, time horizon, and must-answer questions instead of re-scoping from scratch.
- If the user's request is mainly `what does the latest filing actually say`, keep the answer in filing-analysis mode and stop short of a full investment memo.
