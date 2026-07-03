---
name: us-daily-market-news
description: Build a dated U.S. daily market-news report for the whole market and sectors, using U.S. RSS articles plus Google News RSS discovery signals, then write Markdown/JSON artifacts and a Naver Blog publish manifest.
---

# U.S. Daily Market News

Create a daily U.S. market-news report for Codex Desktop Automation. This skill mirrors `kr-daily-market-news` but uses U.S. market sources, U.S. tickers, GICS-style sector buckets, and New York date filtering.

## Workflow

1. Read [references/workflow.md](references/workflow.md).
2. Optionally accept the watchlist JSON for compatibility, but do not collect watchlist stock news or SEC/company links in this daily market-news report.
3. Collect market and sector RSS news flow:

   ```bash
   node skills/us-daily-market-news/scripts/fetch-daily-market-news.js \
     --json-out analysis-example/us-market/daily-news-YYYY-MM-DD.json
   ```

4. Render the report and blog publish manifest:

   ```bash
   node skills/us-daily-market-news/scripts/render-daily-report.js \
     --json analysis-example/us-market/daily-news-YYYY-MM-DD.json \
     --md-out analysis-example/us-market/daily-news-YYYY-MM-DD.md \
     --post-out analysis-example/us-market/naver-post-YYYY-MM-DD.md \
     --manifest-out analysis-example/us-market/naver-publish-YYYY-MM-DD.json
   ```

5. If the user asked for blog publication, hand the generated manifest to `kr-naver-blog-publish`. Scheduled public publishing is allowed only through that skill's explicit scheduled mode and only if validation passes.

## Output Contract

- Main artifacts:
  - `analysis-example/us-market/daily-news-YYYY-MM-DD.json`
  - `analysis-example/us-market/daily-news-YYYY-MM-DD.md`
- Blog artifacts:
  - `analysis-example/us-market/naver-post-YYYY-MM-DD.md`
  - `analysis-example/us-market/naver-publish-YYYY-MM-DD.json`
- The research Markdown must include the same sections as `kr-daily-market-news`, localized to U.S. market coverage.
- The Naver Blog Markdown must keep the SmartEditor-ready shape used by `kr-daily-market-news`: numbered summaries, raw URL link-card lines, fixed sector table, source table, end-of-post collection notes, and no Markdown bullet lines.
- Live news collection must include only articles whose normalized publication date matches `asOfDate`; RSS `pubDate` values are normalized to `America/New_York` `YYYY-MM-DD`, while the full timestamp is retained as `publishedAt`.
- Default live collection prefers direct U.S. RSS article URLs for body sections. If same-day direct broad-market RSS returns fewer than five representative market stories, Google News RSS may supply market-news fallback link-card candidates with `sourceRole: "discovery-fallback"`; sector fallback discovery signals are rendered without source links.
- Articles with unknown dates or non-matching dates stay out of JSON body sections and post body; record the exclusion in JSON `warnings`.
- The publish manifest must set `post.linkCards` to the raw URLs shown in the Naver `시장 주요 뉴스` section, in the same order.

## Validation

Run before considering changes complete:

```bash
node skills/us-daily-market-news/scripts/test-daily-market-news.js
node --check skills/us-daily-market-news/scripts/fetch-daily-market-news.js
node --check skills/us-daily-market-news/scripts/render-daily-report.js
```

Use `--fixture <fixture.json>` only for deterministic tests or dry runs. Do not treat fixture output as a real same-day market report.
