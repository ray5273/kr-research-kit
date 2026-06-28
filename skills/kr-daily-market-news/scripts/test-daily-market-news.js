#!/usr/bin/env node

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { DEFAULT_SECTORS, buildSectorDiscoveryQueries, buildSectorStockQueries, collectDailyMarketNews, collectSectorNews, dedupeItems, normalizeNewsDate, normalizeRssPubDate, parseRssItems, readSectorStocks, readWatchlist } = require("./fetch-daily-market-news");
const { buildPublishManifest, renderDailyReport, renderNaverPost } = require("./render-daily-report");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "kr-daily-market-news-"));
const watchlistPath = path.join(root, "watchlist.json");
fs.writeFileSync(watchlistPath, JSON.stringify([
  { ticker: "005930", name: "삼성전자", keywords: ["HBM", "실적"] },
  { ticker: "000660", name: "SK하이닉스", keywords: ["DRAM"] },
], null, 2));

assert.deepStrictEqual(readWatchlist(watchlistPath).map(item => item.ticker), ["005930", "000660"]);
assert.throws(() => {
  const bad = path.join(root, "bad.json");
  fs.writeFileSync(bad, JSON.stringify([{ ticker: "5930", name: "bad" }]));
  readWatchlist(bad);
}, /six-digit/);

const rssFixture = `
<rss><channel>
  <item>
    <title><![CDATA[코스피, 반도체 강세에 상승 마감]]></title>
    <link>https://news.example.com/market1?utm_source=rss</link>
    <pubDate>Sun, 28 Jun 2026 10:20:00 +0900</pubDate>
    <source url="https://news.example.com/rss">Fixture News</source>
    <description><![CDATA[코스피와 코스닥 시장은 반도체 업종 강세와 외국인 수급 개선이 겹치며 상승 마감했다.]]></description>
  </item>
  <item>
    <title>코스피, 반도체 강세에 상승 마감</title>
    <link>https://news.example.com/market1?utm_campaign=dup</link>
    <pubDate>Sun, 28 Jun 2026 10:21:00 +0900</pubDate>
  </item>
  <item>
    <title>전일 기사</title>
    <link>https://news.example.com/old</link>
    <pubDate>Sat, 27 Jun 2026 23:20:00 +0900</pubDate>
  </item>
</channel></rss>`;
const parsed = parseRssItems(rssFixture, { asOfDate: "2026-06-28", source: { name: "Fixture RSS", url: "https://news.example.com/rss" } });
assert.strictEqual(parsed.length, 2);
assert.strictEqual(parsed[0].headline, "코스피, 반도체 강세에 상승 마감");
assert.strictEqual(parsed[0].publishedDate, "2026-06-28");
assert.strictEqual(parsed[0].source, "Fixture News");
assert.strictEqual(normalizeRssPubDate("Sun, 28 Jun 2026 00:30:00 +0000", "2026-06-28"), "2026-06-28");
assert.strictEqual(normalizeNewsDate("어제", "2026-06-28"), "2026-06-27");
assert.strictEqual(normalizeNewsDate("2026.06.28.", "2026-06-28"), "2026-06-28");

assert.strictEqual(dedupeItems([
  { headline: "A", url: "https://x.test/a?utm=1" },
  { headline: "A", url: "https://x.test/a?utm=2" },
  { headline: "B", url: "https://x.test/b" },
]).length, 2);

const sectorStocksPath = path.resolve("examples/kr/daily-sector-stocks.json");
const sectorStocks = readSectorStocks(sectorStocksPath);
for (const sector of DEFAULT_SECTORS) assert.strictEqual(sectorStocks[sector].length, 20);
const sectorQueries = buildSectorStockQueries("반도체/AI", sectorStocks["반도체/AI"]);
assert.strictEqual(sectorQueries.length, 20);
assert.strictEqual(sectorQueries[0].query, "삼성전자 HBM 주식 뉴스");
const sectorDiscovery = buildSectorDiscoveryQueries("반도체/AI", sectorStocks["반도체/AI"]);
assert(sectorDiscovery.query.includes("삼성전자"));
assert(sectorDiscovery.query.includes("주식 뉴스"));

const fixturePath = path.join(root, "fixture.json");
fs.writeFileSync(fixturePath, JSON.stringify({
  marketNews: [
    { headline: "코스피, 반도체 강세에 상승 마감", url: "https://news.example.com/market1", source: "Fixture News", publishedDate: "2026-06-28", articleText: "코스피와 코스닥 시장은 반도체 업종 강세와 외국인 수급 개선이 겹치며 상승 마감했다. 투자자들은 실적 시즌을 앞두고 대형주 흐름을 확인했다." },
    { headline: "환율 하락과 외국인 수급 개선", url: "https://news.example.com/market2", source: "Fixture News", dateLabel: "오늘", description: "이날 코스피는 전날보다 459.28포인트 오른 뒤 ...", articleText: "1996년 7월1일 '한국판 나스닥'을 표방하며 문을 연 코스닥은 그동안 수많은 부침 속에서 성장해왔습니다." },
    { headline: "전일 해외 증시 영향", url: "https://news.example.com/market-old", source: "Fixture News", publishedDate: "2026-06-27" },
    { headline: "날짜 불명 시장 뉴스", url: "https://news.example.com/market-undated", source: "Fixture News" },
  ],
  sectorNews: {
    "반도체/AI": [
      { headline: "반도체 업종 AI 수요 기대", url: "https://news.example.com/sector-chip", source: "Fixture News", publishedDate: "2026-06-28", ticker: "005930", name: "삼성전자" },
      { headline: "반도체 전일 뉴스", url: "https://news.example.com/sector-chip-old", source: "Fixture News", publishedDate: "2026-06-27" },
    ],
  },
  stockNews: {
    "005930": [
      { headline: "삼성전자 HBM 증설 기대", url: "https://news.example.com/samsung", source: "Fixture News", publishedDate: "2026-06-28" },
    ],
  },
  officialSources: [
    { title: "KRX 시장 공지", url: "https://kind.krx.co.kr/example", source: "KRX KIND" },
  ],
}, null, 2));

(async () => {
  const fakeSectorStocks = {
    "반도체/AI": [
      { ticker: "005930", name: "삼성전자", keywords: ["HBM"] },
      { ticker: "000660", name: "SK하이닉스", keywords: ["DRAM"] },
    ],
  };
  const sectorGroups = await collectSectorNews({
    asOfDate: "2026-06-28",
    sectorStocks: fakeSectorStocks,
    warnings: [],
    directRssItems: [
      { headline: "삼성전자 HBM 공급 기대감", url: "https://news.example.com/samsung-hbm", publishedDate: "2026-06-28", source: "Fixture RSS" },
      { headline: "SK하이닉스 DRAM 가격 반등", url: "https://news.example.com/sk-dram", publishedDate: "2026-06-28", source: "Fixture RSS" },
      { headline: "반도체 공통 뉴스", url: "https://news.example.com/common?utm_source=n", publishedDate: "2026-06-28", source: "Fixture RSS" },
      { headline: "반도체 공통 뉴스", url: "https://news.example.com/common?utm_campaign=dup", publishedDate: "2026-06-28", source: "Fixture RSS" },
      { headline: "Google 발견 뉴스", url: "https://news.google.com/rss/articles/example", publishedDate: "2026-06-28", source: "Google News RSS", discovery: true },
    ],
  });
  assert.strictEqual(sectorGroups.find(group => group.sector === "반도체/AI").items.length, 3);
  assert(!sectorGroups.find(group => group.sector === "반도체/AI").items.some(item => item.url.includes("news.google.com")));

  const data = await collectDailyMarketNews({ date: "2026-06-28", watchlist: watchlistPath, fixture: fixturePath });
  assert.strictEqual(data.asOfDate, "2026-06-28");
  assert.strictEqual(data.sourceMode, "fixture");
  assert.strictEqual(data.marketNews.length, 2);
  assert(data.warnings.some(warning => warning.includes("날짜 확인")));
  assert(data.warnings.some(warning => warning.includes("기준일")));
  assert.strictEqual(Object.prototype.hasOwnProperty.call(data, "stockNews"), false);
  assert.strictEqual(data.marketSummary.length, 2);
  assert.strictEqual(data.marketSummary[0].summaryBasis, "headline-theme");
  assert.strictEqual(data.marketSummary[1].summaryBasis, "headline-theme");
  assert(data.marketSummary[0].summary.includes("코스피, 반도체 강세에 상승 마감"));
  assert(data.marketSummary[0].summary.includes("반도체 주도주 수급"));
  assert(data.marketSummary[1].summary.includes("환율 하락과 외국인 수급 개선"));
  assert(data.marketSummary[1].summary.includes("외국인 수급"));
  assert(!data.marketSummary.some(item => item.summary.includes("459.28포인트")));
  assert(!data.marketSummary.some(item => item.summary.includes("...")));
  assert(!data.marketSummary.some(item => item.summary.includes("한국판 나스닥")));
  assert(!data.marketSummary.some(item => item.summary.includes("공모 가격")));
  assert.deepStrictEqual(data.sectorNews.map(group => group.sector), DEFAULT_SECTORS);
  assert.strictEqual(data.sectorNews.length, 10);
  assert(data.themes.some(theme => theme.theme === "반도체 / AI"));
  assert.strictEqual(data.sourceSummary.stockNewsCount, undefined);
  assert.strictEqual(data.sourceSummary.sectorNewsCount, 1);
  assert.strictEqual(data.sourceSummary.officialSourceCount, 1);
  assert(!data.officialSources.some(source => source.source === "DART"));
  assert(data.officialSources.some(source => source.source === "KRX KIND"));

  const reportPath = path.join(root, "daily-news-2026-06-28.md");
  const postPath = path.join(root, "naver-post-2026-06-28.md");
  const liveData = await collectDailyMarketNews({
    date: "2026-06-28",
    watchlist: watchlistPath,
    sectorStocks: fakeSectorStocks,
    directRssItems: [
      { headline: "코스피, 외국인 수급 개선에 상승", url: "https://news.example.com/direct-market", source: "Fixture RSS", publishedDate: "2026-06-28", description: "코스피와 코스닥 시장 흐름" },
      { headline: "삼성전자 HBM 투자 확대", url: "https://news.example.com/direct-sector", source: "Fixture RSS", publishedDate: "2026-06-28", description: "반도체 업종 대표주 뉴스" },
      { headline: "전일 직접 RSS 기사", url: "https://news.example.com/direct-old", source: "Fixture RSS", publishedDate: "2026-06-27" },
    ],
    googleDiscoveryItems: [
      { headline: "코스피 Google 발견 기사", url: "https://news.google.com/rss/articles/google-market", source: "Google News RSS", publishedDate: "2026-06-28", discovery: true },
      { headline: "삼성전자 Google 발견 기사", url: "https://news.google.com/rss/articles/google-sector", source: "Google News RSS", publishedDate: "2026-06-28", discovery: true },
    ],
  });
  assert.strictEqual(liveData.sourceMode, "rss-hybrid");
  assert.strictEqual(liveData.marketNews.length, 1);
  assert.strictEqual(liveData.marketNews[0].url, "https://news.example.com/direct-market");
  assert(!liveData.marketNews.some(item => item.url.includes("news.google.com")));
  assert(liveData.sectorNews.find(group => group.sector === "반도체/AI").items.some(item => item.url === "https://news.example.com/direct-sector"));
  assert(!liveData.sectorNews.flatMap(group => group.items).some(item => item.url.includes("news.google.com")));
  assert.strictEqual(liveData.sourceSummary.discoveryNewsCount, 2);
  fs.writeFileSync(reportPath, renderDailyReport(liveData, { baseDir: root }));
  const livePostMarkdown = renderNaverPost(liveData, { baseDir: root });
  fs.writeFileSync(postPath, livePostMarkdown);
  const liveManifest = buildPublishManifest({ data: liveData, reportPath, postPath, postMarkdown: livePostMarkdown });
  assert.deepStrictEqual(liveManifest.post.linkCards, ["https://news.example.com/direct-market"]);

  const markdown = renderDailyReport(data, { baseDir: root });
  assert(markdown.includes("## 오늘 시장 한 줄"));
  assert(markdown.includes("## 시장 주요 뉴스"));
  assert(markdown.includes("## 업종/테마별 흐름"));
  assert(!markdown.includes("## 관심종목 뉴스"));
  assert(markdown.includes("## 공식 공시/자료"));
  assert(markdown.includes("## 블로그 제목 후보"));
  assert(markdown.includes("## 출처"));
  assert(markdown.includes("매수·매도를 권유하지 않습니다"));
  const postMarkdown = renderNaverPost(data, { baseDir: root });
  assert(!postMarkdown.includes("## 오늘 시장 한 줄"));
  assert(postMarkdown.includes("## 시장 주요 요약"));
  assert(postMarkdown.includes("1. 반도체 업황: 코스피, 반도체 강세에 상승 마감"));
  assert(postMarkdown.includes("2. 금리/환율: 환율 하락과 외국인 수급 개선"));
  assert(!postMarkdown.includes("459.28포인트"));
  assert(!postMarkdown.includes("한국판 나스닥"));
  assert(!postMarkdown.includes("## 블로그 제목 후보"));
  assert(!postMarkdown.includes("## 관심종목 뉴스"));
  assert(!postMarkdown.includes("- 기준일"));
  assert(!postMarkdown.includes("- 생성시각"));
  assert(!postMarkdown.includes("- 수집모드"));
  assert(!/^- /m.test(postMarkdown));
  assert(postMarkdown.includes("| 내용 | 링크 |"));
  assert(postMarkdown.includes("| 업종/테마 | 흐름 | 대표 뉴스 |"));
  assert(postMarkdown.includes("삼성전자: 반도체 업종 AI 수요 기대"));
  for (const sector of DEFAULT_SECTORS) assert(postMarkdown.includes(`| ${sector} |`));
  const marketSection = postMarkdown.split("## 시장 주요 뉴스")[1].split("## 업종/테마별 흐름")[0];
  assert(marketSection.includes("1. 코스피, 반도체 강세에 상승 마감\nhttps://news.example.com/market1"));
  assert(marketSection.includes("2. 환율 하락과 외국인 수급 개선\nhttps://news.example.com/market2"));
  assert(!marketSection.includes("- ["));
  assert(!marketSection.includes("]("));
  assert(!marketSection.includes("—"));
  assert(!postMarkdown.includes("## 수집 경고"));
  assert(postMarkdown.includes("### 수집 참고"));
  assert(postMarkdown.includes("시장 주요 뉴스는 기준일 기사만 2건 확인"));
  assert(!postMarkdown.split("### 수집 참고")[1].includes("- "));
  assert(postMarkdown.includes("특이 뉴스 제한적"));
  fs.writeFileSync(reportPath, markdown);
  fs.writeFileSync(postPath, postMarkdown);
  const manifest = buildPublishManifest({ data, reportPath, postPath, postMarkdown });
  assert.strictEqual(manifest.contentType, "daily-market-news");
  assert.strictEqual(manifest.automation.scheduledPublishAllowed, true);
  assert.strictEqual(manifest.automation.duplicateDate, "2026-06-28");
  assert.strictEqual(manifest.post.markdownSha256.length, 64);
  assert.deepStrictEqual(manifest.post.linkCards, ["https://news.example.com/market1", "https://news.example.com/market2"]);
  console.log("daily market-news tests passed");
})().catch(error => {
  console.error(error);
  process.exit(1);
});
