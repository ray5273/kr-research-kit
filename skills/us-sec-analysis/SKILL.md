---
name: us-sec-analysis
description: Collect and summarize source-mapped SEC evidence for U.S. public companies. Use when the user needs filing-precision work before broader U.S. stock analysis: latest 10-K or 10-Q facts, MD&A, Risk Factors, balance sheet and cash-flow checks, latest 8-K metadata, SEC XBRL companyfacts metrics, filing text extraction, reusable sec-reference.md/sec-cache.json artifacts, or a Korean SEC evidence pack under analysis-example/us/<company>/sec-analysis.md. This is the SEC filing-precision stage before us-stock-analysis when exact filing support matters.
---

# U.S. SEC Analysis

Use this skill to turn SEC EDGAR filings and XBRL facts into a reusable evidence pack before broader U.S. stock interpretation.

<!-- US_SEC_FAIR_ACCESS_RULE -->

<!-- US_SEC_REFERENCE_DIGEST_RULE -->

<!-- US_SEC_SOURCE_MAP_RULE -->

## Language

- Default to Korean for user-facing output, headings, notes, and summaries unless the user explicitly asks for English.
- Keep official company names, ticker symbols, SEC form names, accounting labels, accession numbers, and quoted disclosure text exactly as disclosed when precision matters.

## Quick Start

- Lock the exact company, ticker or CIK, target forms, and whether the user wants a filing-only pack or an input to a broader memo.
- Prefer the latest `10-K` and `10-Q` plus latest `8-K` metadata for the default filing set.
- Use SEC primary sources first: `data.sec.gov` submissions, SEC XBRL `companyfacts`, and the filing's primary document in `/Archives/edgar/data/`.
- Declare a real `User-Agent` for SEC requests. Use `SEC_USER_AGENT` or pass `--user-agent`; keep request cadence below SEC fair-access limits.
- If the workspace is writable and the user wants a reusable artifact, write the result to `analysis-example/us/<company>/sec-analysis.md`.
- For long filings or memo-critical work, also create `analysis-example/us/<company>/sec-reference.md` and `analysis-example/us/<company>/sec-cache.json` so downstream work can cite the digest/cache without re-fetching the entire filing.
- If existing `sec-analysis.md`, `sec-reference.md`, or `sec-cache.json` files already exist for the company, read them before re-collecting and only refresh when the requested filing/date scope requires it.

## Workflow

1. Lock scope.
   Confirm the ticker or CIK, target form set, latest versus specific period, and the key filing questions.
2. Collect SEC data.
   Run `scripts/fetch-sec-edgar.js` to resolve ticker-to-CIK, collect submissions, collect companyfacts, select latest forms, download primary filing HTML, and emit text plus JSON artifacts.
3. Parse filing sections.
   Run `scripts/extract-sec-sections.js` on the relevant `latest-10k.txt` or `latest-10q.txt` when the user needs MD&A, Risk Factors, controls, legal proceedings, or financial-statement sections.
4. Build a reusable reference.
   Run `scripts/build-sec-reference.js` to generate `sec-reference.md` and `sec-cache.json` from filing export, sections, and facts.
5. Write the analysis.
   Use the default SEC analysis shape from `references/output-format.md`, keep every material number source-mapped, and label gaps as `not separately disclosed` or `needs_review`.
6. Hand off cleanly.
   Use `us-stock-analysis` after this when the user wants thesis, valuation, catalysts, risks, and conclusion.

Read [references/workflow.md](references/workflow.md) for the SEC collection and extraction checklist.
Read [references/output-format.md](references/output-format.md) for the default Korean evidence-pack shape.
Read [references/script-inputs.md](references/script-inputs.md) before running the bundled scripts.

## Bundled Scripts

- `scripts/fetch-sec-edgar.js` resolves ticker or CIK, fetches SEC submissions/companyfacts, downloads selected filing HTML, writes filing text files, and emits `sec-filing-export.json` plus `sec-companyfacts.json`.
- `scripts/extract-sec-sections.js` parses 10-K/10-Q Item headings and labels section coverage as `parsed`, `partial`, `missing`, or `needs_review`.
- `scripts/build-sec-reference.js` renders `sec-reference.md` and `sec-cache.json` from the fetch and section artifacts.
- Run all bundled scripts with `node`.

## Operating Rules

- Do not invent revenue mix, customer concentration, segment profitability, governance facts, or valuation metrics that are not in the current SEC source set.
- Do not derive standalone quarters from year-to-date XBRL facts unless the user explicitly asks and you have the matching prior cumulative fact; v1 should preserve XBRL start/end period facts as disclosed.
- Preserve accession number, form, filed date, period start/end, unit, taxonomy, and source URL for each material XBRL fact.
- Treat SEC XBRL companyfacts as standardized fact evidence, not as a complete substitute for reading the filing text.
- If a company uses only custom taxonomy for a memo-critical metric and companyfacts lacks the standard concept, mark it as `not separately disclosed in standard SEC companyfacts` and inspect the filing text.
- Keep latest 8-K work metadata-first unless the user asks to parse 8-K items.
- If a filing section parse is `missing` or `needs_review`, do not convert that into `not separately disclosed`.
- Keep SEC fair access explicit: declared `User-Agent`, efficient downloads, cache reuse, and request cadence below 10 requests/second.

## Source Priority

1. SEC filing primary document and inline XBRL filing text
2. SEC `data.sec.gov/submissions/CIK##########.json`
3. SEC `data.sec.gov/api/xbrl/companyfacts/CIK##########.json`
4. Company IR earnings releases or decks for management commentary
5. Reputable news/transcripts only for context, not as a substitute for filing facts

## Minimum Output Standard

- Scope with ticker, CIK, company name, forms, accession numbers, filing dates, and period dates
- Latest 10-K and 10-Q filing links, plus latest 8-K metadata when available
- XBRL fact table for revenue, gross profit, operating income, net income, diluted EPS, cash, assets, liabilities, equity, operating cash flow, and capex when disclosed in standard concepts
- MD&A, Risk Factors, financial statements, controls, and other requested filing sections with coverage status
- Clear `not separately disclosed` and `needs_review` notes
- Source Map table another analyst can audit quickly
- Reusable `sec-reference.md` and `sec-cache.json` for long or memo-critical filing work

## Handoff Guidance

- Use `us-stock-analysis` after this when the user wants a final investment memo, valuation, catalysts, risks, or comparison.
- If the user's question is mainly "what does the SEC filing actually say", keep the output in SEC analysis mode and stop short of a thesis.
- If an existing `sec-reference.md` or `sec-cache.json` covers the same accession numbers, cite and update that artifact instead of re-downloading unchanged filings.
