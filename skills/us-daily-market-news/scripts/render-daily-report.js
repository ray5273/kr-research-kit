#!/usr/bin/env node

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { DEFAULT_SECTORS, marketNewsScore, newsRankScore } = require("./fetch-daily-market-news");

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

function blogSectorItems(group, options = {}) {
  const pattern = sectorBlogPattern(group?.sector);
  const candidates = pattern
    ? (group.items || []).filter(item => pattern.test(`${item.headline || item.title || ""} ${item.description || ""}`))
    : (group.items || []);
  return uniqueNewsItems(candidates, options);
}

function representativeNewsLabel(item) {
  const headline = item.headline || item.title || "";
  if (!headline) return "";
  return item.name ? `${item.name}: ${headline}` : headline;
}

function koreanHeadlineTranslation(item) {
  const headline = item.headline || item.title || "";
  if (/Wall Street Finished Mixed On Thursday/i.test(headline)) {
    return "목요일 미국 증시는 지수별로 엇갈리며 혼조 마감했습니다.";
  }
  if (/Dow climbs almost 600 points|Dow jumps nearly 600 points|Dow jumps to record/i.test(headline)) {
    return "다우지수는 약 600포인트 올라 사상 최고권에서 마감했고, S&P 500은 보합권, Nasdaq은 약세를 보였습니다.";
  }
  if (/Dow notches fresh record.*Tesla.*semiconductors/i.test(headline)) {
    return "다우는 새 기록을 세웠지만, 테슬라와 반도체 약세로 S&P 500과 Nasdaq은 밀렸습니다.";
  }
  if (/Major Indexes Retreat.*Chip.*Memory/i.test(headline)) {
    return "주요 지수는 장 초반 고점에서 후퇴했고, 칩·메모리 관련주 약세가 S&P 500과 Nasdaq을 압박했습니다.";
  }
  if (/Dow Jones.*Futures Gain.*Weak.*Jobs/i.test(headline)) {
    return "부진한 고용지표에도 다우와 S&P 500 선물은 상승했지만, 일부 AI·반도체 관련주는 부담을 받았습니다.";
  }
  if (/Rivian.*Lucid/i.test(headline)) {
    return "리비안은 2026년 인도 전망을 올렸지만, 루시드는 2분기 인도 실적이 월가 기대를 밑돌았습니다.";
  }
  if (/Tesla.*semiconductors/i.test(headline)) {
    return "테슬라와 반도체주 약세가 기술주 투자심리를 눌렀습니다.";
  }
  if (/Intel.*Marvell Technology.*AMD.*Trade Down/i.test(headline)) {
    return "인텔·마벨·AMD가 동반 약세를 보이며 반도체 투자심리 둔화가 부각됐습니다.";
  }
  if (/High-end camping.*AutoCamp/i.test(headline)) {
    return "고급 캠핑 업체 오토캠프가 여름 여행 수요와 자금 조달을 성장 동력으로 내세웠습니다.";
  }
  if (/Procter\s*&\s*Gamble.*Earnings Webcast/i.test(headline)) {
    return "프록터앤드갬블(P&G)이 실적 발표 웹캐스트 일정을 공지했습니다.";
  }
  if (/Johnson\s*&\s*Johnson.*diversified healthcare strength/i.test(headline)) {
    return "존슨앤드존슨은 다각화된 헬스케어 포트폴리오와 장기 성장성을 강조했습니다.";
  }
  if (/Stock Yards Bank.*GE Aerospace/i.test(headline)) {
    return "Stock Yards Bank & Trust가 GE 에어로스페이스 보유 지분을 늘렸습니다.";
  }
  if (/Natural gas storage rises above expectations/i.test(headline)) {
    return "천연가스 재고가 예상보다 더 늘며 에너지 시장 흐름에 영향을 줬습니다.";
  }
  if (/Gold jumps.*payrolls/i.test(headline)) {
    return "미국 고용보고서 부진으로 금리 부담이 낮아지자 금 가격이 뛰었습니다.";
  }
  if (/NextEra Energy earnings outlook and dividend policy/i.test(headline)) {
    return "넥스트에라 에너지의 실적 전망과 배당 정책이 청정전력 성장 기대와 함께 주목받았습니다.";
  }
  if (/Blackstone.*QTS.*Digital Gateway/i.test(headline)) {
    return "블랙스톤 계열 QTS가 버지니아 데이터센터 프로젝트를 종료했습니다.";
  }
  return headline;
}

function koreanNewsSummary(item) {
  const headline = `${item.headline || item.title || ""} ${item.description || ""}`;
  if (/Wall Street Finished Mixed On Thursday/i.test(headline)) {
    return "다우 중심의 강세와 기술주 약세가 동시에 나타난 하루였습니다. 시장 전체 방향보다 업종 로테이션을 보는 것이 더 중요합니다.";
  }
  if (/Dow climbs almost 600 points|Dow jumps nearly 600 points|Dow jumps to record/i.test(headline)) {
    return "고용지표 둔화가 금리 부담을 낮추며 다우와 방어·가치 성격 업종에 힘을 실었습니다. 반면 성장주 쪽으로는 매수세가 고르게 확산되지 않았습니다.";
  }
  if (/Dow notches fresh record.*Tesla.*semiconductors/i.test(headline)) {
    return "테슬라와 반도체 약세가 Nasdaq을 끌어내렸습니다. AI·반도체 모멘텀은 유지되지만 단기적으로는 차익실현과 섹터 로테이션 압력이 커진 모습입니다.";
  }
  if (/Major Indexes Retreat.*Chip.*Memory/i.test(headline)) {
    return "장 초반 반등 시도 이후 반도체·메모리주가 밀리며 주요 지수가 힘을 잃었습니다. 기술주 쏠림 완화 여부를 확인해야 합니다.";
  }
  if (/Dow Jones.*Futures Gain.*Weak.*Jobs/i.test(headline)) {
    return "약한 고용지표는 금리 인하 기대를 키울 수 있지만, AI 인프라 관련 고평가 종목에는 선별 압력이 이어질 수 있습니다.";
  }
  if (/Rivian.*Lucid/i.test(headline)) {
    return "전기차 수요가 업체별로 갈리고 있습니다. 리비안은 전망 상향으로 차별화됐지만 루시드는 기대치 미달로 전기차 업종 전반의 선별 필요성을 키웠습니다.";
  }
  if (/Tesla.*semiconductors/i.test(headline)) {
    return "기술주 내부에서도 테슬라와 반도체 쪽이 지수 부담으로 작용했습니다. Nasdaq 약세의 질을 확인할 때 참고할 만한 신호입니다.";
  }
  if (/Intel.*Marvell Technology.*AMD.*Trade Down/i.test(headline)) {
    return "반도체 대형주 약세는 XLK와 Nasdaq 부진을 설명하는 핵심 신호입니다. AI 인프라 기대가 남아 있어도 단기 수급은 선별적으로 약해질 수 있습니다.";
  }
  if (/High-end camping.*AutoCamp/i.test(headline)) {
    return "여행·레저 수요가 소비재 업종의 하위 테마로 이어지는지 볼 수 있는 뉴스입니다. 경기 민감 소비가 아직 완전히 꺾이지 않았는지 확인하는 보조 지표입니다.";
  }
  if (/Procter\s*&\s*Gamble.*Earnings Webcast/i.test(headline)) {
    return "필수소비재는 방어주 성격이 강해 실적 발표와 마진 코멘트가 중요합니다. P&G의 가격·수요 흐름은 XLP 강세의 지속성을 점검하는 재료입니다.";
  }
  if (/Johnson\s*&\s*Johnson.*diversified healthcare strength/i.test(headline)) {
    return "헬스케어 강세가 특정 바이오 뉴스가 아니라 대형 방어주의 안정성까지 확산되는지 확인할 필요가 있습니다. XLV 강세의 질을 보는 데 도움이 됩니다.";
  }
  if (/Stock Yards Bank.*GE Aerospace/i.test(headline)) {
    return "GE 에어로스페이스에 대한 기관 보유 확대는 산업재 내 항공우주 투자심리를 보여주는 보조 신호입니다. 업종 전체보다 개별 우량주 선호에 가깝습니다.";
  }
  if (/Natural gas storage rises above expectations/i.test(headline)) {
    return "재고 증가는 천연가스 가격에 부담을 줄 수 있어 에너지 업종 내에서도 원자재별 차별화를 키웁니다. XLE 흐름을 볼 때 유가와 가스를 나눠 확인해야 합니다.";
  }
  if (/Gold jumps.*payrolls/i.test(headline)) {
    return "약한 고용지표가 금리 인하 기대를 자극하면 금과 소재 관련 자산이 반응할 수 있습니다. 소재 업종 강세가 달러·금리 변수와 연결됐는지 점검해야 합니다.";
  }
  if (/NextEra Energy earnings outlook and dividend policy/i.test(headline)) {
    return "유틸리티는 금리 민감도가 높아 배당 안정성과 청정전력 성장성이 함께 중요합니다. XLU 강세가 방어주 선호인지 성장 기대인지 구분해야 합니다.";
  }
  if (/Blackstone.*QTS.*Digital Gateway/i.test(headline)) {
    return "데이터센터 프로젝트 종료는 부동산·인프라 테마의 실행 리스크를 보여줍니다. AI 데이터센터 수요가 강해도 지역 인허가와 사업성 변수는 별도로 봐야 합니다.";
  }
  return "해당 뉴스는 당일 미국 시장의 업종별 수급과 투자심리 변화를 확인하는 보조 신호로 볼 수 있습니다.";
}

function koreanNewsBrief(item) {
  return `${koreanHeadlineTranslation(item)} ${koreanNewsSummary(item)}`.replace(/\s+/g, " ").trim();
}

function naverSummaryLine(item, index) {
  const rank = item.rank || index + 1;
  return `${rank}. ${koreanNewsBrief(item)}`;
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
  return uniqueNewsItems((data.marketNews || []).filter(item => item.url), { limit: 3 });
}

function naverSummaryItems(data) {
  const source = data.marketSummary?.length ? data.marketSummary : data.marketNews;
  return uniqueNewsItems(source || [], { limit: 3 });
}

function representativeSectorItems(data) {
  return sectorGroups(data).flatMap(group => blogSectorItems(group, { limit: 1 }));
}

function naverSourceItems(data) {
  const marketUrls = new Set(naverMarketNewsItems(data).map(item => normalizedUrl(item.url)).filter(Boolean));
  return dedupeSourcesByUrl(uniqueNewsItems([
    ...representativeSectorItems(data),
    ...(data.officialSources || []),
  ].filter(item => item.url && !marketUrls.has(normalizedUrl(item.url))), { limit: 20 }));
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
  const date = data.asOfDate;
  const leadingTheme = data.themes?.[0]?.theme;
  const topNews = [...(data.marketNews || [])]
    .sort((a, b) => ((b.rankScore ?? newsRankScore(b)) - (a.rankScore ?? newsRankScore(a)))
      || ((Date.parse(b.publishedAt || "") || -Infinity) - (Date.parse(a.publishedAt || "") || -Infinity)))
    .slice(0, 4);
  const topText = `${topNews[0]?.headline || topNews[0]?.title || ""} ${topNews[0]?.description || ""}`;
  const combined = topNews.map(item => `${item.headline || item.title || ""} ${item.description || ""}`).join(" ");
  const event = snapshotTitleEvent(data) || titleEventPhrase(topText, combined);
  const support = titleSupportPhrase(combined, leadingTheme);
  return [
    `${date} ${event}: ${support} 점검`,
    `${date} S&P 500·Nasdaq 뉴스 정리: 시장과 업종 흐름`,
    `${date} 미국 증시 데일리: ${leadingTheme || "시장 뉴스"} 흐름 체크`,
    `${date} 장 마감 후 읽는 미국 시장 핵심 뉴스`,
  ];
}

function renderDailyReport(data, options = {}) {
  assert(data.reportType === "us-daily-market-news", "JSON reportType must be us-daily-market-news");
  assert(/^\d{4}-\d{2}-\d{2}$/.test(data.asOfDate), "Report requires YYYY-MM-DD asOfDate");
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
  const baseDir = options.baseDir || "analysis-example/us-market";
  const leadership = findLeadershipSummary(data.asOfDate, baseDir);
  const parts = [
    `# 미국 시장 데일리 뉴스 (${data.asOfDate})`,
  ];

  parts.push("", "## 시장 주요 요약", "");
  const summaryItems = naverSummaryItems(data);
  if (summaryItems.length) {
    summaryItems.forEach((item, index) => parts.push(naverSummaryLine(item, index)));
  } else {
    parts.push("1. 같은 기준일의 시장 뉴스가 충분히 수집되지 않았습니다.");
  }

  const snapshotTable = renderSnapshotTable(data);
  if (snapshotTable.length) parts.push("", ...snapshotTable);

  parts.push("", "## 시장 주요 뉴스", "");
  const marketNewsForCards = naverMarketNewsItems(data);
  if (marketNewsForCards.length) {
    parts.push("| # | 구분 | 내용 |", "| ---: | --- | --- |");
    marketNewsForCards.forEach((item, index) => {
      parts.push(`| ${index + 1} | 원문 제목 | ${escapePipe(item.headline || item.title || "제목 없음")} |`);
      parts.push(`|  | 한국어 정리 | ${escapePipe(koreanNewsBrief(item))} |`);
    });
    parts.push("");
    marketNewsForCards.forEach(item => {
      parts.push(item.url, "");
    });
  } else {
    parts.push("같은 기준일의 시장 뉴스가 충분히 수집되지 않았습니다.");
  }

  const sectorSnapshots = snapshotSectorByName(data);
  const groups = sectorGroups(data);
  parts.push("", "## 업종/테마별 흐름", "", "| 업종/테마 | 대표 뉴스 |", "| --- | --- |");
  groups.forEach((group) => {
    const item = blogSectorItems(group, { limit: 1 })[0];
    const snapshot = sectorSnapshots.get(group.sector);
    const flow = snapshot ? `${snapshot.symbol} ${pctLabel(snapshot.changePct)}` : "-";
    const sectorLabel = flow === "-" ? group.sector : `${group.sector} (${flow})`;
    const title = item ? representativeNewsLabel(item) : "특이 뉴스 제한적";
    const brief = item ? koreanNewsBrief(item) : "-";
    const newsCell = brief && brief !== "-" ? `${title}<br>${brief}` : title;
    parts.push(`| ${escapePipe(sectorLabel)} | ${escapePipe(newsCell)} |`);
  });

  parts.push("", "## 공식 공시/자료", "");
  if (data.officialSources?.length) {
    parts.push("| 내용 | 링크 |", "| --- | --- |", ...data.officialSources.map(sourceRow));
  } else {
    parts.push("별도 공식 공시/자료 링크가 없습니다.");
  }

  if (leadership) parts.push("", "## 리더십 스크린 요약", "", leadership);

  parts.push("", "## 출처", "", "| 내용 | 링크 |", "| --- | --- |");
  const allSources = naverSourceItems(data);
  if (allSources.length) parts.push(...allSources.map(sourceRow));
  else parts.push("| 검증 가능한 URL 출처가 없습니다. | - |");

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

function buildPublishManifest({ data, reportPath, postPath, postMarkdown, category = null }) {
  const titles = titleCandidates(data);
  const linkCards = naverMarketNewsItems(data).map(item => item.url);
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
      issue: data.oneLine || "데일리 시장 뉴스",
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
      scheduledPublishAllowed: true,
      duplicateScope: "us-daily-market-news",
      duplicateDate: data.asOfDate,
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
  koreanHeadlineTranslation,
  koreanNewsSummary,
  titleCandidates,
};
