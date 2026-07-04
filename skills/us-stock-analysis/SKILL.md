---
name: us-stock-analysis
description: Build dated, source-backed analysis for U.S. public companies and U.S.-listed ETFs. Use when analyzing a U.S. ticker, comparing U.S. stocks, preparing a pre-earnings or post-earnings memo, assessing valuation, summarizing an investment thesis, reviewing catalysts and risks, or adding style-specific U.S. growth stock, U.S. value stock, ETF, peer valuation, or chart analysis using current filings, investor materials, and recent news.
---

# U.S. Stock Analysis

Use this skill to produce equity research style analysis for U.S. stocks and U.S.-listed ETFs without relying on stale memory.

## Quick Start

- Treat prices, market caps, financial statements, guidance, analyst estimates, ownership, regulations, and news as time-sensitive. Verify them with current sources before using them.
- Prefer primary sources first: SEC filings, investor relations pages, earnings releases, earnings decks, transcripts, exchange announcements, ETF fact sheets, and official macro data.
- Pin the scope before analyzing: ticker, exchange, analysis horizon, comparison set, and the desired output type.
- If the workspace is writable, treat the default deliverable as a markdown report file, not just a chat reply. For a U.S. stock or ETF, create or update `analysis-example/us/<company>/memo.md`.
- If exact SEC filing support matters, use `us-sec-analysis` first. Read any existing `analysis-example/us/<company>/sec-analysis.md`, `sec-reference.md`, or `sec-cache.json` before re-fetching filings.
- State an explicit "as of" date in the final answer.

## Workflow

1. Define the task.
   Capture the security, market, user goal, time horizon, and whether the user wants a quick view, a deep memo, a comparison, or an event-driven read.
2. Gather verified facts.
   Read current price context, recent SEC filings, the latest earnings package, and any recent company-specific news needed for the question.
2A. Add SEC precision when needed.
   For filing-sensitive claims about reported results, MD&A, Risk Factors, liquidity, cash flow, segment disclosure, controls, or exact XBRL facts, route through `us-sec-analysis` and ingest its `sec-reference.md` / `sec-cache.json` artifacts before drafting.
3. Build the thesis.
   Explain what drives the business, why the market may be underpricing or overpricing it, and which metrics matter most for this business model.
4. Stress test the idea.
   Check balance sheet strength, cash generation, dilution, cyclicality, customer concentration, regulatory risk, and plausible bear cases.
5. Value the security.
   Use simple, defensible valuation methods that fit the business. Do not force a DCF when the inputs are too weak.
6. Write the answer.
   Create or update the report file first when the workspace is writable, then lead with the conclusion, evidence, valuation, catalysts, risks, and what would change the view.

Read [references/workflow.md](references/workflow.md) for the detailed checklist.
Read [references/us-style-checklists.md](references/us-style-checklists.md) when analyzing U.S. growth stocks, U.S. value stocks, or ETFs.
Read [references/output-format.md](references/output-format.md) for answer templates.
Read [references/script-inputs.md](references/script-inputs.md) when using the bundled scripts with structured JSON inputs.

## Bundled Scripts

- Use `scripts/peer-valuation.js` when the user provides peer metrics and you need a consistent markdown comparison table.
- Use `scripts/etf-overlap.js` when the user provides two ETF holdings files and you need weighted overlap, common names, and top overlaps.
- Use `scripts/chart-basics.js` when the user provides OHLCV price history and you need a basic technical read on trend, momentum, and volume regime.
- Run all bundled scripts with `node`.

## Operating Rules

- Cite where each important factual claim came from.
- Use exact dates for earnings, filings, guidance, and news.
- Separate verified facts from your inference.
- Prefer ranges and scenarios over false precision.
- Say when data is missing or uncertain.
- If the user asks for portfolio sizing, tax, or personal suitability, keep the response informational unless the user provides those constraints explicitly.
- If you produced a full single-stock memo, keep the file deliverable synchronized with the final chat answer rather than letting the report drift.
- Do not re-collect SEC filings blindly when a matching `sec-reference.md` or `sec-cache.json` already covers the accession numbers being used.

## Source Priority

1. SEC filings and official investor relations materials
2. Exchange notices and fund sponsor documents
3. Official macro or industry data
4. Reputable news and transcript providers for context

Use `us-sec-analysis` as the SEC filing-precision stage when exact filing evidence is more important than a broad investment memo.

## Minimum Output Standard

- Summary judgment
- What the business does and what matters most
- Evidence from current results and balance sheet
- Valuation view with at least one comparable metric
- Catalysts
- Risks and disconfirming evidence
- Clear "what would change my mind" section
