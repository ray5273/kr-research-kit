#!/usr/bin/env node

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const watch = require("./discover-watch-reports.js");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "kr-report-watch-"));
const artifactDir = path.join(root, "kr-reports");
fs.mkdirSync(artifactDir, { recursive: true });

const prior = {
  schemaVersion: 1,
  skill: "kr-analyst-report-watch",
  mode: "daily",
  asOfDate: "2026-07-01",
  reports: [
    {
      reportId: "old-chip",
      broker: "미래에셋증권",
      publishedDate: "2026-07-01",
      title: "반도체 산업: 재고 부담 지속",
      topicKey: "sector:semiconductor",
      summary: "DRAM 재고 부담과 가격 둔화 우려가 핵심.",
      narrative: { industryTrend: "DRAM 재고 부담 지속", demandSupply: "수요 둔화", risk: "가격 하락 리스크", catalyst: null },
    },
    {
      reportId: "old-battery",
      broker: "NH투자증권",
      publishedDate: "2026-07-01",
      title: "2차전지: 정책 모멘텀 대기",
      topicKey: "sector:battery",
      summary: "정책 모멘텀은 있으나 수요 확인 필요.",
      narrative: { policy: "정책 모멘텀 대기", demandSupply: "수요 확인 필요" },
    },
  ],
};
fs.writeFileSync(path.join(artifactDir, "report-watch-daily-2026-07-01.json"), JSON.stringify(prior, null, 2));

const rawReports = [
  {
    reportId: "hankyung-1",
    broker: "미래에셋증권",
    analyst: "A",
    publishedDate: "2026-07-05",
    title: "반도체 산업: HBM 수요 회복과 가격 개선",
    rating: null,
    targetPrice: null,
    pdfUrl: "https://consensus.hankyung.com/analysis/downpdf?report_idx=1",
    landingUrl: "https://consensus.hankyung.com/analysis/downpdf?report_idx=1",
    sourceSite: "hankyung",
    accessiblePdf: true,
    extractedTextPath: "/tmp/chip.txt",
    extractedText: "HBM 수요 회복. 공급 제약으로 가격 개선. Catalyst는 AI 서버 증설. Risk는 중국 경쟁.",
  },
  {
    reportId: "dup",
    broker: "미래에셋증권",
    publishedDate: "2026-07-05",
    title: "반도체 산업: HBM 수요 회복과 가격 개선",
    sourceSite: "naver",
    pdfUrl: "https://stock.pstatic.net/report.pdf",
  },
  {
    reportId: "hankyung-2",
    broker: "한국투자증권",
    publishedDate: "2026-07-04",
    title: "삼성전자(005930) 실적 모멘텀 점검",
    rating: "BUY",
    targetPrice: 95000,
    pdfUrl: "https://consensus.hankyung.com/analysis/downpdf?report_idx=2",
    sourceSite: "hankyung",
    requiresAuth: true,
    extractedText: "실적 개선과 메모리 가격 회복. Risk는 환율.",
  },
  {
    reportId: "naver-1",
    broker: "NH투자증권",
    publishedDate: "2026-07-03",
    title: "2차전지: 보조금 정책 변화와 LFP 경쟁",
    sourceSite: "naver",
    pdfUrl: null,
    extractedText: "정책 변화와 중국 LFP 경쟁 심화. 수요는 ESS 중심 회복. 리스크는 보조금 축소와 가격 경쟁.",
  },
];

assert.strictEqual(watch.parseTickerFromTitle("삼성전자(005930) 실적"), "005930");
assert.strictEqual(watch.parseCompanyFromTitle("삼성전자(005930) 실적"), "삼성전자");
assert.deepStrictEqual(watch.classifyTopic({ title: "반도체 산업: HBM 수요" }).topicKey, "sector:semiconductor");
assert.deepStrictEqual(watch.classifyTopic({ title: "삼성전자(005930) 실적" }).topicKey, "company:005930");

const deduped = watch.dedupeReports(rawReports);
assert.strictEqual(deduped.length, 3);
assert(deduped.find((r) => r.reportId === "hankyung-1").sourceSites.includes("naver"));

const selected = watch.selectTopReports(deduped, 2);
assert.strictEqual(selected.length, 2);
assert(selected.some((r) => r.title.includes("반도체")));

const priorReports = watch.loadPriorReports({ artifactDir, asOfDate: "2026-07-05" });
assert.strictEqual(priorReports.length, 2);

const artifact = watch.buildFinalArtifact({
  mode: "daily",
  asOfDate: "2026-07-05",
  lookbackDays: 1,
  maxReports: 10,
  rawReports,
  dedupedReports: deduped,
  selectedReports: deduped,
  priorReports,
  warnings: ["fixture warning"],
});

assert.strictEqual(artifact.schemaVersion, 1);
assert.strictEqual(artifact.reports.length, 3);
assert.strictEqual(artifact.collection.rawReportCount, 4);
assert.strictEqual(artifact.collection.dedupedReportCount, 3);
assert(artifact.reports.find((r) => r.topicKey === "sector:semiconductor").narrativeDeltaLabels.includes("tone-shift-positive"));
assert(artifact.reports.find((r) => r.topicKey === "company:005930").narrativeDeltaLabels.includes("new-topic"));
assert(artifact.reports.find((r) => r.topicKey === "sector:battery").narrativeDeltaLabels.includes("risk-framing-changed"));
assert.strictEqual(artifact.sourceQuality.loginGatedCount, 1);
assert.strictEqual(artifact.sourceQuality.extractedTextCount, 1);
assert(artifact.topicChanges.some((change) => change.topicKey === "sector:semiconductor"));

const markdown = watch.renderMarkdown(artifact);
assert(markdown.includes("## 기준일 / 모드 / 수집 범위"));
assert(markdown.includes("## Top Narrative Changes"));
assert(markdown.includes("## Report Digest"));
assert(markdown.includes("## Topic-by-Topic Changes"));
assert(markdown.includes("## Source Quality / Gaps"));
assert(markdown.includes("## Sources"));
assert(markdown.includes("저작권"));

console.log("report watch tests passed");
