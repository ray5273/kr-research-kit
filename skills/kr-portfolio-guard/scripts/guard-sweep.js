#!/usr/bin/env node
"use strict";

// kr-portfolio-guard — weekly sweep (script layer).
//
//   ARCHITECTURE (two-stage, Eng-1A):
//
//     [schedule: local cron / task scheduler — NEVER a cloud routine (P5)]
//        guard-sweep.js
//          portfolio.json ─┐
//          memo.md 전수 ───┼─▶ price/indicators/triggers/filings 점검
//          Yahoo OHLCV ────┤        │
//          OpenDART list ──┘        ▼
//                         flags.json (기계판독) + weekly-guard-*.md (사람용)
//                                   │  PENDING 결정 N건 저장
//     [Claude session]              ▼
//        SKILL.md (LLM layer): pending 로드 → 토론 → 결정 강제 → ledger-append.js
//
//   The script NEVER makes trade judgements. It surfaces; the session decides.
//
// Usage:
//   node guard-sweep.js [--private-dir DIR] [--bars-dir DIR (offline fixtures)]
//                       [--skip-dart] [--range 1y]

const fs = require("fs");
const path = require("path");

const { REPO_ROOT, resolvePrivateDir, loadJsonOrDie } = require("./lib/env.js");
const { atomicWriteJson, atomicWriteFile, readNdjson, loadState, saveState } = require("./lib/store.js");
const { computeSMA, computeRSI, computeMACD } = require("./lib/indicators.js");
const { extractMemoTriggers } = require("./lib/memo-triggers.js");

let fetchChart;
try {
  fetchChart = require(path.join(
    __dirname, "..", "..", "kr-stock-analysis", "scripts", "fetch-kr-chart.js"
  ));
} catch (err) {
  throw new Error(
    "Shared chart fetcher missing (kr-stock-analysis/scripts/fetch-kr-chart.js). " +
      "Install kr-stock-analysis first. Original error: " + err.message
  );
}

// --- args -------------------------------------------------------------------

function parseArgs(argv) {
  const out = { range: "1y" };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    switch (arg) {
      case "--private-dir": out.privateDir = next; i += 1; break;
      case "--bars-dir": out.barsDir = next; i += 1; break;
      case "--skip-dart": out.skipDart = true; break;
      case "--range": out.range = next; i += 1; break;
      case "--help": case "-h": out.help = true; break;
      default: throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return out;
}

// --- date helpers -----------------------------------------------------------

function kstToday() {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(new Date());
}

function daysBetween(isoA, isoB) {
  return Math.round((new Date(isoB) - new Date(isoA)) / 86_400_000);
}

// --- per-holding checks -------------------------------------------------------

function windowSince(bars, sinceDate) {
  if (!sinceDate) return bars.slice(-6); // first run: last ~week of bars
  return bars.filter((b) => b.date > sinceDate);
}

function detectCrossings(bars, level) {
  const fired = [];
  for (let i = 1; i < bars.length; i += 1) {
    const a = bars[i - 1].close;
    const b = bars[i].close;
    if ((a < level && b >= level) || (a > level && b <= level)) {
      fired.push({ date: bars[i].date, from: a, to: b });
    }
  }
  return fired;
}

function detectCorpActionJump(bars, jumpPct) {
  for (let i = 1; i < bars.length; i += 1) {
    const pct = ((bars[i].close - bars[i - 1].close) / bars[i - 1].close) * 100;
    if (Math.abs(pct) > jumpPct) {
      return { date: bars[i].date, pct };
    }
  }
  return null;
}

async function loadBars(holding, args) {
  if (args.barsDir) {
    const p = path.join(path.resolve(args.barsDir), `${holding.ticker.replace(/[^\w.^-]/g, "_")}.json`);
    if (!fs.existsSync(p)) throw new Error(`fixture bars not found: ${p}`);
    return JSON.parse(fs.readFileSync(p, "utf8")).bars;
  }
  const result = await fetchChart.resolveAndFetch(holding.ticker, null, args.range, "1d");
  return result.bars;
}

// sinceDate: 이 종목의 "마지막 성공 점검일" (전역 lastRunAt이 아님 — 실패한
// 주의 윈도우가 다음 주에 건너뛰어지는 블라인드 윈도우 방지).
function sweepHolding(holding, bars, memo, config, sinceDate, today) {
  const closes = bars.map((b) => b.close);
  const price = closes[closes.length - 1];
  const prev = closes.length >= 2 ? closes[closes.length - 2] : null;
  const t = config.thresholds;

  const sma20 = computeSMA(closes, 20);
  const sma60 = computeSMA(closes, 60);
  const rsi14 = computeRSI(closes, 14);
  const macd = computeMACD(closes);
  const sma20DevPct = sma20 ? ((price - sma20) / sma20) * 100 : null;
  const sma60DevPct = sma60 ? ((price - sma60) / sma60) * 100 : null;
  const dayChangePct = prev ? ((price - prev) / prev) * 100 : null;

  const win = windowSince(bars, sinceDate);

  const tradeFlags = [];
  const coverageFlags = [];

  // 메모 트리거 (가격형: 결정적 계층 / 비가격형: LLM 계층 후보로 flags.json에 동봉)
  for (const trig of memo.triggers) {
    for (const level of trig.levels) {
      const devPct = ((price - level) / level) * 100;
      const crossings = detectCrossings(win, level);
      if (crossings.length > 0) {
        tradeFlags.push({
          type: "TRIGGER_FIRED", direction: trig.direction, level,
          detail: `트리거 레벨 ${level.toLocaleString()} 교차 (${crossings.map((c) => c.date).join(", ")})`,
          memoQuote: trig.quote, currentPrice: price,
        });
      } else if (Math.abs(devPct) <= t.triggerNearPct) {
        tradeFlags.push({
          type: "TRIGGER_NEAR", direction: trig.direction, level,
          detail: `트리거 레벨 ${level.toLocaleString()} 근접 (현재가 대비 ${devPct.toFixed(1)}%)`,
          memoQuote: trig.quote, currentPrice: price,
        });
      }
    }
  }

  if (sma20DevPct !== null && Math.abs(sma20DevPct) > t.sma20DeviationPct) {
    tradeFlags.push({ type: "SMA_DEV", detail: `SMA20 괴리 ${sma20DevPct.toFixed(1)}%`, currentPrice: price });
  }
  if (rsi14 !== null && (rsi14 < t.rsiOversold || rsi14 > t.rsiOverbought)) {
    tradeFlags.push({ type: "RSI", detail: `RSI14 ${rsi14.toFixed(1)} (${rsi14 < t.rsiOversold ? "과매도" : "과매수"})`, currentPrice: price });
  }

  const jump = detectCorpActionJump(win, t.corpActionJumpPct);
  if (jump) {
    tradeFlags.push({
      type: "CORP_ACTION_CHECK",
      detail: `${jump.date} 종가 불연속 ${jump.pct.toFixed(1)}% — 분할·증자 여부 확인 후 메모 트리거 전체 재검증 필요`,
      currentPrice: price,
    });
  }

  // 커버리지형 (결정 불요 — 1회 ack 후 상태 변화까지 침묵, OV2)
  if (!memo.exists) {
    coverageFlags.push({ type: "NO_MEMO", detail: "메모 없음 — 가격·지표·공시만 감시 중. kr-stock-analysis 퀵뷰 생성 권장" });
  } else if (memo.parseGap) {
    coverageFlags.push({ type: "PARSE_GAP", detail: "메모는 있으나 구조 추출된 트리거 0건 — Decision Block 추가 권장" });
  }
  if (memo.exists) {
    const latest = memo.updateDate || memo.baseDate;
    if (latest && daysBetween(latest, today) > t.memoStaleDays) {
      coverageFlags.push({ type: "STALE", detail: `메모 최신일 ${latest} — ${daysBetween(latest, today)}일 경과 (기준 ${t.memoStaleDays}일). kr-stock-update 권장` });
    }
  }

  return {
    price, dayChangePct, sma20DevPct, sma60DevPct, rsi14, macd,
    tradeFlags, coverageFlags,
    barCount: bars.length,
    nonPriceTriggers: memo.triggers.filter((x) => x.levels.length === 0),
  };
}

// --- episodes / pending -------------------------------------------------------

function episodeKey(ticker, flag) {
  // salt = 콘텐츠 정체성(예: NEW_FILING의 최신 rcept_no). salt 없이는
  // "2주 연속 서로 다른 공시"가 지난주 결정에 묻혀 PENDING이 안 된다.
  return `${ticker}:${flag.type}${flag.level ? ":" + flag.level : ""}${flag.salt ? ":" + flag.salt : ""}`;
}

function updateEpisodes(state, holdingsResults, today) {
  if (!state.episodes) state.episodes = {};
  const seen = new Set();
  for (const h of holdingsResults) {
    for (const flag of h.tradeFlags) {
      const key = episodeKey(h.ticker, flag);
      seen.add(key);
      if (!state.episodes[key]) {
        state.episodes[key] = { startedAt: today, decidedAt: null };
      }
      state.episodes[key].lastSeenAt = today;
    }
  }
  // 조건 해소된 에피소드 종료 (다음 재발 = 새 에피소드 = 새 채점 단위, OV1).
  // 예외: 미결정 TRIGGER_FIRED는 보존 — 교차는 "해소되는 조건"이 아니라
  // 이미 일어난 사건이라, 한 주 건너뛰었다고 결정 의무가 사라지면 P3′ 위반.
  for (const key of Object.keys(state.episodes)) {
    if (seen.has(key)) continue;
    if (key.includes(":TRIGGER_FIRED") && !state.episodes[key].decidedAt) continue;
    delete state.episodes[key];
  }
  return state;
}

function pendingDecisions(state) {
  return Object.entries(state.episodes || {})
    .filter(([, ep]) => !ep.decidedAt)
    .map(([key, ep]) => ({ key, startedAt: ep.startedAt }));
}

// --- report ------------------------------------------------------------------

function fmtNum(n, digits = 1) {
  return n === null || n === undefined || !Number.isFinite(n) ? "—" : n.toFixed(digits);
}

// 메모 인용·공시 제목 등 제3자 텍스트가 표를 깨거나 여러 줄로 새지 않게.
function mdCell(s) {
  return String(s ?? "").replace(/\|/g, "\\|").replace(/\s*\n\s*/g, " ");
}

function buildReport({ today, lastRunDate, gapDays, results, pending, filingsByTicker, gaps, config }) {
  const L = [];
  L.push(`# 주간 포트폴리오 가드 — ${today}`);
  L.push("");
  const gapWarn = gapDays !== null && gapDays > config.thresholds.lastRunWarnDays ? ` ⚠️ 공백 ${gapDays}일` : "";
  L.push(`전 실행: ${lastRunDate || "없음(첫 실행)"}${gapDays !== null ? ` (${gapDays}일 전)` : ""}${gapWarn} | PENDING 결정: **${pending.length}건**`);
  L.push("");

  const allTrade = results.flatMap((h) => h.tradeFlags.map((f) => ({ ...f, ticker: h.ticker, name: h.name })));
  L.push(`## ACTION NEEDED (${allTrade.length}건 — 각 플래그는 SELL/HOLD/ADD/REVIEW 결정으로 마감)`);
  L.push("");
  if (allTrade.length === 0) {
    L.push("- 없음 — 트레이드형 플래그 0건.");
  } else {
    L.push("| 종목 | 플래그 | 상세 | 현재가 |");
    L.push("|---|---|---|---|");
    for (const f of allTrade) {
      const quote = f.memoQuote ? `<br>메모: "${mdCell(f.memoQuote.slice(0, 60))}"` : "";
      L.push(`| ${mdCell(f.name)} | ${f.type} | ${mdCell(f.detail)}${quote} | ${f.currentPrice ? f.currentPrice.toLocaleString() : "—"} |`);
    }
    L.push("");
    L.push("결정 마감: Claude 세션에서 `kr-portfolio-guard` 스킬 실행 → 토론 후 ledger-append.");
  }
  L.push("");

  const unackedCoverage = results.flatMap((h) => h.coverageFlags.filter((f) => !f.acked).map((f) => ({ ...f, name: h.name })));
  if (unackedCoverage.length > 0) {
    L.push(`## 커버리지 알림 (${unackedCoverage.length}건 — 1회 확인(ack)만, 채점 제외)`);
    for (const f of unackedCoverage) L.push(`- **${f.name}** [${f.type}] ${f.detail}`);
    L.push("");
  }

  L.push("## 지표 스냅샷");
  L.push("");
  L.push("| 종목 | 현재가 | 1일 | SMA20± | SMA60± | RSI14 | MACD |");
  L.push("|---|---|---|---|---|---|---|");
  for (const h of results) {
    const macdStr = h.macd ? `${h.macd.hist >= 0 ? "+" : ""}${fmtNum(h.macd.hist, 2)}${h.macd.cross ? ` (${h.macd.cross === "golden" ? "골든↑" : "데드↓"})` : ""}` : "—";
    L.push(`| ${h.name} | ${h.price ? h.price.toLocaleString() : "—"} | ${fmtNum(h.dayChangePct)}% | ${fmtNum(h.sma20DevPct)}% | ${fmtNum(h.sma60DevPct)}% | ${fmtNum(h.rsi14)} | ${macdStr} |`);
  }
  L.push("");

  // 공시 원본 병기 (2cA — LLM 판단은 표시일 뿐 필터가 아님)
  const tickersWithFilings = Object.keys(filingsByTicker).filter((k) => filingsByTicker[k].length > 0);
  if (tickersWithFilings.length > 0) {
    L.push("## 신규 공시 원본 목록 (전 실행 이후, 무필터)");
    L.push("");
    for (const tk of tickersWithFilings) {
      L.push(`### ${tk}`);
      for (const f of filingsByTicker[tk]) {
        L.push(`- ${f.rcept_dt} | ${mdCell(f.report_nm)} | ${mdCell(f.flr_nm)} | rcept_no ${f.rcept_no}`);
      }
      L.push("");
    }
  }

  if (gaps.length > 0) {
    L.push("## GAP (가드 결함 아님 — 소스·커버리지 이슈)");
    for (const g of gaps) L.push(`- [${g.type}] ${g.detail}`);
    L.push("");
  }

  L.push("---");
  L.push("*본 리포트는 자동 산출물이며 투자 판단의 책임은 이용자에게 있습니다. 이 파일은 보유 정보를 포함하므로 발행·외부 전송 스킬에 전달 금지.*");
  return L.join("\n");
}

// --- main --------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log("Usage: node guard-sweep.js [--private-dir DIR] [--bars-dir DIR] [--skip-dart] [--range 1y]");
    process.exit(0);
  }

  const privateDir = resolvePrivateDir(args.privateDir);
  const config = loadJsonOrDie(path.join(privateDir, "guard-config.json"), "guard-config.json");
  const portfolio = loadJsonOrDie(path.join(privateDir, "portfolio.json"), "portfolio.json");
  const holdings = portfolio.holdings || [];
  if (holdings.length === 0) {
    throw new Error(`portfolio.json has no holdings (${privateDir}/portfolio.json)`);
  }
  for (const h of holdings) {
    if (!Number.isFinite(Number(h.quantity))) {
      throw new Error(`holding ${h.ticker}: quantity is mandatory (OV4 — 비중 옵션은 삭제됨)`);
    }
  }

  const state = loadState(privateDir);
  const today = kstToday();
  const lastRunDate = state.lastRunAt ? state.lastRunAt.slice(0, 10) : null;
  const gapDays = lastRunDate ? daysBetween(lastRunDate, today) : null;

  const results = [];
  const gaps = [];
  const filingsByTicker = {};

  // DART: KR 보유종목만, 스크립트는 원본 목록만 표면화
  let corpMap = null;
  let dartKey = null;
  const wantDart = !args.skipDart && !args.barsDir;
  if (wantDart) {
    try {
      const dart = require("./lib/dart.js");
      dartKey = (process.env.OPENDART_API_KEY || "").trim();
      if (!dartKey) throw new Error("OPENDART_API_KEY not set (.env)");
      corpMap = dart.loadCorpCodeMap();
    } catch (err) {
      gaps.push({ type: "DISCLOSURE_GAP", detail: `DART 스윕 불가: ${err.message}` });
      corpMap = null;
    }
  }

  for (const holding of holdings) {
    const label = `${holding.name}(${holding.ticker})`;
    process.stderr.write(`[guard] ${label} … `);

    let bars = null;
    try {
      bars = await loadBars(holding, args);
    } catch (err) {
      gaps.push({ type: "DATA_GAP", detail: `${label}: 가격 조회 실패 — ${err.message}` });
      process.stderr.write("DATA_GAP\n");
      results.push({
        ticker: holding.ticker, name: holding.name, market: holding.market || "KR",
        price: null, dayChangePct: null, sma20DevPct: null, sma60DevPct: null,
        rsi14: null, macd: null, tradeFlags: [], coverageFlags: [{ type: "DATA_GAP", detail: err.message }],
      });
      continue;
    }

    let memoPath = null;
    if (holding.memo && holding.memo !== "none") {
      const resolved = path.resolve(REPO_ROOT, holding.memo);
      if (resolved.startsWith(REPO_ROOT + path.sep)) {
        memoPath = resolved;
      } else {
        gaps.push({ type: "PARSE_GAP", detail: `${label}: memo 경로가 리포 밖을 가리킴 — 무시됨 (${holding.memo})` });
      }
    }
    const memo = extractMemoTriggers(memoPath);

    const checked = state.checked || (state.checked = {});
    const tickerChecked = checked[holding.ticker] || (checked[holding.ticker] = {});

    const r = sweepHolding(holding, bars, memo, config, tickerChecked.price || null, today);
    tickerChecked.price = today; // 성공 경로에서만 도달 (실패는 위에서 continue)
    r.ticker = holding.ticker;
    r.name = holding.name;
    r.market = holding.market || "KR";
    r.memo = { path: holding.memo || "none", baseDate: memo.baseDate, updateDate: memo.updateDate, stance: memo.stance };

    // 커버리지 ack (OV2): 조건이 "현재 부재"하면 ack 해제 → 재발 시 다시 표시.
    // 해제 판정을 플래그 루프 안에서 하면 논리 모순(플래그 존재 = 조건 존재)이라
    // 영구 침묵이 된다 — 조건 부재 기준의 독립 패스로 판정한다.
    const acks = state.ackedCoverageFlags || (state.ackedCoverageFlags = {});
    for (const type of ["NO_MEMO", "PARSE_GAP", "STALE"]) {
      const key = `${holding.ticker}:${type}`;
      if (acks[key] && !r.coverageFlags.some((f) => f.type === type)) delete acks[key];
    }
    for (const f of r.coverageFlags) {
      if (acks[`${holding.ticker}:${f.type}`]) f.acked = true;
    }

    // DART 신규 공시
    if (corpMap && (holding.market || "KR") === "KR") {
      try {
        const dart = require("./lib/dart.js");
        const bare = holding.ticker.replace(/\.(KS|KQ)$/i, "");
        const dartSince = tickerChecked.dart || lastRunDate;
        const bgn = (dartSince || today).replace(/-/g, "");
        const filings = await dart.fetchNewFilings({
          ticker: bare, bgnDe: bgn, endDe: today.replace(/-/g, ""), apiKey: dartKey, corpMap,
        });
        filingsByTicker[label] = filings;
        tickerChecked.dart = today; // 성공 시에만 전진 — 실패 주의 공시가 다음 주에 잡히도록
        if (filings.length > 0 && dartSince) {
          const latestRcept = filings.map((f) => f.rcept_no).sort().pop();
          r.tradeFlags.push({
            type: "NEW_FILING",
            salt: latestRcept,
            detail: `신규 공시 ${filings.length}건 — 하단 원본 목록 확인, 트리거 관련성은 세션에서 판단`,
            currentPrice: r.price,
          });
        }
      } catch (err) {
        gaps.push({ type: "DISCLOSURE_GAP", detail: `${label}: ${err.message}` });
      }
    }

    process.stderr.write(`OK trade:${r.tradeFlags.length} cover:${r.coverageFlags.filter((f) => !f.acked).length}\n`);
    results.push(r);
  }

  updateEpisodes(state, results, today);
  const pending = pendingDecisions(state);

  const flagsDoc = {
    generatedAt: new Date().toISOString(),
    asOfDate: today,
    lastRunDate,
    gapDays,
    pending,
    holdings: results,
    filingsByTicker,
    gaps,
  };

  const reportsDir = path.join(privateDir, "reports");
  atomicWriteJson(path.join(reportsDir, `flags-${today}.json`), flagsDoc);
  atomicWriteJson(path.join(reportsDir, "flags-latest.json"), flagsDoc);

  const report = buildReport({ today, lastRunDate, gapDays, results, pending, filingsByTicker, gaps, config });
  atomicWriteFile(path.join(reportsDir, `weekly-guard-${today}.md`), report + "\n");

  state.lastRunAt = new Date().toISOString();
  saveState(privateDir, state);

  console.log(report);
  process.stderr.write(
    `\n[guard] done — trade flags: ${results.reduce((s, h) => s + h.tradeFlags.length, 0)}, ` +
      `pending decisions: ${pending.length}, report: ${path.join(reportsDir, `weekly-guard-${today}.md`)}\n`
  );
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  });
}

module.exports = { sweepHolding, detectCrossings, detectCorpActionJump, updateEpisodes, pendingDecisions, episodeKey, windowSince };
