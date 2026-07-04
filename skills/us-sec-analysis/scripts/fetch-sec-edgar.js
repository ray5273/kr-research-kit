#!/usr/bin/env node

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const DEFAULT_FORMS = ["10-K", "10-Q", "8-K"];
const DEFAULT_CACHE_DIR = ".tmp/sec-edgar-cache";
const DEFAULT_USER_AGENT = "KrResearchKit AdminContact@example.com";
const REQUEST_DELAY_MS = 150;

const CONCEPT_MAP = {
  revenue: ["RevenueFromContractWithCustomerExcludingAssessedTax", "Revenues"],
  grossProfit: ["GrossProfit"],
  operatingIncome: ["OperatingIncomeLoss"],
  netIncome: ["NetIncomeLoss"],
  epsDiluted: ["EarningsPerShareDiluted"],
  cash: ["CashAndCashEquivalentsAtCarryingValue"],
  assets: ["Assets"],
  liabilities: ["Liabilities"],
  equity: ["StockholdersEquity"],
  operatingCashFlow: ["NetCashProvidedByUsedInOperatingActivities"],
  capex: ["PaymentsToAcquirePropertyPlantAndEquipment"],
};

function parseArgs(argv) {
  const result = {
    forms: DEFAULT_FORMS,
    cacheDir: DEFAULT_CACHE_DIR,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--ticker") {
      result.ticker = argv[index + 1];
      index += 1;
    } else if (arg === "--cik") {
      result.cik = argv[index + 1];
      index += 1;
    } else if (arg === "--forms") {
      result.forms = argv[index + 1]
        .split(",")
        .map((item) => item.trim().toUpperCase())
        .filter(Boolean);
      index += 1;
    } else if (arg === "--output") {
      result.output = argv[index + 1];
      index += 1;
    } else if (arg === "--cache-dir") {
      result.cacheDir = argv[index + 1];
      index += 1;
    } else if (arg === "--user-agent") {
      result.userAgent = argv[index + 1];
      index += 1;
    } else if (arg === "--fixture-dir") {
      result.fixtureDir = argv[index + 1];
      index += 1;
    } else if (arg === "--help" || arg === "-h") {
      result.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return result;
}

function usage() {
  return [
    "Usage:",
    "  node fetch-sec-edgar.js --ticker AAPL --output <dir> [--forms 10-K,10-Q,8-K] [--cache-dir .tmp/sec-edgar-cache] [--user-agent 'Company email@example.com']",
    "  node fetch-sec-edgar.js --cik 0000320193 --output <dir> [--fixture-dir examples/us-sec-analysis]",
    "",
    "SEC fair access:",
    "  Set SEC_USER_AGENT or pass --user-agent with a company/app name and contact email.",
    "  Recommended format: \"YourCompanyOrApp AdminContact@example.com\".",
  ].join("\n");
}

function ensureDir(dirPath) {
  fs.mkdirSync(path.resolve(dirPath), { recursive: true });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(filePath), "utf8"));
}

function writeText(filePath, text) {
  ensureDir(path.dirname(path.resolve(filePath)));
  fs.writeFileSync(path.resolve(filePath), text, "utf8");
}

function writeJson(filePath, value) {
  writeText(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function normalizeCik(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) {
    throw new Error("CIK is empty.");
  }
  return digits.padStart(10, "0");
}

function archiveCik(cik10) {
  return String(Number(cik10));
}

function cachePathFor(cacheDir, url, contentType) {
  const hash = crypto.createHash("sha256").update(url).digest("hex");
  const ext = contentType === "json" ? "json" : "html";
  return path.join(cacheDir, `${hash}.${ext}`);
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function fetchWithCache(url, { cacheDir, userAgent, contentType }) {
  ensureDir(cacheDir);
  const cachePath = cachePathFor(cacheDir, url, contentType);
  if (fs.existsSync(cachePath)) {
    return fs.readFileSync(cachePath, "utf8");
  }

  await sleep(REQUEST_DELAY_MS);
  const response = await fetch(url, {
    headers: {
      "User-Agent": userAgent,
      "Accept-Encoding": "gzip, deflate",
      Accept: contentType === "json" ? "application/json,text/plain,*/*" : "text/html,application/xhtml+xml,text/plain,*/*",
    },
  });
  if (!response.ok) {
    throw new Error(`SEC request failed (${response.status}) for ${url}`);
  }
  const text = await response.text();
  writeText(cachePath, text);
  return text;
}

async function fetchJson(url, options) {
  const text = await fetchWithCache(url, { ...options, contentType: "json" });
  return JSON.parse(text);
}

async function fetchHtml(url, options) {
  return fetchWithCache(url, { ...options, contentType: "html" });
}

function getFixturePath(fixtureDir, fileName) {
  const fullPath = path.resolve(fixtureDir, fileName);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Missing fixture: ${fullPath}`);
  }
  return fullPath;
}

function loadTickerExchangeFixture(fixtureDir) {
  return readJson(getFixturePath(fixtureDir, "company_tickers_exchange_sample.json"));
}

function loadTickerFallbackFixture(fixtureDir) {
  const filePath = path.resolve(fixtureDir, "company_tickers_sample.json");
  return fs.existsSync(filePath) ? readJson(filePath) : null;
}

function loadSubmissionsFixture(fixtureDir) {
  return readJson(getFixturePath(fixtureDir, "submissions-aapl-sample.json"));
}

function loadCompanyfactsFixture(fixtureDir) {
  return readJson(getFixturePath(fixtureDir, "companyfacts-aapl-sample.json"));
}

function loadHtmlFixture(fixtureDir, form) {
  const normalized = form.toLowerCase().replace(/[^a-z0-9]+/g, "");
  return fs.readFileSync(getFixturePath(fixtureDir, `filing-${normalized}-aapl-sample.html`), "utf8");
}

function parseExchangeTickerMap(payload) {
  if (!payload || !Array.isArray(payload.fields) || !Array.isArray(payload.data)) {
    return [];
  }
  const fields = payload.fields.map((field) => String(field).toLowerCase());
  const cikIndex = fields.indexOf("cik");
  const nameIndex = fields.indexOf("name");
  const tickerIndex = fields.indexOf("ticker");
  const exchangeIndex = fields.indexOf("exchange");

  return payload.data.map((row) => ({
    cik: normalizeCik(row[cikIndex]),
    name: row[nameIndex],
    ticker: String(row[tickerIndex] || "").toUpperCase(),
    exchange: row[exchangeIndex] || null,
  }));
}

function parseFallbackTickerMap(payload) {
  if (!payload || typeof payload !== "object") {
    return [];
  }
  return Object.values(payload)
    .filter((entry) => entry && entry.ticker && entry.cik_str)
    .map((entry) => ({
      cik: normalizeCik(entry.cik_str),
      name: entry.title,
      ticker: String(entry.ticker).toUpperCase(),
      exchange: null,
    }));
}

async function resolveTicker({ ticker, fixtureDir, cacheDir, userAgent }) {
  if (!ticker) {
    return null;
  }
  const upperTicker = ticker.toUpperCase();

  const exchangePayload = fixtureDir
    ? loadTickerExchangeFixture(fixtureDir)
    : await fetchJson("https://www.sec.gov/files/company_tickers_exchange.json", { cacheDir, userAgent });
  const exchangeMatches = parseExchangeTickerMap(exchangePayload).filter((entry) => entry.ticker === upperTicker);
  if (exchangeMatches.length > 0) {
    return exchangeMatches[0];
  }

  const fallbackPayload = fixtureDir
    ? loadTickerFallbackFixture(fixtureDir)
    : await fetchJson("https://www.sec.gov/files/company_tickers.json", { cacheDir, userAgent });
  const fallbackMatches = parseFallbackTickerMap(fallbackPayload).filter((entry) => entry.ticker === upperTicker);
  if (fallbackMatches.length > 0) {
    return fallbackMatches[0];
  }

  throw new Error(`Ticker not found in SEC ticker maps: ${ticker}`);
}

function buildRecentFilings(submissions) {
  const recent = submissions && submissions.filings && submissions.filings.recent;
  if (!recent || !Array.isArray(recent.accessionNumber)) {
    return [];
  }

  return recent.accessionNumber.map((accessionNumber, index) => ({
    accessionNumber,
    form: recent.form ? recent.form[index] : null,
    filingDate: recent.filingDate ? recent.filingDate[index] : null,
    reportDate: recent.reportDate ? recent.reportDate[index] : null,
    acceptanceDateTime: recent.acceptanceDateTime ? recent.acceptanceDateTime[index] : null,
    act: recent.act ? recent.act[index] : null,
    fileNumber: recent.fileNumber ? recent.fileNumber[index] : null,
    filmNumber: recent.filmNumber ? recent.filmNumber[index] : null,
    items: recent.items ? recent.items[index] : null,
    size: recent.size ? recent.size[index] : null,
    isXBRL: recent.isXBRL ? recent.isXBRL[index] : null,
    isInlineXBRL: recent.isInlineXBRL ? recent.isInlineXBRL[index] : null,
    primaryDocument: recent.primaryDocument ? recent.primaryDocument[index] : null,
    primaryDocDescription: recent.primaryDocDescription ? recent.primaryDocDescription[index] : null,
  }));
}

function compareFilingDesc(left, right) {
  const leftKey = `${left.filingDate || ""}T${left.acceptanceDateTime || ""}`;
  const rightKey = `${right.filingDate || ""}T${right.acceptanceDateTime || ""}`;
  return rightKey.localeCompare(leftKey);
}

function selectLatestFilings(filings, forms) {
  return forms
    .map((requestedForm) => {
      const exact = filings.filter((filing) => filing.form === requestedForm).sort(compareFilingDesc);
      const variants = filings.filter((filing) => filing.form === `${requestedForm}/A`).sort(compareFilingDesc);
      const selected = exact[0] || variants[0] || null;
      return selected ? { requestedForm, ...selected } : { requestedForm, missing: true };
    })
    .filter(Boolean);
}

function buildArchiveUrls(cik10, filing) {
  if (!filing || !filing.accessionNumber) {
    return {};
  }
  const accessionNoDashes = filing.accessionNumber.replace(/-/g, "");
  const baseUrl = `https://www.sec.gov/Archives/edgar/data/${archiveCik(cik10)}/${accessionNoDashes}`;
  return {
    archiveFolderUrl: `${baseUrl}/`,
    indexUrl: `https://www.sec.gov/Archives/edgar/data/${archiveCik(cik10)}/${filing.accessionNumber}-index.html`,
    primaryDocumentUrl: filing.primaryDocument ? `${baseUrl}/${filing.primaryDocument}` : null,
  };
}

function decodeHtmlEntities(text) {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, num) => String.fromCodePoint(parseInt(num, 10)));
}

function htmlToText(html) {
  return decodeHtmlEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<\/(div|p|tr|table|section|article|header|footer|h[1-6])>/gi, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function outputBaseName(form) {
  return `latest-${form.toLowerCase().replace(/[^a-z0-9]+/g, "")}`;
}

function factSortDesc(left, right) {
  const leftKey = `${left.end || ""}T${left.filed || ""}`;
  const rightKey = `${right.end || ""}T${right.filed || ""}`;
  return rightKey.localeCompare(leftKey);
}

function summarizeFacts(companyfacts, cik10, ticker) {
  const factsRoot = companyfacts && companyfacts.facts ? companyfacts.facts : {};
  const summary = {
    generatedAt: new Date().toISOString(),
    cik: cik10,
    ticker: ticker || null,
    entityName: companyfacts.entityName || null,
    sourceUrl: `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik10}.json`,
    sourceRole: "SEC XBRL companyfacts; standard taxonomy facts only",
    concepts: {},
  };

  for (const [metric, conceptNames] of Object.entries(CONCEPT_MAP)) {
    const metricResult = {
      metric,
      conceptsTried: conceptNames,
      status: "not_separately_disclosed_in_standard_companyfacts",
      taxonomy: null,
      selectedConcept: null,
      label: null,
      description: null,
      units: {},
    };

    for (const taxonomy of ["us-gaap", "ifrs-full"]) {
      const taxonomyFacts = factsRoot[taxonomy] || {};
      const conceptName = conceptNames.find((candidate) => taxonomyFacts[candidate]);
      if (!conceptName) {
        continue;
      }
      const concept = taxonomyFacts[conceptName];
      metricResult.status = "found";
      metricResult.taxonomy = taxonomy;
      metricResult.selectedConcept = conceptName;
      metricResult.label = concept.label || null;
      metricResult.description = concept.description || null;
      for (const [unit, facts] of Object.entries(concept.units || {})) {
        metricResult.units[unit] = facts
          .slice()
          .sort(factSortDesc)
          .slice(0, 12)
          .map((fact) => ({
            taxonomy,
            concept: conceptName,
            unit,
            val: fact.val,
            start: fact.start || null,
            end: fact.end || null,
            fy: fact.fy || null,
            fp: fact.fp || null,
            form: fact.form || null,
            filed: fact.filed || null,
            accn: fact.accn || null,
            frame: fact.frame || null,
          }));
      }
      break;
    }

    summary.concepts[metric] = metricResult;
  }

  return summary;
}

function buildSourceMap({ cik10, selectedFilings, factsSummary }) {
  const rows = [
    {
      claim: "Ticker to CIK mapping",
      sourceType: "SEC ticker map",
      documentOrConcept: "company_tickers_exchange.json / company_tickers.json",
      filed: null,
      accession: null,
      url: "https://www.sec.gov/files/company_tickers_exchange.json",
      status: "collected",
    },
    {
      claim: "Filing history",
      sourceType: "SEC submissions API",
      documentOrConcept: `CIK${cik10}.json`,
      filed: null,
      accession: null,
      url: `https://data.sec.gov/submissions/CIK${cik10}.json`,
      status: "collected",
    },
    {
      claim: "Standard XBRL company facts",
      sourceType: "SEC companyfacts API",
      documentOrConcept: `CIK${cik10}.json`,
      filed: null,
      accession: null,
      url: factsSummary.sourceUrl,
      status: "collected",
    },
  ];

  for (const filing of selectedFilings.filter((item) => !item.missing)) {
    rows.push({
      claim: `Latest ${filing.requestedForm} selected filing`,
      sourceType: "SEC primary filing document",
      documentOrConcept: filing.primaryDocument || filing.primaryDocDescription || filing.form,
      filed: filing.filingDate,
      accession: filing.accessionNumber,
      url: filing.primaryDocumentUrl || filing.indexUrl,
      status: filing.primaryDocumentUrl ? "collected" : "metadata_only",
    });
  }

  return rows;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  if (!args.ticker && !args.cik) {
    throw new Error("Pass --ticker or --cik.");
  }
  if (!args.output) {
    throw new Error("Pass --output.");
  }

  const outputDir = path.resolve(args.output);
  ensureDir(outputDir);

  const userAgent = args.userAgent || process.env.SEC_USER_AGENT || DEFAULT_USER_AGENT;
  if (!args.userAgent && !process.env.SEC_USER_AGENT) {
    console.error("[sec] Warning: using a placeholder SEC User-Agent. Set SEC_USER_AGENT with a real company/app name and contact email for live collection.");
  }

  const fixtureDir = args.fixtureDir ? path.resolve(args.fixtureDir) : null;
  const tickerEntry = args.ticker
    ? await resolveTicker({ ticker: args.ticker, fixtureDir, cacheDir: args.cacheDir, userAgent })
    : null;
  const cik10 = normalizeCik(args.cik || tickerEntry.cik);

  const submissions = fixtureDir
    ? loadSubmissionsFixture(fixtureDir)
    : await fetchJson(`https://data.sec.gov/submissions/CIK${cik10}.json`, { cacheDir: args.cacheDir, userAgent });
  const companyfacts = fixtureDir
    ? loadCompanyfactsFixture(fixtureDir)
    : await fetchJson(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik10}.json`, { cacheDir: args.cacheDir, userAgent });

  const ticker = args.ticker ? args.ticker.toUpperCase() : (submissions.tickers && submissions.tickers[0]) || null;
  const companyName = submissions.name || (tickerEntry && tickerEntry.name) || companyfacts.entityName || null;
  const allFilings = buildRecentFilings(submissions);
  const selectedFilings = selectLatestFilings(allFilings, args.forms).map((filing) => ({
    ...filing,
    ...buildArchiveUrls(cik10, filing),
  }));

  const documents = [];
  for (const filing of selectedFilings) {
    if (filing.missing || !filing.primaryDocumentUrl) {
      continue;
    }
    const html = fixtureDir
      ? loadHtmlFixture(fixtureDir, filing.requestedForm)
      : await fetchHtml(filing.primaryDocumentUrl, { cacheDir: args.cacheDir, userAgent });
    const baseName = outputBaseName(filing.requestedForm);
    const htmlPath = path.join(outputDir, `${baseName}.html`);
    const textPath = path.join(outputDir, `${baseName}.txt`);
    writeText(htmlPath, html);
    writeText(textPath, htmlToText(html));
    documents.push({
      requestedForm: filing.requestedForm,
      form: filing.form,
      accessionNumber: filing.accessionNumber,
      filingDate: filing.filingDate,
      reportDate: filing.reportDate,
      primaryDocument: filing.primaryDocument,
      primaryDocumentUrl: filing.primaryDocumentUrl,
      htmlPath: path.relative(outputDir, htmlPath),
      textPath: path.relative(outputDir, textPath),
    });
  }

  const factsSummary = summarizeFacts(companyfacts, cik10, ticker);
  const exportPayload = {
    generatedAt: new Date().toISOString(),
    fixtureMode: Boolean(fixtureDir),
    secFairAccess: {
      declaredUserAgent: userAgent,
      requestDelayMs: REQUEST_DELAY_MS,
      maxRequestsPerSecondPolicy: "SEC fair access page states current max request rate is 10 requests/second; this script throttles below that.",
    },
    company: {
      name: companyName,
      ticker,
      cik: archiveCik(cik10),
      cik10,
      exchange: tickerEntry ? tickerEntry.exchange : null,
    },
    formsRequested: args.forms,
    selectedFilings,
    documents,
    files: {
      submissions: "sec-submissions.json",
      companyfacts: "sec-companyfacts.json",
      filingExport: "sec-filing-export.json",
    },
    sourceMap: buildSourceMap({ cik10, selectedFilings, factsSummary }),
  };

  writeJson(path.join(outputDir, "sec-submissions.json"), submissions);
  writeJson(path.join(outputDir, "sec-companyfacts.json"), factsSummary);
  writeJson(path.join(outputDir, "sec-filing-export.json"), exportPayload);

  console.log(`Wrote SEC export for ${companyName || ticker || cik10} to ${outputDir}`);
}

main().catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exit(1);
});
