#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const {
  chunkTelegramMessage,
  redactToken,
  resolveTelegramConfig,
  sendDocument,
  sendMessage,
  truncateTelegramCaption,
} = require("./lib/telegram");

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 2; i < argv.length; i += 1) {
    const value = argv[i];
    if (!value.startsWith("--")) { args._.push(value); continue; }
    const key = value.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) args[key] = true;
    else { args[key] = next; i += 1; }
  }
  return args;
}

function usage() {
  return [
    "Usage: node <telegram-report-sender>/scripts/send-telegram.js --input <artifact> [options]",
    "",
    "Options:",
    "  --chat-id <id>       Override TELEGRAM_CHAT_ID",
    "  --token <token>      Override TELEGRAM_BOT_TOKEN",
    "  --attach <path>      Attach this file instead of auto-detected artifact",
    "  --summary-only       Send only summary text",
    "  --document-only      Send only document attachment",
    "  --dry-run           Print the send plan without HTTP calls",
  ].join("\n");
}

function compact(value) {
  return String(value == null ? "" : value).replace(/\s+/g, " ").trim();
}

function topItems(items, pick) {
  return (Array.isArray(items) ? items : []).slice(0, pick).map(item => {
    if (typeof item === "string") return compact(item);
    return compact(item.headline || item.title || item.summary || item.name || item.company || JSON.stringify(item));
  }).filter(Boolean);
}

function summarizeDailyMarketNews(data) {
  const region = data.reportType === "us-daily-market-news" ? "U.S. market daily news" : "Korean market daily news";
  const lines = [`${region} (${data.asOfDate || "date n/a"})`];
  if (data.oneLine) lines.push(compact(data.oneLine));
  const marketItems = topItems(data.marketSummary || data.marketNews, 3);
  if (marketItems.length) lines.push(`Market: ${marketItems.join(" / ")}`);
  const sectorGroups = Array.isArray(data.sectorNews) ? data.sectorNews : [];
  const sectorItems = sectorGroups.slice(0, 3).map(group => {
    const item = topItems(group.items || group.news, 1)[0];
    return item ? `${group.sector}: ${item}` : group.sector;
  }).filter(Boolean);
  if (sectorItems.length) lines.push(`Sectors: ${sectorItems.join(" / ")}`);
  return lines.join("\n");
}

function summarizeReportWatch(data) {
  const reports = Array.isArray(data.reports) ? data.reports : [];
  const lines = [`Korean analyst report watch (${data.asOfDate || "date n/a"})`];
  if (data.collection) {
    lines.push(`Reports: ${data.collection.dedupedReportCount || reports.length}; sources: ${(data.collection.sources || []).join(", ") || "n/a"}`);
  }
  for (const report of reports.slice(0, 5)) {
    const title = [report.company, report.broker, report.rating || report.ratingRaw, report.targetRaw || report.targetPrice].filter(Boolean).join(" / ");
    lines.push(`- ${title}: ${compact(report.summary || report.title)}`);
  }
  return lines.join("\n");
}

function summarizeMarketLeaders(data) {
  const date = data.date || data.asOfDate || "date n/a";
  const universe = data.universe?.includedOrdinaryStocks || data.universe?.eligibleCount || data.universe?.attemptedSymbols;
  const lines = [`KR market leaders (${date})`];
  if (universe) lines.push(`Universe: ${universe} stocks`);
  const rankings = data.rankings || {};
  for (const [label, rows] of [["Short", rankings.shortTerm], ["Intermediate", rankings.intermediateTerm], ["Structural", rankings.structural]]) {
    const names = (Array.isArray(rows) ? rows : []).slice(0, 5).map(row => `${row.name || row.ticker} ${Math.round(row.compositeScore || row.shortScore || row.intermediateScore || row.structuralScore || 0)}`).join(", ");
    if (names) lines.push(`${label}: ${names}`);
  }
  const newEntrants = data.priorComparison?.newEntrants || data.newEntrants || [];
  const entrantNames = topItems(newEntrants, 5);
  if (entrantNames.length) lines.push(`New entrants: ${entrantNames.join(", ")}`);
  return lines.join("\n");
}

function summarizeGenericJson(data, filePath) {
  const lines = [`Artifact: ${path.basename(filePath)}`];
  for (const key of ["reportType", "skill", "mode", "asOfDate", "date", "generatedAt"]) {
    if (data[key]) lines.push(`${key}: ${data[key]}`);
  }
  const keys = Object.keys(data).slice(0, 12);
  if (keys.length) lines.push(`Keys: ${keys.join(", ")}`);
  return lines.join("\n");
}

function summarizeMarkdown(text, filePath) {
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const title = lines.find(line => /^#\s+/.test(line))?.replace(/^#\s+/, "") || path.basename(filePath);
  const bullets = lines.filter(line => /^[-*]\s+/.test(line)).slice(0, 4).map(line => line.replace(/^[-*]\s+/, ""));
  const sections = lines.filter(line => /^##\s+/.test(line)).slice(0, 5).map(line => line.replace(/^##\s+/, ""));
  return [`Markdown artifact: ${title}`, ...(bullets.length ? bullets : sections)].join("\n");
}

function readArtifact(inputPath) {
  const absolutePath = path.resolve(inputPath);
  const text = fs.readFileSync(absolutePath, "utf8");
  if (/\.json$/i.test(absolutePath)) {
    const data = JSON.parse(text);
    return { absolutePath, type: "json", data, text };
  }
  return { absolutePath, type: "markdown", text };
}

function buildSummary(artifact) {
  if (artifact.type === "markdown") return summarizeMarkdown(artifact.text, artifact.absolutePath);
  const data = artifact.data;
  if (data.reportType === "kr-daily-market-news" || data.reportType === "us-daily-market-news") return summarizeDailyMarketNews(data);
  if (data.skill === "kr-analyst-report-watch") return summarizeReportWatch(data);
  if (data.rankings && data.universe) return summarizeMarketLeaders(data);
  return summarizeGenericJson(data, artifact.absolutePath);
}

function defaultAttachment(inputPath) {
  const parsed = path.parse(path.resolve(inputPath));
  if (parsed.ext.toLowerCase() === ".json") {
    const markdownPath = path.join(parsed.dir, `${parsed.name}.md`);
    if (fs.existsSync(markdownPath)) return markdownPath;
  }
  return path.resolve(inputPath);
}

function buildSendPlan(args) {
  if (!args.input) throw new Error(`Missing --input.\n${usage()}`);
  if (args["summary-only"] && args["document-only"]) throw new Error("--summary-only and --document-only cannot be used together.");
  const artifact = readArtifact(args.input);
  const summary = buildSummary(artifact);
  const attachment = args.attach ? path.resolve(args.attach) : defaultAttachment(artifact.absolutePath);
  return {
    input: artifact.absolutePath,
    summary,
    attachment,
    sendSummary: !args["document-only"],
    sendDocument: !args["summary-only"],
  };
}

async function main(argv = process.argv) {
  const args = parseArgs(argv);
  const plan = buildSendPlan(args);
  const configRoot = args["config-root"] || process.env.TELEGRAM_CONFIG_ROOT || path.resolve(__dirname, "..");
  const config = resolveTelegramConfig({ token: args.token, chatId: args["chat-id"], configRoot });
  if (args["dry-run"]) {
    console.log(JSON.stringify({
      dryRun: true,
      input: plan.input,
      sendSummary: plan.sendSummary,
      summaryChunks: plan.sendSummary ? chunkTelegramMessage(plan.summary).length : 0,
      sendDocument: plan.sendDocument,
      attachment: plan.sendDocument ? plan.attachment : null,
      caption: plan.sendDocument ? truncateTelegramCaption(plan.summary) : null,
      chatId: config.chatId ? "[configured]" : "[missing]",
      token: config.token ? "[configured]" : "[missing]",
    }, null, 2));
    return;
  }
  if (plan.sendSummary) await sendMessage(config, plan.summary);
  if (plan.sendDocument) await sendDocument(config, plan.attachment, { caption: plan.sendSummary ? "" : plan.summary });
  console.log(JSON.stringify({ ok: true, sentSummary: plan.sendSummary, sentDocument: plan.sendDocument, attachment: plan.sendDocument ? plan.attachment : null }, null, 2));
}

if (require.main === module) {
  main().catch(error => {
    const tokenArg = process.argv.includes("--token") ? process.argv[process.argv.indexOf("--token") + 1] : "";
    console.error(redactToken(error.message, tokenArg));
    process.exit(1);
  });
}

module.exports = {
  buildSendPlan,
  buildSummary,
  defaultAttachment,
  main,
  parseArgs,
  summarizeDailyMarketNews,
  summarizeGenericJson,
  summarizeMarkdown,
  summarizeMarketLeaders,
  summarizeReportWatch,
};
