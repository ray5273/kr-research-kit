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
  if (/오늘|방금|분\s*전|시간\s*전/.test(text)) return asOfDate;
  if (/어제|1일\s*전|하루\s*전/.test(text)) return addDays(asOfDate, -1);
  const daysAgo = text.match(/(\d+)\s*일\s*전/);
  if (daysAgo) return addDays(asOfDate, -Number(daysAgo[1]));
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

function todayKst() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
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
  "반도체/AI",
  "이차전지/전기차",
  "자동차/부품",
  "조선/방산",
  "바이오/헬스케어",
  "인터넷/게임/미디어",
  "금융/증권/보험",
  "화학/정유",
  "철강/기계/건설",
  "소비재/화장품/유통",
];

const DEFAULT_SECTOR_STOCKS_PATH = "examples/kr/daily-sector-stocks.json";
const DEFAULT_DIRECT_RSS_SOURCES = [
  { name: "연합뉴스 마켓+", url: "https://www.yna.co.kr/rss/market.xml" },
  { name: "연합뉴스 경제", url: "https://www.yna.co.kr/rss/economy.xml" },
  { name: "한국경제", url: "https://www.hankyung.com/feed/all-news" },
];
const GOOGLE_NEWS_RSS_BASE = "https://news.google.com/rss/search";
const MARKET_KEYWORDS = /코스피|코스닥|증시|주식시장|시장\s*(?:흐름|마감|전망|수급)|외국인|기관|금리|환율|원화|달러|마감|상승|하락|급등|급락/i;

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

function dateInKst(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function normalizeRssPubDate(value, asOfDate = null) {
  const text = normalizeSpace(decodeXmlEntities(value));
  if (!text) return null;
  const newsDate = normalizeNewsDate(text, asOfDate);
  if (newsDate) return newsDate;
  const parsed = new Date(text);
  return dateInKst(parsed);
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
    assert(/^\d{6}$/.test(String(item.ticker || "")), `Watchlist item ${index + 1} must include a six-digit ticker`);
    assert(normalizeSpace(item.name), `Watchlist item ${index + 1} must include a name`);
    return {
      ticker: String(item.ticker),
      name: normalizeSpace(item.name),
      keywords: Array.isArray(item.keywords) ? item.keywords.map(normalizeSpace).filter(Boolean) : [],
      dartUrl: item.dartUrl || null,
      krxUrl: item.krxUrl || null,
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
      assert(/^\d{6}$/.test(String(item.ticker || "")), `${sector} stock ${index + 1} must include a six-digit ticker`);
      assert(normalizeSpace(item.name), `${sector} stock ${index + 1} must include a name`);
      return {
        ticker: String(item.ticker),
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
    query: `${stock.name} ${sectorKeyword(sector, stock)} 주식 뉴스`,
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
        "user-agent": "Mozilla/5.0 kr-research-kit daily-market-news",
        "accept-language": "ko-KR,ko;q=0.9,en;q=0.7",
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
  return filterSameDateItems(items, options.asOfDate, warnings, "국내 RSS 기사").filter(item => item.url);
}

function googleNewsRssUrl(query) {
  const params = new URLSearchParams({
    q: query,
    hl: "ko",
    gl: "KR",
    ceid: "KR:ko",
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
    query: `${terms.join(" OR ")} 주식 뉴스`,
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
  return MARKET_KEYWORDS.test(textForMatch(item));
}

function sectorMatchTerms(sector, stocks = []) {
  return [...new Set([
    ...String(sector).split(/[\/\s]+/).map(normalizeSpace).filter(Boolean),
    ...stocks.map(stock => stock.name).filter(Boolean),
    ...stocks.flatMap(stock => stock.keywords || []).filter(Boolean),
  ])].filter(term => term.length >= 2);
}

function matchesSectorNews(item, sector, stocks = []) {
  const text = textForMatch(item);
  return sectorMatchTerms(sector, stocks).some(term => text.includes(term));
}

function classifyThemes(items) {
  const buckets = [
    { theme: "반도체 / AI", pattern: /반도체|HBM|DRAM|낸드|AI|엔비디아|메모리/i },
    { theme: "이차전지 / 전기차", pattern: /배터리|이차전지|전기차|ESS|양극재|리튬/i },
    { theme: "금리 / 환율 / 매크로", pattern: /금리|환율|달러|원화|물가|FOMC|연준/i },
    { theme: "정책 / 지배구조", pattern: /정책|정부|세제|상법|배당|자사주|지배구조/i },
    { theme: "바이오 / 헬스케어", pattern: /바이오|임상|FDA|신약|헬스케어/i },
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

function buildOneLine(marketNews) {
  const firstMarket = marketNews[0]?.headline;
  if (firstMarket) return firstMarket;
  return "수집된 기사 수가 제한적입니다. 원문 출처를 우선 확인해야 합니다.";
}

const SUMMARY_NOISE_PATTERN = /무단전재|저작권|기자\s*=|특파원\s*=|구독|제보|편집자\s*주|공모\s*가격|상장됐을\s*당시|한국판\s*나스닥|ⓒ|Copyright/i;
const SUMMARY_CANDIDATE_NOISE_PATTERN = /편집자\s*주|한국판\s*나스닥|표방\s*출범|시총\s*\d+배|공모\s*가격|상장됐을\s*당시|역사|발자취/i;

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
  if (SUMMARY_NOISE_PATTERN.test(text)) return "";
  if (text.length < 18) return "";
  return text.length > 110 ? text.slice(0, 110).replace(/[,.·\s]+$/, "") : text;
}

function isLowQualitySummaryCandidate(item) {
  const headline = cleanNewsText(item.headline || item.title || "");
  const description = cleanNewsText(item.description || "");
  return SUMMARY_CANDIDATE_NOISE_PATTERN.test(`${headline} ${description}`);
}

function marketSummaryTheme(item) {
  const text = textForMatch(item);
  const tests = [
    {
      theme: "코스닥 밸류업/퇴출 제도",
      pattern: /코스닥(?=.*(?:밸류업|퇴출|상장폐지|활성화|저평가|30주년))/i,
      implication: "코스닥 저평가 해소 정책이 중소형주 선별과 시장 신뢰 회복으로 이어지는지 봐야 합니다",
    },
    {
      theme: "반도체 업황",
      pattern: /반도체|HBM|DRAM|D램|낸드|AI\s*반도체|엔비디아|키옥시아|메모리/i,
      implication: "반도체 주도주 수급과 실적 기대가 지수 방향성을 계속 이끄는지 확인해야 합니다",
    },
    {
      theme: "7월 실적 시즌",
      pattern: /실적\s*시즌|어닝|분기\s*실적|7월/i,
      implication: "실적 확인 구간에서 이익 전망과 주가 반응의 간극을 점검할 필요가 있습니다",
    },
    {
      theme: "ETF 시장",
      pattern: /ETF|상장지수펀드/i,
      implication: "패시브 자금 확대가 개별 업종 변동성과 시장 구조에 미치는 영향을 봐야 합니다",
    },
    {
      theme: "레버리지 수급",
      pattern: /레버리지|빚투|신용|미수|선물|차입|변동성/i,
      implication: "과도한 레버리지 수급이 단기 변동성을 키우는지 관리해야 합니다",
    },
    {
      theme: "금리/환율",
      pattern: /금리|환율|달러|원화|연준|FOMC|물가/i,
      implication: "금리와 환율 변화가 외국인 수급과 성장주 밸류에이션에 미치는 영향을 봐야 합니다",
    },
    {
      theme: "시장 수급",
      pattern: /코스피|코스닥|증시|주식시장|외국인|기관|개인|상승|하락|마감/i,
      implication: "지수 흐름보다 수급 주체와 주도 업종의 지속성을 확인해야 합니다",
    },
  ];
  return tests.find(test => test.pattern.test(text)) || {
    theme: "시장 뉴스",
    implication: "해당 뉴스가 업종별 투자심리와 수급에 어떤 변화를 만드는지 확인해야 합니다",
  };
}

function summaryEventText(item) {
  const headline = cleanNewsText(item.headline || item.title || "시장 뉴스");
  const description = usableDescription(item.description);
  if (description && !description.includes(headline) && !headline.includes(description)) {
    return `${headline}은 ${description}`;
  }
  return headline;
}

function makeMarketSummary(item) {
  const event = summaryEventText(item);
  const theme = marketSummaryTheme(item);
  const prefix = theme.theme === "시장 뉴스" ? "" : `${theme.theme}: `;
  const summary = `${prefix}${event} 기사입니다. 시장에서는 ${theme.implication}.`;
  return summary.length > 210 ? summary.slice(0, 210).replace(/[,.·\s]+$/, "") : summary;
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
      return { sector, query: existing.query || `한국증시 ${sector} 주식 뉴스`, items: filterSameDateItems(existing.items || [], asOfDate, warnings, `${sector} 업종 뉴스`) };
    });
  }
  return DEFAULT_SECTORS.map(sector => ({
    sector,
    query: `한국증시 ${sector} 주식 뉴스`,
    items: filterSameDateItems(value?.[sector] || [], asOfDate, warnings, `${sector} 업종 뉴스`),
  }));
}

async function collectSectorNews(options = {}) {
  const groups = [];
  const warnings = options.warnings || [];
  const sectorStocks = options.sectorStocks
    || (options.sectorStocksPath === false ? null : readSectorStocks(options.sectorStocksPath || DEFAULT_SECTOR_STOCKS_PATH));
  const perSectorLimit = Number(options.sectorLimit || 5);
  const directItems = options.directRssItems || await collectDirectRssItems({ ...options, warnings });
  for (const sector of DEFAULT_SECTORS) {
    const stocks = sectorStocks?.[sector] || [];
    const discoveryQuery = buildSectorDiscoveryQueries(sector, stocks);
    const items = dedupeItems(directItems
      .filter(isDirectRssArticle)
      .filter(item => matchesSectorNews(item, sector, stocks))
      .map(item => ({ ...item, sector, query: discoveryQuery.query })))
      .slice(0, perSectorLimit);
    groups.push({
      sector,
      query: discoveryQuery.query,
      queries: [discoveryQuery],
      items,
    });
  }
  return groups;
}

async function collectDailyMarketNews(options) {
  const date = options.date || todayKst();
  const watchlist = options.watchlist ? readWatchlist(options.watchlist) : [];
  if (options.fixture) {
    const fixture = JSON.parse(fs.readFileSync(path.resolve(options.fixture), "utf8"));
    const warnings = [...(fixture.warnings || [])];
    const marketNews = filterSameDateItems(fixture.marketNews || [], date, warnings, "시장 뉴스");
    const marketSummary = fixture.marketSummary || await buildMarketSummary(marketNews, { fixture: true });
    const sectorNews = normalizeSectorNews(fixture.sectorNews, date, warnings);
    const officialSources = dedupeItems(fixture.officialSources || []);
    const allNews = [...marketNews, ...sectorNews.flatMap(group => group.items || [])];
    return {
      schemaVersion: 1,
      reportType: "kr-daily-market-news",
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
    "코스피 코스닥 마감 증시",
    "한국 증시 업종 테마",
    "코스피 코스닥 외국인 기관 수급",
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
    ? filterSameDateItems(options.directRssItems, date, warnings, "국내 RSS 기사")
    : await collectDirectRssItems({ ...options, asOfDate: date, warnings });
  const marketNews = dedupeItems(directRssItems
    .filter(isDirectRssArticle)
    .filter(matchesMarketNews))
    .slice(0, Number(options.marketLimit || 12));
  if (marketNews.length < 5) warnings.push(`시장 주요 뉴스가 기준일 기사만으로 ${marketNews.length}건 수집됐습니다.`);
  const marketSummary = await buildMarketSummary(marketNews, options);
  const sectorNews = await collectSectorNews({ ...options, asOfDate: date, warnings, sectorStocks, directRssItems });
  warnings.push(...sectorNews.map(group => group.warning).filter(Boolean));
  const officialSources = [];
  const allNews = [...marketNews, ...sectorNews.flatMap(group => group.items || [])];
  return {
    schemaVersion: 1,
    reportType: "kr-daily-market-news",
    asOfDate: date,
    generatedAt: new Date().toISOString(),
    sourceMode: "rss-hybrid",
    watchlist,
    oneLine: buildOneLine(marketNews),
    marketNews,
    marketSummary,
    sectorNews,
    discoveryNews: googleDiscovery,
    themes: classifyThemes([...allNews, ...googleDiscovery]),
    officialSources,
    sourceSummary: {
      marketNewsCount: marketNews.length,
      sectorNewsCount: sectorNews.reduce((sum, group) => sum + (group.items?.length || 0), 0),
      discoveryNewsCount: googleDiscovery.length,
      officialSourceCount: officialSources.length,
    },
    warnings,
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const date = args.date || todayKst();
  const outPath = path.resolve(args["json-out"] || `analysis-example/kr-market/daily-news-${date}.json`);
  const result = await collectDailyMarketNews({ ...args, date, watchlist: args.watchlist || "examples/kr/daily-watchlist.json" });
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
  collectSectorNews,
  DEFAULT_DIRECT_RSS_SOURCES,
  DEFAULT_SECTORS,
  DEFAULT_SECTOR_STOCKS_PATH,
  dedupeItems,
  extractArticleText,
  googleNewsRssUrl,
  isGoogleNewsUrl,
  parseRssItems,
  readSectorStocks,
  readWatchlist,
  normalizeRssPubDate,
  normalizeNewsDate,
  stripHtml,
  todayKst,
};
