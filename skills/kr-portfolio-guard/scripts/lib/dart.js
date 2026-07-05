"use strict";

// New-filing sweep for KR holdings (script layer = raw list only).
//
// Reuses the OpenDART conventions from kr-stock-dart-analysis:
//   - corp master cache at <repo>/.tmp/opendart-cache/CORPCODE.xml
//     (seeded by fetch-opendart.js — if missing we fail loudly with the seed
//     command instead of re-implementing the ZIP download here)
//   - list.json?corp_code=...&bgn_de=...&end_de=... for per-company filings
//
// Semantic filing→trigger matching is the SKILL (LLM) layer's job (2cA):
// this module never filters — every filing since the last run is surfaced.

const fs = require("fs");
const path = require("path");
const https = require("https");

const { REPO_ROOT } = require("./env.js");

const API_BASE = "https://opendart.fss.or.kr/api";
const CORPCODE_XML = path.join(REPO_ROOT, ".tmp", "opendart-cache", "CORPCODE.xml");

function httpsGetJson(urlString) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      urlString,
      { headers: { "User-Agent": "kr-research-kit/1.0 (kr-portfolio-guard)", Accept: "application/json" } },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode} from OpenDART`));
            return;
          }
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
          } catch (err) {
            reject(new Error(`OpenDART returned non-JSON: ${err.message}`));
          }
        });
      }
    );
    req.setTimeout(60_000, () => req.destroy(new Error("OpenDART timeout")));
    req.on("error", reject);
  });
}

// Same parsing approach as fetch-opendart.js loadCorpCodeMap.
function loadCorpCodeMap() {
  if (!fs.existsSync(CORPCODE_XML)) {
    throw new Error(
      `OpenDART corp master not cached (${CORPCODE_XML}). Seed it once with:\n` +
        "  OPENDART_API_KEY=<key> node skills/kr-stock-dart-analysis/scripts/fetch-opendart.js --ticker 005930 --list-only\n" +
        "(any ticker works — the master downloads as a side effect)"
    );
  }
  const text = fs.readFileSync(CORPCODE_XML, "utf8");
  const map = new Map();
  const itemRe = /<list>([\s\S]*?)<\/list>/g;
  const fieldRe = (name) => new RegExp(`<${name}>([\\s\\S]*?)<\\/${name}>`);
  let match;
  while ((match = itemRe.exec(text)) !== null) {
    const block = match[1];
    const stock = (block.match(fieldRe("stock_code")) || [])[1];
    const corp = (block.match(fieldRe("corp_code")) || [])[1];
    if (stock && corp && stock.trim()) map.set(stock.trim(), corp.trim());
  }
  return map;
}

// ticker: bare 6-char KRX code (e.g. "336370" — strip .KS/.KQ before calling)
// Returns [{rcept_no, report_nm, rcept_dt, flr_nm}] since bgnDe (YYYYMMDD).
async function fetchNewFilings({ ticker, bgnDe, endDe, apiKey, corpMap }) {
  const corpCode = corpMap.get(ticker);
  if (!corpCode) {
    throw new Error(`corp_code not found for ${ticker} in cached master`);
  }
  // 페이지네이션: 오래 방치된 기간 + 다작 공시 기업이면 100건을 넘는다 —
  // 1페이지 절단은 조용한 공시 누락. total_page까지 순회(안전 상한 10p).
  const all = [];
  const MAX_PAGES = 10;
  for (let pageNo = 1; pageNo <= MAX_PAGES; pageNo += 1) {
    const params = new URLSearchParams({
      crtfc_key: apiKey,
      corp_code: corpCode,
      bgn_de: bgnDe,
      end_de: endDe,
      page_no: String(pageNo),
      page_count: "100",
    });
    const json = await httpsGetJson(`${API_BASE}/list.json?${params.toString()}`);
    if (json.status === "013") break; // 013 = no data
    if (json.status !== "000") {
      throw new Error(`OpenDART list.json status=${json.status} message=${json.message || "unknown"}`);
    }
    for (const f of json.list || []) {
      all.push({
        rcept_no: f.rcept_no,
        report_nm: (f.report_nm || "").trim(),
        rcept_dt: f.rcept_dt,
        flr_nm: (f.flr_nm || "").trim(),
      });
    }
    const totalPage = Number(json.total_page) || 1;
    if (pageNo >= totalPage) break;
  }
  return all;
}

module.exports = { loadCorpCodeMap, fetchNewFilings };
