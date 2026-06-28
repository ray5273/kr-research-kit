#!/usr/bin/env node

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { DEFAULT_SECTORS } = require("./fetch-daily-market-news");

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

function itemLine(item) {
  const label = item.headline || item.title || "제목 없음";
  return item.url ? `- [${label}](${item.url}) — ${item.source || "source"}` : `- ${label}`;
}

function sourceLabel(item) {
  return item.headline || item.title || item.name || "출처";
}

function representativeNewsLabel(item) {
  const headline = item.headline || item.title || "";
  if (!headline) return "";
  return item.name ? `${item.name}: ${headline}` : headline;
}

function sourceRow(item) {
  return `| ${escapePipe(sourceLabel(item))} | ${item.url ? `[원문](${item.url})` : "-"} |`;
}

function naverMarketNewsItems(data) {
  return (data.marketNews || []).filter(item => item.url).slice(0, 5);
}

function summarizeWarningForNaver(warning) {
  const text = String(warning || "");
  if (/시장 주요 뉴스가 기준일 기사만으로/.test(text)) return text.replace(/\s*\(.*?\)\s*/g, " ");
  if (/업종 뉴스|반도체\/AI|이차전지|자동차|조선|바이오|인터넷|금융|화학|철강|소비재/.test(text)) return "업종 뉴스 일부는 수집 제한 또는 날짜 확인 문제로 제외했습니다.";
  if (/날짜 확인|기준일/.test(text)) return "날짜가 확인되지 않거나 기준일이 다른 뉴스는 본문에서 제외했습니다.";
  if (/뉴스 수집 실패|수집 실패/.test(text)) return "일부 뉴스 검색은 수집 제한으로 제외했습니다.";
  return "일부 수집 이슈는 본문 출처 구성에서 제외했습니다.";
}

function naverCollectionNotes(data) {
  const notes = new Set((data.warnings || []).map(summarizeWarningForNaver).filter(Boolean));
  const displayedMarketNews = naverMarketNewsItems(data).length;
  if (displayedMarketNews < 5) notes.add(`시장 주요 뉴스는 기준일 기사만 ${displayedMarketNews}건 확인되어 부족분을 보충하지 않았습니다.`);
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

function titleCandidates(data) {
  const date = data.asOfDate;
  const leadingTheme = data.themes?.[0]?.theme;
  return [
    `${date} 한국 증시 데일리: ${leadingTheme || "시장 뉴스"} 흐름 체크`,
    `${date} 코스피·코스닥 뉴스 정리: 시장과 업종 흐름`,
    `${date} 장 마감 후 읽는 한국 시장 핵심 뉴스`,
  ];
}

function renderDailyReport(data, options = {}) {
  assert(data.reportType === "kr-daily-market-news", "JSON reportType must be kr-daily-market-news");
  assert(/^\d{4}-\d{2}-\d{2}$/.test(data.asOfDate), "Report requires YYYY-MM-DD asOfDate");
  const baseDir = options.baseDir || "analysis-example/kr-market";
  const leadership = findLeadershipSummary(data.asOfDate, baseDir);
  const titles = titleCandidates(data);
  const parts = [
    `# 한국 시장 데일리 뉴스 (${data.asOfDate})`,
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

  parts.push("", "## 시장 주요 뉴스", "");
  if (data.marketNews?.length) parts.push(...data.marketNews.map(itemLine));
  else parts.push("- 같은 기준일의 시장 뉴스가 충분히 수집되지 않았습니다.");

  parts.push("", "## 업종/테마별 흐름", "");
  if (data.themes?.length) {
    parts.push("| 테마 | 기사 수 | 대표 헤드라인 |", "| --- | ---: | --- |");
    for (const theme of data.themes) {
      parts.push(`| ${escapePipe(theme.theme)} | ${theme.count || theme.headlines?.length || 0} | ${escapePipe((theme.headlines || []).slice(0, 2).join(" / "))} |`);
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
  const allSources = [
    ...(data.marketNews || []),
    ...(data.sectorNews || []).flatMap(group => group.items || []),
    ...(data.officialSources || []),
  ].filter(item => item.url);
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
  return DEFAULT_SECTORS.map(sector => byName.get(sector) || { sector, query: `한국증시 ${sector} 주식 뉴스`, items: [] });
}

function renderNaverPost(data, options = {}) {
  assert(data.reportType === "kr-daily-market-news", "JSON reportType must be kr-daily-market-news");
  assert(/^\d{4}-\d{2}-\d{2}$/.test(data.asOfDate), "Report requires YYYY-MM-DD asOfDate");
  const baseDir = options.baseDir || "analysis-example/kr-market";
  const leadership = findLeadershipSummary(data.asOfDate, baseDir);
  const parts = [
    `# 한국 시장 데일리 뉴스 (${data.asOfDate})`,
  ];

  parts.push("", "## 시장 주요 요약", "");
  if (data.marketSummary?.length) {
    for (const item of data.marketSummary.slice(0, 5)) {
      parts.push(`${item.rank || ""}. ${item.summary || item.title}`.replace(/^\. /, ""));
    }
  } else if (data.marketNews?.length) {
    data.marketNews.slice(0, 5).forEach((item, index) => {
      parts.push(`${index + 1}. ${item.headline || item.title}`);
    });
  } else {
    parts.push("1. 같은 기준일의 시장 뉴스가 충분히 수집되지 않았습니다.");
  }

  parts.push("", "## 시장 주요 뉴스", "");
  const marketNewsForCards = naverMarketNewsItems(data);
  if (marketNewsForCards.length) {
    marketNewsForCards.forEach((item, index) => {
      parts.push(`${index + 1}. ${item.headline || item.title || "제목 없음"}`, item.url, "");
    });
  } else {
    parts.push("같은 기준일의 시장 뉴스가 충분히 수집되지 않았습니다.");
  }

  parts.push("", "## 업종/테마별 흐름", "", "| 업종/테마 | 흐름 | 대표 뉴스 |", "| --- | --- | --- |");
  for (const group of sectorGroups(data)) {
    const titles = (group.items || []).slice(0, 2).map(representativeNewsLabel).filter(Boolean);
    const flow = titles.length ? `${titles.length}건 확인` : "특이 뉴스 제한적";
    parts.push(`| ${escapePipe(group.sector)} | ${flow} | ${escapePipe(titles.join(" / ") || "특이 뉴스 제한적")} |`);
  }

  parts.push("## 공식 공시/자료", "");
  if (data.officialSources?.length) {
    parts.push("| 내용 | 링크 |", "| --- | --- |", ...data.officialSources.map(sourceRow));
  } else {
    parts.push("별도 공식 공시/자료 링크가 없습니다.");
  }

  if (leadership) parts.push("", "## 리더십 스크린 요약", "", leadership);

  parts.push("", "## 출처", "", "| 내용 | 링크 |", "| --- | --- |");
  const allSources = [
    ...(data.marketNews || []),
    ...(data.sectorNews || []).flatMap(group => group.items || []),
    ...(data.officialSources || []),
  ].filter(item => item.url);
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
      company: "한국 시장",
      ticker: "",
      title: titles[0].slice(0, 100),
      issue: data.oneLine || "데일리 시장 뉴스",
      category,
      tags: ["한국증시", "코스피", "코스닥", "시장뉴스", data.asOfDate.replace(/-/g, "")].slice(0, 10),
      markdownPath: path.resolve(postPath),
      markdownSha256: sha256(postMarkdown),
      images: [],
      linkCards,
      thumbnail: null,
      publicationDate: data.asOfDate,
    },
    automation: {
      scheduledPublishAllowed: true,
      duplicateScope: "daily-market-news",
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
  renderDailyReport,
  renderNaverPost,
  titleCandidates,
};
