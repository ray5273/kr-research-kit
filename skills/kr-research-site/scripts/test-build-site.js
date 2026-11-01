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
assert(/<meta name="description" content="순현금이 하방을 받치고, 트래픽 회복이 상방을 연다\. 현금 2,480억 원은 시가총액의 30%다\./.test(article));
assert(article.includes('<meta property="og:image" content="https://research.example.com/kr/soop-2026-06/assets/naver-thumbnail.png">'));
assert(article.includes('<p class="lead">순현금이 하방을 받치고, 트래픽 회복이 상방을 연다</p>'));
assert(article.includes("기준일 2026-06-21 · 최근 업데이트 2026-07-02"));
assert(article.includes('<span class="tone-pos">배당수익률 4%가 하방을 받친다.</span>'));
assert(article.includes('<span class="tone-neg">별풍선 역성장이 부담이다.</span>'));
assert(article.includes('<span class="tone-spec">하반기 회복 가능성이 있다.</span>'));
assert(article.includes('class="legend"'));
assert(article.includes('<img src="assets/SOOP-chart.png" alt="SOOP 주가 추세" width="1" height="1"'));
assert(fs.existsSync(path.join(outDir, "kr/soop-2026-06/assets/SOOP-chart.png")));
assert(article.includes("<table>") && article.includes('<td class="r">9.8배</td>'));
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
assert.strictEqual(read("robots.txt"), "User-agent: *\nAllow: /\n\nSitemap: https://research.example.com/sitemap.xml\n");
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

// --- helpers ---
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
