---
name: kr-research-site
description: Build and deploy the author's own static research site (canonical home for finished Korean/U.S. stock and sector memos) with SEO/AEO outputs (canonical, OG, JSON-LD Article/Breadcrumb/FAQ, sitemap.xml, Atom feed, robots.txt, llms.txt, llms-full.txt), opt-in AdSense slots, and IndexNow pings. Use when the user wants a memo published to the website, wants the site rebuilt after a memo update, wants a local preview, or wants a Naver teaser that links back to the site. Only memos listed in site/published.json are built; untracked, private-path, holdings/ledger, or undated memos are refused. Do not use to write analysis or to publish to Naver itself (kr-naver-blog-publish does that).
---

# KR Research Site

The site is the canonical home for finished research. Naver gets a short teaser that links back here, so the two copies are not judged as duplicates. Ads and canonical URLs live on the site.

Requires `kr-naver-blog-publish` installed next to this skill: the renderer reuses its memo parser (`memo-to-post.js`) and tone markers (`color-markers.js`).

## Workflow

1. **Opt in.** Add the memo to `site/published.json`:

   ```json
   { "memo": "analysis-example/us/Alphabet/memo.md", "slug": "us/alphabet-2026-q3",
     "company": "알파벳", "ticker": "GOOGL", "exchange": "NASDAQ", "market": "us",
     "tags": ["알파벳", "GOOGL"] }
   ```

   `memo` and `slug` are required. Optional `article` points to a tracked editorial Markdown sibling; it must preserve the original memo 기준일 and passes the same privacy and image checks. The original memo remains available at `<slug>/memo.md` for compatibility, but do not show a Markdown source button or link in the public article. Set `archive: true` for historical research; cards and the article show a 기록 글 label and explain that subsequent changes are excluded. For editorial publication, set `datePublished` to the actual site publication date and `dateModified` to the latest editing date. The page displays these separately from the 자료 기준일; older entries without these fields still build. `slug` is lowercase `a-z0-9-` segments joined by `/` and never changes after publishing (it is the canonical URL). `company`, `ticker`, `exchange`, `market`, `issue`, `tags`, `datePublished`, `dateModified` override what the builder derives from the memo. Display-only fields (see [references/design-brief.md](references/design-brief.md)):

   - `headline`: short on-page title and card title (the SEO `<title>` keeps the `company(ticker) | issue | 기준일` format).
   - `summary`: one-line card summary (default: whole sentences from the core answer).
   - `stance`: `긍정` / `중립` / `부정` (or `pos` / `neu` / `neg`) badge. Set it only when the memo states that call; never infer one. No buy/sell words.
   - `quote`: up to 4 header cells `{ "label", "value", "unit"?, "tone"?: "up" | "down" }`, copied from numbers in the memo.
   - `featured`: rank in the home "지금 읽을 만한 리서치" grid (1 = big card). Unranked slots fall back to the latest articles.
   - `popular`: rank in the home "인기" tab. Until there are visit stats, unranked articles follow research-date order. Commit the memo and every image it embeds first; the builder refuses untracked files.

2. **Build and check.**

   ```bash
   node skills/kr-research-site/scripts/build-site.js --out site-dist
   node skills/kr-research-site/scripts/serve-site.js --dir site-dist --port 8080
   ```

   Open the article at phone width with `/browse` and check the core answer box, tables, charts, tone colors, update log and sources. Read [references/seo-aeo.md](references/seo-aeo.md) for the title, description, structured data and ad placement rules the build enforces.

3. **Deploy.** Push to `main`. Cloudflare Workers Builds (GitHub integration) runs the tests, builds with `--production` and deploys `site-dist/` with `npx wrangler deploy`. In parallel `.github/workflows/site.yml` builds the pushed commit and the previous one, waits until the live `urls.json` matches the new build, then sends only new, changed or removed URLs to IndexNow.

4. **Naver teaser (optional).**

   ```bash
   node skills/kr-naver-blog-publish/scripts/memo-to-post.js --memo <memo.md> --mode teaser
   node skills/kr-naver-blog-publish/scripts/publisher.js prepare --manifest <dir>/naver-teaser-publish.json
   ```

   The teaser holds the Summary, one key table, one chart, the canonical link (`원문 전체 보기: <url>`), primary sources, the disclaimer and the signature. The canonical URL comes from `site/site.config.json` `baseUrl` + the memo's `slug` and is recorded as `post.canonicalUrl` in the manifest. Public publishing still needs the publisher's explicit approval gate.

## Update flow

When `kr-stock-update` appends an Update Log block (`### YYYY-MM-DD — ...`) or bumps `최근 업데이트일`, commit and push. The rebuild moves `dateModified`, the sitemap `lastmod` and the feed `updated`, shows the block under "업데이트 내역", and IndexNow is pinged for that URL. Write a new Naver teaser ("○○ 업데이트") only for a material update; that call is the user's.

## Safety rules

- Only `site/published.json` entries are built. Nothing else under `analysis-example/` reaches the site.
- The build refuses: files not tracked by git; files inside `KR_PORTFOLIO_GUARD_HOME`, `~/stock-analysis-private` or `~/folio-private`; memos or pages mentioning holdings/ledger artifacts (`decision-ledger`, `portfolio.json`, `holdings.json`, `voice-profile.md` …); memos without a `YYYY-MM-DD` 기준일.
- Never put guard reports, the decision ledger, or the voice profile into `site/`.
- Ads are emitted only when `adsense.client` is set in `site/site.config.json`. With it empty (before AdSense approval) the output contains no ad code and no `ads.txt`.
- Free, public, disclaimed research only. Paid subscriptions or one-to-one advice would turn this into 유사투자자문업 territory; do not add them here.

## One-time setup (user)

1. The site runs as a Cloudflare **Worker with static assets** (`wrangler.jsonc` at the repo root uploads `site-dist/`). The public canonical address is `https://kr-research-site.pages.dev`; a Pages service-binding proxy forwards requests to Worker `kr-research-site`. The original `https://kr-research-site.ray527321.workers.dev` public route and Worker preview URLs are disabled with `workers_dev: false` and `preview_urls: false` in the root Wrangler configuration. Keep the Worker itself: Pages still reaches it through the service binding. See [Pages proxy operations](../../../site/pages-proxy/OPERATIONS.md). `baseUrl` (and `author.url`) in `site/site.config.json` must match it exactly. Administrator access uses a separate password stored in the Worker Secret `ADMIN_PASSWORD`; Cloudflare Access setup is not required. Keep public pages open. A custom domain can be attached later, but that changes every canonical URL, so decide before the site is indexed.
2. Cloudflare dashboard → Workers & Pages → Create → Import a repository → this repository:
   - Project (Worker) name: `kr-research-site` (must equal `name` in `wrangler.jsonc`)
   - Build command: `npm ci && npm run check:site`
   - Deploy command: `npm run deploy:site` (validates analytics settings, applies remote D1 migrations, deploys Worker)
   - Advanced settings → Build variables: `NODE_VERSION` = `22`; Build watch paths: `site/*`, `analysis-example/*`, `skills/kr-research-site/*`, `skills/kr-naver-blog-publish/scripts/*`, `wrangler.jsonc`, `package*.json`
   - Let Cloudflare create the build API token automatically. No GitHub secrets are needed.
3. Register the site in Google Search Console (URL-prefix property), 네이버 서치어드바이저 and Bing Webmaster. A `workers.dev` site has no DNS of its own, so use the HTML meta-tag method: put each token in `verification.google` / `.naver` / `.bing`, push, then verify and submit `/sitemap.xml`.
4. Generate an IndexNow key and set `indexNow.key`.
5. AdSense site registration must accept the public hostname before proceeding. Google permits eligible platform subdomains on the Public Suffix List; purchasing a domain is not a universal requirement. In this account, `kr-research-site.ray527321.workers.dev` was rejected as an ordinary subdomain and the suggested account root returned 404. Use `https://kr-research-site.pages.dev` for the next registration attempt; acceptance and content approval must be confirmed in the actual AdSense account. Do not promise approval or infer a minimum article count. Once the user supplies the real publisher ID, configure ownership verification and ads.txt; ad slots require the actual account slot IDs. Configure the appropriate consent message in AdSense before ad serving.

## Scripts

| Script | Purpose |
|---|---|
| `scripts/build-site.js` | Build `site-dist/` from opt-in memos + `site/pages/*.md` (articles, list pages, tag pages, sitemap, feed, robots, llms, urls.json, ads.txt, IndexNow key file) |
| `scripts/serve-site.js` | Local static preview server |
| `scripts/indexnow-ping.js` | POST changed URLs to IndexNow endpoints (`--dry-run`, `--all`, `--previous <url|file>`) |
| `scripts/test-build-site.js` | Fixture tests: HTML/JSON-LD, sitemap/feed, opt-in and private-path refusals, ads on/off |

## Public article editing rules

- Write for readers of the published page. Omit local file names, JSON inputs/results, Python scripts, CSV zone files, reproduction commands and internal research-pipeline status from prose. Keep these in repository research artifacts; retain disclosed facts, assumptions, source dates and material verification limits.
- Do not display “원본 리서치 메모 보기 (Markdown)” or other implementation/source-file controls in article headers.
- Bare numeric citations such as `[1]` must resolve to their explicitly numbered Sources entry and render as links to the lower source list. Preserve source identity if the builder renumbers citations; never silently link to a different source. Code snippets and numeric labels on real Markdown links are not bare citations.
- Keep paragraphs visually separated (28px bottom margin and 1.9 line height); allow clear pauses before section headings and around tables. Check long finance tables at phone width without narrowing the page or compressing prose.

- For multi-part explanations, make numbered subheadings visibly distinct from body text (top rule, space before the heading and stronger type). Group closely related facts into one or two sentences per paragraph; do not automatically split every sentence into a separate paragraph. Keep short judgment/transition paragraphs where the argument changes. Avoid repetitive “사실:” / “계산:” labels in public prose; communicate the distinction naturally while preserving assumptions and attribution.

- Numbered topic/checkpoint titles must use actual Markdown headings (`### 1. ...`), not standalone bold paragraphs (`**1. ...**`). This applies to closing checklists as well as the main analysis; verify that each title renders as a heading with the shared separator and spacing.

- Avoid dry runs of unconnected numeric paragraphs. When an argument mixes expenditure, guidance and derived values, use a compact table that labels period and fact/forecast/calculation, then explain their connection in prose. Put attributed management commentary in a visually distinct block labeled “회사 설명 · 실적 콜 요약” with its source. Summaries/paraphrases must be labeled as such, never presented as verbatim quotation; use quotation marks only for verified exact wording (and label translations). Distinguish company commentary from the author's interpretation through structure, not by coloring every sentence.

- Apply editorial structure across every public article: compare broker targets/ratings in tables (retain unknowns and source limitations), separate company/broker/report summaries from author interpretation, and use tables for repeated financial periods, forecasts and schedules when they aid comparison. Keep causal reasoning as prose and avoid duplicating the entire table in text. Do not invent per-row source attribution when the original only supplies collective sources.
- Public tables use consistent left alignment for headers and cells, overriding Markdown alignment hints. Keep text legible and horizontal scrolling inside the table on narrow screens.

## Consent analytics and administrator

The Worker serves administrator data and assets only after verifying an origin-bound signed session cookie from `/admin/login`. The login password comes from the Worker Secret `ADMIN_PASSWORD` (12–256 characters), and the session signature also uses `ANALYTICS_HMAC_SECRET`. Sessions last 8 hours and password rotation invalidates existing sessions. Login/logout enforce same-origin POST; login attempts have a persistent global limit of 20 per 15-minute fixed window without storing IP addresses. It fails closed with missing settings. Public static assets contain no administrator HTML/JS. The build emits `analytics-manifest.json` containing public paths, titles, markets and tags only; never add private memo paths or admin URLs to it, sitemap, feeds, or search artifacts.

The public footer has 통계 설정 and equal-weight consent choices. Collection starts only after opt-in. Browser IDs live at most 90 days and the server stores HMAC values; raw events expire after 90 days and identifier-free daily aggregates after 365 days. Hourly Cron rebuilds the latest 2 days plus today. The dashboard shows only observed consenting-browser traffic, KST date ranges, provisional today, missing data, collection and aggregation health, and sample-gated rules.

Read [analytics operations](../../../site/analytics/OPERATIONS.md) before initial deployment. Required real settings are D1 database ID and Worker Secrets `ADMIN_PASSWORD` and `ANALYTICS_HMAC_SECRET`. Do not deploy placeholders. Use `npm run check:site` for static build, tracker consent tests and real local D1/Worker security/aggregation tests. Use `npm run deploy:site` after the account and Worker Secrets have been configured. Local static preview does not supply the protected administrator API.

## Historical archive publication

When the user publishes notes as records of their time, preserve original prices, assumptions, judgments and each metric's stated date. Include updates already recorded in the memo; do not refresh the analysis to the site publication day. Publish one editorial copy of each finished primary note, avoiding duplicate voice/SEO/channel copies and supporting data packs. Include uncommitted finished notes only as an explicitly scoped snapshot in the isolated publication worktree; leave the source worktree untouched.

List pages sort by the latest original research date (the maximum of 기준일, 최근 업데이트일 and dated Update Log headings), then original 기준일 and slug. Site publication/editing dates do not change that order. Keep the original 기준일 visible and label a later research update separately. For a bulk archive publication, remove old featured ranks so home recommendations also show the latest research; retain optional ranking support for deliberate future curation. Feeds and sitemap modification dates still reflect actual site edits.

Retain source bibliographic entries even when the original supplies no URL. Link numbered citations to those entries without inventing external URLs; an explicit DART receipt identifier may link to that exact filing. Preserve chart data and images, encode spaces in Markdown image paths, and verify every embedded image reaches the build.
