# Workflow

## Scope

- Monitor public Korean sell-side research flow across companies, sectors, and themes.
- Do not require a ticker. Classify company-specific reports to `company:<ticker-or-name>` and sector/theme reports to `sector:<slug>` or `theme:<slug>`.
- Use Hankyung Consensus first. Use Naver Research as secondary coverage and fallback when Hankyung rows are sparse.
- Keep login-gated or failed-PDF reports as metadata. Do not bypass authentication or use private credentials.

## Collection

1. Set `asOfDate` to the requested date, or today's KST date if omitted.
2. Use mode defaults unless the user overrides them:
   - `daily`: look back 1 day, Top 10.
   - `weekly`: look back 7 days, Top 30.
3. Discover broad recent reports from Hankyung and Naver list pages.
4. Dedupe on normalized `broker + publishedDate + title` while retaining `sourceSites`.
5. Probe PDF access. Download/extract text only for accessible PDFs.
6. Rank by recency, source quality, metadata completeness, and narrative keywords. Do not rank only by target-price changes.

## Narrative Comparison

- Load prior JSON artifacts from `analysis-example/kr-reports/` with the same mode or any mode, newest first.
- For each current report, find the most recent prior report item with the same `topicKey` and an earlier `asOfDate`.
- Compare narrative fields, especially industry trend, demand/supply, policy, competition, risk framing, and catalysts.
- Use labels: `new-topic`, `same-topic-refresh`, `tone-shift-positive`, `tone-shift-negative`, `risk-framing-changed`, `catalyst-changed`, `insufficient-prior`.

## Copyright And Source Handling

- Paraphrase analyst-report contents. Do not reproduce long report text.
- Short snippets are allowed only when necessary for source identification or a precise phrase, and should remain very short.
- Treat sell-side summaries as secondary interpretation, not primary filing facts.
- State extraction gaps clearly: inaccessible PDF, login gate, parser miss, missing broker/date/title, or text extraction failure.
