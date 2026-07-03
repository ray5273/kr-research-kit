#!/usr/bin/env node

const fs = require("fs");
const https = require("https");
const path = require("path");

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
const GOOGLE_NEWS_RSS_BASE = "https://news.google.com/rss/search";
const MARKET_KEYWORDS = /S&P\s*500|Nasdaq|Dow Jones|Russell 2000|Wall Street|stock market|stocks|equities|market\s*(?:close|rally|selloff|wrap|outlook)|Treasury|yield|Fed|FOMC|inflation|CPI|PCE|dollar|earnings|megacap|Magnificent Seven/i;
const BROAD_MARKET_PATTERN = /S&P\s*500|Nasdaq|Dow Jones|Russell 2000|Wall Street|stock market today|stocks?\s+(?:close|finish|end|rise|fall|gain|drop|slip|rally|sell off|mixed)|markets?\s+(?:close|finish|end|rise|fall|gain|drop|slip|rally|sell off|mixed)|Treasury|yield|Fed|FOMC|inflation|CPI|PCE|jobs report|payrolls|dollar|VIX|market wrap/i;
const LOW_PRIORITY_NEWS_PATTERN = /after\s*hours|pre[-\s]?market|IPO filing|files?\s+for\s+(?:IPO|Nasdaq)|secondary offering|stock split|dividend declaration|insider sale|price target|analyst rating|lawsuit|class action|penny stock|stock market today,\s*[^:]+:\s*(?!Dow|S&P|Nasdaq|Wall Street|Stocks|Markets|Futures|Treasury|Yields|Fed)|breaks?\s+(?:above|below)\s+(?:its\s+)?(?:50|100|200)-day|cross(?:es)?\s+(?:above|below)\s+(?:key|critical)?\s*moving average|cross(?:es)?\s+(?:above|below)\s+\d+\s*DMA|\b\d+\s*DMA\b|oversold|overbought|notable for|crypto market|bitcoin|millionaires?|wealth report|personal wealth|stock gains on S&P SmallCap/i;
const SECTOR_REJECT_PATTERN = /sports|lacrosse|mortgage rates only|home listing|celebrity|crypto|bitcoin|lottery|gamer trades|physical discs|credit-card debt|401\(k\)|retirement account|personal finance|New Zealand|Mexico stocks|Colombia stocks|European shares|FTSE|DAX|Nikkei|Hang Seng/i;
const BROAD_SECTOR_TERMS = new Set(["AI", "Services", "Consumer", "Staples", "Health", "Care", "Energy", "Materials", "Utilities", "Real", "Estate", "production", "capital", "demand", "media", "search"]);
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
    item.name,
  ].filter(Boolean).join(" "));
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
  if (LOW_PRIORITY_NEWS_PATTERN.test(text) || SECTOR_REJECT_PATTERN.test(text)) return false;
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
  if (SECTOR_REJECT_PATTERN.test(text)) return false;
  if (LOW_PRIORITY_NEWS_PATTERN.test(text)) return false;
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
  if (directMarketNews.length >= limit) return { marketNews: directMarketNews.slice(0, limit), fallbackCount: 0 };
  const existingKeys = new Set(directMarketNews.map(item => sourceKey(item)));
  const candidates = rankNewsItems((discoveryItems || [])
    .filter(matchesMarketNews)
    .filter(item => !existingKeys.has(sourceKey(item)))
    .map(item => ({
      ...item,
      sourceRole: "discovery-fallback",
      discoveryFallback: true,
    })), limit - directMarketNews.length, { minScore: 1 });
  return {
    marketNews: [...directMarketNews, ...candidates].slice(0, limit),
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
    const fallbackItems = directSectorItems.length >= minSignals ? [] : rankNewsItems(discoveryItems
      .filter(item => matchesSectorNews(item, sector, stocks))
      .map(item => ({
        ...item,
        url: "",
        sector,
        query: discoveryQuery.query,
        sourceRole: "discovery-signal",
        discovery: true,
      })), Math.max(0, minSignals - directSectorItems.length));
    const items = [...directSectorItems, ...fallbackItems].slice(0, perSectorLimit);
    groups.push({
      sector,
      query: discoveryQuery.query,
      queries: [discoveryQuery],
      items,
      discoverySignalCount: fallbackItems.length,
    });
  }
  return groups;
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
      themes: fixture.themes || classifyThemes(allNews),
      officialSources,
      sourceSummary: {
        marketNewsCount: marketNews.length,
        sectorNewsCount: sectorNews.reduce((sum, group) => sum + (group.items?.length || 0), 0),
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
  const marketNews = marketSupplement.marketNews;
  if (directMarketNews.length < 5 && marketSupplement.fallbackCount) {
    warnings.push(`시장 주요 뉴스는 direct RSS ${directMarketNews.length}건에 Google News discovery 보조 후보 ${marketSupplement.fallbackCount}건을 더해 구성했습니다.`);
  } else if (marketNews.length < 5) {
    warnings.push(`시장 주요 뉴스가 기준일 기사만으로 ${marketNews.length}건 수집됐습니다.`);
  }
  const marketSnapshot = options.marketSnapshotData || await collectMarketSnapshot({ ...options, asOfDate: date, warnings });
  const marketSummary = await buildMarketSummary(marketNews, options);
  const sectorNews = await collectSectorNews({ ...options, asOfDate: date, warnings, sectorStocks, directRssItems, discoveryItems: googleDiscovery });
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
    discoveryNews: googleDiscovery,
    themes: classifyThemes([...allNews, ...googleDiscovery]),
    officialSources,
    sourceSummary: {
      marketNewsCount: marketNews.length,
      marketNewsDirectCount: directMarketNews.length,
      marketNewsDiscoveryFallbackCount: marketSupplement.fallbackCount,
      sectorNewsCount: sectorNews.reduce((sum, group) => sum + (group.items?.length || 0), 0),
      sectorDiscoverySignalCount: sectorNews.reduce((sum, group) => sum + (group.discoverySignalCount || 0), 0),
      discoveryNewsCount: googleDiscovery.length,
      officialSourceCount: officialSources.length,
      marketSnapshotIndexCount: marketSnapshot?.indexes?.length || 0,
      marketSnapshotSectorCount: marketSnapshot?.sectors?.length || 0,
    },
    warnings,
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const date = args.date || todayEastern();
  const outPath = path.resolve(args["json-out"] || `analysis-example/us-market/daily-news-${date}.json`);
  const result = await collectDailyMarketNews({ ...args, date, watchlist: args.watchlist || "examples/us/daily-watchlist.json" });
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
  collectDirectRssItems,
  collectGoogleDiscovery,
  collectMarketSnapshot,
  collectSectorNews,
  DEFAULT_DIRECT_RSS_SOURCES,
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
