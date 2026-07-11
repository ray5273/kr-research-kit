#!/usr/bin/env node

const fs = require("fs");
const https = require("https");
const path = require("path");
const { MIN_BODY_CHARS, applyEditorial, articleId, canonicalUrl, extractEvidence } = require("./article-evidence");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith("--")) throw new Error(`Unexpected argument: ${key}`);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) args[key.slice(2)] = true;
    else { args[key.slice(2)] = next; i += 1; }
  }
  return args;
}

function addDays(yyyyMmDd, delta) {
  const [year, month, day] = yyyyMmDd.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + delta));
  return date.toISOString().slice(0, 10);
}

function normalizeNewsDate(value, asOfDate) {
  const text = normalizeSpace(String(value || ""));
  if (!text || !asOfDate) return null;
  const iso = text.match(/\b(20\d{2})[-.](\d{1,2})[-.](\d{1,2})\b/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  const md = text.match(/\b(\d{1,2})\.(\d{1,2})\.\b/);
  if (md) return `${asOfDate.slice(0, 4)}-${md[1].padStart(2, "0")}-${md[2].padStart(2, "0")}`;
  if (/오늘|방금|분\s*전|시간\s*전|\btoday\b|just now|minutes?\s+ago|hours?\s+ago/i.test(text)) return asOfDate;
  if (/어제|1일\s*전|하루\s*전|\byesterday\b|1\s+day\s+ago/i.test(text)) return addDays(asOfDate, -1);
  const daysAgo = text.match(/(\d+)\s*일\s*전/);
  if (daysAgo) return addDays(asOfDate, -Number(daysAgo[1]));
  const englishDaysAgo = text.match(/(\d+)\s+days?\s+ago/i);
  if (englishDaysAgo) return addDays(asOfDate, -Number(englishDaysAgo[1]));
  return null;
}

function filterSameDateItems(items, asOfDate, warnings, label) {
  if (!asOfDate) return dedupeItems(items);
  const output = [];
  let missing = 0;
  let otherDate = 0;
  for (const item of dedupeItems(items)) {
    const rawDate = item.publishedDate || item.pubDate || item.publishedAt || item.date || item.dateLabel || item.sourceDate || "";
    const publishedDate = /^\d{4}-\d{2}-\d{2}$/.test(String(rawDate))
      ? String(rawDate)
      : (item.pubDate ? normalizeRssPubDate(rawDate, asOfDate) : normalizeNewsDate(rawDate, asOfDate));
    if (!publishedDate) {
      missing += 1;
      continue;
    }
    if (publishedDate !== asOfDate) {
      otherDate += 1;
      continue;
    }
    output.push({ ...item, publishedDate });
  }
  if (missing) warnings?.push(`${label} ${missing}건은 날짜 확인이 어려워 제외했습니다.`);
  if (otherDate) warnings?.push(`${label} ${otherDate}건은 기준일(${asOfDate}) 기사가 아니어서 제외했습니다.`);
  return output;
}

function todayEastern() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function writeJsonAtomic(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(temporary, filePath);
}

function normalizeSpace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

const DEFAULT_SECTORS = [
  "Technology/AI",
  "Communication Services",
  "Consumer Discretionary",
  "Consumer Staples",
  "Financials",
  "Health Care",
  "Industrials",
  "Energy",
  "Materials",
  "Utilities",
  "Real Estate",
];

const DEFAULT_SECTOR_STOCKS_PATH = "examples/us/daily-sector-stocks.json";
const DEFAULT_DIRECT_RSS_SOURCES = [
  { name: "Yahoo Finance", url: "https://finance.yahoo.com/news/rssindex" },
  { name: "CNBC Markets", url: "https://www.cnbc.com/id/10001147/device/rss/rss.html" },
  { name: "CNBC Investing", url: "https://www.cnbc.com/id/15839069/device/rss/rss.html" },
  { name: "MarketWatch MarketPulse", url: "https://feeds.content.dowjones.io/public/rss/mw_marketpulse" },
  { name: "MarketWatch Realtime", url: "https://feeds.content.dowjones.io/public/rss/mw_realtimeheadlines" },
  { name: "Nasdaq Markets", url: "https://www.nasdaq.com/feed/rssoutbound?category=Markets" },
  { name: "Seeking Alpha Market Currents", url: "https://seekingalpha.com/market_currents.xml" },
  { name: "Investing.com Stock Market", url: "https://www.investing.com/rss/news_25.rss" },
  { name: "Investing.com Economy", url: "https://www.investing.com/rss/news_95.rss" },
];
const DEFAULT_PUBLISHER_SOURCES = [
  {
    id: "yahoo-finance",
    name: "Yahoo Finance",
    sectionUrl: "https://finance.yahoo.com/topic/stock-market-news/",
    hosts: ["finance.yahoo.com"],
    priority: 1,
  },
  {
    id: "ap-business",
    name: "AP News",
    sectionUrl: "https://apnews.com/hub/business",
    hosts: ["apnews.com"],
    priority: 2,
  },
  {
    id: "reuters-investing",
    name: "Reuters via Investing.com",
    sectionUrl: "https://www.investing.com/news/stock-market-news",
    hosts: ["investing.com"],
    priority: 3,
  },
  {
    id: "cnbc-markets",
    name: "CNBC Markets",
    sectionUrl: "https://www.cnbc.com/markets/",
    hosts: ["cnbc.com"],
    priority: 4,
  },
];
const GOOGLE_NEWS_RSS_BASE = "https://news.google.com/rss/search";
const MARKET_KEYWORDS = /S&P\s*500|Nasdaq|Dow Jones|Russell 2000|Wall Street|stock market|stocks|equities|market\s*(?:close|rally|selloff|wrap|outlook)|Treasury|yield|Fed|FOMC|inflation|CPI|PCE|dollar|earnings|megacap|Magnificent Seven/i;
const BROAD_MARKET_PATTERN = /S&P\s*500|Nasdaq|Dow Jones|Russell 2000|Wall Street|stock market today|stocks?\s+(?:close|finish|end|rise|fall|gain|drop|slip|rally|sell off|mixed)|markets?\s+(?:close|finish|end|rise|fall|gain|drop|slip|rally|sell off|mixed)|Treasury|yield|Fed|FOMC|inflation|CPI|PCE|jobs report|payrolls|dollar|VIX|market wrap/i;
const LOW_PRIORITY_NEWS_PATTERN = /after\s*hours|pre[-\s]?market|IPO filing|files?\s+for\s+(?:IPO|Nasdaq)|secondary offering|stock split|dividend declaration|insider sale|price target|analyst rating|lawsuit|class action|penny stock|schedules?\s+(?:an?\s+)?earnings\s+(?:call|webcast|discussion)|webcast\s+discussion|what\s+to\s+expect|what\s+to\s+know\s+ahead|earnings\s+expected\s+to|next\s+quarterly\s+earnings|projected\s+to\s+release\s+earnings|forecasters?\s+revamp|expectations?\s+ahead\s+of|new\s+[^.]{0,40}\bETF\b|launch(?:es|ed|ing)?\s+[^.]{0,40}\bETF\b|grows?\s+(?:its\s+)?(?:holdings|position|stake)|boosts?\s+(?:its\s+)?(?:holdings|position|stake)|cuts?\s+(?:its\s+)?(?:holdings|position|stake)|(?:holdings?|position|stake)\s+(?:lessened|reduced|lowered|increased|raised|boosted)|(?:largest|major|top)\s+(?:holding|position)|\b\d+(?:st|nd|rd|th)\s+largest\s+position|(?:buys?|sells?|adds?|trims?|reduces?|increases?)\s+(?:its\s+)?(?:holdings|position|stake)|acquires?\s+\d+\s+shares|sells?\s+\d+\s+shares|charged\s+with|manslaughter|fatal\s+crash|stock market today,\s*[^:]+:\s*(?!Dow|S&P|Nasdaq|Wall Street|Stocks|Markets|Futures|Treasury|Yields|Fed)|breaks?\s+(?:above|below)\s+(?:its\s+)?(?:50|100|200)-day|cross(?:es)?\s+(?:above|below)\s+(?:key|critical)?\s*moving average|cross(?:es)?\s+(?:above|below)\s+\d+\s*DMA|\b\d+\s*DMA\b|oversold|overbought|notable for|crypto market|bitcoin|millionaires?|wealth report|personal wealth|stock gains on S&P SmallCap/i;
const SECTOR_REJECT_PATTERN = /sports|lacrosse|mortgage rates only|home listing|celebrity|crypto|bitcoin|lottery|gamer trades|physical discs|credit-card debt|401\(k\)|retirement account|personal finance|New Zealand|Mexico stocks|Colombia stocks|European shares|FTSE|DAX|Nikkei|Hang Seng/i;
const LOW_QUALITY_SECTOR_SOURCE_PATTERN = /MarketBeat|Kalkine Media|Ad[- ]?hoc[- ]?news/i;
const LOW_QUALITY_DISCOVERY_SOURCE_PATTERN = /富途牛牛|Benzinga|simplywall\.st|24\/7 Wall St\./i;
const RECOMMENDATION_ARTICLE_PATTERN = /ETF showdown|which ETF is the better buy|screaming buy|buy right now|what it could mean for .* stock|largest company/i;
const FEATURED_STORY_REJECT_PATTERN = /analyst report|EPS Revisions|declares? .* dividend|Nasdaq non-compliance|missing Form 6-K|Swedish inflation expectations|reports earnings|earnings and webcast|live coverage/i;
const BROAD_SECTOR_TERMS = new Set(["AI", "Technology", "Services", "Consumer", "Staples", "Health", "Care", "Energy", "Materials", "Utilities", "Real", "Estate", "production", "capital", "demand", "media", "search"]);
const INDEX_SYMBOLS = [
  { symbol: "^GSPC", name: "S&P 500" },
  { symbol: "^IXIC", name: "Nasdaq Composite" },
  { symbol: "^DJI", name: "Dow Jones" },
  { symbol: "^RUT", name: "Russell 2000" },
];
const SECTOR_ETFS = [
  { sector: "Technology/AI", symbol: "XLK", name: "Technology" },
  { sector: "Communication Services", symbol: "XLC", name: "Communication Services" },
  { sector: "Consumer Discretionary", symbol: "XLY", name: "Consumer Discretionary" },
  { sector: "Consumer Staples", symbol: "XLP", name: "Consumer Staples" },
  { sector: "Financials", symbol: "XLF", name: "Financials" },
  { sector: "Health Care", symbol: "XLV", name: "Health Care" },
  { sector: "Industrials", symbol: "XLI", name: "Industrials" },
  { sector: "Energy", symbol: "XLE", name: "Energy" },
  { sector: "Materials", symbol: "XLB", name: "Materials" },
  { sector: "Utilities", symbol: "XLU", name: "Utilities" },
  { sector: "Real Estate", symbol: "XLRE", name: "Real Estate" },
];
// Recency / closing-article preference: later in the New York trading day
// should surface as the day's representative story.
const RECENCY_MAX = 6;
const CLOSE_BONUS = 5;
const CLOSING_PATTERN = /close|closing bell|ends?\s+(?:higher|lower|mixed|up|down)|stocks\s+(?:finish|end)|wall street\s+(?:ends|closes)|market\s+wrap/i;

function stripHtml(value) {
  return normalizeSpace(String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">"));
}

function decodeXmlEntities(value) {
  return String(value || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function textForMatch(item) {
  return normalizeSpace([
    item.headline,
    item.title,
    item.description,
    item.summary,
    item.source,
    item.name,
    item.sector,
  ].filter(Boolean).join(" "));
}

function articleTextForMatch(item) {
  return normalizeSpace([
    item.headline,
    item.title,
    item.description,
    item.summary,
    item.articleText,
    item.name,
  ].filter(Boolean).join(" "));
}

function normalizedArticleUrl(value) {
  try {
    const url = new URL(String(value || ""));
    url.search = "";
    url.hash = "";
    return url.toString().toLowerCase();
  } catch {
    return String(value || "").replace(/[?#].*$/, "").toLowerCase();
  }
}

function dateInEastern(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

// Parse an RSS pubDate (RFC-822) into an absolute ISO timestamp so downstream
// ranking can prefer the most recent article. Returns null when unparseable.
function parseEasternTimestamp(value) {
  const text = normalizeSpace(decodeXmlEntities(value));
  if (!text) return null;
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

// New York time-of-day (0..24, fractional) for a parsed publishedAt. Null when absent.
function easternHourFraction(publishedAt) {
  if (!publishedAt) return null;
  const date = new Date(publishedAt);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const hour = Number(parts.find(part => part.type === "hour")?.value);
  const minute = Number(parts.find(part => part.type === "minute")?.value);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return null;
  return (hour === 24 ? 0 : hour) + minute / 60;
}

function publishedMs(item) {
  const ms = Date.parse(item?.publishedAt || "");
  return Number.isFinite(ms) ? ms : -Infinity;
}

function normalizeRssPubDate(value, asOfDate = null) {
  const text = normalizeSpace(decodeXmlEntities(value));
  if (!text) return null;
  const newsDate = normalizeNewsDate(text, asOfDate);
  if (newsDate) return newsDate;
  const parsed = new Date(text);
  return dateInEastern(parsed);
}

function firstTag(block, tagName) {
  const pattern = new RegExp(`<${tagName}\\b([^>]*)>([\\s\\S]*?)<\\/${tagName}>`, "i");
  const match = block.match(pattern);
  if (!match) return { text: "", attrs: "" };
  return { text: normalizeSpace(stripHtml(decodeXmlEntities(match[2]))), attrs: match[1] || "" };
}

function attrValue(attrs, attrName) {
  const pattern = new RegExp(`${attrName}=["']([^"']+)["']`, "i");
  return attrs.match(pattern)?.[1] || "";
}

function parseRssItems(xml, options = {}) {
  const items = [];
  const sourceName = options.source?.name || options.sourceName || "";
  const sourceUrl = options.source?.url || "";
  const itemPattern = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;
  let match;
  while ((match = itemPattern.exec(xml)) !== null) {
    const block = match[1];
    const title = firstTag(block, "title").text;
    const linkTag = firstTag(block, "link").text;
    const guidTag = firstTag(block, "guid");
    const pubDateRaw = firstTag(block, "pubDate").text || firstTag(block, "dc:date").text || firstTag(block, "updated").text;
    const description = firstTag(block, "description").text;
    const sourceTag = firstTag(block, "source");
    const link = /^https?:\/\//i.test(linkTag) ? linkTag : (/^https?:\/\//i.test(guidTag.text) ? guidTag.text : "");
    const publishedDate = normalizeRssPubDate(pubDateRaw, options.asOfDate);
    const publishedAt = parseEasternTimestamp(pubDateRaw);
    if (!title || !link) continue;
    items.push({
      headline: title,
      title,
      url: link,
      source: sourceTag.text || sourceName || "RSS",
      sourceUrl: attrValue(sourceTag.attrs, "url") || sourceUrl,
      sourceRole: options.sourceRole || "direct-rss",
      description,
      ...(pubDateRaw ? { pubDate: pubDateRaw } : {}),
      ...(publishedDate ? { publishedDate } : {}),
      ...(publishedAt ? { publishedAt } : {}),
      ...(options.query ? { query: options.query } : {}),
      ...(options.discovery ? { discovery: true } : {}),
    });
  }
  return dedupeItems(items);
}

function extractArticleText(html) {
  const candidates = [];
  const patterns = [
    /<article\b[^>]*>([\s\S]*?)<\/article>/gi,
    /<div\b[^>]*(?:id|class)="[^"]*(?:article|news|content|view|body)[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
    /<section\b[^>]*(?:id|class)="[^"]*(?:article|news|content|view|body)[^"]*"[^>]*>([\s\S]*?)<\/section>/gi,
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(html)) !== null) {
      const text = stripHtml(match[1]);
      if (text.length >= 120) candidates.push(text);
    }
  }
  if (!candidates.length) {
    const fallback = stripHtml(html);
    if (fallback.length >= 120) candidates.push(fallback);
  }
  return candidates.sort((a, b) => b.length - a.length)[0]?.slice(0, 2500) || "";
}

function sourceKey(item) {
  let url = normalizeSpace(item.url || "");
  if (url) {
    try {
      const parsed = new URL(url);
      for (const key of [...parsed.searchParams.keys()]) {
        if (/^(?:utm_|fbclid$|gclid$|ncid$|sid$|session$|tracking$)/i.test(key)) parsed.searchParams.delete(key);
      }
      parsed.hash = "";
      url = parsed.toString();
    } catch {
      url = url.replace(/#.*$/, "");
    }
  }
  url = url.toLowerCase();
  if (url) return `url:${url}`;
  return `headline:${normalizeSpace(item.headline || item.title).toLowerCase()}`;
}

function dedupeItems(items) {
  const seen = new Set();
  const output = [];
  for (const item of items) {
    const key = sourceKey(item);
    const headlineKey = `headline:${normalizeSpace(item.headline || item.title).toLowerCase()}`;
    if (!key || seen.has(key) || (headlineKey !== "headline:" && seen.has(headlineKey))) continue;
    seen.add(key);
    if (headlineKey !== "headline:") seen.add(headlineKey);
    output.push(item);
  }
  return output;
}

function readWatchlist(filePath) {
  const resolved = path.resolve(filePath);
  const parsed = JSON.parse(fs.readFileSync(resolved, "utf8"));
  assert(Array.isArray(parsed), "Watchlist must be a JSON array");
  return parsed.map((item, index) => {
    assert(/^[A-Z][A-Z0-9.-]{0,9}$/.test(String(item.ticker || "").toUpperCase()), `Watchlist item ${index + 1} must include a U.S.-style ticker`);
    assert(normalizeSpace(item.name), `Watchlist item ${index + 1} must include a name`);
    return {
      ticker: String(item.ticker).toUpperCase(),
      name: normalizeSpace(item.name),
      keywords: Array.isArray(item.keywords) ? item.keywords.map(normalizeSpace).filter(Boolean) : [],
      secUrl: item.secUrl || null,
      exchangeUrl: item.exchangeUrl || null,
      irUrl: item.irUrl || null,
    };
  });
}

function readSectorStocks(filePath = DEFAULT_SECTOR_STOCKS_PATH) {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) return null;
  const parsed = JSON.parse(fs.readFileSync(resolved, "utf8"));
  assert(parsed && typeof parsed === "object" && !Array.isArray(parsed), "Sector stocks must be a JSON object keyed by sector");
  const output = {};
  for (const sector of DEFAULT_SECTORS) {
    const stocks = parsed[sector];
    if (stocks == null) {
      output[sector] = [];
      continue;
    }
    assert(Array.isArray(stocks), `Sector stocks for ${sector} must be an array`);
    output[sector] = stocks.map((item, index) => {
      assert(/^[A-Z][A-Z0-9.-]{0,9}$/.test(String(item.ticker || "").toUpperCase()), `${sector} stock ${index + 1} must include a U.S.-style ticker`);
      assert(normalizeSpace(item.name), `${sector} stock ${index + 1} must include a name`);
      return {
        ticker: String(item.ticker).toUpperCase(),
        name: normalizeSpace(item.name),
        keywords: Array.isArray(item.keywords) ? item.keywords.map(normalizeSpace).filter(Boolean) : [],
      };
    });
  }
  return output;
}

function sectorKeyword(sector, stock) {
  return stock?.keywords?.[0] || normalizeSpace(String(sector || "").replace(/[\/]/g, " "));
}

function buildSectorStockQueries(sector, stocks) {
  return (stocks || []).map(stock => ({
    sector,
    ticker: stock.ticker,
    name: stock.name,
    query: `${stock.name} ${sectorKeyword(sector, stock)} stock market news`,
  }));
}

function appendDateStatsWarnings(warnings, label, stats, asOfDate) {
  if (!asOfDate || !stats) return;
  if (stats.missingDate) warnings?.push(`${label} ${stats.missingDate}건은 날짜 확인이 어려워 제외했습니다.`);
  if (stats.otherDate) warnings?.push(`${label} ${stats.otherDate}건은 기준일(${asOfDate}) 기사가 아니어서 제외했습니다.`);
}

function fetchText(url, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, {
      headers: {
        "user-agent": "Mozilla/5.0 kr-research-kit us-daily-market-news",
        "accept-language": "en-US,en;q=0.9,ko;q=0.7",
      },
    }, (response) => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode) && response.headers.location) {
        response.resume();
        resolve(fetchText(new URL(response.headers.location, url).toString(), timeoutMs));
        return;
      }
      if (response.statusCode < 200 || response.statusCode >= 300) {
        response.resume();
        reject(new Error(`HTTP ${response.statusCode} for ${url}`));
        return;
      }
      let body = "";
      response.setEncoding("utf8");
      response.on("data", chunk => { body += chunk; });
      response.on("end", () => resolve(body));
    });
    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error(`Timeout fetching ${url}`));
    });
    request.on("error", reject);
  });
}

function absoluteUrl(href, baseUrl) {
  try {
    return new URL(String(href || ""), baseUrl).toString();
  } catch {
    return "";
  }
}

function hostnameMatches(url, hosts = []) {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return hosts.some(host => hostname === host || hostname.endsWith(`.${host}`));
  } catch {
    return false;
  }
}

function parsePublisherCandidates(html, source) {
  const output = [];
  const anchorPattern = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = anchorPattern.exec(String(html || ""))) !== null) {
    const url = absoluteUrl(match[1], source.sectionUrl);
    const headline = normalizeSpace(stripHtml(match[2]));
    if (!url || !headline || headline.length < 20 || !hostnameMatches(url, source.hosts)) continue;
    if (/\/topic\/|\/tag\/|\/author\/|\/video\//i.test(new URL(url).pathname)) continue;
    if (isGoogleNewsUrl(url) || LOW_PRIORITY_NEWS_PATTERN.test(headline) || RECOMMENDATION_ARTICLE_PATTERN.test(headline)) continue;
    const item = {
      headline,
      title: headline,
      url: canonicalUrl(url),
      source: source.name,
      sourceId: source.id,
      sourceRole: "publisher-web",
      sourceTier: "primary-publisher",
      sourcePriority: source.priority,
    };
    if (!matchesMarketNews(item) && !DEFAULT_SECTORS.some(sector => matchesSectorNews(item, sector, []))) continue;
    output.push(item);
  }
  return dedupeItems(output);
}

function metaContent(html, keys) {
  for (const key of keys) {
    const escaped = escapeRegExp(key);
    const propertyFirst = new RegExp(`<meta\\b[^>]*(?:property|name|itemprop)=["']${escaped}["'][^>]*content=["']([^"']+)["'][^>]*>`, "i");
    const contentFirst = new RegExp(`<meta\\b[^>]*content=["']([^"']+)["'][^>]*(?:property|name|itemprop)=["']${escaped}["'][^>]*>`, "i");
    const value = html.match(propertyFirst)?.[1] || html.match(contentFirst)?.[1];
    if (value) return decodeXmlEntities(value);
  }
  return "";
}

function publisherArticleMetadata(html, candidate, asOfDate) {
  const headline = normalizeSpace(metaContent(html, ["og:title", "twitter:title"]) || candidate.headline);
  const publishedAt = normalizeSpace(metaContent(html, ["article:published_time", "datePublished", "date", "parsely-pub-date"]));
  const publishedDate = normalizeRssPubDate(publishedAt, asOfDate) || normalizeNewsDate(publishedAt, asOfDate) || candidate.publishedDate || null;
  const canonical = canonicalUrl(metaContent(html, ["og:url"]) || candidate.url);
  return { headline, publishedAt: publishedAt || null, publishedDate, canonicalUrl: canonical };
}

async function fetchPublisherArticle(candidate, options = {}) {
  const fetcher = options.publisherArticleFetcher || options.articleFetcher || fetchText;
  const html = await fetcher(candidate.url, Number(options.articleTimeoutMs || 15000));
  const metadata = publisherArticleMetadata(html, candidate, options.asOfDate);
  return { ...metadata, body: articleBodyFromHtml(html) };
}

async function collectPublisherCandidates(options = {}) {
  const warnings = options.warnings || [];
  const sources = (options.publisherSources || DEFAULT_PUBLISHER_SOURCES).slice().sort((a, b) => a.priority - b.priority);
  const fetcher = options.publisherSectionFetcher || fetchText;
  const items = [];
  for (const source of sources) {
    try {
      const html = await fetcher(source.sectionUrl, Number(options.sectionTimeoutMs || 15000));
      const parsed = parsePublisherCandidates(html, source);
      if (!parsed.length) warnings.push(`${source.name} 섹션에서 직접 기사 링크를 찾지 못했습니다.`);
      items.push(...parsed);
    } catch (error) {
      warnings.push(`${source.name} 섹션 수집 실패: ${error.message}`);
    }
  }
  return dedupeItems(items).sort((a, b) => a.sourcePriority - b.sourcePriority);
}

function articleBodyFromHtml(html) {
  const withoutNoise = String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<(?:nav|header|footer|aside|form)[^>]*>[\s\S]*?<\/(?:nav|header|footer|aside|form)>/gi, " ");
  const articleBlocks = [...withoutNoise.matchAll(/<article\b[^>]*>([\s\S]*?)<\/article>/gi)].map(match => match[1]);
  const containers = articleBlocks.length ? articleBlocks : [withoutNoise];
  const candidates = containers.map(container => {
    const paragraphs = [...container.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
      .map(match => stripHtml(match[1]))
      .filter(text => text.length >= 45 && !/^(?:advertisement|subscribe|read more|sign up)$/i.test(text));
    return normalizeSpace(paragraphs.join(" "));
  }).filter(text => text.length >= 180);
  return candidates.sort((a, b) => b.length - a.length)[0]?.slice(0, 8000) || "";
}

function significantHeadlineTerms(headline) {
  const stopWords = new Set(["the", "a", "an", "and", "or", "as", "to", "of", "in", "on", "for", "with", "after", "before", "today", "stock", "stocks", "market", "news", "why", "how"]);
  return normalizeSpace(headline).toLowerCase().match(/[a-z][a-z0-9-]{2,}/g)?.filter(word => !stopWords.has(word)) || [];
}

function articleMatchesHeadline(body, headline) {
  const terms = significantHeadlineTerms(headline);
  if (!terms.length) return true;
  const lower = String(body || "").toLowerCase();
  const matched = terms.filter(term => lower.includes(term)).length;
  return matched >= Math.min(2, terms.length);
}

async function fetchArticleBody(url, options = {}) {
  if (!/^https?:\/\//i.test(url || "")) return "";
  const fetcher = options.articleFetcher || fetchText;
  try {
    const html = await fetcher(url, Number(options.articleTimeoutMs || 15000));
    const extracted = articleBodyFromHtml(html);
    if (extracted.length >= MIN_BODY_CHARS || !options.browserFallback) return extracted;
  } catch {
    if (!options.browserFallback) return "";
  }
  // Opt-in only: public sites that render article paragraphs client-side may
  // need Chromium text extraction. It never substitutes an RSS title.
  try {
    const { browseText } = require("../../kr-web-browse/scripts/browse-web");
    return normalizeSpace(browseText(url, { timeoutMs: Number(options.browserTimeoutMs || 30000) }) || "").slice(0, 8000);
  } catch {
    return "";
  }
}

async function fetchJson(url, timeoutMs = 15000) {
  const text = await fetchText(url, timeoutMs);
  return JSON.parse(text);
}

async function fetchRssSource(source, options = {}) {
  const xml = await fetchText(source.url, Number(options.rssTimeoutMs || 15000));
  return parseRssItems(xml, {
    asOfDate: options.asOfDate,
    source,
    sourceRole: options.sourceRole || "direct-rss",
    query: options.query,
    discovery: options.discovery,
  });
}

function parseRssSourceList(value) {
  if (!value) return DEFAULT_DIRECT_RSS_SOURCES;
  if (Array.isArray(value)) return value;
  return String(value).split(",").map(entry => {
    const [name, url] = entry.split("=");
    if (url) return { name: normalizeSpace(name), url: normalizeSpace(url) };
    return { name: normalizeSpace(entry), url: normalizeSpace(entry) };
  }).filter(source => /^https?:\/\//i.test(source.url));
}

async function collectDirectRssItems(options = {}) {
  const warnings = options.warnings || [];
  const sources = parseRssSourceList(options.rssSources);
  const items = [];
  for (const source of sources) {
    try {
      const parsed = await fetchRssSource(source, { ...options, sourceRole: "direct-rss" });
      items.push(...parsed);
    } catch (error) {
      warnings.push(`RSS 수집 실패: ${source.name || source.url} (${error.message})`);
    }
  }
  return filterSameDateItems(items, options.asOfDate, warnings, "미국 RSS 기사").filter(item => item.url);
}

function googleNewsRssUrl(query) {
  const params = new URLSearchParams({
    q: query,
    hl: "en-US",
    gl: "US",
    ceid: "US:en",
  });
  return `${GOOGLE_NEWS_RSS_BASE}?${params.toString()}`;
}

function buildSectorDiscoveryQueries(sector, stocks = []) {
  const names = stocks.map(stock => stock.name).filter(Boolean).slice(0, 6);
  const keywords = stocks.flatMap(stock => stock.keywords || []).filter(Boolean).slice(0, 6);
  const sectorText = normalizeSpace(String(sector).replace(/[\/]/g, " "));
  const terms = [...new Set([sectorText, ...names, ...keywords])].slice(0, 10);
  return {
    sector,
    query: `${terms.join(" OR ")} stock market news`,
    terms,
  };
}

async function collectGoogleDiscovery(options = {}) {
  if (options.googleDiscovery === false || options["skip-google"]) return [];
  const warnings = options.warnings || [];
  const queries = options.googleQueries || [];
  const items = [];
  for (const query of queries) {
    try {
      const source = { name: "Google News RSS", url: googleNewsRssUrl(query) };
      const parsed = await fetchRssSource(source, {
        ...options,
        query,
        sourceRole: "discovery-rss",
        discovery: true,
      });
      items.push(...parsed.map(item => ({ ...item, url: item.url, query, sourceRole: "discovery-rss", discovery: true })));
    } catch (error) {
      warnings.push(`Google News RSS discovery 실패: ${query} (${error.message})`);
    }
  }
  return filterSameDateItems(items, options.asOfDate, warnings, "Google News RSS discovery");
}

function isGoogleNewsUrl(url) {
  try {
    return new URL(url).hostname === "news.google.com";
  } catch {
    return false;
  }
}

function isDirectRssArticle(item) {
  return Boolean(item?.url) && !item.discovery && !isGoogleNewsUrl(item.url);
}

function matchesMarketNews(item) {
  const text = articleTextForMatch(item);
  if (LOW_PRIORITY_NEWS_PATTERN.test(text) || RECOMMENDATION_ARTICLE_PATTERN.test(text) || SECTOR_REJECT_PATTERN.test(text)) return false;
  return MARKET_KEYWORDS.test(text) && BROAD_MARKET_PATTERN.test(text);
}

function sectorMatchTerms(sector, stocks = []) {
  const sectorTerms = String(sector).split(/[\/\s]+/)
    .map(normalizeSpace)
    .filter(term => term.length >= 2 && !BROAD_SECTOR_TERMS.has(term));
  const stockNames = stocks.map(stock => stock.name).filter(Boolean);
  const stockKeywords = stocks.flatMap(stock => stock.keywords || [])
    .map(normalizeSpace)
    .filter(term => term.length >= 2 && !BROAD_SECTOR_TERMS.has(term));
  return [...new Set([...sectorTerms, ...stockNames, ...stockKeywords])];
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function termMatchesText(text, term) {
  if (!term) return false;
  if (/^[A-Za-z0-9 .&-]+$/.test(term)) {
    return new RegExp(`\\b${escapeRegExp(term)}\\b`, "i").test(text);
  }
  return text.includes(term);
}

function matchesSectorNews(item, sector, stocks = []) {
  const text = articleTextForMatch(item);
  if (LOW_QUALITY_SECTOR_SOURCE_PATTERN.test(item.source || "")) return false;
  if (item.discovery && LOW_QUALITY_DISCOVERY_SOURCE_PATTERN.test(item.source || "")) return false;
  if (sector === "Materials" && /\bDow Jones\b/i.test(text)) return false;
  if (sector === "Consumer Discretionary" && /Consumer Staples/i.test(text)) return false;
  if (SECTOR_REJECT_PATTERN.test(text)) return false;
  if (LOW_PRIORITY_NEWS_PATTERN.test(text) || RECOMMENDATION_ARTICLE_PATTERN.test(text)) return false;
  return sectorMatchTerms(sector, stocks).some(term => termMatchesText(text, term));
}

function scorePattern(text, pattern, points) {
  return pattern.test(text) ? points : 0;
}

function marketNewsScore(item) {
  const text = articleTextForMatch(item);
  let score = 0;
  score += scorePattern(text, /S&P\s*500|SPX|SPY/i, 9);
  score += scorePattern(text, /Nasdaq|NDX|QQQ/i, 9);
  score += scorePattern(text, /Dow Jones|DJIA|Russell 2000|IWM/i, 7);
  score += scorePattern(text, /close|closing|open|rally|selloff|slump|surge|gain|loss|higher|lower|mixed|record high|correction/i, 8);
  score += scorePattern(text, /Treasury|yield|bond|Fed|Federal Reserve|FOMC|Powell|rate cut|rate hike|inflation|CPI|PCE|jobs report|payrolls/i, 10);
  score += scorePattern(text, /dollar|yen|euro|oil|gold|VIX|volatility/i, 7);
  score += scorePattern(text, /earnings|guidance|quarterly results|profit|revenue|megacap|Magnificent Seven/i, 7);
  score += scorePattern(text, /Nvidia|Apple|Microsoft|Amazon|Alphabet|Meta|Tesla|semiconductor|\bAI\b|bank|healthcare|energy|consumer/i, 5);
  score += scorePattern(text, /stock market today|market wrap|Wall Street Finished|closing bell|record finish|fresh record/i, 12);
  score -= scorePattern(text, LOW_PRIORITY_NEWS_PATTERN, 24);
  if (!/S&P\s*500|Nasdaq|Dow Jones|Wall Street|stock market|stocks|equities|Treasury|yield|Fed|earnings|sector/i.test(text)) score -= 8;
  return score;
}

function yahooChartUrl(symbol) {
  return `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=10d&interval=1d`;
}

function chartDateFromTimestamp(timestamp) {
  if (!timestamp) return null;
  return dateInEastern(new Date(Number(timestamp) * 1000));
}

function latestChartPoint(chart, asOfDate) {
  const result = chart?.chart?.result?.[0];
  const timestamps = result?.timestamp || [];
  const closes = result?.indicators?.quote?.[0]?.close || [];
  const points = timestamps.map((timestamp, index) => ({
    timestamp,
    date: chartDateFromTimestamp(timestamp),
    close: closes[index],
  })).filter(point => point.date && point.close != null && Number.isFinite(Number(point.close)) && (!asOfDate || point.date <= asOfDate));
  if (points.length < 2) return null;
  const latest = points[points.length - 1];
  const previous = points[points.length - 2];
  const price = Number(latest.close);
  const previousClose = Number(previous.close);
  const change = price - previousClose;
  const changePct = previousClose ? (change / previousClose) * 100 : 0;
  return { date: latest.date, price, previousClose, change, changePct };
}

async function fetchMarketQuote(definition, asOfDate, warnings, options = {}) {
  try {
    const chart = await fetchJson(yahooChartUrl(definition.symbol), Number(options.quoteTimeoutMs || 15000));
    const point = latestChartPoint(chart, asOfDate);
    if (!point) {
      warnings?.push(`Yahoo Finance 시세 ${definition.name}(${definition.symbol})는 기준일 근처 값을 확인하지 못했습니다.`);
      return null;
    }
    return {
      ...definition,
      ...point,
      source: "Yahoo Finance chart",
      sourceUrl: `https://finance.yahoo.com/quote/${encodeURIComponent(definition.symbol)}`,
    };
  } catch (error) {
    warnings?.push(`Yahoo Finance 시세 수집 실패: ${definition.name}(${definition.symbol}) (${error.message})`);
    return null;
  }
}

async function collectMarketSnapshot(options = {}) {
  if (options.marketSnapshot === false || options["skip-market-snapshot"]) return null;
  const warnings = options.warnings || [];
  const asOfDate = options.asOfDate || options.date;
  const indexes = (await Promise.all(INDEX_SYMBOLS.map(definition => fetchMarketQuote(definition, asOfDate, warnings, options)))).filter(Boolean);
  const sectors = (await Promise.all(SECTOR_ETFS.map(definition => fetchMarketQuote(definition, asOfDate, warnings, options)))).filter(Boolean);
  if (!indexes.length && !sectors.length) return null;
  const latestDate = [...indexes, ...sectors].map(item => item.date).sort().at(-1) || asOfDate;
  return {
    source: "Yahoo Finance chart",
    asOfDate,
    latestDate,
    indexes,
    sectors,
  };
}

function pctLabel(value) {
  if (!Number.isFinite(Number(value))) return "";
  const number = Number(value);
  return `${number >= 0 ? "+" : ""}${number.toFixed(2)}%`;
}

function directionLabel(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "";
  if (number >= 0.15) return "강세";
  if (number <= -0.15) return "약세";
  return "보합";
}

function buildSnapshotOneLine(snapshot) {
  const indexes = snapshot?.indexes || [];
  if (!indexes.length) return "";
  const preferred = ["Dow Jones", "S&P 500", "Nasdaq Composite", "Russell 2000"]
    .map(name => indexes.find(item => item.name === name))
    .filter(Boolean);
  const indexText = preferred.slice(0, 3).map(item => `${item.name.replace(" Composite", "")} ${pctLabel(item.changePct)}`).join(", ");
  const sectors = [...(snapshot?.sectors || [])].sort((a, b) => b.changePct - a.changePct);
  const leader = sectors[0];
  const laggard = sectors[sectors.length - 1];
  const sectorText = leader && laggard ? `섹터는 ${leader.name} ${pctLabel(leader.changePct)} / ${laggard.name} ${pctLabel(laggard.changePct)}가 대비됐습니다` : "";
  return [indexText ? `지수는 ${indexText}` : "", sectorText].filter(Boolean).join("; ") + ".";
}

// Freshness bonus: 0 when no absolute timestamp, otherwise scaled by New York
// time-of-day so afternoon articles edge out morning ones (15:00 ≈ 5.0, 10:00 ≈ 3.3).
function recencyBonus(item, options = {}) {
  const max = options.recencyMax == null ? RECENCY_MAX : Number(options.recencyMax);
  const hour = easternHourFraction(item?.publishedAt);
  if (hour == null || !(max > 0)) return 0;
  return Math.max(0, Math.min(max, (hour / 18) * max));
}

// Extra weight for end-of-day close wrap-ups published in the afternoon, so the
// day's closing summary outranks intraday flashes even at similar content scores.
function closingBonus(item, options = {}) {
  const bonus = options.closeBonus == null ? CLOSE_BONUS : Number(options.closeBonus);
  if (!(bonus > 0) || !CLOSING_PATTERN.test(articleTextForMatch(item))) return 0;
  const hour = easternHourFraction(item?.publishedAt);
  return hour != null && hour >= 14 ? bonus : 0;
}

// Combined ordering score = content relevance + recency + closing preference.
function newsRankScore(item, options = {}) {
  return marketNewsScore(item) + recencyBonus(item, options) + closingBonus(item, options);
}

function rankNewsItems(items, limit = null, options = {}) {
  const ranked = dedupeItems(items).map((item, index) => ({
    item,
    index,
    score: marketNewsScore(item),
    rankScore: newsRankScore(item, options),
    ms: publishedMs(item),
  })).filter(entry => options.minScore == null || entry.score >= options.minScore)
    .sort((a, b) => (b.rankScore - a.rankScore) || (b.ms - a.ms) || (a.index - b.index))
    .map(entry => ({ ...entry.item, importanceScore: entry.score, rankScore: entry.rankScore }));
  return limit == null ? ranked : ranked.slice(0, limit);
}

function supplementMarketNews(directMarketNews, discoveryItems, limit = 5) {
  const existingKeys = new Set(directMarketNews.map(item => sourceKey(item)));
  const candidates = rankNewsItems((discoveryItems || [])
    .filter(matchesMarketNews)
    .filter(item => !LOW_QUALITY_DISCOVERY_SOURCE_PATTERN.test(item.source || ""))
    .filter(item => !existingKeys.has(sourceKey(item)))
    .map(item => ({
      ...item,
      sourceRole: "discovery-rss",
      discovery: true,
    })), limit, { minScore: 1 });
  return {
    marketNews: rankNewsItems([...directMarketNews, ...candidates], limit, { minScore: 1 }),
    fallbackCount: candidates.length,
  };
}

function classifyThemes(items) {
  const buckets = [
    { theme: "AI / Semiconductors", pattern: /\bAI\b|Nvidia|semiconductor|chip|GPU|HBM|memory|Broadcom|AMD|Micron/i },
    { theme: "Rates / Macro", pattern: /Treasury|yield|Fed|FOMC|Powell|inflation|CPI|PCE|jobs|payrolls|dollar/i },
    { theme: "Megacap Tech", pattern: /Apple|Microsoft|Amazon|Alphabet|Meta|Tesla|Magnificent Seven|megacap/i },
    { theme: "Earnings Season", pattern: /earnings|guidance|quarterly results|revenue|profit|margin/i },
    { theme: "Health Care / Biotech", pattern: /healthcare|health care|biotech|pharma|FDA|drug|trial|Medicare/i },
    { theme: "Energy / Commodities", pattern: /oil|crude|natural gas|OPEC|energy|Exxon|Chevron|gold|copper/i },
  ].map(bucket => ({ ...bucket, headlines: [] }));
  for (const item of items) {
    for (const bucket of buckets) {
      const headline = item.headline || item.title || "";
      if (bucket.pattern.test(headline)) bucket.headlines.push(item.name ? `${item.name}: ${headline}` : headline);
    }
  }
  return buckets
    .filter(bucket => bucket.headlines.length)
    .map(({ theme, headlines }) => ({ theme, count: headlines.length, headlines: [...new Set(headlines)].slice(0, 5) }));
}

// Directional read for a market index. Scans articles in ranked (recency-weighted)
// order and reads direction from the FIRST article that mentions the index, using
// only that article's own text — so a later "S&P 500 약세 마감" wins and a "Nasdaq 강세"
// article never inherits an unrelated "하락" from a different headline.
function indexPhraseFromItems(index, items) {
  const down = new RegExp(`${index}[^.。\\n]*?(?:falls?|drops?|declines?|slides?|slumps?|lower|selloff|loss|↓)`, "i");
  const up = new RegExp(`${index}[^.。\\n]*?(?:rises?|gains?|jumps?|climbs?|higher|rally|record|↑)`, "i");
  let mentioned = false;
  for (const item of items) {
    const text = textForMatch({ headline: item.headline || item.title, description: item.description });
    if (!new RegExp(index).test(text)) continue;
    mentioned = true;
    if (down.test(text)) return `${index} 약세`;
    if (up.test(text)) return `${index} 강세`;
  }
  return mentioned ? `${index} 흐름` : null;
}

function buildOneLine(marketNews, options = {}) {
  const snapshotLine = buildSnapshotOneLine(options.marketSnapshot);
  if (snapshotLine) return snapshotLine;
  const events = [];
  const text = textForMatch({ headline: marketNews.slice(0, 5).map(item => item.headline || item.title).join("\n"), description: marketNews.slice(0, 5).map(item => item.description).join("\n") });
  const add = value => {
    if (value && !events.includes(value)) events.push(value);
  };
  add(indexPhraseFromItems("S&P 500", marketNews));
  add(indexPhraseFromItems("Nasdaq", marketNews));
  if (/dollar|yen|euro|FX|currency/i.test(text)) add("달러/환율 변수");
  if (/Treasury|yield|Fed|FOMC|rate|inflation|CPI|PCE|jobs|payrolls/i.test(text)) add("금리/매크로 변수");
  if (/\bAI\b|semiconductor|chip|Nvidia|GPU|HBM/i.test(text)) add("AI/반도체");
  if (/earnings|guidance|quarterly results|revenue|profit/i.test(text)) add("실적 시즌");
  if (/megacap|Magnificent Seven|Apple|Microsoft|Amazon|Alphabet|Meta|Tesla/i.test(text)) add("빅테크");
  if (/healthcare|health care|biotech|pharma|FDA/i.test(text)) add("헬스케어");
  if (events.length >= 2) return `${events.slice(0, 3).join(", ")} 흐름이 함께 부각됐습니다.`;
  const firstMarket = marketNews[0]?.headline;
  if (firstMarket && marketNewsScore(marketNews[0]) > 0) return firstMarket;
  return "수집된 기사 수가 제한적입니다. 원문 출처를 우선 확인해야 합니다.";
}

const SUMMARY_NOISE_PATTERN = /Copyright|All rights reserved|Subscribe|newsletter|Advertisement|Reuters contributed|Terms of Use/i;
const SUMMARY_CANDIDATE_NOISE_PATTERN = /newsletter|podcast|watch live|what to know|things to watch|calendar/i;

function cleanNewsText(value) {
  return normalizeSpace(stripHtml(value)
    .replace(/&nbsp;/gi, " ")
    .replace(/^[[(（]?[가-힣A-Za-z\s·=]+(?:연합뉴스|특파원|기자)[)\]）]?\s*[가-힣A-Za-z\s·]+?\s*=\s*/, "")
    .replace(/^\[?※?\s*편집자\s*주\s*[=:].*?(?:\]\s*)?/i, "")
    .replace(/\s+[A-Za-z가-힣]+(?:뉴스|경제|일보|신문|투데이|조선|연합뉴스|인포맥스)$/i, ""));
}

function isTruncatedDescription(value) {
  const text = normalizeSpace(value);
  return !text || /(?:\.{3}|…)$/.test(text) || /(?:\.{3}|…)\s*(?:&nbsp;|\S+뉴스|\S+경제|\S+일보|\S+신문)?\s*$/i.test(text);
}

function usableDescription(value) {
  const text = cleanNewsText(value);
  if (isTruncatedDescription(text)) return "";
  if (/\b[A-Za-z]\.?$/.test(text)) return "";
  if (SUMMARY_NOISE_PATTERN.test(text)) return "";
  if (text.length < 18) return "";
  if (text.length <= 180) return text;
  const shortened = text.slice(0, 180);
  return shortened.slice(0, Math.max(80, shortened.lastIndexOf(" "))).replace(/[,.·;:\s]+$/, "");
}

function isLowQualitySummaryCandidate(item) {
  const headline = cleanNewsText(item.headline || item.title || "");
  const description = cleanNewsText(item.description || "");
  return SUMMARY_CANDIDATE_NOISE_PATTERN.test(`${headline} ${description}`);
}

function headlineFingerprint(value) {
  return String(value || "")
    .replace(/[0-9]+(?:\.[0-9]+)?%/g, "#%")
    .replace(/[0-9,]+/g, "#")
    .replace(/[^\p{L}\p{N}%#]+/gu, "")
    .toLowerCase();
}

function marketSummaryTheme(item) {
  const text = textForMatch(item);
  const tests = [
    {
      theme: "Nasdaq 밸류업/퇴출 제도",
      pattern: /Nasdaq(?=.*(?:밸류업|퇴출|상장폐지|활성화|저평가|30주년))/i,
      implication: "Nasdaq 저평가 해소 정책이 중소형주 선별과 시장 신뢰 회복으로 이어지는지 봐야 합니다",
    },
    {
      theme: "AI/반도체",
      pattern: /\bAI\b|semiconductor|chip|GPU|HBM|Nvidia|Broadcom|AMD|Micron/i,
      implication: "AI 인프라와 반도체 실적 기대가 빅테크 및 지수 방향성을 계속 이끄는지 확인해야 합니다",
    },
    {
      theme: "7월 실적 시즌",
      pattern: /earnings|guidance|quarterly results|revenue|profit|margin/i,
      implication: "실적 확인 구간에서 이익 전망과 주가 반응의 간극을 점검할 필요가 있습니다",
    },
    {
      theme: "ETF 시장",
      pattern: /ETF|fund flow|passive|index fund/i,
      implication: "패시브 자금 확대가 개별 업종 변동성과 시장 구조에 미치는 영향을 봐야 합니다",
    },
    {
      theme: "레버리지 수급",
      pattern: /leverage|margin debt|options|futures|volatility|VIX/i,
      implication: "과도한 레버리지 수급이 단기 변동성을 키우는지 관리해야 합니다",
    },
    {
      theme: "금리/달러",
      pattern: /Treasury|yield|Fed|FOMC|Powell|inflation|CPI|PCE|dollar/i,
      implication: "금리와 달러 변화가 성장주 밸류에이션과 섹터 로테이션에 미치는 영향을 봐야 합니다",
    },
    {
      theme: "시장 수급",
      pattern: /S&P\s*500|Nasdaq|Dow Jones|Wall Street|stock market|stocks|higher|lower|close/i,
      implication: "지수 방향보다 주도 업종과 매크로 변수의 지속성을 확인해야 합니다",
    },
  ];
  return tests.find(test => test.pattern.test(text)) || {
    theme: "시장 뉴스",
    implication: "해당 뉴스가 업종별 투자심리와 수급에 어떤 변화를 만드는지 확인해야 합니다",
  };
}

function summaryEventText(item) {
  const headline = cleanNewsText(item.headline || item.title || "시장 뉴스");
  const description = usableDescription(item.description).replace(/[.。]+$/, "");
  const headlineKey = headlineFingerprint(headline);
  const descriptionKey = headlineFingerprint(description);
  const duplicateDescription = headlineKey && descriptionKey
    && (headlineKey.includes(descriptionKey.slice(0, 40)) || descriptionKey.includes(headlineKey.slice(0, 40)));
  if (description && !description.includes(headline) && !headline.includes(description)) {
    if (duplicateDescription) return headline;
    return `${headline}은 ${description}`;
  }
  return headline;
}

function makeMarketSummary(item) {
  const event = summaryEventText(item);
  const theme = marketSummaryTheme(item);
  const prefix = theme.theme === "시장 뉴스" ? "" : `${theme.theme}: `;
  const summary = `${prefix}${event}. 투자자는 ${theme.implication}.`;
  if (summary.length <= 280) return summary;
  const shortened = summary.slice(0, 280);
  return `${shortened.slice(0, Math.max(80, shortened.lastIndexOf(" "))).replace(/[,.·;:\s]+$/, "")}.`;
}

async function buildMarketSummary(marketNews, options = {}) {
  const summaries = [];
  const candidates = marketNews.filter(item => !isLowQualitySummaryCandidate(item));
  const selected = candidates.length ? candidates : marketNews;
  for (const [index, item] of selected.slice(0, 5).entries()) {
    summaries.push({
      rank: index + 1,
      title: item.headline || item.title || `시장 뉴스 ${index + 1}`,
      summary: makeMarketSummary(item),
      url: item.url || "",
      source: item.source || "RSS",
      summaryBasis: usableDescription(item.description) ? "headline-description-theme" : "headline-theme",
    });
  }
  return summaries;
}

function normalizeSectorNews(value, asOfDate = null, warnings = null) {
  if (Array.isArray(value)) {
    return DEFAULT_SECTORS.map((sector, index) => {
      const existing = value.find(item => item.sector === sector) || value[index] || {};
      return { sector, query: existing.query || `U.S. market ${sector} stock news`, items: rankNewsItems(filterSameDateItems(existing.items || [], asOfDate, warnings, `${sector} 업종 뉴스`), 5) };
    });
  }
  return DEFAULT_SECTORS.map(sector => ({
    sector,
    query: `U.S. market ${sector} stock news`,
    items: rankNewsItems(filterSameDateItems(value?.[sector] || [], asOfDate, warnings, `${sector} 업종 뉴스`), 5),
  }));
}

async function collectSectorNews(options = {}) {
  const groups = [];
  const warnings = options.warnings || [];
  const sectorStocks = options.sectorStocks
    || (options.sectorStocksPath === false ? null : readSectorStocks(options.sectorStocksPath || DEFAULT_SECTOR_STOCKS_PATH));
  const perSectorLimit = Number(options.sectorLimit || 5);
  const minSignals = Number(options.minSectorSignals || 2);
  const directItems = options.directRssItems || await collectDirectRssItems({ ...options, warnings });
  const discoveryItems = options.discoveryItems || options.googleDiscoveryItems || [];
  for (const sector of DEFAULT_SECTORS) {
    const stocks = sectorStocks?.[sector] || [];
    const discoveryQuery = buildSectorDiscoveryQueries(sector, stocks);
    const directSectorItems = rankNewsItems(directItems
      .filter(isDirectRssArticle)
      .filter(item => matchesSectorNews(item, sector, stocks))
      .map(item => ({ ...item, sector, query: discoveryQuery.query })), perSectorLimit);
    const discoverySectorItems = rankNewsItems(discoveryItems
      .filter(item => matchesSectorNews(item, sector, stocks))
      .map(item => ({
        ...item,
        sector,
        query: discoveryQuery.query,
        sourceRole: "discovery-rss",
        discovery: true,
      })), perSectorLimit);
    const items = dedupeItems([...directSectorItems, ...discoverySectorItems]).slice(0, perSectorLimit);
    groups.push({
      sector,
      query: discoveryQuery.query,
      queries: [discoveryQuery],
      items,
      discoverySignalCount: discoverySectorItems.length,
    });
  }
  return groups;
}

function featuredStockMatches(item, stock) {
  const text = articleTextForMatch(item);
  return termMatchesText(text, stock.name) || termMatchesText(text, stock.ticker);
}

function featuredStockCandidates(sectorNews, sectorStocks, asOfDate) {
  const seen = new Set();
  const candidates = [];
  for (const group of sectorNews || []) {
    for (const item of group.items || []) {
      if ((!isDirectRssArticle(item) && !item.discovery) || item.publishedDate !== asOfDate) continue;
      if (FEATURED_STORY_REJECT_PATTERN.test(articleTextForMatch(item))) continue;
      if (group.sector === "Materials" && /\bDow(?: Jones)?\b/i.test(item.headline || item.title || "")) continue;
      const stock = (sectorStocks?.[group.sector] || []).find(candidate => featuredStockMatches(item, candidate));
      const key = normalizedArticleUrl(item.url) || headlineFingerprint(item.headline || item.title);
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push({ ...item, sector: group.sector, ticker: stock?.ticker || "", name: stock?.name || group.sector });
    }
  }
  const primaryByArticle = new Map();
  for (const candidate of candidates) {
    const articleKey = normalizedArticleUrl(candidate.url) || headlineFingerprint(candidate.headline || candidate.title);
    const headline = String(candidate.headline || candidate.title || "");
    const position = headline.toLowerCase().indexOf(String(candidate.name || "").toLowerCase());
    const current = primaryByArticle.get(articleKey);
    if (!current || (position >= 0 && (current.position < 0 || position < current.position))) primaryByArticle.set(articleKey, { candidate, position });
  }
  return [...primaryByArticle.values()].map(item => item.candidate)
    .sort((a, b) => (b.rankScore ?? newsRankScore(b)) - (a.rankScore ?? newsRankScore(a)));
}

async function collectFeaturedStocks(options = {}) {
  const candidates = featuredStockCandidates(options.sectorNews, options.sectorStocks, options.asOfDate)
    .slice(0, Number(options.featuredCandidateLimit || 14));
  const output = [];
  const usedSectors = new Set();
  for (const candidate of candidates) {
    if (usedSectors.has(candidate.sector)) continue;
    const articleText = normalizeSpace(candidate.articleText || await fetchArticleBody(candidate.url, options));
    // RSS 제목·설명은 후보를 찾는 단서일 뿐, 블로그에 쓸 사실 근거가 아니다.
    // 특징주로 채택하려면 기사 URL에서 읽을 수 있는 본문을 반드시 확보한다.
    if (articleText.length < 180) continue;
    const quote = candidate.ticker
      ? (options.stockQuotes?.[candidate.ticker]
        || await fetchMarketQuote({ symbol: candidate.ticker, name: candidate.name }, options.asOfDate, options.warnings, options))
      : null;
    const sectorQuote = (options.marketSnapshot?.sectors || []).find(item => item.sector === candidate.sector) || null;
    output.push({
      ...candidate,
      articleText,
      evidenceText: articleText,
      evidenceType: "article-body",
      ...(quote && quote.date === options.asOfDate && Number.isFinite(Number(quote.price)) && Number.isFinite(Number(quote.changePct)) ? {
        quote: {
          symbol: candidate.ticker,
          price: quote.price,
          previousClose: quote.previousClose,
          change: quote.change,
          changePct: quote.changePct,
          date: quote.date,
          source: quote.source,
          sourceUrl: quote.sourceUrl,
        },
      } : {}),
      ...(sectorQuote ? { sectorQuote: { symbol: sectorQuote.symbol, name: sectorQuote.name, changePct: sectorQuote.changePct, date: sectorQuote.date } } : {}),
    });
    usedSectors.add(candidate.sector);
    if (output.length >= Number(options.featuredLimit || 5)) break;
  }
  return output;
}

async function enrichArticleBodies(items, options = {}) {
  const output = [];
  for (const item of items || []) {
    // Google News 발견 기사는 직접 RSS 기사와 함께 쓸 수 있지만, URL에서
    // 읽히는 본문을 확보한 경우에만 본문 후보가 된다.
    if (!isDirectRssArticle(item) && !item.discovery) continue;
    const articleText = normalizeSpace(item.articleText || await fetchArticleBody(item.url, options));
    if (articleText.length >= 180) output.push({ ...item, articleText, evidenceText: articleText, evidenceType: "article-body" });
  }
  return output;
}

async function collectDailyMarketNews(options) {
  const date = options.date || todayEastern();
  const watchlist = options.watchlist ? readWatchlist(options.watchlist) : [];
  if (options.fixture) {
    const fixture = JSON.parse(fs.readFileSync(path.resolve(options.fixture), "utf8"));
    const warnings = [...(fixture.warnings || [])];
    const marketNews = rankNewsItems(filterSameDateItems(fixture.marketNews || [], date, warnings, "시장 뉴스"), Number(options.marketLimit || 12));
    const marketSummary = fixture.marketSummary || await buildMarketSummary(marketNews, { fixture: true });
    const sectorNews = normalizeSectorNews(fixture.sectorNews, date, warnings);
    const featuredStocks = (fixture.featuredStocks || [])
      .filter(item => item.publishedDate === date && item.articleText)
      .map(item => ({ ...item, evidenceText: item.evidenceText || item.articleText, evidenceType: item.evidenceType || "article-body" }));
    const officialSources = dedupeItems(fixture.officialSources || []);
    const allNews = [...marketNews, ...sectorNews.flatMap(group => group.items || [])];
    return {
      schemaVersion: 1,
      reportType: "us-daily-market-news",
      asOfDate: date,
      generatedAt: new Date().toISOString(),
      sourceMode: "fixture",
      watchlist,
      oneLine: fixture.oneLine || buildOneLine(marketNews),
      marketNews,
      marketSummary,
      sectorNews,
      featuredStocks,
      themes: fixture.themes || classifyThemes(allNews),
      officialSources,
      sourceSummary: {
        marketNewsCount: marketNews.length,
        sectorNewsCount: sectorNews.reduce((sum, group) => sum + (group.items?.length || 0), 0),
        featuredStockCount: featuredStocks.length,
        officialSourceCount: officialSources.length,
      },
      warnings,
    };
  }

  const marketQueries = [
    "S&P 500 Nasdaq Dow Jones market close",
    "U.S. stock market sectors themes",
    "Wall Street Treasury yields Fed earnings",
  ];
  const warnings = [];
  const sectorStocks = options.sectorStocks
    || (options.sectorStocksPath === false ? null : readSectorStocks(options.sectorStocksPath || DEFAULT_SECTOR_STOCKS_PATH));
  const sectorDiscoveryQueries = DEFAULT_SECTORS.map(sector => buildSectorDiscoveryQueries(sector, sectorStocks?.[sector] || []).query);
  const googleDiscovery = Array.isArray(options.googleDiscoveryItems)
    ? filterSameDateItems(options.googleDiscoveryItems, date, warnings, "Google News RSS discovery")
    : await collectGoogleDiscovery({
      ...options,
      asOfDate: date,
      warnings,
      googleQueries: [...marketQueries, ...sectorDiscoveryQueries],
    });
  const directRssItems = Array.isArray(options.directRssItems)
    ? filterSameDateItems(options.directRssItems, date, warnings, "미국 RSS 기사")
    : await collectDirectRssItems({ ...options, asOfDate: date, warnings });
  const directMarketNews = rankNewsItems(directRssItems
    .filter(isDirectRssArticle)
    .filter(matchesMarketNews), Number(options.marketLimit || 12), { minScore: 1 });
  const marketSupplement = supplementMarketNews(directMarketNews, googleDiscovery, Math.min(Number(options.marketLimit || 12), 5));
  let marketNews = await enrichArticleBodies(marketSupplement.marketNews, options);
  if (marketNews.length < 3) {
    const bodyVerifiedFallback = supplementMarketNews([], googleDiscovery, Math.min(Number(options.marketLimit || 12), 5));
    const fallbackNews = await enrichArticleBodies(bodyVerifiedFallback.marketNews, options);
    marketNews = rankNewsItems([...marketNews, ...fallbackNews], Number(options.marketLimit || 12), { minScore: 1 });
  }
  if (directMarketNews.length < 5 && marketSupplement.fallbackCount) {
    warnings.push(`시장 주요 뉴스는 direct RSS ${directMarketNews.length}건에 Google News discovery 보조 후보 ${marketSupplement.fallbackCount}건을 더해 구성했습니다.`);
  } else if (marketNews.length < 5) {
    warnings.push(`시장 주요 뉴스가 기준일 기사만으로 ${marketNews.length}건 수집됐습니다.`);
  }
  const marketSnapshot = options.marketSnapshotData || await collectMarketSnapshot({ ...options, asOfDate: date, warnings });
  const marketSummary = await buildMarketSummary(marketNews, options);
  const sectorNews = await collectSectorNews({ ...options, asOfDate: date, warnings, sectorStocks, directRssItems, discoveryItems: googleDiscovery });
  const featuredStocks = await collectFeaturedStocks({ ...options, asOfDate: date, warnings, sectorStocks, sectorNews, marketSnapshot });
  if (featuredStocks.length < 3) warnings.push(`원문 본문과 당일 종가를 함께 확인한 특징주가 ${featuredStocks.length}건입니다. 예약 게시 기준(3건)에 미달합니다.`);
  warnings.push(...sectorNews.map(group => group.warning).filter(Boolean));
  const officialSources = [];
  const allNews = [...marketNews, ...sectorNews.flatMap(group => group.items || [])];
  return {
    schemaVersion: 1,
    reportType: "us-daily-market-news",
    asOfDate: date,
    generatedAt: new Date().toISOString(),
    sourceMode: "rss-hybrid",
    watchlist,
    oneLine: buildOneLine(marketNews, { marketSnapshot }),
    marketSnapshot,
    marketNews,
    marketSummary,
    sectorNews,
    featuredStocks,
    discoveryNews: googleDiscovery,
    themes: classifyThemes([...allNews, ...googleDiscovery]),
    officialSources,
    sourceSummary: {
      marketNewsCount: marketNews.length,
      marketNewsDirectCount: directMarketNews.length,
      marketNewsDiscoveryFallbackCount: marketSupplement.fallbackCount,
      sectorNewsCount: sectorNews.reduce((sum, group) => sum + (group.items?.length || 0), 0),
      featuredStockCount: featuredStocks.length,
      sectorDiscoverySignalCount: sectorNews.reduce((sum, group) => sum + (group.discoverySignalCount || 0), 0),
      discoveryNewsCount: googleDiscovery.length,
      officialSourceCount: officialSources.length,
      marketSnapshotIndexCount: marketSnapshot?.indexes?.length || 0,
      marketSnapshotSectorCount: marketSnapshot?.sectors?.length || 0,
    },
    warnings,
  };
}

function readEditorialOverrides(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  const parsed = JSON.parse(fs.readFileSync(path.resolve(String(value)), "utf8"));
  return parsed.articles && typeof parsed.articles === "object" ? parsed.articles : parsed;
}

function readPublisherCandidates(value) {
  if (!value) return null;
  if (Array.isArray(value)) return value;
  const parsed = typeof value === "object" ? value : JSON.parse(fs.readFileSync(path.resolve(String(value)), "utf8"));
  const candidates = Array.isArray(parsed) ? parsed : parsed.candidates;
  assert(Array.isArray(candidates), "Publisher candidates must be a JSON array or an object with a candidates array");
  return candidates.map((candidate, index) => {
    assert(/^https?:\/\//i.test(candidate.url || ""), `Publisher candidate ${index + 1} requires a direct canonical URL`);
    assert(!isGoogleNewsUrl(candidate.url), `Publisher candidate ${index + 1} cannot use a Google News URL`);
    assert(normalizeSpace(candidate.headline), `Publisher candidate ${index + 1} requires a headline`);
    assert(normalizeSpace(candidate.source), `Publisher candidate ${index + 1} requires a publisher name`);
    return { ...candidate, url: canonicalUrl(candidate.url), sourceRole: "publisher-web", sourceTier: "primary-publisher" };
  });
}

function classifyEvidenceArticle(item, sectorStocks) {
  const text = articleTextForMatch(item);
  const sectors = DEFAULT_SECTORS.filter(sector => matchesSectorNews(item, sector, sectorStocks?.[sector] || []));
  const stock = sectors.flatMap(sector => (sectorStocks?.[sector] || []).map(candidate => ({ sector, ...candidate })))
    .find(candidate => termMatchesText(text, candidate.name) || termMatchesText(text, candidate.ticker));
  const market = matchesMarketNews(item);
  if (stock) return { kind: "stock", sector: stock.sector, ticker: stock.ticker, name: stock.name };
  if (sectors.length === 1) return { kind: "sector", sector: sectors[0], ticker: "", name: "" };
  if (market) return { kind: "market", sector: "", ticker: "", name: "" };
  return null;
}

function selectVerifiedStories(articles, asOfDate) {
  const selected = [];
  const usedSectors = new Set();
  const usedTickers = new Set();
  const sorted = [...articles]
    .filter(article => article.editorial?.status === "verified")
    .sort((a, b) => (b.rankScore || 0) - (a.rankScore || 0)
      || (Date.parse(b.publishedAt || "") || 0) - (Date.parse(a.publishedAt || "") || 0));
  for (const article of sorted) {
    if (article.publishedDate !== asOfDate) continue;
    if (article.classification.kind === "stock" && usedTickers.has(article.classification.ticker)) continue;
    if (article.classification.kind === "sector" && usedSectors.has(article.classification.sector)) continue;
    selected.push({
      id: `story-${article.id.slice(-12)}`,
      articleId: article.id,
      kind: article.classification.kind,
      sector: article.classification.sector,
      ticker: article.classification.ticker,
      name: article.classification.name,
      headlineKo: article.editorial.headlineKo,
      summaryKo: article.editorial.summaryKo,
      evidenceIds: article.editorial.evidenceIds,
      url: article.canonicalUrl,
      source: article.source,
      sourceId: article.sourceId,
      sourceRole: article.sourceRole,
      sourceTier: article.sourceTier,
      publishedAt: article.publishedAt || null,
      publishedDate: article.publishedDate,
      quote: article.quote || null,
    });
    if (article.classification.kind === "stock") usedTickers.add(article.classification.ticker);
    if (article.classification.kind === "sector") usedSectors.add(article.classification.sector);
    if (selected.length >= 6) break;
  }
  return selected;
}

async function collectEvidenceReport(options = {}) {
  const asOfDate = options.date || todayEastern();
  const warnings = [];
  const sectorStocks = options.sectorStocks || readSectorStocks(options.sectorStocksPath || DEFAULT_SECTOR_STOCKS_PATH);
  const marketQueries = [
    "S&P 500 Nasdaq Dow Jones market close",
    "U.S. stock market sectors themes",
    "Wall Street Treasury yields Fed earnings",
  ];
  const sectorQueries = DEFAULT_SECTORS.map(sector => buildSectorDiscoveryQueries(sector, sectorStocks?.[sector] || []).query);
  const [directItems, discoveryItems, marketSnapshot] = await Promise.all([
    Array.isArray(options.directRssItems)
      ? Promise.resolve(filterSameDateItems(options.directRssItems, asOfDate, warnings, "미국 RSS 기사"))
      : collectDirectRssItems({ ...options, asOfDate, warnings }),
    Array.isArray(options.googleDiscoveryItems)
      ? Promise.resolve(filterSameDateItems(options.googleDiscoveryItems, asOfDate, warnings, "Google News RSS discovery"))
      : collectGoogleDiscovery({ ...options, asOfDate, warnings, googleQueries: [...marketQueries, ...sectorQueries] }),
    options.marketSnapshotData ? Promise.resolve(options.marketSnapshotData) : collectMarketSnapshot({ ...options, asOfDate, warnings }),
  ]);
  const candidates = rankNewsItems(dedupeItems([...directItems, ...discoveryItems])
    .filter(item => item.publishedDate === asOfDate)
    .filter(item => matchesMarketNews(item) || DEFAULT_SECTORS.some(sector => matchesSectorNews(item, sector, sectorStocks?.[sector] || []))), Number(options.bodyCandidateLimit || 24));
  const editorialOverrides = readEditorialOverrides(options.editorial || options.editorialJson);
  const articles = [];
  for (const candidate of candidates) {
    const body = normalizeSpace(candidate.articleText || await fetchArticleBody(candidate.url, options));
    if (body.length < MIN_BODY_CHARS) {
      warnings.push(`본문 추출 기준 미달로 제외: ${candidate.headline}`);
      continue;
    }
    if (!articleMatchesHeadline(body, candidate.headline)) {
      warnings.push(`제목과 본문 일치 검증 실패로 제외: ${candidate.headline}`);
      continue;
    }
    const evidence = extractEvidence(body);
    if (!evidence.length) {
      warnings.push(`인용 가능한 사실 문장이 없어 제외: ${candidate.headline}`);
      continue;
    }
    const enriched = { ...candidate, articleText: body };
    const classification = classifyEvidenceArticle(enriched, sectorStocks);
    if (!classification) continue;
    let quote = null;
    if (classification.ticker) {
      const candidateQuote = options.stockQuotes?.[classification.ticker]
        || await fetchMarketQuote({ symbol: classification.ticker, name: classification.name }, asOfDate, warnings, options);
      if (candidateQuote?.date === asOfDate && Number.isFinite(Number(candidateQuote.price)) && Number.isFinite(Number(candidateQuote.changePct))) {
        quote = { symbol: classification.ticker, price: candidateQuote.price, changePct: candidateQuote.changePct, date: candidateQuote.date, source: candidateQuote.source, sourceUrl: candidateQuote.sourceUrl };
      }
    }
    const article = applyEditorial({
      id: articleId(candidate.url),
      canonicalUrl: canonicalUrl(candidate.url),
      source: candidate.source,
      sourceRole: candidate.sourceRole,
      publishedAt: candidate.publishedAt || null,
      publishedDate: candidate.publishedDate,
      headline: candidate.headline,
      body: { charCount: body.length, sha256: require("crypto").createHash("sha256").update(body).digest("hex") },
      evidence,
      classification,
      quote,
      rankScore: newsRankScore(candidate),
    }, editorialOverrides);
    articles.push(article);
  }
  const stories = selectVerifiedStories(articles, asOfDate);
  const editorialQueue = articles.filter(article => article.editorial.status !== "verified").map(article => ({
    articleId: article.id,
    canonicalUrl: article.canonicalUrl,
    headline: article.headline,
    classification: article.classification,
    evidence: article.evidence,
    requiredShape: { headlineKo: "한국어 제목", summaryKo: "본문 근거 기반 한국어 요약", evidenceIds: ["e1"] },
  }));
  if (stories.length < 3) warnings.push(`본문 근거와 검증된 한국어 편집을 모두 갖춘 기사가 ${stories.length}건입니다. 임시저장·예약 발행 기준(3건)에 미달합니다.`);
  return {
    schemaVersion: 2,
    reportType: "us-daily-market-news",
    asOfDate,
    generatedAt: new Date().toISOString(),
    sourceMode: "evidence-pipeline",
    marketSnapshot,
    articles,
    stories,
    editorialQueue,
    sourceSummary: {
      directCandidateCount: directItems.length,
      discoveryCandidateCount: discoveryItems.length,
      bodyVerifiedArticleCount: articles.length,
      editorialVerifiedStoryCount: stories.length,
      directVerifiedStoryCount: stories.filter(story => story.sourceRole === "direct-rss").length,
    },
    warnings,
  };
}

async function collectPublisherEvidenceReport(options = {}) {
  const asOfDate = options.date || todayEastern();
  const warnings = [];
  const sectorStocks = options.sectorStocks || readSectorStocks(options.sectorStocksPath || DEFAULT_SECTOR_STOCKS_PATH);
  const [candidates, marketSnapshot] = await Promise.all([
    Array.isArray(options.publisherCandidates)
      ? Promise.resolve(options.publisherCandidates)
      : collectPublisherCandidates({ ...options, warnings }),
    options.marketSnapshotData ? Promise.resolve(options.marketSnapshotData) : collectMarketSnapshot({ ...options, asOfDate, warnings }),
  ]);
  const publisherCandidates = dedupeItems(candidates)
    .filter(candidate => /^https?:\/\//i.test(candidate.url || "") && !isGoogleNewsUrl(candidate.url));
  const editorialOverrides = readEditorialOverrides(options.editorial || options.editorialJson);
  const articles = [];
  const candidateLimit = Number(options.publisherCandidateLimit || 32);
  for (const candidate of publisherCandidates.slice(0, candidateLimit)) {
    let fetched;
    try {
      fetched = candidate.articleText
        ? { headline: candidate.headline, publishedAt: candidate.publishedAt || null, publishedDate: candidate.publishedDate, canonicalUrl: canonicalUrl(candidate.url), body: candidate.articleText }
        : await fetchPublisherArticle(candidate, { ...options, asOfDate });
    } catch (error) {
      warnings.push(`기사 본문 수집 실패: ${candidate.headline} (${error.message})`);
      continue;
    }
    if (fetched.publishedDate !== asOfDate) continue;
    const body = normalizeSpace(fetched.body);
    if (body.length < MIN_BODY_CHARS) {
      warnings.push(`본문 추출 기준 미달로 제외: ${fetched.headline}`);
      continue;
    }
    if (!articleMatchesHeadline(body, fetched.headline)) {
      warnings.push(`제목과 본문 일치 검증 실패로 제외: ${fetched.headline}`);
      continue;
    }
    const evidence = extractEvidence(body);
    if (!evidence.length) {
      warnings.push(`인용 가능한 사실 문장이 없어 제외: ${fetched.headline}`);
      continue;
    }
    const enriched = { ...candidate, headline: fetched.headline, title: fetched.headline, articleText: body };
    const classification = classifyEvidenceArticle(enriched, sectorStocks);
    if (!classification) continue;
    let quote = null;
    if (classification.ticker) {
      const candidateQuote = options.stockQuotes?.[classification.ticker]
        || await fetchMarketQuote({ symbol: classification.ticker, name: classification.name }, asOfDate, warnings, options);
      if (candidateQuote?.date === asOfDate && Number.isFinite(Number(candidateQuote.price)) && Number.isFinite(Number(candidateQuote.changePct))) {
        quote = { symbol: classification.ticker, price: candidateQuote.price, changePct: candidateQuote.changePct, date: candidateQuote.date, source: candidateQuote.source, sourceUrl: candidateQuote.sourceUrl };
      }
    }
    const article = applyEditorial({
      id: articleId(fetched.canonicalUrl),
      canonicalUrl: fetched.canonicalUrl,
      source: candidate.source,
      sourceId: candidate.sourceId,
      sourceRole: "publisher-web",
      sourceTier: "primary-publisher",
      publishedAt: fetched.publishedAt,
      publishedDate: fetched.publishedDate,
      headline: fetched.headline,
      body: { charCount: body.length, sha256: require("crypto").createHash("sha256").update(body).digest("hex") },
      evidence,
      classification,
      quote,
      rankScore: newsRankScore(enriched),
    }, editorialOverrides);
    articles.push(article);
  }
  const stories = selectVerifiedStories(articles, asOfDate);
  const editorialQueue = articles.filter(article => article.editorial.status !== "verified").map(article => ({
    articleId: article.id,
    canonicalUrl: article.canonicalUrl,
    headline: article.headline,
    source: article.source,
    classification: article.classification,
    evidence: article.evidence,
    requiredShape: { headlineKo: "한국어 제목", summaryKo: "본문 근거 기반 한국어 요약", evidenceIds: ["e1"] },
  }));
  if (stories.length < 3) warnings.push(`직접 발행사 본문과 Codex 편집 근거를 모두 갖춘 기사가 ${stories.length}건입니다. 임시저장·예약 발행 기준(3건)에 미달합니다.`);
  return {
    schemaVersion: 2,
    reportType: "us-daily-market-news",
    asOfDate,
    generatedAt: new Date().toISOString(),
    sourceMode: "publisher-web-evidence",
    marketSnapshot,
    articles,
    stories,
    editorialQueue,
    sourceSummary: {
      publisherCandidateCount: publisherCandidates.length,
      bodyVerifiedArticleCount: articles.length,
      editorialVerifiedStoryCount: stories.length,
      directPublisherStoryCount: stories.filter(story => story.sourceRole === "publisher-web").length,
      publisherNames: [...new Set(articles.map(article => article.source))],
    },
    warnings,
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const date = args.date || todayEastern();
  const outPath = path.resolve(args["json-out"] || `analysis-example/us-market/daily-news-${date}.json`);
  const result = await collectPublisherEvidenceReport({
    ...args,
    date,
    publisherCandidates: readPublisherCandidates(args["publisher-candidates"]),
    editorial: args.editorial || args["editorial-json"],
  });
  writeJsonAtomic(outPath, result);
  process.stdout.write(`${JSON.stringify({ jsonPath: outPath, asOfDate: result.asOfDate, sourceSummary: result.sourceSummary, warnings: result.warnings }, null, 2)}\n`);
}

if (require.main === module) {
  main().catch(error => { console.error(error.message); process.exit(1); });
}

module.exports = {
  buildSectorStockQueries,
  buildOneLine,
  buildMarketSummary,
  buildSectorDiscoveryQueries,
  classifyThemes,
  collectDailyMarketNews,
  collectEvidenceReport,
  collectPublisherCandidates,
  collectPublisherEvidenceReport,
  readPublisherCandidates,
  collectDirectRssItems,
  collectGoogleDiscovery,
  collectMarketSnapshot,
  collectSectorNews,
  collectFeaturedStocks,
  enrichArticleBodies,
  featuredStockCandidates,
  fetchArticleBody,
  articleBodyFromHtml,
  articleMatchesHeadline,
  DEFAULT_DIRECT_RSS_SOURCES,
  DEFAULT_PUBLISHER_SOURCES,
  DEFAULT_SECTORS,
  DEFAULT_SECTOR_STOCKS_PATH,
  dedupeItems,
  extractArticleText,
  googleNewsRssUrl,
  isGoogleNewsUrl,
  marketNewsScore,
  newsRankScore,
  recencyBonus,
  closingBonus,
  parseEasternTimestamp,
  easternHourFraction,
  parseRssItems,
  rankNewsItems,
  readSectorStocks,
  readWatchlist,
  normalizeRssPubDate,
  normalizeNewsDate,
  stripHtml,
  todayEastern,
};
