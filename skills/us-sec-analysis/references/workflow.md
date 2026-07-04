# Workflow Reference

## Scope Lock

- Identify the exact ticker or CIK.
- Identify the form set: default `10-K`, `10-Q`, and latest `8-K` metadata.
- Identify whether the user wants the latest filings or a specific fiscal period.
- Identify the target questions: results, MD&A, Risk Factors, liquidity, cash flow, debt, segment disclosure, customer concentration, controls, or event filing metadata.
- Set output paths early when the workspace is writable:
  - `analysis-example/us/<company>/sec-analysis.md`
  - `analysis-example/us/<company>/sec-reference.md`
  - `analysis-example/us/<company>/sec-cache.json`

## SEC Fair Access

- Use SEC's official JSON APIs and archive URLs.
- Declare a real `User-Agent` in request headers. Prefer `SEC_USER_AGENT`; otherwise pass `--user-agent`.
- Keep request cadence below SEC's current fair-access limit of 10 requests/second; the bundled fetcher throttles requests more conservatively.
- Cache responses under `.tmp/sec-edgar-cache/` by default and reuse cached responses when possible.
- Download only the filing documents needed for the current question.

Primary SEC pages to keep in mind:

- EDGAR API page: `https://www.sec.gov/search-filings/edgar-application-programming-interfaces`
- Fair access page: `https://www.sec.gov/search-filings/edgar-search-assistance/accessing-edgar-data`

## Collection Set

Use the smallest set that supports a precise answer:

1. Ticker map
   Resolve ticker to CIK from `https://www.sec.gov/files/company_tickers_exchange.json`; fall back to `https://www.sec.gov/files/company_tickers.json`.
2. Submissions history
   Fetch `https://data.sec.gov/submissions/CIK##########.json`.
3. Companyfacts
   Fetch `https://data.sec.gov/api/xbrl/companyfacts/CIK##########.json`.
4. Filing HTML
   Build the archive URL from CIK, accession number without dashes, and `primaryDocument`.
5. Existing local artifacts
   If `sec-reference.md` or `sec-cache.json` exists for the same accession numbers, read it before re-fetching.

## XBRL Concept Map

Use standard taxonomy concepts first:

| Output metric | Concepts, in priority order |
| --- | --- |
| revenue | `RevenueFromContractWithCustomerExcludingAssessedTax`, `Revenues` |
| gross profit | `GrossProfit` |
| operating income | `OperatingIncomeLoss` |
| net income | `NetIncomeLoss` |
| EPS diluted | `EarningsPerShareDiluted` |
| cash | `CashAndCashEquivalentsAtCarryingValue` |
| assets | `Assets` |
| liabilities | `Liabilities` |
| equity | `StockholdersEquity` |
| operating cash flow | `NetCashProvidedByUsedInOperatingActivities` |
| capex | `PaymentsToAcquirePropertyPlantAndEquipment` |

For every fact, preserve:

- accession number
- form
- filed date
- fiscal year and period
- start and end date when available
- frame when available
- unit
- value
- taxonomy and concept

Do not infer a standalone quarter from cumulative facts in v1. If the user asks for a standalone quarter, derive it only from matching current and prior cumulative facts and label the calculation.

## Section Sweep

Run section extraction when a filing text read matters to the answer:

```text
node skills/us-sec-analysis/scripts/extract-sec-sections.js --input analysis-example/us/<company>/latest-10k.txt --form 10-K --output analysis-example/us/<company>/sec-sections.json
```

Expected statuses:

- `parsed`: section heading and substantive body were captured.
- `partial`: heading was detected but content is too short for confident use.
- `missing`: expected heading was not detected.
- `needs_review`: parser found ambiguous or weak coverage and a human/agent should re-check the filing.

For memo-critical claims, do not turn `missing` or `needs_review` into `not separately disclosed`.

## Writing Rules

- Use Korean headings and explanatory notes by default.
- Keep SEC form names, item numbers, and source titles in their official English.
- Keep Source Map rows close to the claims they support.
- Use `not separately disclosed` only after the relevant filing section and XBRL concept were actually checked.
- Use `needs_review` when parser coverage is weak or the fact may exist only in custom taxonomy or a table not captured by plain text.

## Handoff To U.S. Stock Analysis

- Hand off to `us-stock-analysis` when the user wants valuation, thesis, catalysts, risks, or a decision memo.
- Before `us-stock-analysis` re-collects SEC material, it should read existing `sec-analysis.md`, `sec-reference.md`, and `sec-cache.json` for the company.
- In the final memo, SEC filing facts should be cited as filing evidence; company IR can add commentary but should not override SEC facts.
