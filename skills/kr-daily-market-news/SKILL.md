---
name: kr-daily-market-news
description: Build a dated Korean daily market-news report for the whole market and sectors, using domestic RSS articles plus Google News RSS discovery signals, then write Markdown/JSON artifacts and a Naver Blog publish manifest.
---

# Korean Daily Market News

Create a daily Korean market-news report for Codex Desktop Automation. This skill is intended for scheduled local-project runs, not `launchd`, cron, or GitHub Actions.

## Workflow

1. Read [references/workflow.md](references/workflow.md).
2. Optionally accept the watchlist JSON for compatibility, but do not collect watchlist stock news or watchlist DART/KRX links in this daily market-news report.
3. Collect market and sector RSS news flow:

   ```bash
   node skills/kr-daily-market-news/scripts/fetch-daily-market-news.js \
     --json-out analysis-example/kr-market/daily-news-YYYY-MM-DD.json
   ```

4. Render the report and blog publish manifest:

   ```bash
   node skills/kr-daily-market-news/scripts/render-daily-report.js \
     --json analysis-example/kr-market/daily-news-YYYY-MM-DD.json \
     --md-out analysis-example/kr-market/daily-news-YYYY-MM-DD.md \
     --post-out analysis-example/kr-market/naver-post-YYYY-MM-DD.md \
     --manifest-out analysis-example/kr-market/naver-publish-YYYY-MM-DD.json
   ```

5. If the user asked for blog publication, hand the generated manifest to `kr-naver-blog-publish`. Scheduled public publishing is allowed only through that skill's explicit scheduled mode and only if validation passes.

## Output Contract

- Main artifacts:
  - `analysis-example/kr-market/daily-news-YYYY-MM-DD.json`
  - `analysis-example/kr-market/daily-news-YYYY-MM-DD.md`
- Blog artifacts:
  - `analysis-example/kr-market/naver-post-YYYY-MM-DD.md`
  - `analysis-example/kr-market/naver-publish-YYYY-MM-DD.json`
- The research Markdown (`daily-news-YYYY-MM-DD.md`) must include:
  - `기준일 / 생성시각`
  - `오늘 시장 한 줄`
  - `시장 주요 뉴스`
  - `업종/테마별 흐름`
  - `공식 공시/자료`
  - `리더십 스크린 요약` when a same-date leaders artifact exists
  - `블로그 제목 후보`
  - `출처`
  - investment disclaimer
- The Naver Blog Markdown (`naver-post-YYYY-MM-DD.md`) must use the SmartEditor-ready format:
  - no `오늘 시장 한 줄`
  - no top metadata bullets (`기준일`, `생성시각`, `수집모드`); the title is followed directly by `시장 주요 요약`
  - `시장 주요 요약` as a 1-5 numbered summary list
  - `시장 주요 뉴스` as raw link-card input lines only: `1. 기사 제목`, next line `https://...`, then a blank line before the next item
  - no Markdown bullet lines anywhere in the Naver post
  - no Markdown links or `— source` suffixes inside the Naver `시장 주요 뉴스` section
  - no `블로그 제목 후보`
  - no `관심종목 뉴스`
  - `업종/테마별 흐름` as the fixed 10-sector table
  - `출처` as a two-column `내용 | 링크` table
- Live news collection must include only articles whose normalized publication date matches `asOfDate`; RSS `pubDate` values are normalized to KST `YYYY-MM-DD`.
- Default live collection uses domestic media RSS article URLs for body sections. Google News RSS is discovery-only and must not populate `marketNews`, `sectorNews`, Naver post `linkCards`, or the rendered `출처` table.
- Articles with unknown dates or non-matching dates stay out of the JSON body sections and post body; record the exclusion in JSON `warnings`.
- The Naver post must not show `## 수집 경고` near the top. Summarize collection gaps at the end near the disclaimer under `### 수집 참고`, without exposing long URLs.
- The Naver publish manifest must set `post.title` to the first title candidate and, for daily market-news only, must set `post.linkCards` to the raw URLs shown in the Naver `시장 주요 뉴스` section, in the same order.

## Validation

Run before considering changes complete:

```bash
node skills/kr-daily-market-news/scripts/test-daily-market-news.js
node --check skills/kr-daily-market-news/scripts/fetch-daily-market-news.js
node --check skills/kr-daily-market-news/scripts/render-daily-report.js
```

Use `--fixture <fixture.json>` only for deterministic tests or dry runs. Do not treat fixture output as a real same-day market report.
