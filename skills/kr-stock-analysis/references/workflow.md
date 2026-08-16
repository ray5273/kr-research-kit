# Workflow Reference

## Source Roles

Use a blended-source workflow, but keep source roles explicit:

1. Primary company sources
   Latest DART filing, quarterly report, business report, audit report, KRX disclosure, IR deck, governance material, or shareholder-return disclosure. Use these to confirm material numbers and formal facts.
2. Sell-side and transcript summaries
   Brokerage notes, earnings-briefing summaries, and transcript recaps. Use these to surface what the market is focusing on, how peers are framed, and where estimates or narratives diverge.
3. Specialist media and industry reporting
   Reputable financial media, trade press, and specialist interviews. Use these for competitive context, customer references, or sector-specific debate that the company does not spell out cleanly.
4. Independent long-form analysis
   Detailed blogs, newsletters, or analyst-style writeups. Use these as idea sources and stress tests, not as a substitute for primary-source verification.
5. Market-data pages
   Use these for quick ratio checks, price context, and consensus screens when the numbers are clearly dated.

If a number matters to the conclusion, trace it back to a primary source when possible. If you cannot, mark it as `street inference`, `media report`, or `unverified`.

## Single-Stock Checklist

### Scope

- Identify the exact ticker, market, and share class.
- Identify whether the listing is an operating company, holding company, preferred shares line, or restructuring case.
- Identify the analysis horizon: trading, next earnings, 12-24 months, or multi-year compounder view.
- Identify the user's goal: idea generation, validation, comparison, or risk review.
- If the workspace is writable, set the output file path early. Default to `analysis-example/kr/<company>/memo.md` for a full report and `analysis-example/kr/assets/<company>-chart.png` for any linked chart image.

### Business Quality

- Describe the core business, segments, and revenue drivers.
- Build a 3-axis revenue mix view: product or segment, geography, and customer concentration.
- If one of the three axes is not separately disclosed, say that directly and continue with the disclosed layers.
- Identify whether the business is domestic-demand driven, export-driven, cyclical, or policy-sensitive.
- Identify what must go right for the thesis to work.

### Financial Quality

- Check revenue growth and whether it is accelerating or decelerating.
- Check operating margin, EBITDA quality, and free cash flow trend.
- Check leverage, liquidity, debt maturity, lease burden, and capex needs.
- Check treasury shares, dilution, dividends, buybacks, and cancellation behavior.
- Check segment mix, geography mix, and customer concentration where disclosed.

### Order Backlog and Revenue Visibility

- Inherit `Order-driven company: yes / no / deferred` from `kr-stock-plan`; do not infer it from sector membership alone.
- For `yes`, consume `order-backlog-analysis.md`, `order-backlog-data.json`, and `assets/<company>-order-backlog.png` from `kr-order-backlog-analysis`.
- Embed the PNG and state the primary basis: official revenue schedule, official project-level remaining amount by end year, contract-maturity proxy, or official total-only.
- Show official backlog, dated amount, undated amount, final disclosed year, and backlog/revenue coverage only when the numerator and denominator are comparable.
- If the chart is a contract-maturity proxy, say that the bars use total effective contract amounts and are not official remaining revenue.
- If the filing discloses only an official total, show the one-bar `연도 미공시` chart instead of creating a schedule.
- Treat backlog as visibility, not guaranteed revenue, margin, cash flow, or guidance.
- If no quantitative amount exists after a complete DART/KRX check, record the chart exception and the sections checked.

### External Views Scan

- Before finalizing a full memo, scan for outside views that go beyond the company IR narrative.
- Prefer at least one sell-side source when coverage exists, then add specialist media or independent analysis if they materially sharpen the debate.
- Pull only the high-signal takeaways:
  - what the market thinks matters most now
  - where interpretation diverges from management framing
  - what non-company sources say about peer positioning, customer quality, or end-market risk
  - which claims are still not verified by filings
- If a secondary source restates a number that already exists in filings, cite the filing for the number and use the secondary source only for interpretation.
- Do not fill the section with repetitive newsroom summaries from the company itself.
- For independent long-form analysis from Naver bloggers, use `kr-naver-blogger` to identify specialists who consistently cover the ticker, then `kr-naver-insight` to fetch and digest their recent posts. Treat the digest as source material — cite the specific post URL and date, and never let a blogger's framing substitute for a filing check on material numbers.

### DART Recheck

- For annual-filing-backed memo work, always run a DART recheck loop on the most important claims before finalizing the memo.
- Pull 3-8 claims from the draft memo, scoped brief, or data pack that would materially change the thesis if wrong.
- Prefer claims about customer concentration, internal-group revenue, segment margin, backlog, capital allocation, liquidity, and management-stated reasons for change.
- Route those claims through `kr-stock-dart-analysis` or an existing `dart-cache.json`.
- Treat note-driven claims as unresolved until the DART filing path or attached official audit or review document has actually been checked. Company IR pages may add commentary but must not substitute for note verification.
- Tag each one as:
  - `confirmed`
  - `partially supported`
  - `contradicted`
  - `not separately disclosed`
  - `needs follow-up`
- A full memo should not present a thesis-critical statement as settled if the DART recheck status is weaker than `confirmed`.
- If the DART read is incomplete, downgrade the memo wording and surface the limitation explicitly instead of carrying a company-site summary as if it were filing-verified.

### Governance and Structure

- Check controlling shareholder, ownership structure, and beneficial ownership where disclosed.
- Check board composition, outside director mix, and whether the CEO and chair roles are split.
- Check related-party transactions, cross-holdings, and ownership structure when relevant.
- Check whether a holding-company discount or subsidiary discount may matter.
- Check shareholder return policy, treasury stock treatment, and capital allocation credibility.
- Check whether controlling shareholder incentives diverge from minority shareholders.

### Valuation

Pick methods that fit the business model:

- Mature profitable business: P/E, EV/EBITDA, FCF yield, dividend yield
- Asset-heavy or cyclical business: EV/EBITDA, EV/EBIT, price to book, replacement value clues
- Financials: P/B, ROE, dividend yield, capital ratios
- Holding companies: NAV discount, look-through sum-of-the-parts, treasury shares adjustment

For a standard single-stock memo, always assemble a current valuation snapshot with:

- Current price
- Market cap
- Trailing P/E
- Forward P/E
- EV/EBITDA
- P/B
- FCF yield

Add EV/Sales, dividend yield, ROE, net debt or net cash, and treasury share ratio when available.

If you can gather 3-5 years of historical multiples, add valuation bands for:

- P/E
- EV/EBITDA
- P/B

State clearly when a metric is not meaningful because earnings, EBITDA, or book value make the multiple noisy or non-comparable.

Use peer comparisons only if the peer set is genuinely comparable.

### Chart and Positioning

- Prefer fetching about 1 year of daily bars before writing the chart section so MA120 and Ichimoku have enough history.
- For `Minervini Trend Template` or `KRX 52주 신고가 리더십 점수`, prefer roughly 2 years of daily bars or otherwise confirm that a 252-trading-day window exists before forcing a full rule verdict.
- Use `scripts/fetch-kr-chart.js` to pull current KRX bars when the user did not provide price history.
- When the output will become PNG chart assets, always pass the explicit company name with `--name "<회사명>"`. Do not rely on ticker fallback if you want the PNG title to show `삼성SDS`, `LG전자`, or another human-readable stock name.
- Use `scripts/chart-basics.js` to generate both the markdown technical read and the four-part PNG chart assets that can be embedded in the memo (main trend, overlay, momentum, structure).
- Use `scripts/build-kr-universe-rs-cache.js` to build or reuse the as-of-date integrated KOSPI+KOSDAQ RS percentile cache before writing a `Rule Screen` block.
- Use `scripts/kr-trend-rules.js` to generate the `Rule Screen` markdown block once the chart data and RS cache are ready.
- Gather at least 120 daily bars when possible.
- Report latest close and date, MA5, MA20, MA60, MA120, Bollinger Bands, Ichimoku state, RSI 14, MACD, ADX/DMI, volume versus 20-day average, and nearby breakout or breakdown levels.
- When a memo includes the `Rule Screen`, place it near the top of `Chart and Positioning`, immediately after the four PNG images and before the prose technical read.
- The main chart should prefer OHLC candlesticks plus a close line and a visible current-price guide, while the overlay chart keeps heavier indicators separate.
- The chart set should show readable axes, price labels, date labels, and clearly separated overlay and momentum views instead of stacking every indicator on one price panel.
- For Korean stock memos, prefer Korean legend and panel labels when a Hangul-capable local font is available.
- Treat missing company-name titles as a chart-generation failure, not as an acceptable fallback. If a PNG would render without the company name, regenerate the input with `name` populated before producing the memo.
- When you are writing a markdown memo file, embed the generated main trend PNG first, the overlay PNG immediately after it, the momentum PNG right after that, and the structure PNG (매물대 + 수평 지지/저항 zone) last near the start of the chart section. The companion `*-structure-zones.csv` can be cited when discussing key price levels, including broken or distance-filtered zones that are not drawn on the chart.
- Keep chart analysis secondary to fundamentals. Use it to frame positioning, momentum, and key levels, not to override business reality.
- End the chart section with a short chart-only conclusion that says whether the setup looks like bullish continuation, bearish continuation, a technical rebound, a pullback, or range-building.
- If you do not have enough bars, say the chart read is limited and fall back to simple price-action context such as 1-week, 1-month, 3-month, and 52-week range behavior.
- If the RS cache is unavailable or the chart lacks a full 252-trading-day window, mark `Minervini Trend Template` as `incomplete` and the Korean leadership score as `partial` rather than silently zeroing the missing component.

### Catalysts

- Next earnings date
- Export-cycle or end-market turns
- Shareholder return policy changes
- Treasury share cancellation or buybacks
- Regulatory decisions or policy support
- Subsidiary listing, delisting, spin-off, or restructuring

### Risks

- Export slowdown or FX headwind
- Margin compression or inventory correction
- Governance discount widening
- Capital allocation disappointment
- Regulatory pressure
- Refinancing risk or weak cash conversion

### Conclusion

State:

- Base case
- Bull case
- Bear case
- Key metrics to watch next
- What would invalidate the thesis

### Street / Alternative Views For Full Memos

- Add this section after `What The Latest Results Say` and before valuation.
- Group the takeaways into:
  - common street view
  - where the market is split
  - what looks ahead of the filing
- Tag claims when useful:
  - `Confirmed by filing`
  - `Street view`
  - `Specialist media`
  - `Independent view`
  - `Not separately disclosed`
- If outside sources conflict with company framing, show the conflict instead of forcing one side into the main thesis.
- Use this section to seed `Additional Research Questions` when outside sources expose a real evidence gap.

### Evidence Gaps And Follow-Up Questions For Full Memos

- After drafting the memo, classify open points into `verified`, `inferred`, `not disclosed`, and `still unverified`.
- Use the DART recheck result to downgrade overconfident statements before the memo is finalized.
- Promote only the highest-impact gaps into `Additional Research Questions`.
- Prioritize gaps tied to valuation, earnings durability, governance, customer concentration, capital allocation, or rerating triggers.
- Prioritize unresolved outside claims when sell-side or independent analysis makes them central to the market debate.
- Phrase each item as a concrete question that another analyst could answer from the next DART filing, IR deck, earnings release, shareholder meeting, or company-specific news flow.
- Add one short line on why each question matters to the thesis.
- Do not restate catalysts, risks, or `what to watch next` items unless they expose a current evidence gap.

## Style-Specific Routing

Use the base checklist first, then add the relevant market checklist:

- KRX growth stock: read `kr-market-checklists.md` and focus on reinvestment quality, margin path, and expectation risk.
- KRX value stock: read `kr-market-checklists.md` and focus on normalized earnings power, governance, and value-trap risk.
- Exporter: read `kr-market-checklists.md` and focus on FX sensitivity, customer concentration, and end-market cyclicality.
- Holding company or restructuring setup: read `kr-market-checklists.md` and focus on look-through value and discount persistence.

## Comparison Checklist

When comparing tickers:

- Use a common date and source set.
- Normalize the comparison around a few metrics that matter for the sector.
- Include revenue mix quality, governance, and current valuation in the normalized comparison set.
- Add chart setup or momentum only if it materially changes timing or risk-reward.
- Distinguish quality from price.
- Show why the cheaper stock may deserve to be cheaper.
- End with `best business`, `cheapest optically`, and `best risk/reward` if useful.

## Event-Driven Checklist

Use this flow for pre-earnings and post-earnings requests:

1. Confirm the event date and the previous quarter context.
2. Identify the 3-5 numbers or comments most likely to move the stock.
3. Compare reported results or expectations versus prior guidance and consensus when available.
4. Separate one-off effects from durable trend changes.
5. Add a short current valuation read, technical setup read, and note whether governance or capital allocation changes affect the event read-through.
6. Explain whether the stock move looks fundamentally justified.

## Failure Modes To Avoid

- Repeating stale price or valuation figures from memory
- Finishing a full memo only in chat when the workspace was writable and the skill should have produced a report file
- Pretending revenue mix, customer concentration, or valuation metrics exist when they are not separately disclosed
- Writing a technical read without enough price history or without saying the chart evidence is limited
- Ignoring treasury shares or holding-company structure
- Treating management commentary as fact without checking reported numbers
- Treating a company IR page as sufficient evidence for a note-driven annual claim that should have been verified from DART
- Letting company newsroom releases dominate the memo when outside debate is available
- Omitting the backlog chart for an order-driven company with quantitative DART/KRX evidence
- Spreading a total-only backlog across assumed years or calling contract-maturity proxy amounts official remaining backlog
- Treating one broker note, one media article, or one blog as confirmed fact
- Copying a secondary-source number into the memo without saying whether the filing confirms it
- Giving a target price with false precision
- Ignoring governance risk because valuation looks cheap
- Ending a full memo without surfacing the highest-impact unresolved questions
- Filling `Additional Research Questions` with generic diligence prompts or repeated catalysts
