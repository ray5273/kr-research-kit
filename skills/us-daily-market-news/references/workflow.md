# Daily U.S. Market News Workflow

## Source Priority

## Execution Environment

- Run every live `fetch-daily-market-news.js` command in an unrestricted network environment because it fetches publisher pages and Yahoo Finance charts.
- If the terminal reports DNS, connection, or sandbox-network failures, abort the collection before rendering. Do not replace a prior populated same-date artifact with an empty result.
- Fixture collection and script tests do not need external network access and may run in the sandbox.

1. Use direct publisher section pages in this order: Yahoo Finance, AP News, Reuters republication on Investing.com, then CNBC Markets. Yahoo is preferred, not mandatory.
2. Each adapter must store only the publisher canonical URL, publisher name, source tier, page publication date, and extracted article body. Never retain aggregator or redirect URLs.
3. Do not run Google News or RSS collection in the normal path. They may be inspected manually to find a topic, but their URLs, titles, and descriptions must never become report content.
4. Keep supplied market-level official links separate from publisher article links in JSON and Markdown.
5. When a publisher blocks terminal HTTP, Codex may supply a `--publisher-candidates` JSON file after reading the direct publisher page. Every entry must provide `url`, `headline`, `source`, `publishedDate`, and full `articleText`; it goes through the same date, body length, title/body, evidence, and editorial checks as adapter output.
5. Do not add watchlist-company SEC, exchange, or IR links in daily market-news output.

## Ordering / Recency

1. Among articles that pass the same-day date filter and market/sector relevance filters, prefer the most recent one as the representative story.
2. Ranking score = keyword importance (`marketNewsScore`) + a U.S. Eastern time-of-day recency bonus + an afternoon closing bonus for "close/closing bell/ends" wrap-ups.
3. Relevance filtering still uses the content score only, so fresh but off-topic single-stock items do not win on recency alone.
4. When same-day articles conflict, the later timestamp wins and flows into `oneLine`, `marketSummary[0]`, blog title, and Naver link-card order.
5. The full publish time is retained per item as `publishedAt` (ISO). Articles with only a relative or date-only stamp get no recency bonus.

## Watchlist Format

The default watchlist path is `examples/us/daily-watchlist.json`.

```json
[
  { "ticker": "NVDA", "name": "NVIDIA", "keywords": ["AI", "GPU"] }
]
```

Each item requires a U.S.-style ticker and `name`. The daily market-news collector may validate this file for compatibility, but it does not collect watchlist stock news or company disclosure links.

## Sector Stock Seeds

The default sector stock seed path is `examples/us/daily-sector-stocks.json`.

It is keyed by the fixed U.S. daily-market sector buckets. Each sector keeps representative stocks with `ticker`, `name`, and `keywords`. Live sector news collection builds one Google News RSS discovery query from the sector label, representative stock names, and keywords. Actual `sectorNews` items come only from direct RSS articles whose title or description matches the sector label, representative stock names, or keywords.

## Scheduled Automation Prompt

Recommended Codex Desktop Automation prompt:

```text
Use $us-daily-market-news to create today's U.S. daily market-news report for blog publication.

Scope:
- Market-wide and sector report only.
- Do not include watchlist stock-news sections or company SEC/IR links.
- Use U.S. market news flow from direct RSS article URLs and keep source URLs exact.
- Write artifacts to analysis-example/us-market/daily-news-YYYY-MM-DD.md and .json.
- Then use $kr-naver-blog-publish to prepare and publish the report to Naver Blog in scheduled mode.
```

## Operating Rules

- Do not invent market moves or company events. If live collection returns too little material, render an explicit low-source warning instead of filling gaps.
- Keep exact source URLs in JSON and Markdown.
- For live collection, keep only articles dated the same day as `asOfDate`; do not backfill with older or undated articles when fewer than five same-day items are available.
- In the Naver post, keep collection warnings as short end notes under `### 수집 참고`; do not put a `## 수집 경고` block at the top.
- Treat publisher news as secondary reporting, not primary disclosure evidence.
- Reject low-information sector fillers such as fund-holdings changes, earnings-call schedules, IPO notices, analyst-rating items, lawsuits, and unrelated accidents. An empty `특이 뉴스 제한적` row is preferable to a weak representative article.
- Make the post article-led: render verified market, industry, and company stories in the order chosen by editorial review. A company quote is a useful annotation, not a reason to force a weak article into the post. Keep the index/sector snapshot as supporting data.
- Exclude an article from rendered content when its body cannot be read (minimum 400 characters), its publication date is absent or not `asOfDate`, the title/body consistency check fails, there are no extractable evidence sentences, its company/sector match is ambiguous, or its Codex-written Korean title/summary does not cite valid evidence IDs. Never translate a title into a pseudo-summary or fill a gap with a generic analysis instruction.
- Codex must read the retained evidence sentences before filling the editorial JSON. A summary that repeats its title, contains `원문은`, `내용을 전합니다`, or `확인해야 합니다`, or introduces an unsupported percentage/억달러 amount must be rejected.
- Keep source rows strictly traceable: each source must appear in a rendered article entry, and every rendered article must have one source row in the same display order.
- Render low-source reports for inspection, but leave scheduled publication disabled when the manifest quality gate fails.
