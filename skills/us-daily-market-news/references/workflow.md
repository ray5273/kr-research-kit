# Daily U.S. Market News Workflow

## Source Priority

1. Use U.S. media RSS articles as the only default source for market and sector body links.
2. Use Google News RSS first as a query-based discovery signal for ranking, theme detection, and identifying which sectors/keywords are active.
3. For U.S. reports only, if same-day direct broad-market RSS returns fewer than five representative market stories, Google News RSS may supply market-news fallback link cards with `sourceRole: "discovery-fallback"`. Do not use Google News URLs for sector source tables; sector fallback signals should be linkless headlines.
4. Keep supplied market-level official links and RSS article links separate in JSON and Markdown.
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
- Treat RSS news as secondary reporting, not primary disclosure evidence.
