#!/usr/bin/env node

// fetch-analyst-coverage.js — search Korean news for foreign-IB research
// coverage of a KRX company, fetch each article, extract broker/rating/TP/
// date metadata, and emit a JSON file the summarizer can consume.
//
// Source scope (v1): Korean news sites surfaced by Naver News search. The
// articles usually summarize or quote foreign IB reports (Morgan Stanley,
// Goldman, JPM, Nomura, CLSA, UBS, HSBC, Macquarie, etc.). Direct Bloomberg/
// Refinitiv access is intentionally out of scope.
//
// Fails loud when zero coverage records are produced, unless `--allow-empty`
// is passed (used by the harness `all` flow to avoid blocking memo
// generation for tiny caps that genuinely have no foreign-IB coverage).

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const browseNaver = require("../../kr-naver-browse/scripts/browse-naver.js");
const {
  extractBrokers,
  extractTargetPriceForCompany,
  extractRating,
  extractReportDate,
  extractThesisSnippet,
  paragraphAroundBroker,
  companyAliases,
  brokerCompanySentences,
  relevantBrokerWindows,
} = require("./lib/article-parser.js");

const DEFAULT_MAX_ARTICLES = 20;
const DEFAULT_DAYS = 180;
const DEFAULT_CACHE_DIR = ".tmp/foreign-analyst-cache";

function parseArgs(argv) {
  const opts = {
    maxArticles: DEFAULT_MAX_ARTICLES,
    days: DEFAULT_DAYS,
    cacheDir: DEFAULT_CACHE_DIR,
    noCache: false,
    allowEmpty: false,
    verbose: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => argv[++i];
    if (arg === "--company") opts.company = next();
    else if (arg === "--ticker") opts.ticker = next();
    else if (arg === "--output") opts.output = next();
    else if (arg === "--queries") opts.queries = next().split(";").map((s) => s.trim()).filter(Boolean);
    else if (arg === "--max-articles") opts.maxArticles = parseInt(next(), 10) || DEFAULT_MAX_ARTICLES;
    else if (arg === "--days") opts.days = parseInt(next(), 10) || DEFAULT_DAYS;
    else if (arg === "--cache-dir") opts.cacheDir = next();
    else if (arg === "--no-cache") opts.noCache = true;
    else if (arg === "--allow-empty") opts.allowEmpty = true;
    else if (arg === "--verbose") opts.verbose = true;
    else if (arg === "--help" || arg === "-h") opts.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return opts;
}

function usage() {
  return [
    "Usage:",
    "  node fetch-analyst-coverage.js --company <name> [--ticker <code>] --output <path>",
    "",
    "Options:",
    "  --company NAME      Company name (required)",
    "  --ticker CODE       6-digit KRX ticker (recommended)",
    "  --output PATH       Output JSON path (required)",
    "  --queries Q1;Q2;..  Override default query set (semicolon-separated)",
    "  --max-articles N    Upper bound on articles inspected (default 20)",
    "  --days N            Freshness window in days (default 180)",
    "  --cache-dir PATH    Cache root (default .tmp/foreign-analyst-cache)",
    "  --no-cache          Bypass discovery + article cache",
    "  --allow-empty       Write empty coverage + exit 0 when nothing is found",
    "  --verbose           Print discovery/fetch progress",
  ].join("\n");
}

function todayYmd() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function ensureDir(p) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
}

function writeJson(p, data) {
  ensureDir(p);
  fs.writeFileSync(p, JSON.stringify(data, null, 2) + "\n", "utf8");
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function sha(str, len) {
  return crypto.createHash("sha1").update(str).digest("hex").slice(0, len);
}

function defaultQueries(company) {
  return [
    `${company} 외국계`,
    `${company} 외국계 리포트`,
    `${company} 목표주가`,
    `${company} 모건스탠리 OR 골드만 OR JP모건 OR 노무라 OR 씨티 OR UBS OR HSBC OR 맥쿼리`,
  ];
}

function discoveryCachePath(cacheDir, ticker, query) {
  const scope = ticker || "no-ticker";
  return path.join(
    cacheDir,
    scope,
    "discovery",
    todayYmd(),
    `${sha(query, 8)}.json`
  );
}

function articleCachePath(cacheDir, url) {
  return path.join(cacheDir, "articles", `${sha(url, 16)}.json`);
}

function loadCache(p) {
  if (!fs.existsSync(p)) return null;
  try { return readJson(p); } catch { return null; }
}

function isWithinDays(isoDate, days) {
  if (!isoDate) return true; // unknown date -> keep, let parser re-date
  const t = Date.parse(isoDate);
  if (Number.isNaN(t)) return true;
  const ageDays = (Date.now() - t) / 86_400_000;
  return ageDays <= days;
}

function discoverArticles(opts) {
  const queries = opts.queries && opts.queries.length ? opts.queries : defaultQueries(opts.company);
  const all = [];
  const seen = new Set();

  for (const query of queries) {
    const cacheFile = discoveryCachePath(opts.cacheDir, opts.ticker, query);
    let results = null;

    if (!opts.noCache) {
      const cached = loadCache(cacheFile);
      if (cached && Array.isArray(cached.results)) {
        if (opts.verbose) console.error(`[discover] cache hit: ${query}`);
        results = cached.results;
      }
    }

    if (!results) {
      if (opts.verbose) console.error(`[discover] live: ${query}`);
      try {
        results = browseNaver.searchNaverNewsStructured(query, { max: 30, verbose: opts.verbose });
      } catch (err) {
        console.error(`[discover] query failed (${query}): ${err.message}`);
        results = [];
      }
      if (!opts.noCache) {
        writeJson(cacheFile, { query, fetchedAt: todayYmd(), results });
      }
    }

    for (const item of results) {
      if (!item || !item.url) continue;
      if (seen.has(item.url)) continue;
      seen.add(item.url);
      all.push({ ...item, sourceQueries: [query] });
    }
  }

  // Merge sourceQueries across dup URLs we already deduped
  const urlToRecord = new Map();
  for (const a of all) urlToRecord.set(a.url, a);
  const merged = Array.from(urlToRecord.values());

  // Apply freshness filter + sort by date desc + cap
  const filtered = merged.filter((a) => isWithinDays(a.date, opts.days));
  filtered.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  return filtered.slice(0, opts.maxArticles);
}

function fetchArticleBody(url, opts) {
  const cachePath = articleCachePath(opts.cacheDir, url);
  if (!opts.noCache) {
    const cached = loadCache(cachePath);
    if (cached) {
      if (opts.verbose) console.error(`[article cache] ${url}`);
      return { text: cached.text, fromCache: true };
    }
  }
  let text = null;
  try {
    text = browseNaver.browseText(url, { verbose: opts.verbose });
  } catch (err) {
    return { text: null, fromCache: false, error: err.message };
  }
  if (!text || text.length < 100) {
    return { text: null, fromCache: false, error: "empty text extraction" };
  }
  if (!opts.noCache) {
    writeJson(cachePath, { url, fetchedAt: todayYmd(), text });
  }
  return { text, fromCache: false };
}

function buildRecords(article, text, opts = {}) {
  const brokers = extractBrokers(text);
  if (!brokers.length) return [];
  const aliases = companyAliases(opts.company, opts.ticker);
  const records = [];
  for (const broker of brokers) {
    // A publisher page carries navigation, "많이 본 기사" rails, and unrelated
    // tickers. Keep only the windows where this broker is named next to the
    // company we asked about; if there are none, the mention is not coverage
    // of this name and the whole record is dropped.
    const windows = relevantBrokerWindows(text, broker, aliases);
    if (!windows.length) continue;

    // Extract strictly inside those windows, and read the rating/target price
    // only from sentences that name the company. Falling back to the full page
    // is what previously attached SK하이닉스's target price to 삼성전자.
    let rating = null;
    let targetPriceKrw = null;
    let reportDate = null;
    for (const win of windows) {
      for (const sentence of brokerCompanySentences(win, aliases, broker)) {
        rating = rating || extractRating(sentence);
        targetPriceKrw = targetPriceKrw || extractTargetPriceForCompany(sentence, aliases);
      }
      reportDate = reportDate || extractReportDate(win, null);
    }
    // "Broker X was named near company Y" is still not a view. Without a rating
    // or a target price there is nothing to report, and keeping such rows makes
    // passing mentions look like coverage.
    if (!rating && !targetPriceKrw) continue;

    reportDate = reportDate || article.date || null;
    const snippet = extractThesisSnippet(windows[0], broker, { maxChars: 240 })
      || extractThesisSnippet(text, broker, { maxChars: 240 });

    records.push({
      broker,
      rating,
      targetPriceKrw,
      reportDate,
      articleDate: article.date || null,
      articleUrl: article.url,
      press: article.press || null,
      title: article.title || "",
      snippet,
      sourceQueries: article.sourceQueries || [],
    });
  }
  return records;
}

function dedupeRecords(records) {
  const byKey = new Map();
  for (const r of records) {
    const key = `${r.broker}|${r.reportDate || ""}|${r.targetPriceKrw || ""}`;
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, r);
      continue;
    }
    // Keep longest snippet, earliest articleDate, union sourceQueries.
    const mergedSnippet = r.snippet && r.snippet.length > (prev.snippet || "").length ? r.snippet : prev.snippet;
    const mergedArticleDate = [prev.articleDate, r.articleDate].filter(Boolean).sort()[0] || null;
    const mergedSourceQueries = Array.from(new Set([...(prev.sourceQueries || []), ...(r.sourceQueries || [])]));
    // Prefer the record whose articleDate matches the earliest (likely scoop).
    const base = prev.articleDate && (!r.articleDate || prev.articleDate <= r.articleDate) ? prev : r;
    byKey.set(key, {
      ...base,
      snippet: mergedSnippet,
      articleDate: mergedArticleDate,
      sourceQueries: mergedSourceQueries,
      rating: base.rating || prev.rating || r.rating || null,
      targetPriceKrw: base.targetPriceKrw || prev.targetPriceKrw || r.targetPriceKrw || null,
    });
  }
  const out = Array.from(byKey.values());
  out.sort((a, b) => {
    const d = (b.reportDate || "").localeCompare(a.reportDate || "");
    if (d !== 0) return d;
    return a.broker.localeCompare(b.broker);
  });
  return out;
}

function run(opts) {
  if (!opts.company) {
    console.error("Error: --company is required");
    console.error(usage());
    process.exit(1);
  }
  if (!opts.output) {
    console.error("Error: --output is required");
    console.error(usage());
    process.exit(1);
  }

  const articles = discoverArticles(opts);
  if (opts.verbose) {
    console.error(`[discover] ${articles.length} candidate article(s) after filter`);
  }

  const rawRecords = [];
  const errors = [];
  let fromCache = 0;
  let inspected = 0;

  for (const article of articles) {
    const body = fetchArticleBody(article.url, opts);
    inspected += 1;
    if (body.fromCache) fromCache += 1;
    if (!body.text) {
      errors.push({ url: article.url, message: body.error || "unknown error" });
      continue;
    }
    const records = buildRecords(article, body.text, opts);
    rawRecords.push(...records);
  }

  const coverage = dedupeRecords(rawRecords);

  const output = {
    company: opts.company,
    ticker: opts.ticker || null,
    fetchedAt: todayYmd(),
    queries: opts.queries && opts.queries.length ? opts.queries : defaultQueries(opts.company),
    coverage,
    meta: {
      totalArticlesInspected: inspected,
      totalCoverageRecords: coverage.length,
      fromCache,
      errors,
      generatedBy: "kr-foreign-analyst/fetch-analyst-coverage.js",
    },
  };

  writeJson(opts.output, output);
  console.log(
    `Inspected ${inspected} article(s), produced ${coverage.length} coverage record(s). Cache hits: ${fromCache}. Output: ${opts.output}`
  );

  if (coverage.length === 0 && !opts.allowEmpty) {
    console.error(
      `Error: no foreign-IB coverage found for "${opts.company}". Pass --allow-empty to continue with an empty record set.`
    );
    process.exit(1);
  }
  return output;
}

function main() {
  let opts;
  try { opts = parseArgs(process.argv.slice(2)); }
  catch (err) {
    console.error(err.message);
    console.error(usage());
    process.exit(1);
  }
  if (opts.help) {
    console.log(usage());
    process.exit(0);
  }
  run(opts);
}

if (require.main === module) main();

module.exports = { run, defaultQueries };
