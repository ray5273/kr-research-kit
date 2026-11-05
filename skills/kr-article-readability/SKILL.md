---
name: kr-article-readability
description: Review and improve research-site article readability before deployment, including Korean paragraph length, visual emphasis, tone colors, section rhythm, tables and source labels. Use for article readability audits and the research site's mandatory pre-deploy editorial check; preserve facts and the author's judgment.
---

# Article readability review

Review the article readers will see, using `article` when supplied in `site/published.json`, otherwise `memo`. This is editorial review of finished research, not new analysis, voice imitation or SEO research.

## Review and edit

1. Read the source, manifest entry, and the site's actual renderer/style rules. Save a before copy outside public output. Run:

   ```sh
   node skills/kr-article-readability/scripts/review.js --memo <article.md>
   ```

2. Report concrete findings, with passage/line and reader impact. Inspect:
   - **Emphasis:** the answer and decision-changing conclusion should be findable while scanning. Use bold for neutral key distinctions. Use existing `[red:]` for positive, `[blue:]` for negative and `[brown:]` for speculation; do not use red as a generic headline color. Keep colors to short selected phrases, with the renderer's legend. Meaning must remain understandable without color.
   - **Paragraphs:** one point, normally one or two connected sentences. Treat 200 visible characters or three sentences as review signals, not permission to cut qualifications. Above 350 visible characters needs editing. Avoid mechanically putting every sentence on a separate line, orphan source paragraphs and strings of short numeric paragraphs.
   - **Rhythm:** distinguish subtopics with real `###` headings. Keep causal reasoning as prose; use compact tables for repeated periods, institutions or scenario conditions. Keep long explanations out of table cells. Avoid restating the entire table below it.
   - **Sources and figures:** keep attribution beside the claim. Give numbered references recognizable publisher/date/document labels. Distinguish company and broker summaries from author judgments. Explain financial units and recurring/nonrecurring components near the number. Consult `../kr-stock-analysis/references/financial-readability.md` when present for dense finance sections.
   - **Copied summary (요약+링크 복사):** the article page's copy button pastes the core answer, one key table and the canonical link into the Naver blog. The lead section (`## Summary`, else `## Decision Frame`, else the first section) must open with a conclusion sentence — never metadata such as `작성 기준일:` — and the core answer (that paragraph, or a bold one-line lead plus the next paragraph) needs at least 60 visible characters: the conclusion and its main reason. Include at least one compact key-figures table; the first table in the article is the one copied (earnings reviews with `analysisData` copy the expectation-vs-actual table instead). Close `**` inside the same paragraph — bold across a blank line leaks literal `**` onto the page.
   - **Rendered layout:** inspect at approximately 390px and 1440px, light/dark when possible. Check line breaks, table scrolling within its container, source anchors, chart labels and contrast. Use the site's existing type/color tokens. If a browser is unavailable, inspect generated HTML and CSS, label the review `source-and-renderer`, and explicitly retain the unverified visual checks. Never invent screenshots or call static inspection a browser pass.

3. Apply authorized readability edits. Freeze the original 기준일, numbers, units, periods, source URL set, quotations and stance; compare before/after mechanically. Do not silently shorten uncertainty or turn a reported view into fact. Changes to research require separate sourcing. A formatting edit does not require refreshing market data.
4. Re-run the audit and inspect warnings individually. Verify numbers/dates/URLs and generated markup. Record only the review actually performed:

   ```sh
   node skills/kr-article-readability/scripts/review.js --record <slug> --mode source-and-renderer --notes "Findings addressed; static layout checks and remaining visual limits."
   # Use --mode browser only after real mobile/desktop inspection.
   npm run check:readability
   ```

The record binds the exact memo, editorial article and reader-facing manifest fields. A later content/metadata edit invalidates it. Recording is a local audit action, not user approval to deploy. This skill never authorizes production publishing.

## Deployment gate

The repository's `predeploy:preview`, `predeploy:site` and `predeploy:pages` lifecycle scripts run `check:readability`, as does `check:site`. All manifest entries are scanned every run. New/changed articles need a matching review; serious findings block even if a review record exists. Serious findings include the copied-summary rules (`digest-lead`, `digest-short-answer`, `digest-key-table`) and `broken-bold`; legacy articles are not held to them until they change. Warnings require editorial judgment and remain in the JSON report.

`site/readability-reviews.json` contains an explicit snapshot of pre-existing articles under `legacy`. They are scanned but remain **unreviewed**, with their findings reported as debt. They are not certified as passing. Once their content or publication metadata changes, the snapshot no longer exempts them and a real review is required. Do not bulk-refresh legacy hashes or create review records to get a deployment through. Review only the affected articles, resolve their findings, and save a truthful record.

Gate output is a heuristic plus a recorded editorial review, not a guarantee of visual or factual accuracy. Report the edited article, meaningful before/after metrics, verified checks and remaining limitations. For a scoped review, leave unrelated archival articles unchanged.
