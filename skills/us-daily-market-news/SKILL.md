---
name: us-daily-market-news
description: Build a dated U.S. daily market-news report from Yahoo Finance-first direct publisher pages, then have Codex produce evidence-linked Korean copy and a Naver Blog publish manifest.
---

# U.S. Daily Market News

Create a daily U.S. market-news report for Codex Desktop Automation. This skill mirrors `kr-daily-market-news` but uses U.S. market sources, U.S. tickers, GICS-style sector buckets, and New York date filtering.

## Workflow

1. Read [references/workflow.md](references/workflow.md).
2. Use the fixed sector-stock seed list only to classify article-backed company news. Do not force a feature-stock quota: a verified sector article can be a lead item when no company-specific article is better supported. Do not add a separate user watchlist or SEC/company-link section.
3. Collect direct publisher pages. Yahoo Finance is first; when its section or article is unavailable, use AP News, Reuters republication, and CNBC direct pages. Google News and RSS are not default content sources.

   Live collection requires outbound publisher-page and Yahoo Finance chart access. Run it in an unrestricted network environment. Do not silently fall back to an empty report when DNS, connection, or source-access failures occur.

   ```bash
   node skills/us-daily-market-news/scripts/fetch-daily-market-news.js \
     --json-out analysis-example/us-market/daily-news-YYYY-MM-DD.json
   ```

   If a publisher blocks the terminal, Codex may read the direct publisher page with an available browser and pass the verified canonical URL, headline, publication date, publisher name, and extracted body through `--publisher-candidates <json>`. This does not bypass validation: title-only inputs and Google URLs are rejected.

4. Read every retained article's `editorialQueue` evidence sentences. Codex writes the Korean title, two-to-three-sentence summary, and evidence IDs to an editorial JSON file, then reruns collection with `--editorial <file>`. Do not call an external model API or use Gemini browser automation for this step.

5. Render the report and blog publish manifest:

   ```bash
   node skills/us-daily-market-news/scripts/render-daily-report.js \
     --json analysis-example/us-market/daily-news-YYYY-MM-DD.json \
     --md-out analysis-example/us-market/daily-news-YYYY-MM-DD.md \
     --post-out analysis-example/us-market/naver-post-YYYY-MM-DD.md \
     --manifest-out analysis-example/us-market/naver-publish-YYYY-MM-DD.json
   ```

6. If the user asked for blog publication, hand the generated manifest to `kr-naver-blog-publish`. Scheduled public publishing is allowed only through that skill's explicit scheduled mode and only if validation passes.

## Output Contract

- Main artifacts:
  - `analysis-example/us-market/daily-news-YYYY-MM-DD.json`
  - `analysis-example/us-market/daily-news-YYYY-MM-DD.md`
- Blog artifacts:
  - `analysis-example/us-market/naver-post-YYYY-MM-DD.md`
  - `analysis-example/us-market/naver-publish-YYYY-MM-DD.json`
- The research Markdown must include the same sections as `kr-daily-market-news`, localized to U.S. market coverage.
- The Naver Blog Markdown must use article-led numbered summaries, an `업종·특징주 뉴스` section that includes only verified company or sector stories, raw URL link-card lines, a source list, end-of-post collection notes, and no Markdown bullet lines. Keep English evidence excerpts in JSON only; do not print them in the Naver post.
- Live collection must include only articles whose published date, extracted from the publisher page, matches `asOfDate`; retain the full timestamp when available.
- Never use a Google News URL, RSS title, RSS description, or other aggregator URL in a rendered article, source list, or link card.
- Articles with unknown dates or non-matching dates stay out of JSON body sections and post body; record the exclusion in JSON `warnings`.
- The collector writes schema v2 evidence records: publisher canonical URL, source tier, body hash/length, exact body evidence sentences, classification, and editorial state. A post item is eligible only when readable body text is at least 400 characters and its Codex-written Korean title/summary cites existing evidence IDs. Reject title-repeating summaries, forbidden 안내형 문구, and unsupported percentage or Korean 억달러 amounts.
- The publish manifest must set `post.linkCards` to every raw URL used in `특징주 뉴스` and `시장 주요 뉴스`, in display order; the source table must contain exactly the same URL set and order.
- Korean summaries translate the article’s reported content. Never replace an article with a generic “확인해야 합니다”, cross-check instruction, or unsupported causal interpretation.
- `automation.scheduledPublishAllowed` is true only when the live report has the complete index/sector snapshot and at least three evidence-linked Codex-edited stories from distinct direct publisher URLs. Yahoo may be absent when its pages are blocked; trusted fallback publisher pages remain eligible. Fixture, pending-editorial, or low-source output remains renderable but cannot enter scheduled publication.

## Validation

Run before considering changes complete:

```bash
node skills/us-daily-market-news/scripts/test-daily-market-news.js
node --check skills/us-daily-market-news/scripts/fetch-daily-market-news.js
node --check skills/us-daily-market-news/scripts/render-daily-report.js
```

Use `--fixture <fixture.json>` only for deterministic tests or dry runs; fixture commands may run inside the sandbox. Do not treat fixture output as a real same-day market report.
