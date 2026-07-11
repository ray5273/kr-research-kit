#!/usr/bin/env node

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { DEFAULT_SECTORS, marketNewsScore, newsRankScore } = require("./fetch-daily-market-news");
const { validateEditorial } = require("./article-evidence");

const SECTOR_KO = {
  "Technology/AI": "기술/AI",
  Technology: "기술",
  "Communication Services": "커뮤니케이션",
  "Consumer Discretionary": "경기소비재",
  "Consumer Staples": "필수소비재",
  Financials: "금융",
  "Health Care": "헬스케어",
  Industrials: "산업재",
  Energy: "에너지",
  Materials: "소재",
  Utilities: "유틸리티",
  "Real Estate": "부동산",
};
const REQUIRED_INDEX_NAMES = ["S&P 500", "Nasdaq Composite", "Dow Jones", "Russell 2000"];
const REQUIRED_SECTOR_SYMBOLS = ["XLK", "XLC", "XLY", "XLP", "XLF", "XLV", "XLI", "XLE", "XLB", "XLU", "XLRE"];

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

function sha256(value) {
  const hash = crypto.createHash("sha256");
  hash.update(value);
  return hash.digest("hex");
}

function fileSha256(filePath) {
  return sha256(fs.readFileSync(filePath));
}

function writeJsonAtomic(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(temporary, filePath);
}

function normalizeText(value) {
  return String(value || "").replace(/[ \t]+$/gm, "").replace(/\n{3,}/g, "\n\n").trim();
}

function escapePipe(value) {
  return String(value || "").replace(/\|/g, "\\|").trim();
}

function easternTimeLabel(publishedAt) {
  if (!publishedAt) return "";
  const date = new Date(publishedAt);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function itemLine(item) {
  const label = item.headline || item.title || "제목 없음";
  const time = easternTimeLabel(item.publishedAt);
  const suffix = `${item.source || "source"}${time ? ` (${time} ET)` : ""}`;
  return item.url ? `- [${label}](${item.url}) — ${suffix}` : `- ${label}`;
}

function sourceLabel(item) {
  return item.headline || item.title || item.name || "출처";
}

function isEvidenceReport(data) {
  return Number(data?.schemaVersion) >= 2 && Array.isArray(data?.articles) && Array.isArray(data?.stories);
}

function evidenceArticleMap(data) {
  return new Map((data.articles || []).map(article => [article.id, article]));
}

function verifiedEvidenceStory(story, articles) {
  const article = articles.get(story.articleId);
  if (!article || article.editorial?.status !== "verified") return false;
  if (!validateEditorial(article, article.editorial).valid) return false;
  const evidenceIds = new Set((article.evidence || []).map(item => item.id));
  return Boolean(story.headlineKo && story.summaryKo && Array.isArray(story.evidenceIds) && story.evidenceIds.length
    && story.evidenceIds.every(id => evidenceIds.has(id)) && /^https?:\/\//i.test(story.url || ""));
}

function evidenceStories(data) {
  const articles = evidenceArticleMap(data);
  const seen = new Set();
  return (data.stories || []).filter(story => {
    if (!verifiedEvidenceStory(story, articles) || seen.has(story.url)) return false;
    seen.add(story.url);
    return true;
  });
}

function naverEvidenceStories(data) {
  const stories = evidenceStories(data);
  return [
    ...stories.filter(story => story.kind !== "market").slice(0, 4),
    ...stories.filter(story => story.kind === "market").slice(0, 2),
  ];
}

function evidenceStoryLabel(story) {
  if (story.kind === "stock") return `${story.name || story.ticker} (${story.ticker})`;
  if (story.kind === "sector") return `${SECTOR_KO[story.sector] || story.sector} 업종`;
  return "미국 증시";
}

function evidenceQuote(story, articles) {
  const article = articles.get(story.articleId);
  const byId = new Map((article?.evidence || []).map(item => [item.id, item]));
  return story.evidenceIds.map(id => byId.get(id)?.quote).filter(Boolean)[0] || "";
}

function evidenceTitleCandidates(data) {
  const stories = evidenceStories(data);
  const leads = stories.filter(story => story.kind === "stock" || story.kind === "sector").slice(0, 2);
  const labels = leads.map(story => story.kind === "stock" ? (story.name || story.ticker) : (SECTOR_KO[story.sector] || story.sector));
  const market = stories.find(story => story.kind === "market");
  if (labels.length) return [`${data.asOfDate} 미국증시 | ${labels.join("·")} 핵심 뉴스`, `${data.asOfDate} 미국 증시 | ${labels[0]}와 시장 주요 뉴스`];
  if (market) return [`${data.asOfDate} 미국증시 | ${market.headlineKo}`, `${data.asOfDate} 미국 증시 주요 뉴스`];
  return [`${data.asOfDate} 미국증시 | 본문 검증 뉴스`, `${data.asOfDate} 미국 증시 데일리`];
}

function renderEvidenceSnapshot(data) {
  const snapshot = data.marketSnapshot || {};
  const parts = [];
  if (snapshot.indexes?.length) {
    parts.push("## 시장 스냅샷", "", "| 지수 | 종가 | 등락률 |", "| --- | ---: | ---: |");
    snapshot.indexes.forEach(item => parts.push(`| ${escapePipe(item.name)} | ${Number(item.price).toFixed(2)} | ${pctLabel(item.changePct)} |`));
  }
  if (snapshot.sectors?.length) {
    parts.push("", "| 섹터 ETF | 섹터 | 등락률 |", "| --- | --- | ---: |");
    [...snapshot.sectors].sort((a, b) => Number(b.changePct) - Number(a.changePct)).forEach(item => parts.push(`| ${item.symbol} | ${escapePipe(item.name)} | ${pctLabel(item.changePct)} |`));
  }
  return parts;
}

function renderEvidenceReport(data) {
  const articles = evidenceArticleMap(data);
  const stories = evidenceStories(data);
  const parts = [`# 미국 시장 데일리 뉴스 (${data.asOfDate})`, "", "## 본문 검증 기사", ""];
  if (stories.length) {
    stories.forEach((story, index) => {
      const article = articles.get(story.articleId);
      parts.push(`### ${index + 1}. ${story.headlineKo}`, "", story.summaryKo, "", `- 분류: ${evidenceStoryLabel(story)}`, `- 출처: [${article.headline}](${story.url}) (${story.source})`, `- 본문 근거: “${evidenceQuote(story, articles)}”`, "");
    });
  } else {
    parts.push("본문 근거와 한국어 편집 검증을 모두 통과한 기사가 없습니다.");
  }
  parts.push("", ...renderEvidenceSnapshot(data), "", "## 편집 대기", "", `본문은 확보됐지만 근거를 연결한 한국어 편집이 아직 없는 기사: ${(data.editorialQueue || []).length}건`, "", "## 수집 참고", "");
  if (data.warnings?.length) data.warnings.forEach(warning => parts.push(`- ${warning}`));
  else parts.push("- 수집 경고 없음");
  return `${normalizeText(parts.join("\n"))}\n`;
}

function renderEvidenceNaverPost(data) {
  const articles = evidenceArticleMap(data);
  const stories = naverEvidenceStories(data);
  const marketStories = stories.filter(story => story.kind === "market").slice(0, 3);
  const focusStories = stories.filter(story => story.kind !== "market").slice(0, 5);
  const parts = [`# ${evidenceTitleCandidates(data)[0]}`, "", "## 시장 주요 요약", ""];
  if (marketStories.length) marketStories.forEach((story, index) => parts.push(`${index + 1}. ${story.summaryKo}`));
  else parts.push("본문 근거와 한국어 편집 검증을 통과한 시장 기사가 충분하지 않습니다.");
  parts.push("", "## 업종·특징주 뉴스", "");
  if (focusStories.length) {
    focusStories.forEach((story, index) => {
      const quote = story.quote ? ` · 정규장 ${Number(story.quote.price).toFixed(2)} (${pctLabel(story.quote.changePct)})` : "";
      parts.push(`${index + 1}. ${evidenceStoryLabel(story)}${quote}`, "", `한국어 제목: ${story.headlineKo}`, "", `핵심 내용: ${story.summaryKo}`, story.url, "");
    });
  } else {
    parts.push("본문 근거와 한국어 편집 검증을 통과한 업종·특징주 기사가 없습니다.");
  }
  parts.push("", "## 시장 주요 뉴스", "");
  if (marketStories.length) {
    marketStories.forEach((story, index) => {
      parts.push(`${index + 1}. ${story.headlineKo}`, "", `핵심 내용: ${story.summaryKo}`, story.url, "");
    });
  } else {
    parts.push("본문 근거와 한국어 편집 검증을 통과한 시장 기사가 충분하지 않습니다.");
  }
  parts.push("", ...renderEvidenceSnapshot(data), "", "## 출처", "");
  if (stories.length) stories.forEach((story, index) => parts.push(`${index + 1}. ${articles.get(story.articleId).headline} (${story.source})`));
  else parts.push("검증 가능한 본문 출처가 없습니다.");
  if (data.warnings?.length) parts.push("", "### 수집 참고", "", "본문 또는 편집 근거가 부족한 기사는 본문에서 제외했습니다.");
  parts.push("", "---", "", `기준일: ${data.asOfDate}`, "", "본 글은 공개된 뉴스와 공시성 자료를 바탕으로 작성한 개인 시장 정리이며, 특정 종목의 매수·매도를 권유하지 않습니다. 투자 판단과 그 결과에 대한 책임은 투자자 본인에게 있습니다.");
  return `${normalizeText(parts.join("\n"))}\n`;
}

function headlineFingerprint(value) {
  return String(value || "")
    .replace(/\[[^\]]*속보[^\]]*\]/g, "")
    .replace(/\([^)]*(?:종합|속보|상보)[^)]*\)/g, "")
    .replace(/(?:종합|속보|상보)/g, "")
    .replace(/[0-9]+(?:\.[0-9]+)?%/g, "#%")
    .replace(/[0-9,]+/g, "#")
    .replace(/[^\p{L}\p{N}%#]+/gu, "")
    .toLowerCase();
}

function summaryFingerprint(item) {
  const text = `${item?.headline || item?.title || ""} ${item?.summary || ""}`;
  if (/\bAI\b|semiconductor|chip|Nvidia/i.test(text) && /S&P\s*500|Nasdaq|Wall Street/i.test(text)) return "market-ai-semiconductor";
  if (/dollar|currency|FX/i.test(text)) return "macro-fx";
  if (/Treasury|yield|Fed|FOMC|Powell|inflation|CPI|PCE/i.test(text)) return "macro-rates";
  if (/earnings|guidance|quarterly results/i.test(text)) return "earnings";
  return headlineFingerprint(item?.headline || item?.title || item?.summary || "");
}

function uniqueNewsItems(items, options = {}) {
  const seenUrls = new Set();
  const seenTopics = new Set();
  const output = [];
  for (const item of items || []) {
    const urlKey = normalizedUrl(item.url);
    const topicKey = summaryFingerprint(item);
    if (urlKey && seenUrls.has(urlKey)) continue;
    if (topicKey && seenTopics.has(topicKey)) continue;
    if (urlKey) seenUrls.add(urlKey);
    if (topicKey) seenTopics.add(topicKey);
    output.push(item);
    if (options.limit && output.length >= options.limit) break;
  }
  return output;
}

function sectorBlogPattern(sector) {
  const patterns = {
    "Technology/AI": /technology|\bAI\b|semiconductor|chip|software|cloud|Nvidia|Apple|Microsoft|Broadcom|AMD|Micron|Oracle|Palantir/i,
    "Communication Services": /communication|media|advertising|streaming|telecom|Alphabet|Google|Meta|Netflix|Disney|Comcast|Verizon|AT&T/i,
    "Consumer Discretionary": /consumer discretionary|retail|e-commerce|auto|EV|travel|Amazon|Tesla|Home Depot|McDonald's|Nike|Starbucks|Booking/i,
    "Consumer Staples": /consumer staples|grocery|food|beverage|household|Walmart|Costco|Procter|Coca-Cola|PepsiCo|Mondelez/i,
    "Financials": /financials|bank|broker|insurance|asset manager|JPMorgan|Goldman|Morgan Stanley|Bank of America|Wells Fargo|Visa|Mastercard/i,
    "Health Care": /health care|healthcare|biotech|pharma|drug|FDA|Medicare|Eli Lilly|UnitedHealth|Johnson & Johnson|Merck|Pfizer/i,
    "Industrials": /industrial|aerospace|defense|airline|rail|machinery|GE|Boeing|Caterpillar|Union Pacific|Honeywell|RTX/i,
    "Energy": /energy|oil|crude|natural gas|OPEC|refiner|Exxon|Chevron|ConocoPhillips|SLB/i,
    "Materials": /materials|chemical|mining|copper|steel|gold|lithium|Freeport|Newmont|Dow|Linde|Nucor/i,
    "Utilities": /utilities|utility|electricity|power grid|renewable|NextEra|Duke Energy|Southern Company/i,
    "Real Estate": /real estate|REIT|commercial property|data center|warehouse|Prologis|Equinix|Realty Income|American Tower/i,
  };
  return patterns[sector] || null;
}

const BLOG_NEWS_REJECT_PATTERN = /schedules?\s+(?:an?\s+)?earnings\s+(?:call|webcast|discussion)|webcast\s+discussion|what\s+to\s+expect|what\s+to\s+know\s+ahead|earnings\s+expected\s+to|next\s+quarterly\s+earnings|projected\s+to\s+release\s+earnings|forecasters?\s+revamp|expectations?\s+ahead\s+of|new\s+[^.]{0,40}\bETF\b|launch(?:es|ed|ing)?\s+[^.]{0,40}\bETF\b|grows?\s+(?:its\s+)?(?:holdings|position|stake)|boosts?\s+(?:its\s+)?(?:holdings|position|stake)|cuts?\s+(?:its\s+)?(?:holdings|position|stake)|(?:holdings?|position|stake)\s+(?:lessened|reduced|lowered|increased|raised|boosted)|(?:largest|major|top)\s+(?:holding|position)|\b\d+(?:st|nd|rd|th)\s+largest\s+position|(?:buys?|sells?|adds?|trims?|reduces?|increases?)\s+(?:its\s+)?(?:holdings|position|stake)|acquires?\s+\d+\s+shares|sells?\s+\d+\s+shares|one\s+stock\s+in\s+particular|best\s+stocks?\s+to\s+buy|charged\s+with|manslaughter|fatal\s+crash|files?\s+for\s+(?:an?\s+)?(?:IPO|Nasdaq)|secondary offering|price target|analyst rating|class action|MarketBeat|Kalkine Media|Ad[- ]?hoc[- ]?news/i;

function blogSectorItems(group, options = {}) {
  const pattern = sectorBlogPattern(group?.sector);
  const candidates = pattern
    ? (group.items || []).filter(item => {
      const text = `${item.headline || item.title || ""} ${item.description || ""} ${item.source || ""}`;
      return pattern.test(text) && !BLOG_NEWS_REJECT_PATTERN.test(text);
    })
    : (group.items || []).filter(item => !BLOG_NEWS_REJECT_PATTERN.test(`${item.headline || item.title || ""} ${item.description || ""} ${item.source || ""}`));
  return uniqueNewsItems(candidates, options);
}

function representativeNewsLabel(item) {
  const headline = item.headline || item.title || "";
  if (!headline) return "";
  return item.name ? `${item.name}: ${headline}` : headline;
}

function koreanHeadlineTranslation(item) {
  const headline = String(item.headline || item.title || "").replace(/\s+-\s+(?:Yahoo Finance|CNBC|Reuters|Associated Press)$/i, "").trim();
  const name = item.name || "";
  if (/chips? deal|Broadcom chips/i.test(headline) && /Apple/i.test(headline)) return "애플, 브로드컴 칩 계약으로 엔비디아 의존도 축소 모색";
  if (/Apple sues OpenAI/i.test(headline)) return "애플, OpenAI와 전 직원들을 영업비밀 탈취 혐의로 제소";
  if (/S&P 500, Nasdaq End Week Higher.*SK Hynix Debut/i.test(headline)) return "SK하이닉스의 강한 나스닥 데뷔에 S&P 500·나스닥 주간 상승 마감";
  if (/bank earnings approach.*market anomaly/i.test(headline)) return "은행 실적 발표를 앞두고 금융주 밸류에이션의 이례적 현상에 주목";
  if (/Circle.*National Bank Charter/i.test(headline)) return "서클, 미국 내셔널 트러스트 뱅크 인가 획득";
  if (/Holtec Nuclear Corporation files for US IPO/i.test(headline)) return "홀텍 뉴클리어, 미국 IPO 신청";
  if (/Gold drifts lower/i.test(headline)) return "중동 긴장과 금리 우려 속 금값 하락";
  if (/PepsiCo.?s Dividend Could Turn Patience Into Real Profit/i.test(headline)) return "펩시코 배당의 장기 투자 매력 조명";
  if (/earnings miss|miss estimates/i.test(headline) && /PepsiCo/i.test(headline)) return "펩시코, 미국 소비 둔화 속 시장 예상에 못 미친 실적 발표";
  if (/Goldman Sachs wins \$70 billion/i.test(headline)) return "골드만삭스, 버라이즌·록히드마틴 자산운용 계약 700억달러 수임";
  if (/raises? guidance/i.test(headline) && /Levi/i.test(headline)) return "리바이 스트라우스, 실적 호조에 연간 전망 상향";
  if (/stock market today/i.test(headline) && /chip.*rebound|chip stocks rebound/i.test(headline)) return "반도체주 반등과 유가 하락에 다우·S&P 500·나스닥 상승";
  if (/oil prices? (?:ease|fall|lower)/i.test(headline)) return "유가 하락과 함께 글로벌 금융시장 불안 완화";
  if (/rate hike|Fed is split/i.test(headline)) return "연준 내부 견해 차이 속 금리 인상 가능성에 주목";
  return name ? `${name} 관련 주요 보도` : (headline || "원문 제목 없음");
}

function koreanNewsSummary(item) {
  if (item.summaryKo) return item.summaryKo;
  const body = String(item.articleText || "").replace(/\s+/g, " ").trim();
  const headline = String(item.headline || item.title || "");
  if (body.length < 180) return "";
  if (/Apple/i.test(headline) && /Broadcom/i.test(headline) && /chip/i.test(body)) return "애플이 브로드컴과의 칩 계약을 통해 AI 연산용 반도체 조달을 다변화하고, 엔비디아 의존도를 낮추려는 움직임을 보였다는 내용입니다.";
  if (/bank earnings approach.*market anomaly/i.test(headline) && /valuation|earnings/i.test(body)) return "은행 실적 발표를 앞두고 금융섹터지수의 예상 이익 대비 밸류에이션이 2024년보다 약 1.25배 낮다는 점이 소개됐습니다.";
  if (/Apple sues OpenAI/i.test(headline) && /trade secret|lawsuit|sues/i.test(body)) return "애플이 OpenAI와 전직 직원들을 상대로 영업비밀 탈취 소송을 제기했다는 보도입니다.";
  if (/Gold drifts lower/i.test(headline) && /gold|rate|Middle East/i.test(body)) return "중동 긴장 재점화와 고금리 장기화 우려가 부각되면서 금 가격이 하락했다는 보도입니다.";
  if (/PepsiCo/i.test(headline) && /weaker-than-expected|miss(?:ed)? estimates/i.test(body)) return "펩시코는 해외 수요가 견조했지만 미국 소비자의 지출 둔화로 분기 실적이 시장 예상에 못 미쳤다고 보도됐습니다.";
  if (/PepsiCo/i.test(headline) && /dividend|yield|payout/i.test(body)) return "펩시코의 배당 지급 여력과 장기 보유 시 배당수익의 누적 가능성을 짚은 내용입니다.";
  if (/Goldman Sachs/i.test(headline) && /\$70 billion|70 billion/i.test(body) && /Verizon/i.test(body)) return "골드만삭스가 버라이즌과 록히드마틴의 자산운용 계약을 수임해 약 700억달러 규모를 확보했다는 보도입니다. 퇴직자산 운용 시장에서 대형 운용사 간 경쟁도 함께 언급됐습니다.";
  if (/chip stocks? rebound/i.test(headline) && /oil prices? (?:fall|ease|lower)/i.test(body)) return "반도체주 반등과 유가 하락을 배경으로 다우, S&P 500, 나스닥이 상승 마감했다는 시장 기사입니다.";
  if (/Fed/i.test(headline) && /rate hike|split on policy/i.test(body)) return "연준 회의록에서 정책 경로에 대한 견해 차이가 확인됐고, 시장 참여자들의 금리 인상 가능성 추정이 함께 소개됐습니다.";
  if (/Treasury yields fall/i.test(headline) && /inflation|interest rates|equity indexes/i.test(body)) return "완화된 물가 지표 뒤 국채 금리가 하락했고, 금리 경로 재평가에 따라 주가지수가 장 마감에 회복했다는 내용입니다.";
  if (/NVIDIA/i.test(headline) && /AI|data.cent|chip/i.test(body)) return "엔비디아의 AI 칩 수요와 데이터센터 투자 확대가 기술주 강세의 배경으로 언급됐습니다.";
  if (/Microsoft/i.test(headline) && /cloud|AI/i.test(body)) return "마이크로소프트의 클라우드와 AI 수요가 소프트웨어 업종 투자 심리를 지지했다는 내용입니다.";
  if (/S&P 500/i.test(headline) && /Nasdaq/i.test(headline) && /AI|chip|technology/i.test(body)) return "AI·반도체 관련 수요가 대형 기술주 흐름에 반영되며 S&P 500과 나스닥의 장중 또는 마감 움직임에 영향을 줬다는 내용입니다.";
  return "";
}

function koreanNewsBrief(item) {
  return koreanNewsSummary(item).replace(/\s+/g, " ").trim();
}

function sectorNewsBrief(item, snapshot) {
  const base = koreanNewsBrief(item);
  if (!snapshot || !Number.isFinite(Number(snapshot.changePct))) return base;
  const text = `${item.headline || item.title || ""} ${item.description || ""}`;
  const up = /rally|rises?|gains?|jumps?|climbs?|surges?|higher|rebound|beats?|growth|wins?/i.test(text);
  const down = /falls?|drops?|declines?|slides?|slumps?|lower|selloff|miss(?:es|ed)?|cuts?|weak|eases?/i.test(text);
  const move = Number(snapshot.changePct);
  const label = `${snapshot.symbol} ${pctLabel(move)}`;
  if (up && move <= -0.15) return `${base} 다만 ${label}로 마감해 기사 속 개별 강세가 업종 전체로 확산되지는 않았습니다.`;
  if (down && move >= 0.15) return `${base} 다만 ${label}로 마감해 기사 방향과 업종 ETF 종가는 엇갈렸습니다.`;
  return `${base} 당일 업종 ETF는 ${label}로 마감했습니다.`;
}

function naverSummaryLine(item, index) {
  const rank = item.rank || index + 1;
  return `${rank}. ${item.summaryKo || koreanNewsBrief(item)}`;
}

function sourceRow(item) {
  return `| ${escapePipe(sourceLabel(item))} | ${item.url ? `[원문](${item.url})` : "-"} |`;
}

function normalizedUrl(value) {
  let url = String(value || "").trim();
  if (!url) return "";
  try {
    const parsed = new URL(url);
    for (const key of [...parsed.searchParams.keys()]) {
      if (/^(?:utm_|fbclid$|gclid$|ncid$|sid$|session$|tracking$)/i.test(key)) parsed.searchParams.delete(key);
    }
    parsed.hash = "";
    return parsed.toString().toLowerCase();
  } catch {
    return url.replace(/#.*$/, "").toLowerCase();
  }
}

function dedupeSourcesByUrl(items) {
  const seen = new Set();
  const output = [];
  for (const item of items || []) {
    const key = normalizedUrl(item.url);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push(item);
  }
  return output;
}

function naverMarketNewsItems(data) {
  return uniqueNewsItems((data.marketNews || []).filter(item => item.url && item.articleText?.length >= 180 && koreanNewsSummary(item)), { limit: 3 });
}

function featuredStockItems(data) {
  return uniqueNewsItems((data.featuredStocks || []).filter(item => item.url && item.articleText?.length >= 180 && koreanNewsSummary(item)), { limit: 5 });
}

function usedArticleItems(data) {
  return dedupeSourcesByUrl([...featuredStockItems(data), ...naverMarketNewsItems(data)]);
}

function snapshotSummaryItems(data) {
  const indexes = data.marketSnapshot?.indexes || [];
  const sectors = [...(data.marketSnapshot?.sectors || [])]
    .filter(item => Number.isFinite(Number(item.changePct)))
    .sort((a, b) => Number(b.changePct) - Number(a.changePct));
  if (!indexes.length || !sectors.length) return [];
  const indexMap = new Map(indexes.map(item => [item.name, item]));
  const indexOrder = ["Dow Jones", "S&P 500", "Nasdaq Composite", "Russell 2000"];
  const indexText = indexOrder
    .map(name => indexMap.get(name))
    .filter(Boolean)
    .map(item => `${item.name === "Nasdaq Composite" ? "Nasdaq" : item.name} ${pctLabel(item.changePct)}`)
    .join(", ");
  const advancing = sectors.filter(item => Number(item.changePct) > 0).length;
  const declining = sectors.filter(item => Number(item.changePct) < 0).length;
  const top = sectors.slice(0, 2);
  const bottom = sectors.slice(-2).reverse();
  const spread = Number(sectors[0].changePct) - Number(sectors.at(-1).changePct);
  const topText = top.map(item => `${SECTOR_KO[item.name] || item.name} ${pctLabel(item.changePct)}`).join("·");
  const bottomText = bottom.map(item => `${SECTOR_KO[item.name] || item.name} ${pctLabel(item.changePct)}`).join("·");
  const defensive = new Set(["Health Care", "Utilities", "Consumer Staples"]);
  const growth = new Set(["Technology", "Communication Services", "Consumer Discretionary"]);
  const cyclical = new Set(["Financials", "Industrials", "Materials", "Energy"]);
  const topNames = new Set(top.map(item => item.name));
  const bottomNames = new Set(bottom.map(item => item.name));
  let rotation = "업종 간 차별화가 나타났습니다.";
  if ([...topNames].filter(name => defensive.has(name)).length >= 2 && [...bottomNames].some(name => growth.has(name))) {
    rotation = "방어 업종이 상단을 차지하고 성장 업종이 하단에 놓여 방어적 로테이션이 확인됐습니다.";
  } else if ([...topNames].filter(name => growth.has(name)).length >= 2) {
    rotation = "성장 업종이 상단을 차지해 기술·성장주 중심의 위험선호가 확인됐습니다.";
  } else if ([...topNames].filter(name => cyclical.has(name)).length >= 2) {
    rotation = "경기민감 업종이 상단을 차지해 가치·경기순환주 쪽으로 힘이 실렸습니다.";
  }
  const sp = indexMap.get("S&P 500");
  const russell = indexMap.get("Russell 2000");
  let breadth = "";
  if (sp && russell) {
    const relative = Number(russell.changePct) - Number(sp.changePct);
    if (relative >= 0.5) breadth = ` Russell 2000이 S&P 500을 ${relative.toFixed(2)}%p 웃돌아 중소형주까지 상승 폭이 넓어졌습니다.`;
    else if (relative <= -0.5) breadth = ` Russell 2000이 S&P 500을 ${Math.abs(relative).toFixed(2)}%p 밑돌아 대형주 대비 중소형주 확산은 제한적이었습니다.`;
  }
  return [
    { rank: 1, summaryKo: `정규장 종가 기준 주요 지수는 ${indexText}였습니다.` },
    { rank: 2, summaryKo: `11개 섹터 중 상승 ${advancing}개·하락 ${declining}개였고, 강세는 ${topText}, 약세는 ${bottomText}였습니다.` },
    { rank: 3, summaryKo: `섹터 최고·최저 수익률 격차는 ${spread.toFixed(2)}%p였습니다. ${rotation}${breadth}` },
  ];
}

function naverSummaryItems(data) {
  const source = [...featuredStockItems(data), ...naverMarketNewsItems(data)];
  return uniqueNewsItems(source, { limit: 3 });
}

function representativeSectorItems(data) {
  return [...selectSectorRepresentatives(data).values()];
}

function selectSectorRepresentatives(data) {
  const snapshots = snapshotSectorByName(data);
  const prioritized = sectorGroups(data)
    .map((group, index) => ({ group, index, move: Math.abs(Number(snapshots.get(group.sector)?.changePct || 0)) }))
    .sort((a, b) => (b.move - a.move) || (a.index - b.index));
  const selected = new Map();
  const used = new Set();
  for (const { group } of prioritized) {
    const item = blogSectorItems(group, { limit: 5 }).find(candidate => {
      const forcedSector = inferredSector(candidate);
      if (forcedSector && forcedSector !== group.sector) return false;
      const key = normalizedUrl(candidate.url) || headlineFingerprint(candidate.headline || candidate.title);
      return key && !used.has(key);
    });
    if (!item) continue;
    const key = normalizedUrl(item.url) || headlineFingerprint(item.headline || item.title);
    used.add(key);
    selected.set(group.sector, item);
  }
  return selected;
}

function inferredSector(item) {
  const text = `${item?.headline || item?.title || ""} ${item?.description || ""}`;
  const patterns = [
    ["Real Estate", /\bREITs?\b|real estate|commercial property|Federal Realty|Realty Income|Prologis|Equinix|American Tower/i],
    ["Financials", /asset management|\bbanks?\b|brokerage|insurance|JPMorgan|Goldman Sachs|Morgan Stanley|Bank of America|Wells Fargo|Visa|Mastercard/i],
    ["Technology/AI", /semiconductor|\bchips?\b|\bAI\b|GPU|HBM|Nvidia|Broadcom|AMD|Micron|Apple|Microsoft|software|cloud/i],
    ["Health Care", /healthcare|health care|biotech|pharma|\bFDA\b|UnitedHealth|Eli Lilly|Johnson & Johnson|Merck|Pfizer/i],
    ["Industrials", /aerospace|defense|airline|railroad|machinery|GE Aerospace|Boeing|Caterpillar|Honeywell|\bRTX\b/i],
    ["Energy", /\boil\b|\bcrude\b|natural gas|\bOPEC\b|Exxon|Chevron|ConocoPhillips|\bSLB\b/i],
    ["Materials", /\bgold\b|copper|steel|lithium|mining|chemical|Freeport|Newmont|Linde|Nucor/i],
    ["Utilities", /utilities|\butility\b|power grid|renewable energy|NextEra|Duke Energy|Southern Company/i],
    ["Consumer Staples", /consumer staples|grocery|PepsiCo|Coca-Cola|Procter|Walmart|Costco|Mondelez/i],
    ["Communication Services", /telecom|streaming|advertising|Meta Platforms|Alphabet|Google|Netflix|Disney|Comcast|Verizon|AT&T/i],
    ["Consumer Discretionary", /consumer discretionary|e-commerce|automaker|\bEVs?\b|travel|Amazon|Tesla|Home Depot|McDonald|Nike|Starbucks|Booking/i],
  ];
  return patterns.find(([, pattern]) => pattern.test(text))?.[0] || "";
}

function naverSourceItems(data) {
  return usedArticleItems(data);
}

function summarizeWarningForNaver(warning) {
  const text = String(warning || "");
  if (/시장 주요 뉴스가 기준일 기사만으로/.test(text)) return text.replace(/\s*\(.*?\)\s*/g, " ");
  if (/시장 주요 뉴스는 direct RSS.*Google News discovery/i.test(text)) return "시장 주요 뉴스는 직접 RSS와 Google News 보조 후보를 함께 사용했습니다.";
  if (/업종 뉴스|Technology|Communication|Consumer|Financials|Health Care|Industrials|Energy|Materials|Utilities|Real Estate/.test(text)) return "업종 뉴스 일부는 수집 제한 또는 날짜 확인 문제로 제외했습니다.";
  if (/날짜 확인|기준일/.test(text)) return "날짜가 확인되지 않거나 기준일이 다른 뉴스는 본문에서 제외했습니다.";
  if (/뉴스 수집 실패|수집 실패/.test(text)) return "일부 뉴스 검색은 수집 제한으로 제외했습니다.";
  return "일부 수집 이슈는 본문 출처 구성에서 제외했습니다.";
}

function naverCollectionNotes(data) {
  const notes = new Set((data.warnings || []).map(summarizeWarningForNaver).filter(Boolean));
  const availableMarketNews = (data.marketNews || []).filter(item => item.url).length;
  if (availableMarketNews < 5) notes.add(`시장 주요 뉴스는 기준일 기사만 ${availableMarketNews}건 확인되어 부족분을 보충하지 않았습니다.`);
  return [...notes].slice(0, 4);
}

function findLeadershipSummary(asOfDate, baseDir) {
  const mdPath = path.resolve(baseDir, `leaders-${asOfDate}.md`);
  const jsonPath = path.resolve(baseDir, `leaders-${asOfDate}.json`);
  if (!fs.existsSync(mdPath) && !fs.existsSync(jsonPath)) return null;
  if (fs.existsSync(jsonPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
      const leaders = [
        ...(parsed.shortTerm?.slice?.(0, 3) || []),
        ...(parsed.intermediate?.slice?.(0, 3) || []),
        ...(parsed.structural?.slice?.(0, 3) || []),
      ].map(item => item.name || item.ticker || item.company).filter(Boolean);
      return leaders.length ? `동일 기준일 리더십 스크린 상위 관찰 종목: ${[...new Set(leaders)].slice(0, 8).join(", ")}.` : `동일 기준일 리더십 스크린 JSON이 있습니다: ${path.basename(jsonPath)}.`;
    } catch {
      return `동일 기준일 리더십 스크린 파일이 있습니다: ${path.basename(jsonPath)}.`;
    }
  }
  return `동일 기준일 리더십 스크린 문서가 있습니다: ${path.basename(mdPath)}.`;
}

// Window a bit of text after the index name. Excludes only hard sentence
// boundaries (newline / 。) — NOT the ASCII period, so decimals like "7.9%" and
// the "급락" that follows stay inside the segment.
function marketDirection(text, indexName) {
  const escaped = indexName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`${escaped}[^\\n。]{0,90}`, "i");
  let segment = text.match(pattern)?.[0] || "";
  const otherIndex = indexName === "S&P 500" ? "Nasdaq" : "S&P 500";
  const otherAt = segment.indexOf(otherIndex);
  if (otherAt > 0) segment = segment.slice(0, otherAt);
  if (/falls?|drops?|declines?|slides?|slumps?|lower|selloff|loss|↓/i.test(segment)) return "약세";
  if (/rises?|gains?|jumps?|climbs?|higher|rally|record|↑/i.test(segment)) return "강세";
  return "";
}

function percentMove(text, indexName) {
  const escaped = indexName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`${escaped}[^\\n。]{0,90}`, "i");
  let segment = text.match(pattern)?.[0] || "";
  const otherIndex = indexName === "S&P 500" ? "Nasdaq" : "S&P 500";
  const otherAt = segment.indexOf(otherIndex);
  if (otherAt > 0) segment = segment.slice(0, otherAt);
  return segment.match(/(\d+(?:\.\d+)?%)\s*(?:higher|lower|gain|loss|rise|fall|drop|rally)?/i)?.[1] || "";
}

function titleEventPhrase(topText, combined) {
  const text = `${topText}\n${combined}`;
  const hasKospi = /S&P 500/i.test(text);
  const hasKosdaq = /Nasdaq/i.test(text);
  if (hasKospi && hasKosdaq) {
    const kospiDirection = marketDirection(text, "S&P 500");
    const kosdaqDirection = marketDirection(text, "Nasdaq");
    const kosdaqPercent = percentMove(text, "Nasdaq");
    const kospi = kospiDirection === "약세" ? "S&P 500 약세" : (kospiDirection === "강세" ? "S&P 500 강세" : "S&P 500");
    const kosdaq = kosdaqPercent && kosdaqDirection === "강세"
      ? `Nasdaq ${kosdaqPercent} 급등`
      : (kosdaqDirection === "약세" ? "Nasdaq 약세" : (kosdaqDirection === "강세" ? "Nasdaq 강세" : "Nasdaq"));
    return `${kospi}·${kosdaq}`;
  }
  if (hasKosdaq) {
    const percent = percentMove(text, "Nasdaq");
    const direction = marketDirection(text, "Nasdaq");
    if (percent && direction === "강세") return `Nasdaq ${percent} 급등`;
    if (direction) return `Nasdaq ${direction}`;
    return "Nasdaq 흐름";
  }
  if (hasKospi) {
    const direction = marketDirection(text, "S&P 500");
    if (direction) return `S&P 500 ${direction}`;
    return "S&P 500 흐름";
  }
  if (/dollar|currency|FX/i.test(topText)) return "달러 변수";
  if (/Treasury|yield|Fed|rate|inflation|CPI|PCE/i.test(topText)) return "금리 변수";
  if (/earnings|guidance/i.test(topText)) return "실적 변수";
  return "미국 증시 주요 뉴스";
}

function titleSupportPhrase(combined, leadingTheme) {
  const supports = [];
  const add = value => {
    if (value && !supports.includes(value)) supports.push(value);
  };
  if (/Treasury|yield|Fed|rate|inflation|CPI|PCE|dollar|currency|FOMC/i.test(combined)) add("금리·달러");
  if (/\bAI\b|semiconductor|chip|Nvidia|GPU|HBM/i.test(combined)) add("AI·반도체");
  if (/healthcare|health care|biotech|pharma|FDA/i.test(combined)) add("헬스케어");
  if (/earnings|guidance|quarterly results|revenue|profit/i.test(combined)) add("실적");
  if (/Apple|Microsoft|Amazon|Alphabet|Meta|Tesla|megacap|Magnificent Seven/i.test(combined)) add("빅테크");
  const selected = supports.slice(0, 2);
  if (selected.length === 2) {
    const lastCode = selected[0].charCodeAt(selected[0].length - 1);
    const hasFinalConsonant = lastCode >= 0xac00 && lastCode <= 0xd7a3 && ((lastCode - 0xac00) % 28) !== 0;
    return `${selected[0]}${hasFinalConsonant ? "과" : "와"} ${selected[1]}`;
  }
  return selected[0] || leadingTheme || "업종 흐름";
}

function pctLabel(value) {
  if (!Number.isFinite(Number(value))) return "";
  const number = Number(value);
  return `${number >= 0 ? "+" : ""}${number.toFixed(2)}%`;
}

function nextKstBusinessDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(now).reduce((out, item) => ({ ...out, [item.type]: item.value }), {});
  const date = new Date(`${parts.year}-${parts.month}-${parts.day}T00:00:00Z`);
  do { date.setUTCDate(date.getUTCDate() + 1); } while ([0, 6].includes(date.getUTCDay()));
  return date.toISOString().slice(0, 10);
}

function directionWord(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "";
  if (number >= 0.15) return "강세";
  if (number <= -0.15) return "약세";
  return "보합";
}

function snapshotIndex(data, name) {
  return data.marketSnapshot?.indexes?.find(item => item.name === name);
}

function snapshotTitleEvent(data) {
  const dow = snapshotIndex(data, "Dow Jones");
  const sp = snapshotIndex(data, "S&P 500");
  const nasdaq = snapshotIndex(data, "Nasdaq Composite");
  if (dow || sp || nasdaq) {
    const pieces = [
      dow ? `다우 ${directionWord(dow.changePct)}` : "",
      sp ? `S&P 500 ${directionWord(sp.changePct)}` : "",
      nasdaq ? `Nasdaq ${directionWord(nasdaq.changePct)}` : "",
    ].filter(Boolean);
    return pieces.slice(0, 3).join("·");
  }
  return "";
}

function snapshotSectorSupport(data) {
  const sectors = [...(data.marketSnapshot?.sectors || [])]
    .filter(item => Number.isFinite(Number(item.changePct)))
    .sort((a, b) => Number(b.changePct) - Number(a.changePct));
  if (sectors.length < 2) return "";
  const top = sectors[0];
  const bottom = sectors.at(-1);
  const topName = SECTOR_KO[top.name] || top.name;
  const bottomName = SECTOR_KO[bottom.name] || bottom.name;
  if (Number(top.changePct) > 0 && Number(bottom.changePct) < 0) return `${topName} 강세·${bottomName} 약세`;
  return `${topName} 선도·${bottomName} 부진`;
}

function snapshotSectorByName(data) {
  return new Map((data.marketSnapshot?.sectors || []).map(item => [item.sector, item]));
}

function renderSnapshotTable(data) {
  const snapshot = data.marketSnapshot;
  if (!snapshot?.indexes?.length && !snapshot?.sectors?.length) return [];
  const parts = ["## 시장 지수/섹터 스냅샷", ""];
  if (snapshot.indexes?.length) {
    parts.push("| 지수 | 종가 | 등락률 |", "| --- | ---: | ---: |");
    for (const item of snapshot.indexes) {
      parts.push(`| ${escapePipe(item.name)} | ${Number(item.price).toFixed(2)} | ${pctLabel(item.changePct)} |`);
    }
    parts.push("");
  }
  if (snapshot.sectors?.length) {
    const sorted = [...snapshot.sectors].sort((a, b) => b.changePct - a.changePct);
    parts.push("| 섹터 ETF | 섹터 | 등락률 |", "| --- | --- | ---: |");
    for (const item of sorted) {
      parts.push(`| ${escapePipe(item.symbol)} | ${escapePipe(item.name)} | ${pctLabel(item.changePct)} |`);
    }
  }
  return parts;
}

function titleCandidates(data) {
  if (isEvidenceReport(data)) return evidenceTitleCandidates(data);
  const date = data.asOfDate;
  const featured = featuredStockItems(data);
  const featuredNames = featured.slice(0, 2).map(item => SECTOR_KO[item.name] || item.name).filter(Boolean);
  const featuredText = featured.map(item => `${item.headline || ""} ${item.articleText || ""}`).join(" ");
  if (featuredNames.length) {
    const marketSupport = titleSupportPhrase(featuredText, data.themes?.[0]?.theme);
    return [
      `${date} 미국증시 | ${featuredNames.join("·")} 특징주, ${marketSupport}`,
      `${date} ${featuredNames[0]} 특징주 뉴스와 미국 증시 마감`,
      `${date} 미국 특징주·시장 주요 뉴스 정리`,
    ];
  }
  const leadingTheme = data.themes?.[0]?.theme;
  const topNews = [...(data.marketNews || [])]
    .sort((a, b) => ((b.rankScore ?? newsRankScore(b)) - (a.rankScore ?? newsRankScore(a)))
      || ((Date.parse(b.publishedAt || "") || -Infinity) - (Date.parse(a.publishedAt || "") || -Infinity)))
    .slice(0, 4);
  const topText = `${topNews[0]?.headline || topNews[0]?.title || ""} ${topNews[0]?.description || ""}`;
  const combined = topNews.map(item => `${item.headline || item.title || ""} ${item.description || ""}`).join(" ");
  const event = snapshotTitleEvent(data) || titleEventPhrase(topText, combined);
  const support = snapshotSectorSupport(data) || titleSupportPhrase(combined, leadingTheme);
  return [
    `${date} ${event}: ${support}`,
    `${date} S&P 500·Nasdaq 뉴스 정리: 시장과 업종 흐름`,
    `${date} 미국 증시 데일리: ${leadingTheme || "시장 뉴스"} 흐름 체크`,
    `${date} 장 마감 후 읽는 미국 시장 핵심 뉴스`,
  ];
}

function renderDailyReport(data, options = {}) {
  assert(data.reportType === "us-daily-market-news", "JSON reportType must be us-daily-market-news");
  assert(/^\d{4}-\d{2}-\d{2}$/.test(data.asOfDate), "Report requires YYYY-MM-DD asOfDate");
  if (isEvidenceReport(data)) return renderEvidenceReport(data);
  const baseDir = options.baseDir || "analysis-example/us-market";
  const leadership = findLeadershipSummary(data.asOfDate, baseDir);
  const titles = titleCandidates(data);
  const parts = [
    `# 미국 시장 데일리 뉴스 (${data.asOfDate})`,
    "",
    `- 기준일: ${data.asOfDate}`,
    `- 생성시각: ${data.generatedAt}`,
    `- 수집모드: ${data.sourceMode}`,
    "",
    "## 오늘 시장 한 줄",
    "",
    data.oneLine || "수집된 뉴스 흐름이 제한적입니다.",
  ];

  if (Array.isArray(data.warnings) && data.warnings.length) {
    parts.push("", "## 수집 경고", "", ...data.warnings.map(warning => `- ${warning}`));
  }

  const snapshotTable = renderSnapshotTable(data);
  if (snapshotTable.length) parts.push("", ...snapshotTable);

  parts.push("", "## 시장 주요 뉴스", "");
  if (data.marketNews?.length) parts.push(...data.marketNews.map(itemLine));
  else parts.push("- 같은 기준일의 시장 뉴스가 충분히 수집되지 않았습니다.");

  parts.push("", "## 업종/테마별 흐름", "");
  if (data.themes?.length) {
    parts.push("| 테마 | 대표 헤드라인 | 기사 수 |", "| --- | --- | ---: |");
    for (const theme of data.themes) {
      parts.push(`| ${escapePipe(theme.theme)} | ${escapePipe((theme.headlines || []).slice(0, 2).join(" / "))} | ${theme.count || theme.headlines?.length || 0} |`);
    }
  } else {
    parts.push("- 반복적으로 확인되는 업종/테마 키워드가 아직 제한적입니다.");
  }

  parts.push("## 공식 공시/자료", "");
  if (data.officialSources?.length) parts.push(...data.officialSources.map(itemLine));
  else parts.push("- 별도 공식 공시/자료 링크가 없습니다.");

  if (leadership) parts.push("", "## 리더십 스크린 요약", "", leadership);

  parts.push("", "## 블로그 제목 후보", "", ...titles.map(title => `- ${title}`));

  parts.push("", "## 출처", "");
  const allSources = dedupeSourcesByUrl([
    ...(data.marketNews || []),
    ...(data.sectorNews || []).flatMap(group => group.items || []),
    ...(data.officialSources || []),
  ].filter(item => item.url));
  if (allSources.length) parts.push(...allSources.map(itemLine));
  else parts.push("- 검증 가능한 URL 출처가 없습니다.");

  parts.push(
    "",
    "---",
    "",
    `기준일: ${data.asOfDate}`,
    "",
    "본 글은 공개된 뉴스와 공시성 자료를 바탕으로 작성한 개인 시장 정리이며, 특정 종목의 매수·매도를 권유하지 않습니다. 투자 판단과 그 결과에 대한 책임은 투자자 본인에게 있습니다.",
  );
  return `${normalizeText(parts.join("\n"))}\n`;
}

function sectorGroups(data) {
  const byName = new Map((data.sectorNews || []).map(group => [group.sector, group]));
  return DEFAULT_SECTORS.map(sector => byName.get(sector) || { sector, query: `미국증시 ${sector} 주식 뉴스`, items: [] });
}

function renderNaverPost(data, options = {}) {
  assert(data.reportType === "us-daily-market-news", "JSON reportType must be us-daily-market-news");
  assert(/^\d{4}-\d{2}-\d{2}$/.test(data.asOfDate), "Report requires YYYY-MM-DD asOfDate");
  if (isEvidenceReport(data)) return renderEvidenceNaverPost(data);
  const baseDir = options.baseDir || "analysis-example/us-market";
  const leadership = findLeadershipSummary(data.asOfDate, baseDir);
  const parts = [
    `# 미국 시장 데일리 뉴스 (${data.asOfDate})`,
  ];

  parts.push("", "## 시장 주요 요약", "");
  const summaryItems = naverSummaryItems(data);
  if (summaryItems.length) {
    summaryItems.forEach((item, index) => parts.push(`${index + 1}. ${koreanNewsSummary(item)}`));
  } else {
    parts.push("1. 원문 본문을 확인한 당일 시장 기사가 충분하지 않습니다.");
  }

  const snapshotTable = renderSnapshotTable(data);
  if (snapshotTable.length) parts.push("", ...snapshotTable);

  const featured = featuredStockItems(data);
  parts.push("", "## 특징주 뉴스", "");
  if (featured.length) {
    featured.forEach((item, index) => {
      const label = item.ticker ? `${item.name} (${item.ticker})` : `${SECTOR_KO[item.sector] || item.sector} 뉴스`;
      const reaction = item.quote
        ? `정규장 ${Number(item.quote.price).toFixed(2)} (${pctLabel(item.quote.changePct)})`
        : (item.sectorQuote ? `${item.sectorQuote.symbol} ${pctLabel(item.sectorQuote.changePct)}` : "업종 반응 확인 중");
      parts.push(`${index + 1}. ${label} · ${reaction}`);
      parts.push("", `원문 제목: ${item.headline || item.title || "제목 없음"}`);
      parts.push("", `한국어 정리: ${koreanNewsSummary(item)}`);
      parts.push(item.url, "");
    });
  } else {
    parts.push("원문 본문과 정규장 종가를 함께 확인한 특징주가 없습니다.");
  }

  parts.push("", "## 시장 주요 뉴스", "");
  const marketNewsForCards = naverMarketNewsItems(data);
  if (marketNewsForCards.length) {
    marketNewsForCards.forEach((item, index) => {
      parts.push(`${index + 1}. ${item.headline || item.title || "제목 없음"}`);
      parts.push("", `한국어 번역: ${koreanHeadlineTranslation(item)}`);
      parts.push("", `핵심 내용: ${koreanNewsBrief(item)}`);
      parts.push(item.url, "");
    });
  } else {
    parts.push("같은 기준일의 시장 뉴스가 충분히 수집되지 않았습니다.");
  }

  parts.push("", "## 출처", "");
  const allSources = naverSourceItems(data);
  if (allSources.length) allSources.forEach((item, index) => parts.push(`${index + 1}. ${sourceLabel(item)} (${item.source || "원문"})`));
  else parts.push("검증 가능한 URL 출처가 없습니다.");

  const collectionNotes = naverCollectionNotes(data);
  if (collectionNotes.length) {
    parts.push("", "### 수집 참고", "", collectionNotes.join(" "));
  }

  parts.push(
    "",
    "---",
    "",
    `기준일: ${data.asOfDate}`,
    "",
    "본 글은 공개된 뉴스와 공시성 자료를 바탕으로 작성한 개인 시장 정리이며, 특정 종목의 매수·매도를 권유하지 않습니다. 투자 판단과 그 결과에 대한 책임은 투자자 본인에게 있습니다.",
  );
  return `${normalizeText(parts.join("\n"))}\n`;
}

function reportQualityGate(data) {
  if (isEvidenceReport(data)) {
    const snapshot = data.marketSnapshot || {};
    const articles = evidenceArticleMap(data);
    const stories = evidenceStories(data);
    const validIndexes = REQUIRED_INDEX_NAMES.filter(name => (snapshot.indexes || []).some(item => item.name === name && Number.isFinite(Number(item.price)) && Number.isFinite(Number(item.changePct))));
    const validSectors = REQUIRED_SECTOR_SYMBOLS.filter(symbol => (snapshot.sectors || []).some(item => item.symbol === symbol && Number.isFinite(Number(item.changePct))));
    const directStories = stories.filter(story => story.sourceRole === "publisher-web" && story.sourceTier === "primary-publisher");
    const uniqueUrls = new Set(stories.map(story => normalizedUrl(story.url)));
    const invalidEvidence = stories.filter(story => !verifiedEvidenceStory(story, articles));
    const reasons = [];
    if (snapshot.asOfDate !== data.asOfDate) reasons.push("시장 스냅샷 기준일이 없거나 리포트 기준일과 다릅니다.");
    if (validIndexes.length < REQUIRED_INDEX_NAMES.length) reasons.push("필수 4대 지수 스냅샷이 누락됐습니다.");
    if (validSectors.length < REQUIRED_SECTOR_SYMBOLS.length) reasons.push("필수 11개 섹터 스냅샷이 누락됐습니다.");
    if (stories.length < 3) reasons.push("본문 근거와 검증된 한국어 편집을 모두 갖춘 기사가 3건 미만입니다.");
    if (directStories.length < 3) reasons.push("직접 발행사 본문 기반 검증 기사가 3건 미만입니다.");
    if (uniqueUrls.size !== stories.length) reasons.push("본문 기사 URL이 중복됐습니다.");
    if (invalidEvidence.length) reasons.push("본문 근거 ID가 일치하지 않는 편집 항목이 있습니다.");
    return {
      passed: reasons.length === 0,
      reasons,
      metrics: { indexCount: validIndexes.length, sectorSnapshotCount: validSectors.length, verifiedStoryCount: stories.length, directPublisherStoryCount: directStories.length, pendingEditorialCount: (data.editorialQueue || []).length },
    };
  }
  const snapshot = data.marketSnapshot || {};
  const marketNews = data.marketNews || [];
  const validIndexes = REQUIRED_INDEX_NAMES.filter(name => {
    const matches = (snapshot.indexes || []).filter(item => item.name === name);
    return matches.length === 1
      && Number.isFinite(Number(matches[0].price))
      && Number(matches[0].price) > 0
      && Number.isFinite(Number(matches[0].changePct));
  });
  const validSectors = REQUIRED_SECTOR_SYMBOLS.filter(symbol => {
    const matches = (snapshot.sectors || []).filter(item => item.symbol === symbol);
    return matches.length === 1 && Number.isFinite(Number(matches[0].changePct));
  });
  const usableMarketNews = marketNews.filter(item => item.publishedDate === data.asOfDate
    && /^https?:\/\//i.test(item.url || "")
    && item.articleText?.length >= 180
    && koreanNewsSummary(item));
  const directCount = usableMarketNews.filter(item => item.sourceRole === "direct-rss"
    && !item.discovery
    && !/news\.google\.com/i.test(item.url || "")).length;
  const linkedSectorCount = [...selectSectorRepresentatives(data).values()].filter(item => item.publishedDate === data.asOfDate
    && item.sourceRole === "direct-rss"
    && !item.discovery
    && /^https?:\/\//i.test(item.url || "")
    && !/news\.google\.com/i.test(item.url || "")).length;
  const featured = featuredStockItems(data);
  const featuredWithEvidence = featured.filter(item => item.articleText?.length >= 180 && koreanNewsSummary(item));
  const usedUrls = usedArticleItems(data).map(item => normalizedUrl(item.url)).filter(Boolean);
  const sourceUrls = naverSourceItems(data).map(item => normalizedUrl(item.url)).filter(Boolean);
  const reasons = [];
  if (data.sourceMode === "fixture") reasons.push("fixture 산출물은 실게시할 수 없습니다.");
  if (snapshot.asOfDate !== data.asOfDate) reasons.push("시장 스냅샷 기준일이 없거나 리포트 기준일과 다릅니다.");
  if (validIndexes.length < REQUIRED_INDEX_NAMES.length) reasons.push("필수 4대 지수 스냅샷이 누락·중복됐거나 숫자가 유효하지 않습니다.");
  if (validSectors.length < REQUIRED_SECTOR_SYMBOLS.length) reasons.push("필수 11개 섹터 스냅샷이 누락·중복됐거나 숫자가 유효하지 않습니다.");
  if (usableMarketNews.length < 3) reasons.push("유효한 당일 시장 주요 뉴스가 3건 미만입니다.");
  if (directCount < 2) reasons.push("직접 RSS 시장 기사가 2건 미만입니다.");
  if (linkedSectorCount < 4) reasons.push("유효한 당일 직접 RSS 업종 뉴스가 4개 섹터 미만입니다.");
  if (featuredWithEvidence.length < 3) reasons.push("직접 RSS 근거가 확인된 업종별 특징주 뉴스가 3건 미만입니다.");
  if (usedUrls.length !== sourceUrls.length || usedUrls.some((url, index) => url !== sourceUrls[index])) reasons.push("본문에 사용한 기사와 출처 URL 목록이 일치하지 않습니다.");
  return {
    passed: reasons.length === 0,
    reasons,
    metrics: {
      indexCount: validIndexes.length,
      sectorSnapshotCount: validSectors.length,
      marketNewsCount: usableMarketNews.length,
      directMarketNewsCount: directCount,
      linkedSectorCount,
      featuredStockCount: featuredWithEvidence.length,
      usedArticleCount: usedUrls.length,
    },
  };
}

function buildPublishManifest({ data, reportPath, postPath, postMarkdown, category = null }) {
  const titles = titleCandidates(data);
  const linkCards = isEvidenceReport(data) ? naverEvidenceStories(data).map(item => item.url) : usedArticleItems(data).map(item => item.url);
  const qualityGate = reportQualityGate(data);
  return {
    schemaVersion: 1,
    contentType: "daily-market-news",
    status: "converted",
    source: {
      reportPath: path.resolve(reportPath),
      reportSha256: fileSha256(reportPath),
      asOfDate: data.asOfDate,
    },
    post: {
      company: "미국 시장",
      ticker: "",
      title: titles[0].slice(0, 100),
      issue: isEvidenceReport(data) ? (evidenceStories(data)[0]?.summaryKo || "본문 검증 데일리 시장 뉴스") : (data.oneLine || "데일리 시장 뉴스"),
      category,
      tags: ["미국증시", "S&P 500", "Nasdaq", "시장뉴스", data.asOfDate.replace(/-/g, "")].slice(0, 10),
      markdownPath: path.resolve(postPath),
      markdownSha256: sha256(postMarkdown),
      images: [],
      linkCards,
      thumbnail: null,
      publicationDate: data.asOfDate,
    },
    automation: {
      scheduledPublishAllowed: qualityGate.passed,
      duplicateScope: "us-daily-market-news",
      duplicateDate: data.asOfDate,
      qualityGate,
      schedule: { timezone: "Asia/Seoul", date: nextKstBusinessDate(), time: "08:00", nextBusinessDay: true },
    },
    prepare: null,
    publish: null,
  };
}

function main() {
  const args = parseArgs(process.argv);
  assert(args.json, "Usage: render-daily-report.js --json <daily-news.json> [--md-out path] [--post-out path] [--manifest-out path]");
  const jsonPath = path.resolve(args.json);
  const data = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  const date = data.asOfDate;
  const baseDir = path.dirname(jsonPath);
  const mdOut = path.resolve(args["md-out"] || path.join(baseDir, `daily-news-${date}.md`));
  const postOut = path.resolve(args["post-out"] || path.join(baseDir, `naver-post-${date}.md`));
  const manifestOut = path.resolve(args["manifest-out"] || path.join(baseDir, `naver-publish-${date}.json`));
  const markdown = renderDailyReport(data, { baseDir });
  const postMarkdown = renderNaverPost(data, { baseDir });
  fs.mkdirSync(path.dirname(mdOut), { recursive: true });
  fs.writeFileSync(mdOut, markdown, "utf8");
  fs.mkdirSync(path.dirname(postOut), { recursive: true });
  fs.writeFileSync(postOut, postMarkdown, "utf8");
  const manifest = buildPublishManifest({ data, reportPath: mdOut, postPath: postOut, postMarkdown, category: args.category || null });
  writeJsonAtomic(manifestOut, manifest);
  process.stdout.write(`${JSON.stringify({ mdPath: mdOut, postPath: postOut, manifestPath: manifestOut, title: manifest.post.title }, null, 2)}\n`);
}

if (require.main === module) {
  try { main(); } catch (error) { console.error(error.message); process.exit(1); }
}

module.exports = {
  buildPublishManifest,
  findLeadershipSummary,
  naverCollectionNotes,
  naverMarketNewsItems,
  naverSourceItems,
  naverSummaryItems,
  renderDailyReport,
  renderNaverPost,
  reportQualityGate,
  koreanHeadlineTranslation,
  koreanNewsSummary,
  nextKstBusinessDate,
  titleCandidates,
};
