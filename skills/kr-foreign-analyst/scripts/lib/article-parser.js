"use strict";

// Extractors for broker metadata (rating, target price, report date, thesis
// snippet) from Korean news article bodies. Scope-aware: most functions accept
// a text window so the caller can narrow matching to the paragraph around a
// specific broker mention instead of the whole article, avoiding cross-broker
// contamination.

const {
  findBrokersInText,
  firstAliasIndex,
  allAliasIndices,
  IB_WHITELIST,
} = require("./ib-whitelist");

function extractBrokers(text) {
  return findBrokersInText(text);
}

// Name variants a Korean article may use for the target company. Publisher
// pages carry navigation, "많이 본 기사" rails, and unrelated tickers, so a
// broker name on the page proves nothing on its own — it has to sit next to a
// mention of the company we asked about.
function companyAliases(company, ticker = null) {
  const out = new Set();
  const add = (s) => {
    const v = (s || "").trim();
    if (v.length >= 2) out.add(v);
  };

  add(company);
  if (company) {
    const collapsed = company.replace(/\s+/g, "");
    add(collapsed);
    // "HD현대일렉트릭" is routinely shortened to "현대일렉트릭" in body copy.
    add(collapsed.replace(/^HD/i, ""));
    add(collapsed.replace(/^\(주\)/, ""));
  }
  add(ticker);
  return Array.from(out);
}

function textMentionsCompany(text, aliases) {
  if (!text || !aliases || !aliases.length) return false;
  return aliases.some((a) => text.includes(a));
}

// Sentences inside `text` that name the company. Articles covering several
// tickers at once ("삼전닉스", sector round-ups) put a rival's target price one
// sentence away from ours, so numbers must be read at sentence granularity
// rather than from the surrounding window.
function companySentences(text, aliases) {
  if (!text) return [];
  // Korean newswire copy frequently omits the space after a full stop
  // ("…진단했다.레버리지 ETF는…"), so splitting on "punctuation + whitespace"
  // silently merges neighbouring sentences — and a merged sentence is exactly
  // how a rival's target price leaks in. Split after any sentence-ending mark,
  // with a digit guard so decimals like "1.5조" stay intact.
  return text
    .split(/(?<=[.!?。])(?![0-9])\s*|\n+/)
    .map((s) => s.trim())
    .filter((s) => s && textMentionsCompany(s, aliases));
}

// Sentences naming both the company and this specific broker. A round-up piece
// ("글로벌 IB들의 목표주가") puts several houses' numbers in adjacent sentences,
// so requiring the broker in the same sentence as the figure is what stops
// JP모건's target price from being reported as Morgan Stanley's.
function brokerCompanySentences(text, aliases, canonical) {
  return companySentences(text, aliases).filter(
    (s) => allAliasIndices(s, canonical).length > 0
  );
}

// Windows around each mention of `canonical` that also name the company.
// Returns [] when the broker never appears near the company, which is the
// signal to drop that broker for this article entirely.
function relevantBrokerWindows(
  text,
  canonical,
  aliases,
  { windowChars = 300 } = {}
) {
  if (!text || !canonical) return [];
  const windows = [];
  for (const { index, alias } of allAliasIndices(text, canonical)) {
    const start = Math.max(0, index - windowChars);
    const end = Math.min(text.length, index + (alias ? alias.length : 0) + windowChars);
    const win = text.slice(start, end);
    if (textMentionsCompany(win, aliases)) windows.push(win);
  }
  return windows;
}

// A won amount as Korean copy writes it: "1,150,000원", "110만원", "37만5000원".
const KRW_AMOUNT = "([0-9][0-9,]*(?:\\.[0-9]+)?)\\s*(만)?\\s*([0-9][0-9,]*)?\\s*원";

function toKrw(head, manFlag, tail) {
  const base = parseFloat(String(head).replace(/,/g, ""));
  if (!Number.isFinite(base)) return null;
  let value;
  if (manFlag) {
    // "37만5000원" -> 370,000 + 5,000
    const rest = tail ? parseFloat(String(tail).replace(/,/g, "")) : 0;
    value = Math.round(base * 10_000 + (Number.isFinite(rest) ? rest : 0));
  } else {
    value = Math.round(base);
  }
  return value >= 100 && value < 100_000_000 ? value : null;
}

// "목표주가를 300만원에서 275만원으로 하향" — the *new* target is the second
// figure. Reading the first one reports a number the broker just walked away
// from, which is worse than reporting nothing.
const TP_REVISION_RX = new RegExp(
  `${KRW_AMOUNT}\\s*(?:에서|→|->)\\s*${KRW_AMOUNT}\\s*(?:으로|로)`
);

const TP_PATTERNS = [
  new RegExp(`목표주가[를을]?\\s*${KRW_AMOUNT}으로\\s*(?:상향|하향|제시|유지|조정)`),
  new RegExp(`목표주가[를을]?\\s*${KRW_AMOUNT}`),
  new RegExp(`목표가[를을]?\\s*${KRW_AMOUNT}`),
  new RegExp(`목표\\s*가격[을를]?\\s*${KRW_AMOUNT}`),
  /\bTP\s*([0-9][0-9,]{2,})()()\s*(?:원|KRW|krw)?/,
  /target\s*price[^0-9]{0,20}([0-9][0-9,]{2,})()()/i,
];

function extractTargetPrice(text) {
  if (!text) return null;

  // Only trust a bare revision range when the sentence is actually about a
  // target price, not about a share price or an index level.
  if (/목표\s*주?가|목표가/.test(text)) {
    const rev = text.match(TP_REVISION_RX);
    if (rev) {
      const v = toKrw(rev[4], rev[5], rev[6]);
      if (v !== null) return v;
    }
  }

  for (const rx of TP_PATTERNS) {
    const m = text.match(rx);
    if (m) {
      const v = toKrw(m[1], m[2], m[3]);
      if (v !== null) return v;
    }
  }
  return null;
}

// One sentence often prices two names at once:
//   "모건스탠리가 SK하이닉스 목표주가를 260만원, 삼성전자 목표주가를 37만5000원으로 유지했다"
// Take the figure attached to the 목표주가 keyword sitting closest to *our*
// company, instead of whichever number the regex happens to reach first.
function extractTargetPriceForCompany(text, aliases) {
  if (!text) return null;
  if (!aliases || !aliases.length) return extractTargetPrice(text);

  const aliasPositions = [];
  for (const a of aliases) {
    let from = 0;
    for (;;) {
      const i = text.indexOf(a, from);
      if (i < 0) break;
      aliasPositions.push(i);
      from = i + a.length;
    }
  }
  if (!aliasPositions.length) return extractTargetPrice(text);

  const kwRx = /목표\s*주?가|목표가|target\s*price/gi;
  const keywordIdx = [];
  let m;
  while ((m = kwRx.exec(text)) !== null) keywordIdx.push(m.index);
  if (!keywordIdx.length) return extractTargetPrice(text);

  const candidates = [];
  for (let i = 0; i < keywordIdx.length; i += 1) {
    // Stop before the next 목표주가 so an adjacent company's figure cannot be
    // read into this one's segment.
    const end = Math.min(
      text.length,
      keywordIdx[i] + 60,
      i + 1 < keywordIdx.length ? keywordIdx[i + 1] : Infinity
    );
    const value = extractTargetPrice(text.slice(keywordIdx[i], end));
    if (value === null) continue;
    const distance = Math.min(
      ...aliasPositions.map((p) => Math.abs(p - keywordIdx[i]))
    );
    candidates.push({ value, distance });
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => a.distance - b.distance);
  return candidates[0].value;
}

// Order matters: more specific phrases first so "시장수익률 상회"
// match before a generic token like 중립.
//
// Tokens here are unambiguous — in Korean market copy they only ever denote an
// investment opinion.
const RATING_MAP = [
  [/시장수익률\s*상회/, "Outperform"],
  [/시장수익률\s*하회/, "Underperform"],
  [/시장수익률/, "Neutral"],
  [/적극매수/, "Strong Buy"],
  [/\bEqual[-\s]?weight\b/i, "Equal-weight"],
  [/\bOverweight\b/i, "Overweight"],
  [/\bUnderweight\b/i, "Underweight"],
  [/\bOutperform\b/i, "Outperform"],
  [/\bUnderperform\b/i, "Underperform"],
  [/\bStrong\s*Buy\b/i, "Strong Buy"],
];

// 매수 / 매도 / 중립 / 보유 are ordinary nouns as well as ratings — "매도 압력이
// 정점을 지났다" is selling pressure, not a Sell call. 비중 확대 is the same trap:
// "국민연금의 국내 주식 비중 확대 여력" is an allocation, not an Overweight call.
// Require an explicit opinion context (or rating quotes) before believing them.
const AMBIGUOUS_RATING_TOKENS = [
  ["비중\\s*확대", "Overweight"],
  ["비중\\s*축소", "Underweight"],
  ["적극\\s*매수", "Strong Buy"],
  ["매수", "Buy"],
  ["매도", "Sell"],
  ["중립", "Neutral"],
  ["보유", "Hold"],
];

const AMBIGUOUS_RATING_RULES = AMBIGUOUS_RATING_TOKENS.flatMap(([token, label]) => [
  // 투자의견을 '매수'로 유지 / 투자의견 매수
  [new RegExp(`(?:투자의견|투자등급|의견|등급|레이팅)[^。.\\n]{0,25}${token}`), label],
  // 매수 의견 / 매도 등급
  [new RegExp(`${token}\\s*(?:의견|등급|레이팅)`), label],
  // '매수' / "매수" — quoted ratings are the common Korean newswire form
  [new RegExp(`['"‘’“”]\\s*${token}\\s*['"‘’“”]`), label],
]);

// English bare words are safe only with a rating context nearby.
const ENGLISH_AMBIGUOUS_RULES = [
  [/\b(?:rating|maintains?|reiterates?|initiat\w*)\b[^.\n]{0,30}\bBuy\b/i, "Buy"],
  [/\bBuy\b[^.\n]{0,15}\brating\b/i, "Buy"],
  [/\b(?:rating|maintains?|reiterates?|initiat\w*)\b[^.\n]{0,30}\bSell\b/i, "Sell"],
  [/\bSell\b[^.\n]{0,15}\brating\b/i, "Sell"],
  [/\b(?:rating|maintains?|reiterates?|initiat\w*)\b[^.\n]{0,30}\bHold\b/i, "Hold"],
  [/\bHold\b[^.\n]{0,15}\brating\b/i, "Hold"],
  [/\b(?:rating|maintains?|reiterates?|initiat\w*)\b[^.\n]{0,30}\bNeutral\b/i, "Neutral"],
];

function extractRating(text) {
  if (!text) return null;
  for (const [rx, label] of RATING_MAP) {
    if (rx.test(text)) return label;
  }
  for (const [rx, label] of AMBIGUOUS_RATING_RULES) {
    if (rx.test(text)) return label;
  }
  for (const [rx, label] of ENGLISH_AMBIGUOUS_RULES) {
    if (rx.test(text)) return label;
  }
  return null;
}

function extractReportDate(text, articleDate = null) {
  if (!text) return articleDate || null;
  const full = text.match(/(20\d{2})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
  if (full) return `${full[1]}-${full[2].padStart(2, "0")}-${full[3].padStart(2, "0")}`;
  const iso = text.match(/\b(20\d{2})[-/.]\s*(\d{1,2})[-/.]\s*(\d{1,2})\b/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  return articleDate || null;
}

function paragraphAroundBroker(text, canonical, { windowChars = 400 } = {}) {
  if (!text || !canonical) return "";
  const { index, alias } = firstAliasIndex(text, canonical);
  if (index < 0) return "";
  // Try paragraph boundaries first (double newline), fall back to fixed window.
  const paraStart = text.lastIndexOf("\n\n", index);
  const paraEnd = text.indexOf("\n\n", index + (alias ? alias.length : 0));
  if (paraStart >= 0 || paraEnd >= 0) {
    return text.slice(
      paraStart < 0 ? 0 : paraStart + 2,
      paraEnd < 0 ? text.length : paraEnd
    );
  }
  const half = Math.floor(windowChars / 2);
  return text.slice(Math.max(0, index - half), Math.min(text.length, index + half));
}

function extractThesisSnippet(text, canonical, { maxChars = 240 } = {}) {
  const para = paragraphAroundBroker(text, canonical);
  const flat = para.replace(/\s+/g, " ").trim();
  if (!flat) return "";
  if (flat.length <= maxChars) return flat;
  return flat.slice(0, maxChars - 1).trim() + "…";
}

module.exports = {
  extractBrokers,
  extractTargetPrice,
  extractTargetPriceForCompany,
  extractRating,
  extractReportDate,
  extractThesisSnippet,
  paragraphAroundBroker,
  companyAliases,
  textMentionsCompany,
  companySentences,
  brokerCompanySentences,
  relevantBrokerWindows,
  IB_WHITELIST,
};
