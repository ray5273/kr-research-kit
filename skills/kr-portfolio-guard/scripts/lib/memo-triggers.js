"use strict";

// Structural memo-trigger extraction (script layer).
//
// Contract (design doc "Deep-Review 확정 추가 스펙" #1 / #10):
//   - The SCRIPT does structural extraction only: find candidate trigger lines
//     and price levels. Semantic judgement (does filing X satisfy trigger Y?)
//     belongs to the SKILL (LLM) layer.
//   - New memos may carry a machine-readable Decision Block:
//
//       ```guard-decision
//       stance: 관찰 유지
//       review_by: 2026-08-31
//       triggers:
//         - direction: sell
//           quote: 단월 카지노 순매출 300억 미만 2개월 연속
//         - direction: buy
//           level: 20422
//           quote: MA60 20,422원 안착 + MACD 골든크로스
//       ```
//
//     Blocks are parsed first; heuristic section scanning is the fallback for
//     legacy memos. Zero triggers from BOTH paths on an existing memo → PARSE_GAP.

const fs = require("fs");

const TRIGGER_HEADING_RE = /(매도로 전환시킬 조건|매수.*(트리거|조건)|매도.*(트리거|조건)|스탠스를.*조건|무효화|invalidation|Decision Frame)/i;
const DATE_RE = /기준일[:\s]*([0-9]{4}-[0-9]{2}-[0-9]{2})/;
const UPDATE_RE = /최근 업데이트일[:\s]*([0-9]{4}-[0-9]{2}-[0-9]{2})/;
// 1,000-scale KRW ("20,422원") or USD ("$202", "202달러")
const PRICE_RE = /(?:\$\s?([0-9][0-9,\.]*)|([0-9][0-9,\.]*)\s*(?:원|달러))/g;

function parseNumber(s) {
  const n = Number(String(s).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function extractPriceLevels(line) {
  const levels = [];
  let m;
  PRICE_RE.lastIndex = 0;
  while ((m = PRICE_RE.exec(line)) !== null) {
    const n = parseNumber(m[1] || m[2]);
    // Ignore tiny numbers (percentages, counts) and giant ones (시가총액 etc.)
    if (n !== null && n >= 1 && n < 10_000_000) levels.push(n);
  }
  return levels;
}

function inferDirection(sectionTitle, line) {
  const hay = `${sectionTitle} ${line}`;
  if (/매도|sell|이탈|하회|풋/i.test(hay)) return "sell";
  if (/매수|buy|안착|상회|돌파/i.test(hay)) return "buy";
  return "watch";
}

// --- Decision Block (guard-decision fence) --------------------------------

function parseDecisionBlock(text) {
  const fence = text.match(/```guard-decision\n([\s\S]*?)```/);
  if (!fence) return null;
  const body = fence[1];
  const out = { stance: null, reviewBy: null, triggers: [] };
  const stance = body.match(/^stance:\s*(.+)$/m);
  if (stance) out.stance = stance[1].trim();
  const review = body.match(/^review_by:\s*([0-9]{4}-[0-9]{2}-[0-9]{2})/m);
  if (review) out.reviewBy = review[1];

  const itemRe = /^\s*-\s+direction:\s*(\w+)\n(?:\s+level:\s*([0-9,\.]+)\n)?\s+quote:\s*(.+)$/gm;
  let m;
  while ((m = itemRe.exec(body)) !== null) {
    out.triggers.push({
      direction: m[1].trim(),
      levels: m[2] ? [parseNumber(m[2])].filter((v) => v !== null) : [],
      quote: m[3].trim(),
      source: "decision-block",
    });
  }
  return out;
}

// --- Heuristic section scan (legacy memos) ---------------------------------

function scanSections(text) {
  const lines = text.split("\n");
  const triggers = [];
  let currentSection = null;

  for (const line of lines) {
    const trimmed = line.trim();
    const isHeading = /^#{1,4}\s/.test(trimmed) || /^\*\*[^*]+\*\*:?\s*$/.test(trimmed);
    const isBoldLead = /^-\s*\*\*[^*]+\*\*/.test(trimmed);

    if (isHeading || isBoldLead) {
      currentSection = TRIGGER_HEADING_RE.test(trimmed) ? trimmed.replace(/^#+\s*/, "") : null;
      if (!isBoldLead || !currentSection) {
        if (isHeading) continue;
      }
    }
    if (!currentSection) continue;

    const isBullet = /^(-|\*|[0-9]+\.)\s+/.test(trimmed);
    if (!isBullet) continue;

    const quote = trimmed.replace(/^(-|\*|[0-9]+\.)\s+/, "").trim();
    if (quote.length < 8) continue;
    const levels = extractPriceLevels(quote);
    triggers.push({
      direction: inferDirection(currentSection, quote),
      levels,
      quote,
      source: "heuristic",
      section: currentSection,
    });
  }
  return triggers;
}

// --- Public API -------------------------------------------------------------

// Returns { exists, baseDate, updateDate, stance, reviewBy, triggers, parseGap }
function extractMemoTriggers(memoPath) {
  if (!memoPath || memoPath === "none" || !fs.existsSync(memoPath)) {
    return { exists: false, baseDate: null, updateDate: null, stance: null, reviewBy: null, triggers: [], parseGap: false };
  }
  const text = fs.readFileSync(memoPath, "utf8");
  const baseDate = (text.match(DATE_RE) || [])[1] || null;
  const updateDate = (text.match(UPDATE_RE) || [])[1] || null;

  const block = parseDecisionBlock(text);
  let triggers = block ? block.triggers : [];
  if (triggers.length === 0) {
    triggers = scanSections(text);
  }

  return {
    exists: true,
    baseDate,
    updateDate,
    stance: block ? block.stance : null,
    reviewBy: block ? block.reviewBy : null,
    triggers,
    parseGap: triggers.length === 0,
  };
}

module.exports = { extractMemoTriggers, extractPriceLevels, parseDecisionBlock, scanSections, inferDirection };
