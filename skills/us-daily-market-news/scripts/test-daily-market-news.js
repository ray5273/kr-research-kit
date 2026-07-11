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
  collectEvidenceReport,
  collectPublisherCandidates,
  collectPublisherEvidenceReport,
  collectFeaturedStocks,
  collectSectorNews,
  articleBodyFromHtml,
  articleMatchesHeadline,
  dedupeItems,
  normalizeNewsDate,
  normalizeRssPubDate,
  parseRssItems,
  rankNewsItems,
  readSectorStocks,
  readPublisherCandidates,
  readWatchlist,
} = require("./fetch-daily-market-news");
const { validateEditorial } = require("./article-evidence");
const {
  buildPublishManifest,
  reportQualityGate,
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
const publisherCandidatesPath = path.join(root, "publisher-candidates.json");
fs.writeFileSync(publisherCandidatesPath, JSON.stringify({ candidates: [{ url: "https://publisher.example.com/article", headline: "Publisher article with a direct canonical URL", source: "Fixture Publisher", publishedDate: "2026-06-28", articleText: "Readable body" }] }));
assert.strictEqual(readPublisherCandidates(publisherCandidatesPath)[0].sourceRole, "publisher-web");
assert.throws(() => readPublisherCandidates({ candidates: [{ url: "https://news.google.com/rss/articles/example", headline: "Google aggregate", source: "Google News" }] }), /Google News URL/);
assert(articleBodyFromHtml("<html><body><p>NVIDIA demand remained strong across cloud customers and data centers during the regular session.</p><p>The second paragraph supplies enough readable article evidence for a valid feature candidate.</p><p>A third paragraph makes the test body safely longer than the minimum extraction threshold.</p></body></html>").length >= 180);
assert.strictEqual(articleMatchesHeadline("Vodafone shares rose after a large stake changed hands. The company described its telecom strategy and investors reacted to the transaction with heavier trading volume.", "NVIDIA AI chip demand lifts technology shares"), false);
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
    { headline: "S&P 500 rises as Nvidia lifts Nasdaq into the close", url: "https://news.example.com/market1", source: "Fixture News", publishedDate: "2026-06-28", publishedAt: "2026-06-28T16:20:00-04:00", description: "Wall Street ended higher as AI chip demand helped megacap technology shares.", articleText: "Wall Street ended higher as AI chip demand helped megacap technology shares. NVIDIA shares led semiconductor gains while investors welcomed easing inflation expectations. The closing report described broad participation across large technology companies and noted that the Nasdaq finished higher. This readable fixture article supplies the required source evidence for the Korean summary." },
    { headline: "Treasury yields fall after inflation data", url: "https://news.example.com/market2", source: "Fixture News", dateLabel: "today", description: "Bond yields moved lower after a softer inflation reading.", articleText: "Bond yields moved lower after a softer inflation reading. The report said the market reassessed the likely path for interest rates and that equity indexes recovered into the close. Investors focused on the policy implications of the data rather than a single company event. This readable fixture article supplies the required source evidence for the Korean summary." },
    { headline: "Old Wall Street article", url: "https://news.example.com/market-old", source: "Fixture News", publishedDate: "2026-06-27" },
    { headline: "Undated market article", url: "https://news.example.com/market-undated", source: "Fixture News" },
  ],
  sectorNews: {
    "Technology/AI": [
      { headline: "NVIDIA AI chip demand boosts technology shares", url: "https://news.example.com/sector-tech", source: "Fixture News", publishedDate: "2026-06-28", ticker: "NVDA", name: "NVIDIA" },
    ],
  },
  featuredStocks: [
    { ticker: "NVDA", name: "NVIDIA", sector: "Technology/AI", headline: "NVIDIA AI chip demand lifts technology shares", url: "https://news.example.com/feature-nvda", source: "Fixture News", publishedDate: "2026-06-28", articleText: "NVIDIA said demand for AI chips remained strong and the article described broad technology-share gains. The report connected data-center orders with investor interest in the company. It also described the company as a focal point for the semiconductor group during the regular session. This is sufficient readable body evidence for the fixture.", quote: { date: "2026-06-28", price: 150, changePct: 2.1 } },
    { ticker: "MSFT", name: "Microsoft", sector: "Technology/AI", headline: "Microsoft cloud growth supports software shares", url: "https://news.example.com/feature-msft", source: "Fixture News", publishedDate: "2026-06-28", articleText: "Microsoft cloud growth supported software shares in the regular session, according to the article. The report described enterprise demand for cloud services and AI tools. Investors focused on the revenue outlook and the company's position in business software. This is sufficient readable body evidence for the fixture.", quote: { date: "2026-06-28", price: 500, changePct: 1.2 } },
    { ticker: "PEP", name: "PepsiCo", sector: "Consumer Staples", headline: "PepsiCo earnings miss estimates as U.S. consumers tighten budgets", url: "https://news.example.com/feature-pep", source: "Fixture News", publishedDate: "2026-06-28", articleText: "PepsiCo reported weaker-than-expected quarterly earnings as U.S. consumers tightened their budgets. International demand remained resilient, but domestic demand weighed on the result. The article discussed the company's outlook for consumer staples and its regular-session trading response. This is sufficient readable body evidence for the fixture.", quote: { date: "2026-06-28", price: 145, changePct: -1.8 } }
  ],
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
    Industrials: [
      { ticker: "GE", name: "GE Aerospace", keywords: ["aerospace"] },
    ],
  };
  const sectorGroups = await collectSectorNews({
    asOfDate: "2026-06-28",
    sectorStocks: fakeSectorStocks,
    warnings: [],
    directRssItems: [
      { headline: "NVIDIA AI chip demand lifts technology shares", url: "https://news.example.com/nvidia-ai", publishedDate: "2026-06-28", source: "Fixture RSS" },
      { headline: "Microsoft cloud growth helps software stocks", url: "https://news.example.com/msft-cloud", publishedDate: "2026-06-28", source: "Fixture RSS" },
      { headline: "Fund grows its holdings in NVIDIA", url: "https://news.example.com/nvidia-holdings", publishedDate: "2026-06-28", source: "Fixture RSS" },
      { headline: "GE Aerospace position lessened by asset manager", url: "https://news.example.com/ge-position", publishedDate: "2026-06-28", source: "Fixture RSS" },
      { headline: "GE Aerospace is a fund's 6th largest position", url: "https://news.example.com/ge-largest-position", publishedDate: "2026-06-28", source: "Fixture RSS" },
      { headline: "Google discovery item", url: "https://news.google.com/rss/articles/example", publishedDate: "2026-06-28", source: "Google News RSS", discovery: true },
    ],
  });
  assert.strictEqual(sectorGroups.find(group => group.sector === "Technology/AI").items.length, 2);
  assert(!sectorGroups.flatMap(group => group.items).some(item => item.url.includes("nvidia-holdings")));
  assert(!sectorGroups.flatMap(group => group.items).some(item => item.url.includes("ge-position")));
  assert(!sectorGroups.flatMap(group => group.items).some(item => item.url.includes("ge-largest-position")));
  assert(!sectorGroups.flatMap(group => group.items).some(item => item.url.includes("news.google.com")));

  const featured = await collectFeaturedStocks({
    asOfDate: "2026-06-28",
    sectorStocks: fakeSectorStocks,
    sectorNews: [{ sector: "Technology/AI", items: [
      { headline: "NVIDIA AI chip demand lifts technology shares", url: "https://news.example.com/nvda", sourceRole: "direct-rss", publishedDate: "2026-06-28", articleText: "NVIDIA said AI chip demand remained strong across cloud and data-center customers. The readable report described regular-session investor interest, supplier demand, and the company’s role in semiconductor spending. It also explained why the company was a featured stock that day with source-backed detail." },
      { headline: "Unrelated AI headline", url: "https://news.example.com/other", sourceRole: "direct-rss", publishedDate: "2026-06-28", articleText: "This article uses only a broad artificial-intelligence reference and names no seeded company. It contains enough words to pass the length test, but must not become a featured stock because it has no matching ticker or company name in the body text at all." },
    ] }],
    stockQuotes: { NVDA: { date: "2026-06-28", price: 150, previousClose: 147, change: 3, changePct: 2.04, source: "fixture", sourceUrl: "https://quote.example.com/NVDA" } },
  });
  assert.strictEqual(featured.length, 1);
  assert.strictEqual(featured[0].ticker, "NVDA");
  assert.strictEqual(featured[0].quote.changePct, 2.04);

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
      { headline: "S&P 500 closes higher as Fed rate-cut bets rise", url: "https://news.example.com/direct-market", source: "Fixture RSS", publishedDate: "2026-06-28", description: "Wall Street stock market close", articleText: "Wall Street stock market close coverage described the S&P 500 finishing higher as investors considered rate-cut expectations. The full fixture body provides enough evidence for an article summary and contains no unsupported claims. It also notes broad index participation during the regular session." },
      { headline: "NVIDIA AI chip demand lifts technology sector", url: "https://news.example.com/direct-sector", source: "Fixture RSS", publishedDate: "2026-06-28", description: "Technology sector news", articleText: "NVIDIA AI chip demand lifted technology shares during the regular session. The fixture report described data-center demand and semiconductor investor interest. The readable body is deliberately long enough to qualify for article-backed rendering." },
    ],
    googleDiscoveryItems: [
      { headline: "S&P 500 Google discovery", url: "https://news.google.com/rss/articles/google-market", source: "Google News RSS", publishedDate: "2026-06-28", discovery: true },
    ],
  });
  assert.strictEqual(liveData.sourceMode, "rss-hybrid");
  assert.strictEqual(liveData.marketNews[0].url, "https://news.example.com/direct-market");
  assert(!liveData.marketNews.some(item => item.url.includes("news.google.com")));
  assert(!liveData.marketNews.some(item => item.headline === "S&P 500 Google discovery"));
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
  assert(titleCandidates(data)[0].includes("NVIDIA"));

  assert(!postMarkdown.includes("## 오늘 시장 한 줄"));
  assert(postMarkdown.includes("## 시장 주요 요약"));
  assert(postMarkdown.includes("## 특징주 뉴스"));
  assert(postMarkdown.includes("NVIDIA (NVDA)"));
  assert(postMarkdown.includes("150.00 (+2.10%)"));
  assert(!postMarkdown.includes("## 블로그 제목 후보"));
  assert(!/^- /m.test(postMarkdown));
  const marketSection = postMarkdown.split("## 시장 주요 뉴스")[1].split("## 출처")[0];
  assert(marketSection.includes("1. S&P 500 rises as Nvidia lifts Nasdaq into the close"));
  assert(marketSection.includes("한국어 번역:"));
  assert(marketSection.includes("핵심 내용:"));
  assert(!marketSection.includes("| # | 구분 | 내용 |"));
  assert(marketSection.includes("https://news.example.com/market1"));
  assert(!marketSection.includes("- ["));
  assert(!marketSection.includes("]("));
  assert(!postMarkdown.includes("## 기사 번역/요약"));
  assert(!postMarkdown.includes("확인해야 합니다"));
  assert(!postMarkdown.includes("요약:"));
  assert(!postMarkdown.includes("원문은"));
  assert(!postMarkdown.includes("## 업종/테마별 흐름"));
  assert(!postMarkdown.includes("| # | 종목 | 정규장 반응 |"));
  assert(!postMarkdown.includes("## 수집 경고"));
  assert(postMarkdown.includes("### 수집 참고"));

  const manifest = buildPublishManifest({ data, reportPath, postPath, postMarkdown });
  assert.strictEqual(manifest.contentType, "daily-market-news");
  assert.strictEqual(manifest.automation.scheduledPublishAllowed, false);
  assert(manifest.automation.qualityGate.reasons.some(reason => reason.includes("fixture")));
  assert.strictEqual(manifest.automation.duplicateScope, "us-daily-market-news");
  assert.strictEqual(manifest.post.company, "미국 시장");
  assert.deepStrictEqual(manifest.post.linkCards, ["https://news.example.com/feature-nvda", "https://news.example.com/feature-msft", "https://news.example.com/feature-pep", "https://news.example.com/market1", "https://news.example.com/market2"]);

  const snapshot = {
    asOfDate: "2026-06-28",
    indexes: [
      { name: "S&P 500", price: 6100, changePct: 0.4 },
      { name: "Nasdaq Composite", price: 20100, changePct: 0.7 },
      { name: "Dow Jones", price: 44500, changePct: 0.1 },
      { name: "Russell 2000", price: 2200, changePct: -0.3 },
    ],
    sectors: DEFAULT_SECTORS.map((sector, index) => ({
      sector,
      name: sector === "Technology/AI" ? "Technology" : sector,
      symbol: ["XLK", "XLC", "XLY", "XLP", "XLF", "XLV", "XLI", "XLE", "XLB", "XLU", "XLRE"][index],
      changePct: 1.1 - index * 0.2,
    })),
  };
  const publishableData = {
    ...data,
    sourceMode: "rss-hybrid",
    marketSnapshot: snapshot,
    marketNews: [
      ...data.marketNews,
      { headline: "S&P 500 and Nasdaq end mixed as technology shares rotate", url: "https://news.example.com/market3", source: "Fixture RSS", sourceRole: "direct-rss", publishedDate: "2026-06-28", articleText: "Technology and semiconductor shares rotated late in the session while the S&P 500 and Nasdaq finished with mixed moves. The fixture body describes AI-related demand and changing leadership across large-cap technology companies. It supplies a readable article body so this item can satisfy the body-backed market-news quality gate." },
    ].map(item => ({ ...item, sourceRole: "direct-rss" })),
    sectorNews: DEFAULT_SECTORS.map((sector, index) => ({
      sector,
      items: index < 4 ? [{ headline: `${sector} sector closes with a material move`, url: `https://news.example.com/sector-${index}`, sourceRole: "direct-rss", publishedDate: "2026-06-28" }] : [],
    })),
    featuredStocks: data.featuredStocks,
    sourceSummary: { ...data.sourceSummary, marketNewsDirectCount: 3 },
  };
  const qualityGate = reportQualityGate(publishableData);
  assert.strictEqual(qualityGate.passed, true);
  const publishablePost = renderNaverPost(publishableData, { baseDir: root });
  assert(publishablePost.includes("## 특징주 뉴스"));
  assert(publishablePost.includes("NVIDIA (NVDA)"));
  const publishableManifest = buildPublishManifest({ data: publishableData, reportPath, postPath, postMarkdown });
  assert.strictEqual(publishableManifest.automation.scheduledPublishAllowed, true);

  const headlineOnly = structuredClone(publishableData);
  headlineOnly.marketNews = [{
    headline: "PepsiCo’s Dividend Could Turn Patience Into Real Profit",
    url: "https://news.example.com/pepsi-headline-only",
    sourceRole: "discovery-rss",
    discovery: true,
    publishedDate: "2026-06-28",
    evidenceText: "PepsiCo’s Dividend Could Turn Patience Into Real Profit",
    evidenceType: "rss-headline",
  }];
  headlineOnly.featuredStocks = [];
  const headlineOnlyPost = renderNaverPost(headlineOnly, { baseDir: root });
  assert(!headlineOnlyPost.includes("PepsiCo’s Dividend Could Turn Patience Into Real Profit"));
  assert(!headlineOnlyPost.includes("펩시코 배당의 장기 투자 매력 조명"));

  const missingSnapshotDate = structuredClone(publishableData);
  delete missingSnapshotDate.marketSnapshot.asOfDate;
  assert.strictEqual(reportQualityGate(missingSnapshotDate).passed, false);

  const duplicateIndexes = structuredClone(publishableData);
  duplicateIndexes.marketSnapshot.indexes = Array.from({ length: 4 }, () => ({ name: "S&P 500", price: 6100, changePct: 0.4 }));
  assert.strictEqual(reportQualityGate(duplicateIndexes).passed, false);

  const discoveryMasqueradingAsDirect = structuredClone(publishableData);
  discoveryMasqueradingAsDirect.marketNews = discoveryMasqueradingAsDirect.marketNews.map((item, index) => ({
    ...item,
    url: `https://news.google.com/rss/articles/${index}`,
    sourceRole: "discovery-fallback",
    discovery: true,
  }));
  discoveryMasqueradingAsDirect.sourceSummary.marketNewsDirectCount = 99;
  const discoveryGate = reportQualityGate(discoveryMasqueradingAsDirect);
  assert.strictEqual(discoveryGate.passed, false);
  assert.strictEqual(discoveryGate.metrics.directMarketNewsCount, 0);

  const staleSectorNews = structuredClone(publishableData);
  staleSectorNews.sectorNews = staleSectorNews.sectorNews.map(group => ({
    ...group,
    items: group.items.map(item => ({ ...item, publishedDate: "2026-06-27" })),
  }));
  const staleSectorGate = reportQualityGate(staleSectorNews);
  assert.strictEqual(staleSectorGate.passed, false);
  assert.strictEqual(staleSectorGate.metrics.linkedSectorCount, 0);

  const evidenceBody = sentence => `${sentence} The report provides additional context about the market event, names the companies involved, and explains the relevant investor focus during the regular trading session. It also describes the reported figures, the comparison period, and the stated reason investors were watching the development. This additional source text is retained solely to ensure the fixture satisfies the minimum article-body extraction threshold for evidence-backed editorial review.`;
  const evidenceSectorStocks = {
    "Technology/AI": [{ ticker: "NVDA", name: "NVIDIA", keywords: ["AI", "chip"] }],
    Financials: [{ ticker: "JPM", name: "JPMorgan", keywords: ["bank", "earnings"] }],
  };
  const evidenceEditorial = {
    "https://news.example.com/evidence-market": { headlineKo: "국채 금리 하락에 미국 증시 반등", summaryKo: "완화된 물가 지표 이후 국채 금리가 내렸고, 금리 경로 재평가가 주가지수 회복으로 이어졌다고 보도했습니다.", evidenceIds: ["e1"] },
    "https://news.example.com/evidence-nvda": { headlineKo: "엔비디아 AI 수요와 데이터센터 투자", summaryKo: "엔비디아는 AI 칩과 데이터센터 수요가 강세를 이어가고 있다고 밝혔고, 이 흐름이 반도체 투자 심리를 지지했습니다.", evidenceIds: ["e1"] },
    "https://news.example.com/evidence-jpm": { headlineKo: "은행 실적 앞둔 금융주 밸류에이션", summaryKo: "은행 실적 발표를 앞두고 금융 업종의 예상 이익 대비 밸류에이션이 과거보다 낮게 형성됐다는 분석이 제시됐습니다.", evidenceIds: ["e1"] },
  };
  const publisherFallbackCandidates = await collectPublisherCandidates({
    publisherSources: [
      { id: "yahoo", name: "Yahoo Finance", sectionUrl: "https://finance.yahoo.com/topic/stock-market-news/", hosts: ["finance.yahoo.com"], priority: 1 },
      { id: "ap", name: "AP News", sectionUrl: "https://apnews.com/hub/business", hosts: ["apnews.com"], priority: 2 },
    ],
    publisherSectionFetcher: async url => {
      if (url.includes("yahoo")) throw new Error("HTTP 429");
      return '<a href="https://apnews.com/article/evidence-market">S&P 500 and Nasdaq recover as Treasury yields fall after inflation data</a>';
    },
    warnings: [],
  });
  assert.strictEqual(publisherFallbackCandidates.length, 1);
  assert.strictEqual(publisherFallbackCandidates[0].source, "AP News");

  const evidenceData = await collectPublisherEvidenceReport({
    date: "2026-06-28",
    sectorStocks: evidenceSectorStocks,
    marketSnapshotData: { ...snapshot, asOfDate: "2026-06-28" },
    editorial: evidenceEditorial,
    publisherCandidates: [
      { headline: "S&P 500 and Nasdaq recover as Treasury yields fall after inflation data", url: "https://news.example.com/evidence-market", source: "Yahoo Finance", sourceId: "yahoo-finance", publishedDate: "2026-06-28", articleText: evidenceBody("Treasury yields fell after softer inflation data and the S&P 500 and Nasdaq recovered into the close as investors reassessed the path for interest rates.") },
      { headline: "NVIDIA says AI chip demand and data center orders remain strong", url: "https://news.example.com/evidence-nvda", source: "AP News", sourceId: "ap-business", publishedDate: "2026-06-28", articleText: evidenceBody("NVIDIA said demand for AI chips and data-center orders remained strong, supporting investor interest in the semiconductor group.") },
      { headline: "JPMorgan and bank shares in focus ahead of earnings", url: "https://news.example.com/evidence-jpm", source: "CNBC Markets", sourceId: "cnbc-markets", publishedDate: "2026-06-28", articleText: evidenceBody("Bank shares entered earnings season with financial-sector valuations below prior levels relative to expected earnings, according to the report.") },
      { headline: "PepsiCo’s Dividend Could Turn Patience Into Real Profit", url: "https://news.google.com/rss/articles/headline-only", source: "Google News RSS", sourceId: "google", publishedDate: "2026-06-28", articleText: evidenceBody("PepsiCo dividend coverage that must be rejected because the URL is a Google News aggregate rather than a publisher canonical URL.") },
    ],
    stockQuotes: {
      NVDA: { date: "2026-06-28", price: 150, changePct: 2.1, source: "fixture", sourceUrl: "https://quote.example.com/NVDA" },
      JPM: { date: "2026-06-28", price: 250, changePct: 1.1, source: "fixture", sourceUrl: "https://quote.example.com/JPM" },
    },
  });
  assert.strictEqual(evidenceData.schemaVersion, 2);
  assert.strictEqual(evidenceData.stories.length, 3);
  assert(!evidenceData.articles.some(article => article.headline.includes("PepsiCo’s Dividend")));
  assert.strictEqual(validateEditorial(evidenceData.articles[0], { headlineKo: "제목", summaryKo: "원문은 내용을 전합니다.", evidenceIds: ["e1"] }).valid, false);
  assert.strictEqual(validateEditorial(evidenceData.articles[0], { headlineKo: "제목", summaryKo: "국채 금리가 99% 하락했습니다.", evidenceIds: ["e1"] }).valid, false);
  const evidencePost = renderNaverPost(evidenceData, { baseDir: root });
  assert(!evidencePost.includes("본문 근거:"));
  assert(!evidencePost.includes("원문은"));
  assert(!evidencePost.includes("PepsiCo’s Dividend"));
  const evidenceManifest = buildPublishManifest({ data: evidenceData, reportPath, postPath, postMarkdown: evidencePost });
  assert.strictEqual(evidenceManifest.automation.scheduledPublishAllowed, true);
  assert.strictEqual(evidenceManifest.post.linkCards.length, 3);

  console.log("us daily market-news tests passed");
})().catch(error => {
  console.error(error);
  process.exit(1);
});
