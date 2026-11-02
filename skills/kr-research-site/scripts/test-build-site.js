#!/usr/bin/env node

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const { buildSite, collectCitations, extractAnswer } = require("./build-site");
const { changedUrls, sameUrls } = require("./indexnow-ping");

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/l4kK3wAAAABJRU5ErkJggg==",
  "base64",
);

const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "kr-research-site-test-")));
const git = (...args) => execFileSync("git", ["-C", root, ...args], { stdio: "ignore" });
git("init", "-q");
git("config", "user.email", "test@example.com");
git("config", "user.name", "test");

function write(relative, content) {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return file;
}

write("analysis-example/kr/SOOP/assets/SOOP-chart.png", PNG);
write("analysis-example/kr/SOOP/assets/naver-thumbnail.png", PNG);
write("site/assets/default-og.png", PNG);
write("analysis-example/kr/SOOP/memo.md", [
  "# SOOP 투자 메모",
  "",
  "- 티커: 067160",
  "- 기준일: **2026-06-21**",
  "- 최근 업데이트일: 2026-06-30",
  "",
  "## Research Brief",
  "",
  "INTERNAL BRIEF SHOULD NOT SHIP",
  "",
  "## Summary",
  "",
  "**순현금이 하방을 받치고, 트래픽 회복이 상방을 연다**",
  "",
  "현금 2,480억 원은 시가총액의 30%다. 근거는 [1분기 분기보고서](https://dart.fss.or.kr/dsaf001/main.do?rcpNo=1)다.",
  "",
  "[red: 배당수익률 4%가 하방을 받친다.] [blue: 별풍선 역성장이 부담이다.] [brown: 하반기 회복 가능성이 있다.]",
  "",
  "![SOOP 주가 추세](assets/SOOP-chart.png)",
  "",
  "## Decision Frame",
  "",
  "| 판단을 바꾸는 질문 | 현재 판단과 확인 조건 |",
  "| --- | --- |",
  "| 트래픽이 회복되는가? | 월간 시청자 수가 2개 분기 연속 늘면 긍정으로 본다. |",
  "| 매수 가격은 얼마인가? | 기준 가치 하단에 20% 안전마진을 둔 **8만원**이다. |",
  "",
  "## Business and Thesis",
  "",
  "- 플랫폼 수익성",
  "  - 별풍선 단가",
  "- 비용 통제와 [내부 파일](data-pack.md)",
  "",
  "## Current Valuation Snapshot",
  "",
  "| 지표 | 값 |",
  "| --- | ---: |",
  "| PER | 9.8배 |",
  "",
  "## Risks",
  "",
  "1. 트래픽 둔화 & 규제",
  "2. 경쟁 심화",
  "",
  "## Follow-up Research Prompts",
  "",
  "INTERNAL PROMPTS SHOULD NOT SHIP",
  "",
  "## Update Log",
  "",
  "### 2026-07-02 — 2분기 트래픽 반영",
  "",
  "- 2분기 시청자 수를 반영했다.",
  "",
  "## Sources",
  "",
  "- [SOOP 1분기 분기보고서 (2026-05-15)](https://dart.fss.or.kr/dsaf001/main.do?rcpNo=1)",
  "- Source: https://example.com/soop-ir",
].join("\n"));
write("analysis-example/us/Acme/memo.md", [
  "# Acme & Co 실적 리뷰",
  "",
  "기준일: 2026-05-01",
  "티커: ACME",
  "",
  "## Summary",
  "",
  "**마진이 돌아섰다.** 영업이익률은 12%에서 15%로 올랐다.",
  "",
  "## 숫자",
  "",
  "본문입니다.",
].join("\n"));
write("analysis-example/kr/NoDate/memo.md", "# 날짜 없음\n\n## Summary\n\n**결론**\n\n본문\n");
write("analysis-example/kr/Private/memo.md", "# 보유\n\n- 기준일: 2026-06-01\n\n## Summary\n\n**결론**\n\n~/stock-analysis-private/decision-ledger.ndjson 참고\n");
write("analysis-example/kr/OptOut/memo.md", "# 비공개 메모\n\n- 기준일: 2026-06-01\n\n## Summary\n\n**OPT-OUT MEMO SHOULD NOT SHIP**\n\n본문\n");
write("guard-home/memo.md", "# 가드\n\n- 기준일: 2026-06-01\n\n## Summary\n\n**결론**\n\n본문\n");
write("site/pages/about.md", "# 소개\n\nAI 보조로 작성합니다. [개인정보](/privacy/)\n");
write("site/pages/privacy.md", "# 개인정보처리방침\n\n쿠키를 사용할 수 있습니다.\n");
git("add", "-A");
git("commit", "-q", "-m", "fixture");
write("analysis-example/kr/Untracked/memo.md", "# 추적 안 됨\n\n- 기준일: 2026-06-01\n\n## Summary\n\n**결론**\n\n본문\n");

const baseConfig = {
  baseUrl: "https://research.example.com",
  siteName: "Test Research",
  author: { name: "tester" },
  adsense: { client: "", slots: { afterSummary: "1111111111", midArticle: "2222222222", endArticle: "3333333333" } },
  indexNow: { key: "abcdef0123456789" },
};
const soop = { memo: "analysis-example/kr/SOOP/memo.md", slug: "kr/soop-2026-06", market: "kr", tags: ["SOOP", "067160"] };
const acme = { memo: "analysis-example/us/Acme/memo.md", slug: "us/acme-2026-05", company: "Acme & Co", exchange: "NASDAQ" };
const outDir = path.join(root, "site-dist");
const build = (overrides = {}) => buildSite({
  root,
  config: baseConfig,
  published: { articles: [soop, acme] },
  pagesDir: path.join(root, "site/pages"),
  outDir,
  buildYear: 2026,
  ...overrides,
});
const read = relative => fs.readFileSync(path.join(outDir, relative), "utf8");
const jsonLd = html => [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(match => JSON.parse(match[1]));

// --- build without ads ---
const result = build();
assert.deepStrictEqual(result.articles.map(article => article.slug), ["kr/soop-2026-06", "us/acme-2026-05"]);
assert.strictEqual(result.ads, false);
const article = read("kr/soop-2026-06/index.html");
assert(article.startsWith("<!doctype html>\n<html lang=\"ko\">"));
assert(article.includes('<link rel="canonical" href="https://research.example.com/kr/soop-2026-06/">'));
assert(article.includes("<title>SOOP(067160) | 순현금이 하방을 받치고, 트래픽 회복이 상방을 연다 | 2026-06-21</title>"));
assert(/<meta name="description" content="현금 2,480억 원은 시가총액의 30%다\./.test(article));
const shareUrl = /<meta property="og:image" content="([^"]+)">/.exec(article)[1];
assert.match(shareUrl, /^https:\/\/research\.example\.com\/share\/kr-soop-2026-06-[a-f0-9]{16}\.png$/);
const shareBytes = fs.readFileSync(path.join(outDir,new URL(shareUrl).pathname));
assert.equal(shareBytes.readUInt32BE(16),1200);assert.equal(shareBytes.readUInt32BE(20),630);
assert(article.includes('<meta property="og:image:width" content="1200">'));
assert(article.includes('<meta property="og:image:alt"'));
assert(article.includes('<meta property="og:title" content="SOOP 투자 메모">'));
const searchIndex=JSON.parse(read('search-index.json'));
assert.equal(searchIndex.length,2);
assert.deepEqual(Object.keys(searchIndex[0]).sort(), ['slug','headline','company','ticker','market','sectors','tags','summary','datePublished','order','asOfDate','researchDate','readMinutes','archive','image'].sort());
assert(!read('search-index.json').includes('INTERNAL'));
assert(read('search/index.html').includes('content="noindex,follow"'));
assert(!read('sitemap.xml').includes('/search/'));
assert(article.indexOf('aria-label="연관글"')<article.indexOf('aria-label="이어서 읽기"'));
assert(article.indexOf('aria-label="이어서 읽기"')<article.indexOf('id="comments"'));
assert.equal((article.match(/data-share="kakao"/g)||[]).length,2);
assert(article.includes('<p class="lead">순현금이 하방을 받치고, 트래픽 회복이 상방을 연다</p>'));
assert(article.includes("자료 기준일 2026-06-21 · 최근 편집 2026-07-02"));
assert(article.includes('<span class="tone-pos">배당수익률 4%가 하방을 받친다.</span>'));
assert(article.includes('<span class="tone-neg">별풍선 역성장이 부담이다.</span>'));
assert(article.includes('<span class="tone-spec">하반기 회복 가능성이 있다.</span>'));
assert(article.includes('class="legend"'));
assert(article.includes('<img src="assets/SOOP-chart.png" alt="SOOP 주가 추세" width="1" height="1"'));
assert(fs.existsSync(path.join(outDir, "kr/soop-2026-06/assets/SOOP-chart.png")));
assert(article.includes("<table>") && article.includes('<td class="num">9.8배</td>'), "numeric columns align right");
assert(!/<(?:td|th) class="[rc]"/.test(article), "Markdown alignment hints must not change public cell alignment");
assert(article.includes('<div class="table-scroll" role="region" aria-label="표" tabindex="0">'), "wide tables scroll by keyboard");
assert(article.includes('<a class="skip" href="#main">') && article.includes('<main id="main">'));
assert(article.includes('<nav class="crumbs"') && article.includes('<a href="/kr/">한국 주식</a>'));
assert(article.includes('<details class="toc-mobile">'));
assert(article.indexOf('id="answer"') < article.indexOf('data-share="kakao"'), "the core answer comes before share controls");
assert(article.includes("th,td{text-align:left;"));
assert(article.includes("<ul><li>플랫폼 수익성<ul><li>별풍선 단가</li></ul></li><li>비용 통제와 내부 파일</li></ul>"));
assert(article.includes("<ol><li>트래픽 둔화 &amp; 규제</li><li>경쟁 심화</li></ol>"));
assert(article.includes('1분기 분기보고서<sup class="cite"><a href="#src-1"'));
assert(article.includes('<li id="src-1"><a href="https://dart.fss.or.kr/dsaf001/main.do?rcpNo=1" rel="noopener">SOOP 1분기 분기보고서 (2026-05-15)</a></li>'));
assert(article.includes('<li id="src-2"><a href="https://example.com/soop-ir"'));
assert(article.includes('<h2 id="updates">업데이트 내역</h2>'));
assert(article.includes("2분기 시청자 수를 반영했다."));
assert(article.includes("매수·매도를 권유하지 않습니다"));
for (const banned of ["INTERNAL BRIEF SHOULD NOT SHIP", "INTERNAL PROMPTS SHOULD NOT SHIP", "adsbygoogle", "data-pack.md"]) {
  assert(!article.includes(banned), `article must not contain ${banned}`);
}
const ld = jsonLd(article);
const articleLd = ld.find(item => item["@type"] === "Article");
assert.strictEqual(articleLd.datePublished, "2026-06-21T09:00:00+09:00");
assert.strictEqual(articleLd.dateModified, "2026-07-02T09:00:00+09:00");
assert.strictEqual(articleLd.author.name, "tester");
assert.deepStrictEqual(articleLd.about, { "@type": "Corporation", name: "SOOP", tickerSymbol: "KRX 067160" });
assert.strictEqual(ld.find(item => item["@type"] === "BreadcrumbList").itemListElement.length, 3);
const faq = ld.find(item => item["@type"] === "FAQPage");
assert.strictEqual(faq.mainEntity.length, 2);
assert.strictEqual(faq.mainEntity[1].acceptedAnswer.text, "기준 가치 하단에 20% 안전마진을 둔 8만원이다.");

const acmeHtml = read("us/acme-2026-05/index.html");
assert(acmeHtml.includes("<title>Acme &amp; Co(ACME) | 마진이 돌아섰다 | 2026-05-01</title>"));
assert(acmeHtml.includes('<p class="lead">마진이 돌아섰다.</p>'));
assert(acmeHtml.includes("<p>영업이익률은 12%에서 15%로 올랐다.</p>"));
assert.strictEqual(jsonLd(acmeHtml).find(item => item["@type"] === "Article").about.tickerSymbol, "NASDAQ ACME");
assert(!jsonLd(acmeHtml).some(item => item["@type"] === "FAQPage"));
assert(!acmeHtml.includes('class="legend"'));

// opt-in: memos not listed are never built
assert(!fs.existsSync(path.join(outDir, "kr/optout")));
assert(!fs.readdirSync(outDir, { recursive: true }).some(name => String(name).includes("OptOut")));
assert(!read("llms-full.txt").includes("OPT-OUT"));

// list pages, policy pages, tags
assert(read("index.html").includes('href="/kr/soop-2026-06/"') && read("index.html").includes('href="/us/acme-2026-05/"'));
assert(read("kr/index.html").includes("soop-2026-06") && !read("kr/index.html").includes("acme-2026-05"));
assert(read("us/index.html").includes("acme-2026-05"));
assert(read("about/index.html").includes('<a href="/privacy/">개인정보</a>'));
assert(read("tags/SOOP/index.html").includes('<meta name="robots" content="noindex,follow">'));
assert(read("404.html").includes('content="noindex"'));

// home: recommended cards carry a visible 기준일; latest/popular panels; no badge unless stated
const home = read("index.html");
assert(home.includes("지금 읽을 만한 리서치"));
assert(home.includes('<span class="asof"><b>자료 업데이트</b>2026-07-02</span>'));
assert(home.includes('class="panel latest"') && home.includes('class="panel popular"'));
assert(!home.includes('class="badge'), "no stance badge unless published.json states one");
assert(!read("kr/index.html").includes("지금 읽을 만한 리서치"));
assert(article.includes('<nav class="toc"') && article.includes('<a href="#answer" class="on">핵심 답변</a>'));
assert(article.includes('<nav class="more" aria-label="이어서 읽기">') && article.includes('href="/us/acme-2026-05/"'));

// Shared covers reach the public build, while article-specific images win.
const coverConfig = { ...baseConfig, defaultOgImage: "/assets/default-og.png" };
build({ config: coverConfig });
assert(fs.readFileSync(path.join(outDir, "assets/default-og.png")).equals(PNG));
for (const page of ["index.html", "kr/index.html", "about/index.html"]) {
  assert(read(page).includes('<meta property="og:image" content="https://research.example.com/assets/default-og.png">'), page);
  assert(read(page).includes('<meta name="twitter:card" content="summary_large_image">'), page);
  assert(read(page).includes('<meta property="og:image:width" content="1">'), page);
}
for (const page of ["kr/soop-2026-06/index.html", "us/acme-2026-05/index.html"]) {
 assert.match(read(page), /<meta property="og:image" content="https:\/\/research\.example\.com\/share\/[^" ]+\.png">/);
 assert(read(page).includes('<meta property="og:image:width" content="1200">'));
}
assert.strictEqual(coverConfig.defaultOgImage, "/assets/default-og.png", "build must not mutate caller config");
write("site/assets/untracked.png", PNG);
assert.throws(() => build({ config: { ...baseConfig, defaultOgImage: "/assets/untracked.png" } }), /not tracked/);
assert.throws(() => build({ config: { ...baseConfig, defaultOgImage: "/assets/../../private.png" } }), /defaultOgImage/);
build({ config: { ...baseConfig, defaultOgImage: "https://images.example.com/cover.png" } });
assert(read("index.html").includes('<meta property="og:image" content="https://images.example.com/cover.png">'));
build();

// display-only fields from published.json: stance, headline, quote, featured, popular
build({ published: { articles: [soop, { ...acme, stance: "부정", headline: "Acme 짧은 제목", featured: 1, popular: 1, quote: [{ label: "기준 주가", value: "12.3", unit: "달러" }, { label: "변화", value: "-4.0%", tone: "down" }] }] } });
const acmeDisplay = read("us/acme-2026-05/index.html");
assert(acmeDisplay.includes('<span class="badge neg">부정</span>'));
assert(acmeDisplay.includes("<h1>Acme 짧은 제목</h1>"));
assert(acmeDisplay.includes('<div class="v down">-4.0%</div>') && acmeDisplay.includes("12.3<small>달러</small>"));
const featuredHome = read("index.html");
assert(featuredHome.includes('<div class="grid"><a class="card" href="/us/acme-2026-05/">'), "featured article leads the recommended grid");
assert(/class="panel popular"><a class="row" href="\/us\/acme-2026-05\/"><div class="row-id"><span class="rank">1<\/span>/.test(featuredHome));
assert.throws(() => build({ published: { articles: [{ ...soop, stance: "매수" }] } }), /Invalid stance/);
build();

// A bulk publication/edit date must not make old research outrank newer data.
// SOOP's dated update is later than Acme's original date; Acme is published later.
const dated = build({ published: { articles: [
  { ...acme, datePublished: "2026-11-01", dateModified: "2026-11-02" },
  { ...soop, datePublished: "2026-10-01", dateModified: "2026-10-01" },
] } });
assert.deepStrictEqual(dated.articles.map(a => a.slug), [soop.slug, acme.slug]);
const datedHome = read("index.html");
assert(datedHome.indexOf('class="row" href="/kr/soop-2026-06/') < datedHome.indexOf('class="row" href="/us/acme-2026-05/'));
assert(read("feed.xml").includes("<updated>2026-11-02T09:00:00+09:00</updated>"), "feed updated is latest edit, independently of research sorting");
assert(read("sitemap.xml").includes("<loc>https://research.example.com/</loc><lastmod>2026-11-02</lastmod>"));
assert(datedHome.includes("자료 업데이트 2026-07-02"));
build();

// The memo's 한줄요약 header line becomes the card summary and meta description.
{
  const memoFile = "analysis-example/kr/SOOP/memo.md";
  const original = fs.readFileSync(path.join(root, memoFile), "utf8");
  write(memoFile, original.replace("- 티커: 067160", "- 한줄요약: 순현금이 하방을 받치고 트래픽이 관건이다.\n- 티커: 067160"));
  build();
  assert(read("kr/soop-2026-06/index.html").includes('<meta name="description" content="순현금이 하방을 받치고 트래픽이 관건이다.">'));
  assert(read("kr/index.html").includes("<p>순현금이 하방을 받치고 트래픽이 관건이다.</p>"));
  assert(!read("kr/soop-2026-06/index.html").includes("한줄요약"), "the label itself is not published");
  build({ published: { articles: [{ ...soop, summary: "직접 쓴 요약" }, acme] } });
  assert(read("kr/index.html").includes("<p>직접 쓴 요약</p>"), "published.json summary wins");
  write(memoFile, original);
  build();
}

// Public analytics metadata and consent assets must never expose source paths.
const analyticsManifest = JSON.parse(read("analytics-manifest.json"));
assert.strictEqual(analyticsManifest.articles.length, 2);
assert(analyticsManifest.articles.every(a => a.path.startsWith("/") && a.title && a.market && Array.isArray(a.tags)));
assert(!JSON.stringify(analyticsManifest).includes("analysis-example/"));
assert(!analyticsManifest.paths.some(p => p.startsWith("/admin")));
assert(read("index.html").includes('data-stats-settings'));
assert(read("index.html").includes('src="/analytics.js"'));
assert(read("analytics.js").includes("research.stats.consent"));
assert(read("index.html").includes('src="/card-counts.js"'));
{
  const { coverCard, shareCard } = require("./share-card");
  const coverDir = fs.mkdtempSync(path.join(os.tmpdir(), "cover-"));
  const withArt = coverCard({ slug: "sector/uhv-transformer", company: "초고압 변압기", headline: "제목", asOfDate: "2026-08-16" }, coverDir);
  assert(withArt.endsWith(".jpg"), "Published art must produce a composed JPEG cover");
  assert(fs.statSync(path.join(coverDir, withArt)).size > 15000, "Cover art must actually be drawn");
  assert(coverCard({ slug: "no/art", company: "가나다", headline: "제목", asOfDate: "2026-08-16" }, coverDir).endsWith(".png"), "Missing art falls back to the text cover");
  const shareConfig = { siteName: "KR Research", baseUrl: "" };
  const shareWithArt = shareCard({ slug: "sector/uhv-transformer", company: "초고압 변압기", headline: "제목", asOfDate: "2026-08-16" }, shareConfig, coverDir);
  assert(shareWithArt.endsWith(".jpg"), "Published art must produce a composed JPEG share card");
  assert(fs.statSync(path.join(coverDir, shareWithArt)).size > 15000, "Share art must actually be drawn");
  assert(shareCard({ slug: "no/art", company: "가나다", headline: "제목", asOfDate: "2026-08-16" }, shareConfig, coverDir).endsWith(".png"), "Missing art falls back to the text share card");
  const { missingArt, coverPrompt } = require("./generate-covers");
  fs.writeFileSync(path.join(coverDir, "kr-has.jpg"), "x");
  const needsArt = missingArt([{ slug: "kr/has" }, { slug: "kr/new" }, { slug: "kr/opt-out", coverArt: false }], coverDir);
  assert.deepStrictEqual(needsArt.map(a => a.slug), ["kr/new"], "Only un-opted articles without art are missing");
  // Art order: own picture, coverSector, sectors[] match, then the text cover.
  const { loadSectors, resolveArt, sectorFor } = require("./cover-art");
  const sectorList = [{ id: "ships", label: "조선", aliases: ["선박 엔진"], subject: "a ship" }, { id: "banks", label: "은행", subject: "a bank" }, { id: "games", label: "게임", subject: "a game" }];
  const artOptions = { artDir: coverDir, sectors: sectorList };
  fs.mkdirSync(path.join(coverDir, "sectors"));
  for (const id of ["ships", "banks"]) fs.writeFileSync(path.join(coverDir, "sectors", `${id}.jpg`), "x");
  const artFile = (article) => { const file = resolveArt(article, artOptions); return file && path.relative(coverDir, file); };
  assert.strictEqual(artFile({ slug: "kr/has", coverSector: "banks", sectors: ["조선"] }), "kr-has.jpg", "An article's own art wins");
  assert.strictEqual(artFile({ slug: "kr/a", coverSector: "banks", sectors: ["조선"] }), path.join("sectors", "banks.jpg"), "coverSector beats sectors[]");
  assert.strictEqual(artFile({ slug: "kr/a", sectors: ["없는 업종", "선박엔진"] }), path.join("sectors", "ships.jpg"), "sectors[] matches aliases, ignoring spacing");
  assert.strictEqual(artFile({ slug: "kr/a", sectors: ["없는 업종"] }), null, "No match falls back to the text cover");
  assert.strictEqual(artFile({ slug: "kr/a", sectors: ["조선"], coverArt: false }), null, "coverArt: false keeps the text cover");
  assert.deepStrictEqual(missingArt([{ slug: "kr/sector", sectors: ["은행"] }, { slug: "kr/plain", sectors: ["없는 업종"] }, { slug: "kr/no-picture-yet", sectors: ["게임"] }, { slug: "kr/opt-out", sectors: ["없는 업종"], coverArt: false }], coverDir, sectorList).map(a => a.slug), ["kr/plain", "kr/no-picture-yet"], "Sector art satisfies the deploy check; a dictionary hit without a file does not");
  assert.throws(() => missingArt([{ slug: "kr/has", coverSector: "bank" }], coverDir, sectorList), /unknown coverSector "bank"/, "A coverSector typo fails even when the article has its own art");
  const collidingFile = path.join(coverDir, "colliding.json");
  fs.writeFileSync(collidingFile, JSON.stringify({ sectors: [{ id: "a", label: "에이", aliases: ["같은 이름"], subject: "s" }, { id: "b", label: "비", aliases: ["같은이름"], subject: "s" }] }));
  assert.throws(() => loadSectors(collidingFile), /is in both a and b/, "An alias may belong to only one sector");
  const library = loadSectors();
  assert.strictEqual(library.length, 41, "Sector library has 41 entries");
  assert.deepStrictEqual(library.filter(sector => !fs.existsSync(path.join(__dirname, "../../../site/covers/sectors", `${sector.id}.jpg`))).map(sector => sector.id), [], "Every sector has committed art");
  for (const name of ["인터넷 플랫폼", "클라우드", "동박", "배터리 소재", "데이터 스토리지", "조선", "선박 엔진"]) assert(sectorFor({ slug: "x", sectors: [name] }, library), `Manifest sector ${name} maps to the library`);
  const sectorArticle = { slug: "no/own-art", company: "가나다", sectors: ["반도체"], headline: "제목", asOfDate: "2026-08-16" };
  assert(coverCard(sectorArticle, coverDir).endsWith(".jpg"), "Sector art produces a composed list cover");
  assert(shareCard(sectorArticle, shareConfig, coverDir).endsWith(".jpg"), "Sector art produces a composed share card");
  const coverBytes = (headline) => fs.readFileSync(path.join(coverDir, coverCard({ ...sectorArticle, headline }, coverDir)));
  assert(coverBytes("제목 하나").equals(coverBytes("전혀 다른 제목")), "List covers carry no text, so the title is not shown twice");
  const shareBytes = (headline) => fs.readFileSync(path.join(coverDir, shareCard({ ...sectorArticle, headline }, shareConfig, coverDir)));
  assert(!shareBytes("제목 하나").equals(shareBytes("전혀 다른 제목")), "Share cards keep the title");
  assert(coverPrompt({ company: "가나다", headline: "제목" }).includes("가나다: 제목"), "Default prompt derives from the article");
  assert(coverPrompt({ coverSubject: "a blank coin", company: "가나다" }).includes("illustration of a blank coin."), "coverSubject overrides the default prompt");
  fs.rmSync(coverDir, { recursive: true, force: true });
}
assert(read("card-counts.js").includes("/api/article-counts"));
assert(read("index.html").includes('data-counts="/kr/soop-2026-06/" hidden'));
assert(!fs.existsSync(path.join(outDir, "admin")));

// sitemap / feed / robots / llms / urls
const sitemap = read("sitemap.xml");
assert(sitemap.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'));
const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]);
assert.deepStrictEqual(locs.sort(), [
  "https://research.example.com/",
  "https://research.example.com/about/",
  "https://research.example.com/kr/",
  "https://research.example.com/kr/soop-2026-06/",
  "https://research.example.com/privacy/",
  "https://research.example.com/us/",
  "https://research.example.com/us/acme-2026-05/",
]);
assert(sitemap.includes("<loc>https://research.example.com/kr/soop-2026-06/</loc><lastmod>2026-07-02</lastmod>"));
assert(!sitemap.includes("/tags/"));
const feed = read("feed.xml");
assert(feed.includes('<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="ko">'));
assert.strictEqual((feed.match(/<entry>/g) || []).length, 2);
assert(feed.includes("<title>Acme &amp; Co(ACME) | 마진이 돌아섰다 | 2026-05-01</title>"));
assert(feed.includes("<updated>2026-07-02T09:00:00+09:00</updated>"));
assert.strictEqual(read("robots.txt"), "User-agent: *\nAllow: /\nDisallow: /admin\n\nSitemap: https://research.example.com/sitemap.xml\n");
assert(read("llms.txt").includes("- [SOOP(067160) | 순현금이 하방을 받치고, 트래픽 회복이 상방을 연다 | 2026-06-21](https://research.example.com/kr/soop-2026-06/)"));
const llmsFull = read("llms-full.txt");
assert(llmsFull.includes("| PER | 9.8배 |"));
assert(llmsFull.includes("현금 2,480억 원은 시가총액의 30%다. 근거는 1분기 분기보고서다."));
assert(!llmsFull.includes("[red:"));
assert.strictEqual(read("abcdef0123456789.txt"), "abcdef0123456789");
assert(!fs.existsSync(path.join(outDir, "ads.txt")));
const urls = JSON.parse(read("urls.json"));
assert(urls.urls.every(entry => /^[0-9a-f]{64}$/.test(entry.sha256)));

// --- search-console verification meta ---
build({ config: { ...baseConfig, verification: { google: "g-token", naver: "n-token", bing: "" } } });
assert(read("index.html").includes('<meta name="google-site-verification" content="g-token">'));
assert(read("index.html").includes('<meta name="naver-site-verification" content="n-token">'));
assert(!read("index.html").includes("msvalidate.01"));
build();
assert(!read("index.html").includes("site-verification"));

// --- ads on ---
build({ config: { ...baseConfig, adsense: { ...baseConfig.adsense, client: "ca-pub-1234567890123456" } } });
const withAds = read("kr/soop-2026-06/index.html");
assert(withAds.includes('<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-1234567890123456" crossorigin="anonymous"></script>'));
assert.strictEqual((withAds.match(/<ins class="adsbygoogle"/g) || []).length, 3);
for (const slot of ["afterSummary", "midArticle", "endArticle"]) assert(withAds.includes(`data-slot="${slot}"`));
// Ads sit only on section boundaries: never between a table/figure and its section.
for (const match of withAds.matchAll(/<div class="ad"[\s\S]*?<\/div>\n?/g)) {
  const after = withAds.slice(match.index + match[0].length).trimStart();
  assert(/^<(?:h2|section class="sources")/.test(after), `ad must be followed by a section heading: ${after.slice(0, 60)}`);
}
assert(withAds.indexOf('data-slot="endArticle"') < withAds.indexOf('<section class="sources">'));
assert.strictEqual(read("ads.txt"), "google.com, pub-1234567890123456, DIRECT, f08c47fec0942fa0\n");
assert.throws(() => build({ config: { ...baseConfig, adsense: { client: "pub-123" } } }), /adsense\.client/);

// --- refusals ---
assert.throws(() => build({ published: { articles: [{ ...soop, slug: "admin/private" }] } }), /Reserved application slug/);
assert.throws(() => build({ published: { articles: [{ ...soop, slug: "api" }] } }), /Reserved application slug/);
assert.throws(() => build({ published: { articles: [soop, { memo: "analysis-example/kr/Untracked/memo.md", slug: "kr/untracked" }] } }), /not tracked by git/);
assert.throws(() => build({ published: { articles: [{ memo: "analysis-example/kr/NoDate/memo.md", slug: "kr/nodate" }] } }), /기준일/);
assert.throws(() => build({ published: { articles: [{ memo: "analysis-example/kr/Private/memo.md", slug: "kr/private" }] } }), /private holdings\/ledger/);
process.env.KR_PORTFOLIO_GUARD_HOME = path.join(root, "guard-home");
assert.throws(() => build({ published: { articles: [{ memo: "guard-home/memo.md", slug: "kr/guard" }] } }), /private directory/);
delete process.env.KR_PORTFOLIO_GUARD_HOME;
assert.throws(() => build({ published: { articles: [{ ...soop, slug: "KR/SOOP" }] } }), /Invalid slug/);
assert.throws(() => build({ published: { articles: [soop, { ...acme, slug: soop.slug }] } }), /Duplicate slug/);
assert.throws(() => build({ production: true }), /real https baseUrl/);
fs.mkdirSync(path.join(root, "analysis-example/kr/SOOP/assets"), { recursive: true });
fs.writeFileSync(path.join(root, "analysis-example/kr/SOOP/assets/new.png"), PNG);
const withNewImage = fs.readFileSync(path.join(root, soop.memo), "utf8").replace("## Risks", "![새 차트](assets/new.png)\n\n## Risks");
fs.writeFileSync(path.join(root, soop.memo), withNewImage);
git("add", soop.memo);
git("commit", "-q", "-m", "reference untracked image");
assert.throws(() => build(), /Image assets\/new\.png is not tracked/);

// Article overrides remain opt-in, date-consistent, tracked and private-safe.
const originalMemo = fs.readFileSync(path.join(root, soop.memo), "utf8").replace("![새 차트](assets/new.png)\n\n", "");
write("analysis-example/kr/SOOP/article.md", originalMemo.replace("순현금이 하방을 받치고", "기록 해설: 순현금이 하방을 받치고"));
git("add", "analysis-example/kr/SOOP/article.md");
const archiveEntry = { ...soop, article: "analysis-example/kr/SOOP/article.md", archive: true, datePublished: "2026-11-01", dateModified: "2026-11-02" };
build({ published: { articles: [archiveEntry] } });
const archiveHtml = read("kr/soop-2026-06/index.html");
assert(archiveHtml.includes("기록 해설: 순현금"));
assert(archiveHtml.includes("기록 글 · 자료 기준일"));
assert(archiveHtml.includes('datetime="2026-06-21"'));
assert(archiveHtml.includes('사이트 발행 <time datetime="2026-11-01"'));
assert(archiveHtml.includes('최근 편집 <time datetime="2026-11-02"'));
assert(!archiveHtml.includes('원본 리서치 메모 보기'));
assert(!archiveHtml.includes('class="original-link"'));
assert(read("kr/soop-2026-06/memo.md").includes("새 차트"));
assert(read("index.html").includes("기록 글"));
assert(jsonLd(archiveHtml).flat().some(x => JSON.stringify(x).includes("2026-11-01T09:00:00+09:00")));
assert.throws(() => build({ published: { articles: [{ ...archiveEntry, article: "analysis-example/kr/Untracked/memo.md" }] } }), /not tracked/);
assert.throws(() => build({ published: { articles: [{ ...archiveEntry, article: "analysis-example/kr/Private/memo.md" }] } }), /private holdings/);
write(archiveEntry.article, originalMemo.replace("2026-06-21", "2026-06-20"));
assert.throws(() => build({ published: { articles: [archiveEntry] } }), /preserve.*기준일/);

// Build environment wiring and a single shared summary across all discovery surfaces.
const previousKey = process.env.KAKAO_JAVASCRIPT_KEY;
try {
  process.env.KAKAO_JAVASCRIPT_KEY = 'local-fixture-javascript-key';
  const entry = {...archiveEntry, summary:'목록과 검색과 공유에서 같은 공개 요약.', sectors:['인터넷 플랫폼']};
  write(archiveEntry.article, originalMemo);
  build({published:{articles:[entry]}});
  const html = read('kr/soop-2026-06/index.html');
  assert(html.includes('data-kakao-key="local-fixture-javascript-key"'));
  assert(html.includes('https://t1.kakaocdn.net/kakao_js_sdk/2.8.4/kakao.min.js'));
  assert(html.includes('<meta property="og:description" content="목록과 검색과 공유에서 같은 공개 요약.">'));
  assert.equal(JSON.parse(read('search-index.json'))[0].summary, entry.summary);
  assert(read('index.html').includes(entry.summary));
  assert(!html.includes('aria-label="연관글"'));
  assert(!html.includes('aria-label="이어서 읽기"'));
} finally {
  if (previousKey === undefined) delete process.env.KAKAO_JAVASCRIPT_KEY;
  else process.env.KAKAO_JAVASCRIPT_KEY = previousKey;
}

// Long Korean words wrap at measured glyph widths without dropping characters.
const {createCanvas} = require('@napi-rs/canvas');
const {wrap} = require('./share-card');
const measure = createCanvas(1200,630).getContext('2d');
measure.font = '700 52px "Research Korean"';
const longKorean = '가나다라마바사아자차카타파하'.repeat(8);
const wrapped = wrap(measure,longKorean,300);
assert(wrapped.length > 1);
assert(wrapped.every(line=>measure.measureText(line).width<=300));
assert.equal(wrapped.join(''),longKorean);

// --- helpers ---
const numbered = collectCitations("근거 [2]와 [1], 다시 [2]. 코드 `[1]`, 미정 [99], 링크 [3](https://third.example).", ["1. [첫 자료](https://first.example)", "2. [둘째 자료](https://second.example)"]);
assert(numbered.body.includes("근거 ⟦cite:1⟧와 ⟦cite:2⟧, 다시 ⟦cite:1⟧."));
assert(numbered.body.includes("코드 `[1]`, 미정 [99], 링크 3⟦cite:3⟧"));
assert.deepStrictEqual(numbered.sources.map(x => x.url), ["https://second.example", "https://first.example", "https://third.example"]);

const evidence = collectCitations([
  "매출이 늘었다.",
  "",
  "[단독 근거](https://e.example/1)",
  "",
  "| 항목 | 내용 |",
  "| 계약 | 체결했다. [공시](https://e.example/2) · [보도](https://e.example/3) |",
  "",
  "[표 근거](https://e.example/4)",
  "",
  "둔화했다([콜 기록](https://e.example/5)). **판단이다.** [분석](https://e.example/6)",
  "[Fortune](https://e.example/7)은 낙폭을 보도했다.",
  "- [공시 목록](https://e.example/8)",
].join("\n"), []);
assert(evidence.body.startsWith("매출이 늘었다.⟦cite:1⟧\n\n"), "A standalone link joins the previous paragraph as a number");
assert(evidence.body.includes("체결했다.⟦cite:2⟧⟦cite:3⟧|"), "Table-cell evidence keeps only numbers");
assert(evidence.body.includes("\n출처⟦cite:4⟧\n"), "Evidence after a table becomes a source note");
assert(evidence.body.includes("둔화했다⟦cite:5⟧. **판단이다.**⟦cite:6⟧"), "Parenthetical and trailing evidence keep only numbers");
assert(evidence.body.includes("Fortune⟦cite:7⟧은"), "A label that is part of the sentence stays");
assert(evidence.body.includes("- 공시 목록⟦cite:8⟧"), "A list of named links stays");
assert.strictEqual(evidence.sources[1].label, "공시", "The source list keeps the label");
const bibliography = collectCitations("근거 [2], [1].", ["1. Circle 공식 실적 자료, 2026-05-11", "2. SEC: https://sec.example/filing"]);
assert.strictEqual(bibliography.body, "근거 ⟦cite:1⟧, ⟦cite:2⟧.");
assert.deepStrictEqual(bibliography.sources.map(s => s.url), ["https://sec.example/filing", null]);
assert(bibliography.sources[1].label.includes("2026-05-11"));
// Bibliographic sources without URLs remain visible, without an empty hyperlink.
write("analysis-example/us/Acme/memo.md", fs.readFileSync(path.join(root, acme.memo), "utf8") + "\n\n## Sources\n\n- Company annual report, 2026-04-30\n");
build({ published: { articles: [acme] } });
assert(read("us/acme-2026-05/index.html").includes("Company annual report, 2026-04-30</li>"));
assert(!read("us/acme-2026-05/index.html").includes('href=""'));

const cited = collectCitations("본문 [A](https://a.example/x)와 [B](https://b.example/y), 다시 [A2](https://a.example/x).", ["- [A 전체 이름](https://a.example/x)", "- [C](https://c.example/z)"]);
assert.strictEqual(cited.body, "본문 A⟦cite:1⟧와 B⟦cite:2⟧, 다시 A2⟦cite:1⟧.");
assert.deepStrictEqual(cited.sources.map(source => source.label), ["A 전체 이름", "B", "C"]);
assert.deepStrictEqual(extractAnswer("**판단: 매력적이다.** 106,800원은 하단보다 낮다.\n\n| a | b |\n| --- | --- |\n| 1 | 2 |"), { lead: "판단: 매력적이다.", answer: "106,800원은 하단보다 낮다.", rest: "| a | b |\n| --- | --- |\n| 1 | 2 |" });

const previous = { urls: [{ loc: "https://x/a/", sha256: "1" }, { loc: "https://x/b/", sha256: "2" }, { loc: "https://x/gone/", sha256: "3" }] };
const current = { urls: [{ loc: "https://x/a/", sha256: "1" }, { loc: "https://x/b/", sha256: "9" }, { loc: "https://x/new/", sha256: "4" }] };
assert.deepStrictEqual(changedUrls(current, previous), ["https://x/b/", "https://x/new/", "https://x/gone/"]);
assert.deepStrictEqual(changedUrls(current, null), ["https://x/a/", "https://x/b/", "https://x/new/"]);

assert(sameUrls(current, JSON.parse(JSON.stringify(current))));
assert(!sameUrls(current, previous));
assert(!sameUrls(current, null));

fs.rmSync(root, { recursive: true, force: true });
console.log("build-site tests passed");
