const crypto = require("crypto");

const MIN_BODY_CHARS = 400;

function normalize(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function canonicalUrl(value) {
  try {
    const url = new URL(String(value || ""));
    for (const key of [...url.searchParams.keys()]) {
      if (/^(?:utm_|fbclid$|gclid$|ncid$|sid$|session$|tracking$)/i.test(key)) url.searchParams.delete(key);
    }
    url.hash = "";
    return url.toString();
  } catch {
    return String(value || "").replace(/[?#].*$/, "");
  }
}

function articleId(url) {
  return `article-${crypto.createHash("sha256").update(canonicalUrl(url)).digest("hex").slice(0, 16)}`;
}

function splitSentences(body) {
  const text = normalize(body);
  const output = [];
  const pattern = /[^.!?]+[.!?]+|[^.!?]+$/g;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    const quote = normalize(match[0]);
    if (quote.length >= 45 && quote.length <= 480) output.push({ quote, start: match.index, end: match.index + match[0].length });
  }
  return output;
}

function evidenceScore(sentence) {
  const text = sentence.quote;
  let score = 0;
  if (/\$\s?\d|\b\d+(?:\.\d+)?%|\b(?:million|billion|trillion)\b/i.test(text)) score += 3;
  if (/said|reported|announced|expects?|forecast|revenue|earnings|profit|sales|shares?|stock|rose|fell|gained|lost|yield|valuation|IPO|debut/i.test(text)) score += 3;
  if (/according to|as of|compared with|versus|from .* to /i.test(text)) score += 2;
  return score;
}

function extractEvidence(body, limit = 5) {
  return splitSentences(body)
    .map((sentence, index) => ({ ...sentence, index, score: evidenceScore(sentence) }))
    .filter(sentence => sentence.score >= 3)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .sort((a, b) => a.index - b.index)
    .map((sentence, index) => ({
      id: `e${index + 1}`,
      quote: sentence.quote,
      start: sentence.start,
      end: sentence.end,
    }));
}

function containsHangul(value) {
  return /[가-힣]/.test(String(value || ""));
}

function comparisonText(value) {
  return normalize(value).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

function percentageTokens(value) {
  return [...String(value || "").matchAll(/\d+(?:\.\d+)?%/g)].map(match => match[0]);
}

function dollarBillionTokens(value) {
  return [...String(value || "").matchAll(/\$\s?(\d+(?:\.\d+)?)\s*(?:billion|bn)/gi)].map(match => Number(match[1]));
}

function koreanEokDollarTokens(value) {
  return [...String(value || "").matchAll(/(\d+(?:\.\d+)?)\s*억\s*달러/g)].map(match => Number(match[1]));
}

function hasSupportedNumbers(summaryKo, evidenceText) {
  const evidencePercents = new Set(percentageTokens(evidenceText));
  if (percentageTokens(summaryKo).some(token => !evidencePercents.has(token))) return false;
  const evidenceBillions = dollarBillionTokens(evidenceText);
  return koreanEokDollarTokens(summaryKo).every(value => evidenceBillions.some(billion => Math.abs(value - billion * 10) < 0.001));
}

function validateEditorial(article, editorial) {
  if (!editorial || typeof editorial !== "object") return { valid: false, reason: "편집 요약이 없습니다." };
  const headlineKo = normalize(editorial.headlineKo);
  const summaryKo = normalize(editorial.summaryKo);
  const evidenceIds = Array.isArray(editorial.evidenceIds) ? editorial.evidenceIds.map(String) : [];
  if (!headlineKo || !summaryKo || !containsHangul(headlineKo) || !containsHangul(summaryKo)) return { valid: false, reason: "한국어 제목 또는 요약이 없습니다." };
  if (/원문은|내용을 전합니다|확인해야 합니다/i.test(summaryKo)) return { valid: false, reason: "요약이 금지된 안내 문구를 포함합니다." };
  if (comparisonText(summaryKo) === comparisonText(headlineKo) || comparisonText(summaryKo).startsWith(comparisonText(headlineKo))) return { valid: false, reason: "요약이 제목을 반복할 뿐 본문 사실을 담지 않습니다." };
  if (!evidenceIds.length) return { valid: false, reason: "요약을 뒷받침하는 본문 근거가 없습니다." };
  const evidenceById = new Map((article.evidence || []).map(item => [item.id, item]));
  const evidence = evidenceIds.map(id => evidenceById.get(id)).filter(Boolean);
  if (evidence.length !== evidenceIds.length) return { valid: false, reason: "요약이 존재하지 않는 본문 근거를 가리킵니다." };
  if (!hasSupportedNumbers(summaryKo, evidence.map(item => item.quote).join(" "))) return { valid: false, reason: "요약의 퍼센트 또는 달러 수치가 본문 근거와 일치하지 않습니다." };
  return { valid: true, editorial: { headlineKo, summaryKo, evidenceIds, evidence } };
}

function applyEditorial(article, editorialByUrl = {}) {
  const editorial = editorialByUrl[canonicalUrl(article.canonicalUrl || article.url)] || editorialByUrl[article.id] || null;
  const validation = validateEditorial(article, editorial);
  return {
    ...article,
    editorial: validation.valid ? { ...validation.editorial, status: "verified" } : { status: "pending", reason: validation.reason },
  };
}

module.exports = {
  MIN_BODY_CHARS,
  applyEditorial,
  articleId,
  canonicalUrl,
  extractEvidence,
  hasSupportedNumbers,
  splitSentences,
  validateEditorial,
};
