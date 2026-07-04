# Workflow Reference

## Source Order

Use this order unless the user explicitly wants a faster but lighter answer:

1. Latest 10-K, 10-Q, 8-K, proxy, or other SEC filing
2. Latest earnings release, deck, transcript, and investor day materials
3. Investor presentation or fact sheet
4. Recent company news or exchange notices relevant to the question
5. Market data pages or reputable financial summaries for quick ratio checks

If a number matters to the conclusion, trace it back to a primary source when possible.

Use `us-sec-analysis` before drafting when the user needs precise SEC evidence for reported results, XBRL facts, MD&A, Risk Factors, liquidity, controls, or filing section wording. If `analysis-example/us/<company>/sec-reference.md` or `sec-cache.json` already exists for the same accession numbers, read it before re-fetching SEC data.

## Single-Stock Checklist

### Scope

- Identify the exact ticker and exchange.
- Identify the legal listing context when it matters: ADR, common shares, preferred shares, LP structure, REIT, or ETF.
- Identify the analysis horizon: trading, next earnings, 12-24 months, or multi-year compounder view.
- Identify the user's goal: idea generation, validation, comparison, or risk review.
- If the workspace is writable, set the output file path early. Default to `analysis-example/us/<company>/memo.md` for a full report.
- Check for existing SEC evidence artifacts under `analysis-example/us/<company>/sec-analysis.md`, `sec-reference.md`, and `sec-cache.json` before collecting filings again.

### Business Quality

- Describe the core business, segments, and revenue drivers.
- Identify the main moat claim, if any: cost, switching costs, brand, network, data, regulation, or scale.
- Identify what must go right for the thesis to work.

### Financial Quality

- Check revenue growth and whether it is accelerating or decelerating.
- Check gross margin, operating margin, and free cash flow trend.
- Check leverage, liquidity, debt maturity, and interest burden.
- Check dilution, buybacks, and capital allocation.
- Check segment mix, geography mix, or customer concentration if material.

### Management and Capital Allocation

- Compare management guidance with actual delivery.
- Note major acquisitions, divestitures, or buyback behavior.
- Note insider ownership or governance issues when they matter.

### Valuation

Pick methods that fit the business model:

- Mature profitable business: P/E, EV/EBITDA, FCF yield
- Asset-heavy or cyclical business: EV/EBITDA, EV/EBIT, price to book, replacement value clues
- Early-stage or low-profit growth business: EV/sales, gross profit multiples, path-to-margin analysis
- ETF: holdings concentration, fees, benchmark fit, valuation of top holdings

Use peer comparisons only if the peer set is genuinely comparable.

### Catalysts

- Next earnings date
- Product launches or adoption milestones
- Pricing changes
- Regulatory decisions
- Margin recovery or inventory normalization
- Balance sheet repair or capital return changes

### Risks

- Demand slowdown
- Margin compression
- Execution miss
- Regulatory pressure
- Competitive disruption
- Refinancing risk
- Dilution or weak cash conversion

### Conclusion

State:

- Base case
- Bull case
- Bear case
- Key metrics to watch next
- What would invalidate the thesis

## Style-Specific Routing

Use the base checklist first, then add the relevant style checklist:

- U.S. growth stock: read `us-style-checklists.md` and focus on reinvestment quality, margin path, and expectation risk.
- U.S. value stock: read `us-style-checklists.md` and focus on normalized earnings power, asset quality, and trap risk.
- ETF: read `us-style-checklists.md` and focus on index construction, concentration, liquidity, cost, and tracking quality.

## Comparison Checklist

When comparing tickers:

- Use a common date and source set.
- Normalize the comparison around a few metrics that matter for the sector.
- Distinguish quality from price.
- Show why the cheaper stock may deserve to be cheaper.
- End with "best business", "cheapest optically", and "best risk/reward" if useful.

## Event-Driven Checklist

Use this flow for pre-earnings and post-earnings requests:

1. Confirm the event date and the previous quarter context.
2. Identify the 3-5 numbers or comments most likely to move the stock.
3. Compare reported results or expectations versus prior guidance and consensus when available.
4. Separate one-off effects from durable trend changes.
5. Explain whether the stock move looks fundamentally justified.

## Failure Modes To Avoid

- Repeating stale price or valuation figures from memory
- Finishing a full memo only in chat when the workspace was writable and the skill should have produced a report file
- Treating management commentary as fact without checking reported numbers
- Using too many metrics without stating which ones actually matter
- Giving a target price with false precision
- Ignoring balance sheet risk because the income statement looks strong
