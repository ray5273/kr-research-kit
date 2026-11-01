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

   `memo` and `slug` are required. Optional `article` points to a tracked editorial Markdown sibling; it must preserve the original memo 기준일 and passes the same privacy and image checks. The original memo remains available at `<slug>/memo.md`. Set `archive: true` for historical research; cards and the article show a 기록 글 label and explain that subsequent changes are excluded. For editorial publication, set `datePublished` to the actual site publication date and `dateModified` to the latest editing date. The page displays these separately from the 자료 기준일; older entries without these fields still build. `slug` is lowercase `a-z0-9-` segments joined by `/` and never changes after publishing (it is the canonical URL). `company`, `ticker`, `exchange`, `market`, `issue`, `tags`, `datePublished`, `dateModified` override what the builder derives from the memo. Display-only fields (see [references/design-brief.md](references/design-brief.md)):

   - `headline`: short on-page title and card title (the SEO `<title>` keeps the `company(ticker) | issue | 기준일` format).
   - `summary`: one-line card summary (default: whole sentences from the core answer).
   - `stance`: `긍정` / `중립` / `부정` (or `pos` / `neu` / `neg`) badge. Set it only when the memo states that call; never infer one. No buy/sell words.
   - `quote`: up to 4 header cells `{ "label", "value", "unit"?, "tone"?: "up" | "down" }`, copied from numbers in the memo.
   - `featured`: rank in the home "지금 읽을 만한 리서치" grid (1 = big card). Unranked slots fall back to the latest articles.
   - `popular`: rank in the home "인기" tab. Until there are visit stats, unranked articles follow `published.json` order. Commit the memo and every image it embeds first; the builder refuses untracked files.

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

1. The site runs as a Cloudflare **Worker with static assets** (`wrangler.jsonc` at the repo root uploads `site-dist/`). Its address is `https://kr-research-site.ray527321.workers.dev` (Worker `kr-research-site`, account subdomain `ray527321`); `baseUrl` (and `author.url`) in `site/site.config.json` must match it exactly. Keep Cloudflare Access off for production, or crawlers and visitors are blocked. A custom domain can be attached later, but that changes every canonical URL, so decide before the site is indexed.
2. Cloudflare dashboard → Workers & Pages → Create → Import a repository → this repository:
   - Project (Worker) name: `kr-research-site` (must equal `name` in `wrangler.jsonc`)
   - Build command: `node skills/kr-research-site/scripts/test-build-site.js && node skills/kr-research-site/scripts/build-site.js --out site-dist --production`
   - Deploy command: `npx wrangler deploy` (default)
   - Advanced settings → Build variables: `NODE_VERSION` = `22`; Build watch paths: `site/*`, `analysis-example/*`, `skills/kr-research-site/*`, `skills/kr-naver-blog-publish/scripts/*`, `wrangler.jsonc`
   - Let Cloudflare create the build API token automatically. No GitHub secrets are needed.
3. Register the site in Google Search Console (URL-prefix property), 네이버 서치어드바이저 and Bing Webmaster. A `workers.dev` site has no DNS of its own, so use the HTML meta-tag method: put each token in `verification.google` / `.naver` / `.bing`, push, then verify and submit `/sitemap.xml`.
4. Generate an IndexNow key and set `indexNow.key`.
5. AdSense needs a domain you own: `ads.txt` must sit at the root domain, and `workers.dev` belongs to Cloudflare, so a `workers.dev` site cannot realistically be approved. Move to a custom domain before applying. After 20+ articles and the policy pages are live, apply for AdSense, then set `adsense.client` and the three slot ids. Configure the EU consent message in the AdSense dashboard (Google CMP); no code is needed.

## Scripts

| Script | Purpose |
|---|---|
| `scripts/build-site.js` | Build `site-dist/` from opt-in memos + `site/pages/*.md` (articles, list pages, tag pages, sitemap, feed, robots, llms, urls.json, ads.txt, IndexNow key file) |
| `scripts/serve-site.js` | Local static preview server |
| `scripts/indexnow-ping.js` | POST changed URLs to IndexNow endpoints (`--dry-run`, `--all`, `--previous <url|file>`) |
| `scripts/test-build-site.js` | Fixture tests: HTML/JSON-LD, sitemap/feed, opt-in and private-path refusals, ads on/off |
