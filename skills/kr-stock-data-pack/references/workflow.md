# Workflow Reference

## Source Roles

Use a blended pack, but keep each block honest about what role the source plays:

1. Primary company sources
   DART filings, KRX disclosures, official financial statements, IR decks, governance pages, and shareholder-return materials. Use these to anchor material numbers and formal facts.
2. Sell-side summaries
   Brokerage notes and earnings-commentary recaps. Use these to capture what the market is emphasizing, not to replace filing verification.
3. Specialist media
   Reputable financial media, trade press, or interview coverage that sharpens customer, industry, or peer context.
4. Independent analysis
   Detailed blogs, newsletters, or long-form writeups. Use these as idea sources and stress tests, and label them clearly.
5. Market-data pages
   Use these for quick price context and ratio checks with visible dates.

## Required Fact Blocks

For a standard company pack, try to gather:

- security definition: ticker, market, share class, structure
- price block: current price, market cap, date
- results block: latest revenue, operating profit, margin, and growth
- mix block: segment, geography, and customer concentration when disclosed
- balance-sheet block: cash, debt, lease burden, capex load
- governance block: controlling shareholder, board shape, shareholder-return policy, treasury shares
- valuation inputs: trailing P/E, forward P/E, EV/EBITDA, P/B, FCF yield, plus the dates used
- chart inputs: at least 120 daily bars when available
- external views: a short list of outside takes with source role, date, takeaway, and verification status when the downstream memo needs more than official company framing

## Pack Discipline

- Keep every important metric dated.
- Note the source origin for each block.
- Use `not separately disclosed` instead of inventing a split.
- For note-driven blocks such as customer concentration, geography mix, related-party transactions, internal-group revenue, segment margin, or treasury-share detail, inherit the result from `kr-stock-dart-analysis` when annual-note evidence matters.
- Do not fill a note-driven block from company IR alone when the relevant DART note read is still incomplete. Carry the block as `needs_review`, `partial`, or `not separately disclosed after DART check`.
- For outside-view blocks, say whether the claim is `confirmed by filing`, `street inference`, `media report`, or `independent view`.
- When `naver-insights.md` exists in the company output directory (`analysis-example/kr/<company>/`), read each post entry and add a row to the `## External Views` table with `Source role: independent analysis`, `Verification status: unverified (blogger)`, and the Naver post URL. Use the blogger's verbatim snippet as the takeaway instead of paraphrasing.
- When `analyst-report-insight.md` exists in the company output directory, add one `## External Views` row per broker-coverage entry with `Source role: sell-side consensus`, `Verification status: sell-side (broker)`, the report's landing URL in `Source`, and the per-broker 1-liner as the takeaway. In addition, surface the consensus snapshot (TP median / mean / min / max, rating distribution) as a labeled sell-side reference near the valuation block — keep it visibly separate from filing-derived valuation so the downstream memo does not confuse street anchors with facts.
- When `trade-flow-analysis.md` exists in the company output directory, add trade-stat proxy rows as `Source role: trade-flow proxy` with `Verification status: Trade Flow Inference - <confidence grade>`. Put confirmed DART/IR facts in ordinary fact blocks and put inferred customer/geography/product mix in a distinct `Revenue Mix Proxy` or `External Views` row.
- Keep interpretation light. The pack may note why a fact matters, but it should not decide the investment view.

## Failure Modes To Avoid

- mixing metrics from different dates without labeling them
- turning the pack into a full memo
- quoting media summaries when the filing already provides the number
- treating a broker note or blog as a verified fact block without a primary-source check
- backfilling a note-driven annual claim from company IR because the DART note read was skipped
- treating customs, KITA, UN Comtrade, or overseas trade-stat movement as company revenue without a separate attribution chain
- omitting share-class or structure context when it changes the valuation frame
