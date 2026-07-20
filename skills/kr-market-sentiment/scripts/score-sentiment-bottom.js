#!/usr/bin/env node

// kr-market-sentiment: 투심 바닥 채점기
//
// indicators.json(fetch-market-indicators.js 산출)을 읽어 지표별로 바닥 신호를
// {-2..+2}로 채점하고(+2=강한 바닥/capitulation, -2=과열), 가중 합성 점수와
// 판단 밴드, 확인(confirmation) 체크리스트, 한국어 Markdown 리포트를 산출한다.
//
// 신호는 역발상(contrarian)·동행(coincident) 지표다: 바닥 "근접"을 알려줄 뿐
// 정확한 저점 타이밍을 예측하지 않는다. 확정은 수급 전환(외국인 순매수 전환)과
// 지수 추세 회복으로만 이뤄진다.
//
// Node stdlib only.

const fs = require("fs");
const path = require("path");

// signal: -2 과열 … 0 중립 … +2 강한 바닥. weight: 합성 가중치. 0 = 표시만(맥락).
// bands: [상한(미만), signal] 쌍을 오름차순 상한으로 나열. 값 < 상한이면 그 signal.
//        첫 밴드가 하단 오버플로(가장 낮은 값)를 잡고, `above` 가 마지막 상한 이상을 잡는다.
// direction "lowIsBottom": 값이 낮을수록 바닥(+). "highIsBottom": 높을수록 바닥(+).
const NUMERIC_RULES = {
  kospi_pbr: {
    weight: 1.5, direction: "lowIsBottom",
    bands: [[0.85, 2], [0.95, 1], [1.05, 0], [1.20, -1]], above: -2,
    note: "역사적 KOSPI 저점권 PBR ≈ 0.85~0.90배. 1배 이하는 청산가치 근접 신호.",
  },
  kospi_fwd_per: {
    weight: 1.0, direction: "lowIsBottom",
    bands: [[8, 2], [9.5, 1], [11, 0], [13, -1]], above: -2,
    note: "12M 선행 PER 8~9배는 이익 대비 저평가 국면.",
  },
  vkospi: {
    weight: 1.2, direction: "highIsBottom",
    bands: [[15, -2], [20, -1], [28, 0], [35, 1]], above: 2,
    note: "VKOSPI 30 이상은 공포 극단(capitulation), 15 이하는 안일(과열).",
  },
  kospi_drawdown: {
    weight: 1.0, direction: "lowIsBottom",
    bands: [[-25, 2], [-18, 1], [-10, 0], [-5, -1]], above: -2,
    note: "52주 고점 대비 -20% 이상 조정은 약세장 진입, 과매도 배경. (필요조건이지 충분조건 아님)",
  },
  kospi_rsi14: {
    weight: 1.0, direction: "lowIsBottom",
    bands: [[30, 2], [40, 1], [50, 0], [60, -1]], above: -2,
    note: "RSI14 30 이하 과매도(바닥 신호), 70 근처 과열.",
  },
  kospi_vs_sma200: {
    weight: 0.8, direction: "lowIsBottom",
    bands: [[-12, 2], [-5, 1], [0, 0], [5, -1]], above: -2,
    note: "지수가 200일선 아래 크게 이탈하면 추세 훼손·과매도. 위로 크게 이격되면 과열.",
  },
  kosdaq_drawdown: {
    weight: 0.5, direction: "lowIsBottom",
    bands: [[-28, 2], [-20, 1], [-12, 0], [-6, -1]], above: -2,
    note: "코스닥은 변동성이 커 더 깊은 낙폭을 바닥 기준으로 본다. (보조지표)",
  },
  kosdaq_rsi14: {
    weight: 0.5, direction: "lowIsBottom",
    bands: [[30, 2], [40, 1], [50, 0], [60, -1]], above: -2,
    note: "코스닥 RSI14 과매도 여부. (보조지표)",
  },
  adr20: {
    weight: 0.8, direction: "lowIsBottom",
    bands: [[70, 2], [80, 1], [95, 0], [115, -1]], above: -2,
    note: "ADR(등락비율) 20일 75% 이하 과매도(바닥), 120% 이상 과열.",
  },
  usdkrw_level: {
    weight: 0.5, direction: "highIsBottom",
    bands: [[1280, -2], [1330, -1], [1400, 0], [1450, 1]], above: 2,
    note: "원화 약세 극단(환율 급등)은 외국인 이탈 스트레스 정점 → 반전 시 바닥과 동행. (맥락 지표)",
  },
};

// 범주형 지표: 문자열 값 → signal.
const CATEGORICAL_RULES = {
  foreign_flow: {
    weight: 1.5,
    map: {
      net_buy_turn: 2,       // 순매도 → 순매수 전환 (강한 확인)
      selling_slowing: 1,    // 순매도 둔화
      large_sustained_selling: 1, // 대규모 지속 순매도 (capitulation 배경)
      neutral: 0,
      buying: -1,
      large_buying: -2,
    },
    note: "외국인 순매수 전환은 바닥 '확정' 신호. 대규모 순매도 지속/둔화는 capitulation 배경.",
    isConfirmation: true,
  },
  credit_trend: {
    weight: 1.0,
    map: {
      plunging: 2,   // 반대매매·강제 디레버리징
      falling: 1,
      flat: 0,
      rising: -1,
      surging: -2,   // 빚투 과열
    },
    note: "신용융자 잔고 급감(반대매매/디레버리징)은 청산 국면 = 바닥 신호. 급증은 레버리지 과열.",
  },
  deposits_trend: {
    weight: 0,   // 해석이 양면적이라 맥락 표시만 (합성 제외)
    map: { plunging: 1, falling: 1, flat: 0, rising: 0, surging: -1 },
    note: "투자자예탁금 감소는 이탈·위축(바닥 배경)으로, 급증은 대기매수세로도 읽혀 양면적 → 맥락 참고.",
  },
};

const SIGNAL_LABEL = {
  2: "강한 바닥",
  1: "바닥",
  0: "중립",
  "-1": "바닥 아님",
  "-2": "과열",
};

function round(value, digits = 2) {
  if (value == null || !Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

// 수치 지표 채점. bands 는 상한 오름차순. 첫 밴드가 하단을, `above` 가 최상단 이상을 잡는다.
function scoreNumeric(rule, value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  const bands = rule.bands;
  for (const [upper, signal] of bands) {
    if (numeric < upper) return signal;
  }
  if (rule.above != null) return rule.above;
  return bands[bands.length - 1][1];
}

function scoreCategorical(rule, value) {
  const key = String(value).trim();
  if (Object.prototype.hasOwnProperty.call(rule.map, key)) return rule.map[key];
  return null;
}

// 단일 지표 → { id, signal, weight, ... } 또는 null(무데이터/미상값).
function scoreIndicator(indicator) {
  const id = indicator.id;
  if (NUMERIC_RULES[id]) {
    const rule = NUMERIC_RULES[id];
    const signal = scoreNumeric(rule, indicator.value);
    if (signal == null) return null;
    return { ...indicator, signal, weight: rule.weight, signalLabel: SIGNAL_LABEL[signal], ruleNote: rule.note };
  }
  if (CATEGORICAL_RULES[id]) {
    const rule = CATEGORICAL_RULES[id];
    const signal = scoreCategorical(rule, indicator.value);
    if (signal == null) return null;
    return { ...indicator, signal, weight: rule.weight, signalLabel: SIGNAL_LABEL[signal], ruleNote: rule.note, isConfirmation: rule.isConfirmation || false };
  }
  return null;
}

const JUDGMENT_BANDS = [
  { min: 1.2, emoji: "🔵", label: "강한 바닥 신호 (capitulation 국면)", detail: "다수 지표가 과매도·저평가·투심 위축을 동시에 확인. 저점 형성 가능성이 높은 구간이나, 확정은 수급 전환으로만 이뤄집니다." },
  { min: 0.6, emoji: "🟢", label: "바닥 신호 형성 중", detail: "여러 지표가 바닥권에 진입. 외국인 순매수 전환·지수 20일선 회복 등 확인 신호를 기다릴 국면입니다." },
  { min: 0.2, emoji: "🟡", label: "바닥 신호 일부", detail: "일부 지표만 바닥권. 혼조 국면으로 추세 전환은 미확인입니다." },
  { min: -0.2, emoji: "⚪", label: "방향성 불명확 / 중립", detail: "바닥과 과열 신호가 상쇄. 뚜렷한 방향성이 없습니다." },
  { min: -Infinity, emoji: "🔴", label: "바닥 신호 약함", detail: "밸류에이션·기술적 부담 또는 과열 신호가 우세. 하방 여지가 남아 있는 국면입니다." },
];

function judgeComposite(composite) {
  if (composite == null) return { emoji: "⚫", label: "판단 불가", detail: "채점 가능한 지표가 없습니다." };
  return JUDGMENT_BANDS.find((band) => composite >= band.min);
}

function scoreAll(indicatorsDoc) {
  const indicators = indicatorsDoc.indicators || [];
  const scored = [];
  const skipped = [];
  for (const indicator of indicators) {
    const result = scoreIndicator(indicator);
    if (result) scored.push(result); else skipped.push(indicator);
  }

  const weighted = scored.filter((s) => s.weight > 0);
  const weightSum = weighted.reduce((sum, s) => sum + s.weight, 0);
  const composite = weightSum > 0
    ? round(weighted.reduce((sum, s) => sum + s.signal * s.weight, 0) / weightSum, 3)
    : null;
  const judgment = judgeComposite(composite);

  // 확인(confirmation) 게이트: 저점 '확정'에 필요한 신호들의 충족 여부.
  const byId = Object.fromEntries(scored.map((s) => [s.id, s]));
  const confirmation = {
    foreignNetBuyTurn: byId.foreign_flow?.value === "net_buy_turn",
    aboveSma20: (() => {
      const kospi = indicatorsDoc.markets?.kospi;
      if (!kospi || kospi.status || kospi.lastClose == null || kospi.sma20 == null) return null;
      return kospi.lastClose >= kospi.sma20;
    })(),
    rsiRecovering: byId.kospi_rsi14 ? byId.kospi_rsi14.value >= 40 : null,
  };
  const confirmedCount = [confirmation.foreignNetBuyTurn, confirmation.aboveSma20, confirmation.rsiRecovering].filter((v) => v === true).length;

  // 카테고리 요약.
  const categories = {};
  for (const s of weighted) {
    const cat = s.category || "기타";
    if (!categories[cat]) categories[cat] = { signalSum: 0, weightSum: 0, count: 0 };
    categories[cat].signalSum += s.signal * s.weight;
    categories[cat].weightSum += s.weight;
    categories[cat].count += 1;
  }
  const categorySummary = Object.entries(categories).map(([category, agg]) => ({
    category,
    avgSignal: round(agg.signalSum / agg.weightSum, 2),
    count: agg.count,
  })).sort((a, b) => b.avgSignal - a.avgSignal);

  const bottomSignals = scored.filter((s) => s.signal > 0).length;
  const overheatSignals = scored.filter((s) => s.signal < 0).length;

  return {
    schemaVersion: 1,
    reportType: "kr-market-sentiment-score",
    asOfDate: indicatorsDoc.asOfDate,
    generatedAt: new Date().toISOString(),
    composite,
    judgment,
    scored,
    skipped,
    categorySummary,
    confirmation,
    confirmedCount,
    tally: { scoredCount: scored.length, weightedCount: weighted.length, bottomSignals, overheatSignals },
    warnings: indicatorsDoc.warnings || [],
  };
}

// ---- Markdown rendering -------------------------------------------------

function signalCell(signal) {
  const arrow = signal > 0 ? "▲" : signal < 0 ? "▼" : "–";
  return `${arrow} ${signal > 0 ? "+" : ""}${signal} (${SIGNAL_LABEL[String(signal)]})`;
}

function fmtValue(indicator) {
  const unit = indicator.unit ? indicator.unit : "";
  if (typeof indicator.value === "number") return `${indicator.value}${unit}`;
  return String(indicator.value);
}

function renderMarkdown(result, indicatorsDoc) {
  const lines = [];
  const asOf = result.asOfDate || "미상";
  lines.push(`# 한국 시장 투심 바닥 지표 판단 — 기준일 ${asOf}`);
  lines.push("");
  const j = result.judgment;
  lines.push(`## 종합 판단: ${j.emoji} ${j.label}`);
  lines.push("");
  lines.push(`- **합성 점수: ${result.composite == null ? "N/A" : result.composite} / +2** (−2 과열 … 0 중립 … +2 강한 바닥)`);
  lines.push(`- ${j.detail}`);
  lines.push(`- 채점 지표 ${result.tally.scoredCount}개 (바닥 신호 ${result.tally.bottomSignals} · 과열 신호 ${result.tally.overheatSignals})`);
  lines.push("");

  // 합성 게이지 (텍스트 바).
  if (result.composite != null) {
    const pos = Math.round(((result.composite + 2) / 4) * 20);
    const bar = Array.from({ length: 21 }, (_, i) => (i === pos ? "●" : "─")).join("");
    lines.push("```");
    lines.push("과열 -2 ───────────── 중립 0 ───────────── 바닥 +2");
    lines.push(`     ${bar}`);
    lines.push("```");
    lines.push("");
  }

  lines.push("## 확정 신호 체크리스트 (저점 '확정'은 수급·추세 전환으로만)");
  lines.push("");
  const c = result.confirmation;
  const mark = (v) => (v === true ? "✅" : v === false ? "⬜" : "❔");
  lines.push(`- ${mark(c.foreignNetBuyTurn)} 외국인 순매도 → 순매수 전환`);
  lines.push(`- ${mark(c.aboveSma20)} KOSPI 20일선 회복`);
  lines.push(`- ${mark(c.rsiRecovering)} KOSPI RSI14 ≥ 40 (과매도 탈출)`);
  lines.push(`- 충족 ${result.confirmedCount}/3 — ${result.confirmedCount >= 2 ? "추세 전환 정황 확대" : "확정 신호 미완, 바닥 '근접' 단계"}`);
  lines.push("");

  lines.push("## 지표별 상세");
  lines.push("");
  lines.push("| 지표 | 값 | 기준일 | 신호 | 출처 |");
  lines.push("|---|---|---|---|---|");
  for (const s of result.scored) {
    const weightTag = s.weight === 0 ? " (맥락)" : "";
    lines.push(`| ${s.label}${weightTag} | ${fmtValue(s)} | ${s.asOfDate || "–"} | ${signalCell(s.signal)} | ${s.source || (s.origin === "manual" ? "수동 입력" : "–")} |`);
  }
  lines.push("");

  if (result.categorySummary.length) {
    lines.push("### 카테고리별 평균 신호");
    lines.push("");
    lines.push("| 카테고리 | 평균 신호 | 지표 수 |");
    lines.push("|---|---|---|");
    for (const cat of result.categorySummary) {
      lines.push(`| ${cat.category} | ${cat.avgSignal > 0 ? "+" : ""}${cat.avgSignal} | ${cat.count} |`);
    }
    lines.push("");
  }

  // 지수 스냅샷.
  const k = indicatorsDoc.markets?.kospi;
  const q = indicatorsDoc.markets?.kosdaq;
  if (k && !k.status) {
    lines.push("### 지수 스냅샷");
    lines.push("");
    lines.push(`- **KOSPI** ${k.lastClose} · 52주 고점대비 ${k.drawdownFrom52wHigh}% · 200일선 이격 ${k.distanceFromSma200}% · RSI14 ${k.rsi14} (${k.asOfDate})`);
    if (q && !q.status) {
      lines.push(`- **KOSDAQ**(보조) ${q.lastClose} · 52주 고점대비 ${q.drawdownFrom52wHigh}% · RSI14 ${q.rsi14} (${q.asOfDate})`);
    }
    lines.push("");
  }

  if (result.skipped.length) {
    lines.push("### 데이터 공백 / 미채점");
    lines.push("");
    for (const s of result.skipped) {
      lines.push(`- ${s.label || s.id}: 값 없음 또는 미인식 값${s.value != null ? ` (\`${s.value}\`)` : ""} — 수동 입력 필요`);
    }
    lines.push("");
  }

  if (result.warnings.length) {
    lines.push("### 경고");
    lines.push("");
    for (const w of result.warnings) lines.push(`- ${w}`);
    lines.push("");
  }

  lines.push("---");
  lines.push("");
  lines.push("**해석 원칙**: 이 지표들은 역발상·동행 지표로 바닥 '근접'을 알려줄 뿐 정확한 저점 시점을 예측하지 않습니다. 저평가·과매도가 더 깊어질 수 있으며(가치 함정), 저점 확정은 외국인 순매수 전환과 지수 추세 회복으로만 이뤄집니다. 각 지표의 기준일을 확인하고, 사실(수집값)과 추론(신호 해석)을 구분해 활용하세요.");
  lines.push("");
  return lines.join("\n");
}

// ---- CLI ---------------------------------------------------------------

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

function writeAtomic(filePath, text) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, text, "utf8");
  fs.renameSync(temporary, filePath);
}

function main() {
  const args = parseArgs(process.argv);
  if (args.help || args.h || !args.input) {
    process.stdout.write([
      "Usage:",
      "  node score-sentiment-bottom.js --input indicators.json [--output report.md] [--json-out score.json]",
    ].join("\n") + "\n");
    if (!args.input) process.exit(1);
    return;
  }
  const doc = JSON.parse(fs.readFileSync(path.resolve(args.input), "utf8"));
  const result = scoreAll(doc);
  const markdown = renderMarkdown(result, doc);
  if (args.output) writeAtomic(path.resolve(args.output), markdown.endsWith("\n") ? markdown : `${markdown}\n`);
  else process.stdout.write(`${markdown}\n`);
  if (args["json-out"]) writeAtomic(path.resolve(args["json-out"]), `${JSON.stringify(result, null, 2)}\n`);
}

if (require.main === module) {
  try { main(); } catch (error) { console.error(`Error: ${error.message}`); process.exit(1); }
}

module.exports = {
  NUMERIC_RULES,
  CATEGORICAL_RULES,
  scoreNumeric,
  scoreCategorical,
  scoreIndicator,
  scoreAll,
  judgeComposite,
  renderMarkdown,
};
