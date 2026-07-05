#!/usr/bin/env node
"use strict";

// kr-portfolio-guard — decision ledger append (script layer).
//
// Called by the SKILL (LLM) layer after the debate, once the owner has chosen
// SELL / HOLD / ADD / REVIEW / DEFER for a flag. One call = one decision.
//
//   - Ledger is append-only in spirit: same-KST-date re-decisions on the same
//     (ticker, flagType[, level]) SUPERSEDE the previous entry (marked, never
//     deleted — 4aA). Scoring uses the latest non-superseded entry per episode.
//   - qty_change !== 0 updates portfolio.json atomically and prints the diff
//     so ledger and portfolio can never drift silently.
//   - qty_guide (E1, advisory-only): computed only when --confidence is given,
//     the flag carries a price-type trigger level, and total_capital > 0.
//
// Usage:
//   node ledger-append.js --ticker 066970.KQ --flag-type TRIGGER_NEAR
//     --decision HOLD --rationale "..." [--confidence 2] [--qty-change 0]
//     [--channels DART,차트] [--defer-until YYYY-MM-DD] [--level 170000]
//     [--private-dir DIR]

const path = require("path");

const { resolvePrivateDir, loadJsonOrDie } = require("./lib/env.js");
const { atomicWriteJson, readNdjson, writeNdjson, loadState, saveState } = require("./lib/store.js");
const { computeQtyGuide } = require("./lib/scoring.js");

const DECISIONS = ["SELL", "HOLD", "ADD", "REVIEW", "DEFER"];

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    switch (arg) {
      case "--ticker": out.ticker = next; i += 1; break;
      case "--flag-type": out.flagType = next; i += 1; break;
      case "--decision": out.decision = (next || "").toUpperCase(); i += 1; break;
      case "--rationale": out.rationale = next; i += 1; break;
      case "--confidence": out.confidence = parseInt(next, 10); i += 1; break;
      case "--qty-change": out.qtyChange = parseInt(next, 10); i += 1; break;
      case "--channels": out.channels = (next || "").split(",").map((s) => s.trim()).filter(Boolean); i += 1; break;
      case "--defer-until": out.deferUntil = next; i += 1; break;
      case "--level": out.level = Number(next); i += 1; break;
      case "--private-dir": out.privateDir = next; i += 1; break;
      case "--help": case "-h": out.help = true; break;
      default: throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return out;
}

function kstToday() {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(new Date());
}

// KST date of an arbitrary timestamp — supersede must compare KST-to-KST.
// UTC .slice(0,10) breaks for 00:00–08:59 KST sessions (previous UTC day).
function kstDateOf(ts) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(new Date(ts));
}

function episodeKeyOf(ticker, flagType, level) {
  return `${ticker}:${flagType}${level ? ":" + level : ""}`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log("Usage: node ledger-append.js --ticker T --flag-type F --decision SELL|HOLD|ADD|REVIEW|DEFER --rationale '...' [options]");
    process.exit(0);
  }

  if (!args.ticker || !args.flagType || !args.decision || !args.rationale) {
    throw new Error("--ticker, --flag-type, --decision, --rationale are all mandatory (P3′ — 결정 없는 마감은 없다)");
  }
  if (!DECISIONS.includes(args.decision)) {
    throw new Error(`--decision must be one of ${DECISIONS.join("|")}, got: ${args.decision}`);
  }
  if (args.decision === "DEFER" && !/^\d{4}-\d{2}-\d{2}$/.test(args.deferUntil || "")) {
    throw new Error("DEFER requires --defer-until YYYY-MM-DD (도망가지 않는 연기 — 이행률 추적 대상)");
  }
  if (args.confidence !== undefined && ![1, 2, 3].includes(args.confidence)) {
    throw new Error("--confidence must be 1, 2, or 3");
  }
  if (args.qtyChange !== undefined && !Number.isFinite(args.qtyChange)) {
    throw new Error("--qty-change must be an integer (NaN이 조용히 0이 되는 사고 방지)");
  }
  if (args.level !== undefined && !Number.isFinite(args.level)) {
    throw new Error("--level must be a number");
  }

  const privateDir = resolvePrivateDir(args.privateDir);
  const config = loadJsonOrDie(path.join(privateDir, "guard-config.json"), "guard-config.json");
  const portfolioPath = path.join(privateDir, "portfolio.json");
  const portfolio = loadJsonOrDie(portfolioPath, "portfolio.json");

  const holding = (portfolio.holdings || []).find((h) => h.ticker === args.ticker);
  if (!holding) {
    throw new Error(`ticker ${args.ticker} not in portfolio.json — 장부는 보유종목 결정만 기록`);
  }

  // 최신 flags에서 컨텍스트(현재가·트리거 레벨·플래그 상세) 회수
  let flagCtx = null;
  let price = null;
  let kospi = null;
  try {
    const latest = loadJsonOrDie(path.join(privateDir, "reports", "flags-latest.json"), "flags-latest.json");
    const h = (latest.holdings || []).find((x) => x.ticker === args.ticker);
    if (h) {
      price = h.price;
      flagCtx = (h.tradeFlags || []).find(
        (f) => f.type === args.flagType && (args.level === undefined || f.level === args.level)
      ) || null;
    }
  } catch (err) {
    process.stderr.write(`[ledger] flags-latest.json 없음 — 컨텍스트 없이 기록: ${err.message}\n`);
  }

  const level = args.level !== undefined ? args.level : flagCtx ? flagCtx.level : undefined;

  const qtyGuide =
    args.confidence !== undefined
      ? computeQtyGuide({
          totalCapital: Number(config.total_capital) || 0,
          confidence: args.confidence,
          price,
          triggerLevel: level,
          riskBudgetPctByConfidence: config.riskBudgetPctByConfidence,
        })
      : null;

  // qty 검증은 장부 쓰기 "전에" — 장부에 기록됐는데 포트폴리오엔 미적용인
  // 드리프트(이 도구가 막으려는 바로 그것)를 원천 차단한다.
  const qtyChange = args.qtyChange || 0;
  if (qtyChange !== 0) {
    const after = Number(holding.quantity) + qtyChange;
    if (after < 0) {
      throw new Error(
        `qty_change ${qtyChange} would make ${args.ticker} quantity negative (${holding.quantity} → ${after}) — 장부에 아무것도 기록되지 않음`
      );
    }
  }

  const today = kstToday();
  const ledgerPath = path.join(privateDir, "decision-ledger.ndjson");
  const rows = readNdjson(ledgerPath);

  // supersede (4aA): 같은 KST 날짜 + 같은 에피소드 키의 기존 결정은 마킹.
  // KST-to-KST 비교(kst_date 필드 우선, 구 행은 ts를 KST로 변환).
  const epKey = episodeKeyOf(args.ticker, args.flagType, level);
  const entryId = `${today}:${epKey}:${rows.length + 1}`;
  let supersededCount = 0;
  for (const row of rows) {
    const rowKstDate = row.kst_date || (row.ts ? kstDateOf(row.ts) : null);
    if (rowKstDate === today && episodeKeyOf(row.ticker, row.flag, row.level) === epKey && !row.superseded_by) {
      row.superseded_by = entryId;
      supersededCount += 1;
    }
  }

  const entry = {
    id: entryId,
    ts: new Date().toISOString(),
    kst_date: today,
    ticker: args.ticker,
    company: holding.name,
    market: holding.market || "KR",
    currency: holding.currency || "KRW",
    flag: args.flagType,
    flag_detail: flagCtx ? flagCtx.detail : null,
    memo_quote: flagCtx ? flagCtx.memoQuote || null : null,
    level: level ?? null,
    decision: args.decision,
    defer_until: args.deferUntil || null,
    price_at_decision: price,
    rationale: args.rationale,
    qty_change: qtyChange,
    confidence: args.confidence ?? null,
    qty_guide: qtyGuide,
    channels: args.channels || [],
    superseded_by: null,
  };
  rows.push(entry);
  writeNdjson(ledgerPath, rows);

  // qty_change → portfolio.json 갱신 (사전 검증 완료 — 드리프트 방지, diff 표기)
  if (entry.qty_change !== 0) {
    const before = Number(holding.quantity);
    holding.quantity = before + entry.qty_change;
    portfolio.asOf = today;
    atomicWriteJson(portfolioPath, portfolio);
    process.stderr.write(`[ledger] portfolio.json 갱신: ${holding.name} ${before} → ${holding.quantity}주\n`);
  }

  // 에피소드 결정 마킹 → PENDING 감소. NEW_FILING처럼 salt가 붙은 키는
  // 프리픽스 매칭으로 해결(활성 후보가 정확히 1개일 때만).
  const state = loadState(privateDir);
  let matchedKey = null;
  if (state.episodes) {
    if (state.episodes[epKey]) {
      matchedKey = epKey;
    } else {
      const prefix = `${args.ticker}:${args.flagType}`;
      const candidates = Object.keys(state.episodes).filter(
        (k) => k.startsWith(prefix) && !state.episodes[k].decidedAt
      );
      if (candidates.length === 1) matchedKey = candidates[0];
    }
  }
  if (matchedKey) {
    state.episodes[matchedKey].decidedAt = entry.ts;
  } else {
    process.stderr.write(
      `[ledger] ⚠️ 일치하는 활성 에피소드 없음 (${epKey}) — 결정은 기록됐지만 PENDING은 줄지 않음. 플래그 타입/레벨을 확인하세요.\n`
    );
  }
  saveState(privateDir, state);

  const pendingLeft = Object.values(state.episodes || {}).filter((ep) => !ep.decidedAt).length;
  process.stderr.write(
    `[ledger] 기록 완료: ${holding.name} ${args.flagType} → ${args.decision}` +
      (supersededCount ? ` (기존 ${supersededCount}건 supersede)` : "") +
      (qtyGuide ? ` | qty_guide(참고): ${qtyGuide.toLocaleString()}원 상한` : "") +
      ` | 남은 PENDING: ${pendingLeft}건\n`
  );
  console.log(JSON.stringify(entry, null, 2));
}

// 커버리지형 플래그 ack (OV2): node ledger-append.js ack --ticker T --flag-type NO_MEMO
function ackMain() {
  const argv = process.argv.slice(3);
  const args = parseArgs(argv.filter((a) => a !== "ack"));
  if (!args.ticker || !args.flagType) throw new Error("ack requires --ticker and --flag-type");
  const privateDir = resolvePrivateDir(args.privateDir);
  const state = loadState(privateDir);
  if (!state.ackedCoverageFlags) state.ackedCoverageFlags = {};
  state.ackedCoverageFlags[`${args.ticker}:${args.flagType}`] = { ackedAt: new Date().toISOString() };
  saveState(privateDir, state);
  process.stderr.write(`[ledger] ack: ${args.ticker}:${args.flagType} — 상태 변화 전까지 재표시 없음\n`);
}

if (require.main === module) {
  try {
    if (process.argv[2] === "ack") ackMain();
    else main();
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

module.exports = { episodeKeyOf };
