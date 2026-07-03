#!/usr/bin/env node

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  DEFAULT_SECTORS,
  buildSectorDiscoveryQueries,
  buildSectorStockQueries,
  collectDailyMarketNews,
  collectSectorNews,
  dedupeItems,
  normalizeNewsDate,
  normalizeRssPubDate,
  parseRssItems,
  rankNewsItems,
  readSectorStocks,
  readWatchlist,
} = require("./fetch-daily-market-news");
const {
  buildPublishManifest,
  renderDailyReport,
  renderNaverPost,
  titleCandidates,
} = require("./render-daily-report");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "us-daily-market-news-"));
const watchlistPath = path.join(root, "watchlist.json");
fs.writeFileSync(watchlistPath, JSON.stringify([
  { ticker: "NVDA", name: "NVIDIA", keywords: ["AI", "GPU"] },
  { ticker: "BRK.B", name: "Berkshire Hathaway", keywords: ["insurance"] },
], null, 2));

assert.deepStrictEqual(readWatchlist(watchlistPath).map(item => item.ticker), ["NVDA", "BRK.B"]);
assert.throws(() => {
  const bad = path.join(root, "bad.json");
  fs.writeFileSync(bad, JSON.stringify([{ ticker: "005930", name: "bad" }]));
  readWatchlist(bad);
}, /U\.S\.-style ticker/);

const rssFixture = `
<rss><channel>
  <item>
    <title><![CDATA[S&P 500 rises as Nvidia lifts Nasdaq into the close]]></title>
    <link>https://news.example.com/market1?utm_source=rss</link>
    <pubDate>Sun, 28 Jun 2026 16:20:00 -0400</pubDate>
    <source url="https://news.example.com/rss">Fixture News</source>
    <description><![CDATA[Wall Street ended higher as AI chip demand helped megacap technology shares.]]></description>
  </item>
  <item>
    <title>S&P 500 rises as Nvidia lifts Nasdaq into the close</title>
    <link>https://news.example.com/market1?utm_campaign=dup</link>
    <pubDate>Sun, 28 Jun 2026 16:21:00 -0400</pubDate>
  </item>
  <item>
    <title>Old market article</title>
    <link>https://news.example.com/old</link>
    <pubDate>Sat, 27 Jun 2026 23:20:00 -0400</pubDate>
  </item>
</channel></rss>`;
const parsed = parseRssItems(rssFixture, { asOfDate: "2026-06-28", source: { name: "Fixture RSS", url: "https://news.example.com/rss" } });
assert.strictEqual(parsed.length, 2);
assert.strictEqual(parsed[0].publishedDate, "2026-06-28");
assert.strictEqual(parsed[0].source, "Fixture News");
assert.strictEqual(normalizeRssPubDate("Sun, 28 Jun 2026 01:30:00 +0000", "2026-06-27"), "2026-06-27");
assert.strictEqual(normalizeNewsDate("2026.06.28.", "2026-06-28"), "2026-06-28");

assert.strictEqual(dedupeItems([
  { headline: "A", url: "https://x.test/a?utm_source=1" },
  { headline: "A", url: "https://x.test/a?utm_campaign=2" },
  { headline: "B", url: "https://x.test/b" },
]).length, 2);

const rankedMarketNews = rankNewsItems([
  { headline: "Small cap announces secondary offering", url: "https://news.example.com/raise", publishedDate: "2026-06-28" },
  { headline: "S&P 500 and Nasdaq close higher as Treasury yields fall", url: "https://news.example.com/close", publishedDate: "2026-06-28" },
  { headline: "After hours individual stock jumps", url: "https://news.example.com/after", publishedDate: "2026-06-28" },
]);
assert.strictEqual(rankedMarketNews[0].url, "https://news.example.com/close");

const recencyRanked = rankNewsItems([
  { headline: "S&P 500 rises as megacap tech gains", url: "https://news.example.com/am", publishedDate: "2026-06-28", publishedAt: "2026-06-28T10:00:00-04:00" },
  { headline: "S&P 500 closes lower as Treasury yields rise", url: "https://news.example.com/pm-close", publishedDate: "2026-06-28", publishedAt: "2026-06-28T16:10:00-04:00" },
]);
assert.strictEqual(recencyRanked[0].url, "https://news.example.com/pm-close");
assert(recencyRanked[0].rankScore > recencyRanked[1].rankScore);

const sectorStocksPath = path.resolve("examples/us/daily-sector-stocks.json");
const sectorStocks = readSectorStocks(sectorStocksPath);
for (const sector of DEFAULT_SECTORS) assert(sectorStocks[sector].length >= 3);
const sectorQueries = buildSectorStockQueries("Technology/AI", sectorStocks["Technology/AI"]);
assert(sectorQueries[0].query.includes("stock market news"));
const sectorDiscovery = buildSectorDiscoveryQueries("Technology/AI", sectorStocks["Technology/AI"]);
assert(sectorDiscovery.query.includes("NVIDIA"));

const fixturePath = path.join(root, "fixture.json");
fs.writeFileSync(fixturePath, JSON.stringify({
  marketNews: [
    { headline: "S&P 500 rises as Nvidia lifts Nasdaq into the close", url: "https://news.example.com/market1", source: "Fixture News", publishedDate: "2026-06-28", publishedAt: "2026-06-28T16:20:00-04:00", description: "Wall Street ended higher as AI chip demand helped megacap technology shares." },
    { headline: "Treasury yields fall after inflation data", url: "https://news.example.com/market2", source: "Fixture News", dateLabel: "today", description: "Bond yields moved lower after a softer inflation reading." },
    { headline: "Old Wall Street article", url: "https://news.example.com/market-old", source: "Fixture News", publishedDate: "2026-06-27" },
    { headline: "Undated market article", url: "https://news.example.com/market-undated", source: "Fixture News" },
  ],
  sectorNews: {
    "Technology/AI": [
      { headline: "NVIDIA AI chip demand boosts technology shares", url: "https://news.example.com/sector-tech", source: "Fixture News", publishedDate: "2026-06-28", ticker: "NVDA", name: "NVIDIA" },
    ],
  },
  stockNews: {
    NVDA: [
      { headline: "NVIDIA watchlist item should not appear", url: "https://news.example.com/nvda", source: "Fixture News", publishedDate: "2026-06-28" },
    ],
  },
  officialSources: [
    { title: "Federal Reserve calendar", url: "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm", source: "Federal Reserve" },
  ],
}, null, 2));

(async () => {
  const fakeSectorStocks = {
    "Technology/AI": [
      { ticker: "NVDA", name: "NVIDIA", keywords: ["AI"] },
      { ticker: "MSFT", name: "Microsoft", keywords: ["cloud"] },
    ],
  };
  const sectorGroups = await collectSectorNews({
    asOfDate: "2026-06-28",
    sectorStocks: fakeSectorStocks,
    warnings: [],
    directRssItems: [
      { headline: "NVIDIA AI chip demand lifts technology shares", url: "https://news.example.com/nvidia-ai", publishedDate: "2026-06-28", source: "Fixture RSS" },
      { headline: "Microsoft cloud growth helps software stocks", url: "https://news.example.com/msft-cloud", publishedDate: "2026-06-28", source: "Fixture RSS" },
      { headline: "Google discovery item", url: "https://news.google.com/rss/articles/example", publishedDate: "2026-06-28", source: "Google News RSS", discovery: true },
    ],
  });
  assert.strictEqual(sectorGroups.find(group => group.sector === "Technology/AI").items.length, 2);
  assert(!sectorGroups.flatMap(group => group.items).some(item => item.url.includes("news.google.com")));

  const data = await collectDailyMarketNews({ date: "2026-06-28", watchlist: watchlistPath, fixture: fixturePath });
  assert.strictEqual(data.reportType, "us-daily-market-news");
  assert.strictEqual(data.sourceMode, "fixture");
  assert.strictEqual(data.marketNews.length, 2);
  assert(data.warnings.some(warning => warning.includes("날짜 확인")));
  assert(data.warnings.some(warning => warning.includes("기준일")));
  assert.strictEqual(Object.prototype.hasOwnProperty.call(data, "stockNews"), false);
  assert.strictEqual(data.marketSummary.length, 2);
  assert.deepStrictEqual(data.sectorNews.map(group => group.sector), DEFAULT_SECTORS);
  assert.strictEqual(data.sectorNews.length, 11);
  assert(data.themes.some(theme => theme.theme === "AI / Semiconductors"));
  assert.strictEqual(data.sourceSummary.stockNewsCount, undefined);
  assert.strictEqual(data.sourceSummary.officialSourceCount, 1);

  const liveData = await collectDailyMarketNews({
    date: "2026-06-28",
    watchlist: watchlistPath,
    sectorStocks: fakeSectorStocks,
    directRssItems: [
      { headline: "S&P 500 closes higher as Fed rate-cut bets rise", url: "https://news.example.com/direct-market", source: "Fixture RSS", publishedDate: "2026-06-28", description: "Wall Street stock market close" },
      { headline: "NVIDIA AI chip demand lifts technology sector", url: "https://news.example.com/direct-sector", source: "Fixture RSS", publishedDate: "2026-06-28", description: "Technology sector news" },
    ],
    googleDiscoveryItems: [
      { headline: "S&P 500 Google discovery", url: "https://news.google.com/rss/articles/google-market", source: "Google News RSS", publishedDate: "2026-06-28", discovery: true },
    ],
  });
  assert.strictEqual(liveData.sourceMode, "rss-hybrid");
  assert.strictEqual(liveData.marketNews[0].url, "https://news.example.com/direct-market");
  assert(liveData.marketNews.some(item => item.url.includes("news.google.com")));
  assert.strictEqual(liveData.sourceSummary.marketNewsDirectCount, 1);
  assert.strictEqual(liveData.sourceSummary.marketNewsDiscoveryFallbackCount, 1);
  assert(liveData.sectorNews.find(group => group.sector === "Technology/AI").items.some(item => item.url === "https://news.example.com/direct-sector"));
  assert.strictEqual(liveData.sourceSummary.discoveryNewsCount, 1);

  const reportPath = path.join(root, "daily-news-2026-06-28.md");
  const postPath = path.join(root, "naver-post-2026-06-28.md");
  const markdown = renderDailyReport(data, { baseDir: root });
  const postMarkdown = renderNaverPost(data, { baseDir: root });
  fs.writeFileSync(reportPath, markdown);
  fs.writeFileSync(postPath, postMarkdown);

  assert(markdown.includes("# 미국 시장 데일리 뉴스"));
  assert(markdown.includes("## 오늘 시장 한 줄"));
  assert(markdown.includes("## 시장 주요 뉴스"));
  assert(markdown.includes("## 업종/테마별 흐름"));
  assert(markdown.includes("## 블로그 제목 후보"));
  assert(!markdown.includes("## 관심종목 뉴스"));
  assert(titleCandidates(data)[0].includes("S&P 500"));

  assert(!postMarkdown.includes("## 오늘 시장 한 줄"));
  assert(postMarkdown.includes("## 시장 주요 요약"));
  assert(!postMarkdown.includes("## 블로그 제목 후보"));
  assert(!/^- /m.test(postMarkdown));
  assert(postMarkdown.includes("| Technology/AI |"));
  const marketSection = postMarkdown.split("## 시장 주요 뉴스")[1].split("## 업종/테마별 흐름")[0];
  assert(marketSection.includes("| # | 구분 | 내용 |"));
  assert(marketSection.includes("| 1 | 원문 제목 |"));
  assert(marketSection.includes("|  | 한국어 정리 |"));
  assert(!marketSection.includes("|   |   |   |"));
  assert(marketSection.includes("https://news.example.com/market1"));
  assert(!marketSection.includes("- ["));
  assert(!marketSection.includes("]("));
  assert(!postMarkdown.includes("## 기사 번역/요약"));
  assert(!postMarkdown.includes("## 업종별 대표 뉴스 번역/요약"));
  assert(!postMarkdown.includes("요약:"));
  assert(postMarkdown.includes("| 업종/테마 | 대표 뉴스 |"));
  assert(!postMarkdown.includes("기사 수"));
  assert(postMarkdown.includes("<br>"));
  assert(!postMarkdown.includes("## 수집 경고"));
  assert(postMarkdown.includes("### 수집 참고"));

  const manifest = buildPublishManifest({ data, reportPath, postPath, postMarkdown });
  assert.strictEqual(manifest.contentType, "daily-market-news");
  assert.strictEqual(manifest.automation.scheduledPublishAllowed, true);
  assert.strictEqual(manifest.automation.duplicateScope, "us-daily-market-news");
  assert.strictEqual(manifest.post.company, "미국 시장");
  assert.deepStrictEqual(manifest.post.linkCards, ["https://news.example.com/market1", "https://news.example.com/market2"]);

  console.log("us daily market-news tests passed");
})().catch(error => {
  console.error(error);
  process.exit(1);
});
