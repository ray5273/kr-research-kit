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
   - `summary`: one-line card summary. Leave it out when the memo has a `한줄요약` header line, which is used automatically; older memos without one fall back to whole sentences from the core answer.
   - `stance`: `긍정` / `중립` / `부정` (or `pos` / `neu` / `neg`) badge. Set it only when the memo states that call; never infer one. No buy/sell words.
   - `quote`: up to 4 header cells `{ "label", "value", "unit"?, "tone"?: "up" | "down" }`, copied from numbers in the memo.
   - `featured`: rank in the home "지금 읽을 만한 리서치" grid (1 = big card). Unranked slots fall back to the latest articles.
   - `popular`: rank in the home "인기" tab. Until there are visit stats, unranked articles follow research-date order. Commit the memo and every image it embeds first; the builder refuses untracked files.

2. **Pick the cover art.** The list cover and the Kakao/OG share card use the first of these that exists:

   1. The article's own art: `site/covers/<slug with / as ->.jpg`.
   2. `coverSector` on the manifest entry: an `id` from `site/cover-sectors.json`, shown from `site/covers/sectors/<id>.jpg`.
   3. The first `sectors[]` value that matches a dictionary `label` or `aliases` entry (case and spacing ignored).
   4. The text cover.

   A new article with an industry in `sectors` needs nothing else. Articles outside the library (market sentiment, strategy backtests, people) need their own art. Gemini needs the logged-in browser on this machine, so generation runs here and not in Cloudflare:

   ```bash
   node skills/kr-research-site/scripts/generate-covers.js                         # articles no picture covers yet
   node skills/kr-research-site/scripts/generate-covers.js --slug <slug> --force   # make or redo an article's own art
   node skills/kr-research-site/scripts/generate-covers.js --sectors               # fill the library; resumes by skipping existing files
   node skills/kr-research-site/scripts/generate-covers.js --sector <id> --force   # redo one sector picture
   ```

   A run stops after a login page or two failures in a row, and reports how many are left. Open each new image and reject logos, brand marks or legible text, then redo it with a better description: `coverSubject` on the manifest entry, or `subject` in the dictionary. Commit the `.jpg`. `npm run test:site` fails on a published article with no picture and on an unknown `coverSector`, which also stops the Cloudflare build. To ship with the text cover (for example Gemini logged out and no matching sector), set `"coverArt": false` on the entry and remove it once art is committed; it also turns off the sector fallback. When too many cards in a sector look alike, make own art for the newer articles.

3. **Review readability, then build and check.**

   For every new or edited article, apply [kr-article-readability](../kr-article-readability/SKILL.md). Inspect emphasis, tone colors, paragraph/section rhythm, mobile tables and source labels; save an exact-content review record. Run `npm run check:readability` before deployment. Official `deploy:preview`, `deploy:site` and `deploy:pages` npm commands enforce this with predeploy lifecycle hooks. Existing legacy snapshots remain explicitly unreviewed and stop exempting an article as soon as its content/metadata changes.

   ```bash
   node skills/kr-research-site/scripts/build-site.js --out site-dist
   node skills/kr-research-site/scripts/serve-site.js --dir site-dist --port 8080
   ```

   Open the article at phone width with `/browse` and check the core answer box, tables, charts, tone colors, update log and sources. Read [references/seo-aeo.md](references/seo-aeo.md) for the title, description, structured data and ad placement rules the build enforces.

4. **Deploy.** Push to `main`. Cloudflare Workers Builds (GitHub integration) runs the tests, builds with `--production` and deploys `site-dist/` with `npx wrangler deploy`. In parallel `.github/workflows/site.yml` builds the pushed commit and the previous one, waits until the live `urls.json` matches the new build, then sends only new, changed or removed URLs to IndexNow.

5. **Naver teaser (optional).**

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
   - Advanced settings → Build variables: `NODE_VERSION` = `22`; Build watch paths: `site/*`, `analysis-example/*`, `skills/kr-research-site/*`, `skills/kr-article-readability/*`, `skills/kr-naver-blog-publish/scripts/*`, `wrangler.jsonc`, `package*.json`
   - Let Cloudflare create the build API token automatically. No GitHub secrets are needed.
3. Register the site in Google Search Console (URL-prefix property), 네이버 서치어드바이저 and Bing Webmaster. A `pages.dev` site has no DNS of its own, so use the HTML meta-tag method: put each token in `verification.google` / `.naver` / `.bing`, push, then verify and submit `/sitemap.xml`.
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

- Omit entirely empty chart series and research-progress placeholders such as “자료 확인 중” from public articles. Keep missing values in research data and retain limitations that materially affect the conclusion in the prose or source notes.

- Write for readers of the published page. Omit local file names, JSON inputs/results, Python scripts, CSV zone files, reproduction commands and internal research-pipeline status from prose. Keep these in repository research artifacts; retain disclosed facts, assumptions, source dates and material verification limits.
- Do not display “원본 리서치 메모 보기 (Markdown)” or other implementation/source-file controls in article headers.
- Evidence links must not read as body text. Put them right after the sentence or in the table cell they support (`...유지했다. [하나증권 브리핑](url)`), never as a separate paragraph of their own. The builder shows these, parenthetical links and any standalone link as the number only and keeps the label in the source list; a link keeps its label only when the sentence needs the name (`[Fortune](url)은 ...`).
- Bare numeric citations such as `[1]` must resolve to their explicitly numbered Sources entry and render as links to the lower source list. Preserve source identity if the builder renumbers citations; never silently link to a different source. Code snippets and numeric labels on real Markdown links are not bare citations.
- Keep paragraphs visually separated (28px bottom margin and 1.9 line height); allow clear pauses before section headings and around tables. Check long finance tables at phone width without narrowing the page or compressing prose.

- For multi-part explanations, make numbered subheadings visibly distinct from body text (top rule, space before the heading and stronger type). Group closely related facts into one or two sentences per paragraph; do not automatically split every sentence into a separate paragraph. Keep short judgment/transition paragraphs where the argument changes. Avoid repetitive “사실:” / “계산:” labels in public prose; communicate the distinction naturally while preserving assumptions and attribution.

- Numbered topic/checkpoint titles must use actual Markdown headings (`### 1. ...`), not standalone bold paragraphs (`**1. ...**`). This applies to closing checklists as well as the main analysis; verify that each title renders as a heading with the shared separator and spacing.

- Avoid dry runs of unconnected numeric paragraphs. When an argument mixes expenditure, guidance and derived values, use a compact table that labels period and fact/forecast/calculation, then explain their connection in prose. Put attributed management commentary in a visually distinct block labeled “회사 설명 · 실적 콜 요약” with its source. Summaries/paraphrases must be labeled as such, never presented as verbatim quotation; use quotation marks only for verified exact wording (and label translations). Distinguish company commentary from the author's interpretation through structure, not by coloring every sentence.

- Apply [financial readability](../kr-stock-analysis/references/financial-readability.md) throughout the article, especially reverse valuation, scenario math, cash-flow derivations and broker revisions. Show the key result first, compact assumptions/comparisons next, and each necessary formula on its own line. Keep long caveats outside tables and explain the implication without repeating every value. A layout-only edit freezes facts, source dates and judgment.

- Apply editorial structure across every public article: compare broker targets/ratings in tables (retain unknowns and source limitations), separate company/broker/report summaries from author interpretation, and use tables for repeated financial periods, forecasts and schedules when they aid comparison. Keep causal reasoning as prose and avoid duplicating the entire table in text. Do not invent per-row source attribution when the original only supplies collective sources.
- Public tables use consistent left alignment for headers and cells, overriding Markdown alignment hints. Keep text legible and horizontal scrolling inside the table on narrow screens.

## Consent analytics and administrator

The Worker serves administrator data and assets only after verifying an origin-bound signed session cookie from `/admin/login`. The login password comes from the Worker Secret `ADMIN_PASSWORD` (12–256 characters), and the session signature also uses `ANALYTICS_HMAC_SECRET`. Sessions last 8 hours and password rotation invalidates existing sessions. Login/logout enforce same-origin POST; login attempts have a persistent global limit of 20 per 15-minute fixed window without storing IP addresses. It fails closed with missing settings. Public static assets contain no administrator HTML/JS. The build emits `analytics-manifest.json` containing public paths, titles, markets and tags only; never add private memo paths or admin URLs to it, sitemap, feeds, or search artifacts.

The public footer has 통계 설정 and equal-weight consent choices. Collection starts only after opt-in. Browser IDs live at most 90 days and the server stores HMAC values; raw events expire after 90 days and identifier-free daily aggregates after 365 days. Hourly Cron rebuilds the latest 2 days plus today. The dashboard shows only observed consenting-browser traffic, KST date ranges, provisional today, missing data, collection and aggregation health, and sample-gated rules.

Read [analytics operations](../../../site/analytics/OPERATIONS.md) before initial deployment. Required real settings are D1 database ID and Worker Secrets `ADMIN_PASSWORD` and `ANALYTICS_HMAC_SECRET`. Do not deploy placeholders. Use `npm run check:site` for static build, tracker consent tests and real local D1/Worker security/aggregation tests. Use `npm run deploy:site` after the account and Worker Secrets have been configured. Local static preview does not supply the protected administrator API.

## Discovery and reader participation

- Optional `sectors: string[]` in `site/published.json` drives related articles independently of tags. Prefer explicit industry labels, including across markets and stock/sector posts. Up to four related posts appear before publication-order previous/next links, then comments. Publication ties follow manifest order; edits never change these neighbors.
- Supply a short `headline` and factual public `summary`; lists, search and sharing use that same summary. `/search/?q=…` searches only the public static metadata index, with NFKC/case normalization, substring AND matching and exact company/ticker priority. The search page is noindex.
- Build-generated 1200×630 share cards use `@napi-rs/canvas` and the bundled OFL Korean font. They composite the reviewed art from `site/covers/` (own or sector picture, see step 2) under the title, and fall back to a text card without art; content/font/renderer/art hashes invalidate image URLs. OG/Twitter metadata is in server HTML. Do not commit generative images without reviewing them.
- Kakao uses the public JavaScript key from `kakao.javascriptKey` or build environment `KAKAO_JAVASCRIPT_KEY`. Configure SDK/web domains for `baseUrl`. Verify the production domain registrations, build variable and previews after deployment without automatically sending messages.
- Public sharing and nickname comments are served by the existing Worker/D1. Counts fail to `—`, not zero. Comments are plain text, 30/2,000 characters, pending approval, oldest first in 20-row cursor pages. Admin approval/deletion lives at `/admin/comments/` behind the existing signed cookie. Never bundle admin HTML/JS in public assets.
- Run `npm run check:site`, including real local Worker/D1 engagement tests. Keep privacy text and [operations](../../../site/analytics/OPERATIONS.md) aligned with behavior. Deploy through the existing migration-first script; never reset cumulative shares with visit retention.

## Historical archive publication

When the user publishes notes as records of their time, preserve original prices, assumptions, judgments and each metric's stated date. Include updates already recorded in the memo; do not refresh the analysis to the site publication day. Publish one editorial copy of each finished primary note, avoiding duplicate voice/SEO/channel copies and supporting data packs. Include uncommitted finished notes only as an explicitly scoped snapshot in the isolated publication worktree; leave the source worktree untouched.

List pages sort by the latest original research date (the maximum of 기준일, 최근 업데이트일 and dated Update Log headings), then original 기준일 and slug. Site publication/editing dates do not change that order. Keep the original 기준일 visible and label a later research update separately. For a bulk archive publication, remove old featured ranks so home recommendations also show the latest research; retain optional ranking support for deliberate future curation. Feeds and sitemap modification dates still reflect actual site edits.

Retain source bibliographic entries even when the original supplies no URL. Link numbered citations to those entries without inventing external URLs; an explicit DART receipt identifier may link to that exact filing. Preserve chart data and images, encode spaces in Markdown image paths, and verify every embedded image reaches the build.

## Earnings research tools

Optional `articleType`, `period`, `companyId` and `analysisData` extend existing opt-in entries without changing legacy requirements. Follow [the public earnings data contract](references/earnings-data.md) and [the common analysis standard](../kr-stock-analysis/references/earnings-review.md). The build emits `/earnings/` and company histories; assumptions and missing evidence must remain visible.

Keep numeric comparisons in compact tables and place lengthy broker opinions in full-width report cards. Use the Markdown columns `작성일 | 증권사·원문 | 당시 의견·목표가 | 핵심 의견` to invoke the shared renderer: the first two reports are visible and older reports use a native, keyboard-accessible disclosure. Order reports newest first; preserve dates, ratings, targets, explanations and source links. Move lengthy exceptions below numeric tables as notes. See [broker opinion presentation](references/earnings-data.md#증권사-의견-표시) and the [POSCO Future M example](../../analysis-example/kr/포스코퓨처엠/memo.md).

Earnings reviews must include conference-call Q&A, following [the shared sourcing and quotation standard](../kr-stock-analysis/references/earnings-call-qa.md). Use consecutive `### Q1. …`, `### Q2. …` subheadings to invoke shared Q&A cards. Follow each with `**회사 답변 요약:**` (or `**회사 답변:**` for a verified quotation), then `**분석:**` or `**다음 확인:**`. Show a numbered badge, a distinct answer surface and a separated follow-up, with source links and explicit summary/quotation labels. Keep cards expanded and readable in a single column on mobile. Preserve unanswered questions and connect new management targets to follow-up checks; do not display long Q&A in narrow table cells.

## Earnings layout and review fixes

- Place comparison, charts, calculator and management checks beside the corresponding argument. Avoid an uninterrupted tools block before the narrative or a second copy of the same comparison table. The builder places supported earnings sections contextually; unmatched tools retain a fallback section.
- On phones, show the earnings comparison as metric cards with explicit labels; show long management checks as cards. Preserve desktop numeric comparison and accessible source links.
- When a model uses unverified price/mix/profit/multiple inputs, lead with sensitivity and put conditional valuation behind an expandable section. A dated disclosed debt balance remains a historical balance, not the future forecast. Keep company answers separate from source comparisons and author caution.
- First-analysis checks should say when the new hypothesis will be verified. A future management target is “검증시점 미도래”, not a failed promise.
- Static previews retain local link copy but remove live comment forms, count controls and analytics settings when the corresponding scripts/APIs are excluded. Run `npm run test:preview` with the site tests.

## Shared preview address

Use `npm run deploy:preview` for review deployments from any working branch or PR. It builds the isolated static preview and always deploys to Pages branch `preview`, maintaining **https://preview.kr-research-site.pages.dev/** as the shared review address. Do not substitute the Git/PR branch in `--branch`; the last completed preview deployment replaces the shared preview. Per-deployment hash URLs are for historical comparisons. Preserve production `main`, canonical URLs, noindex and the preview exclusions for ads/analytics/Worker APIs. See [preview operations](../../site/preview/README.md).
