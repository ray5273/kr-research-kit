#!/usr/bin/env node

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const {
  chunkTelegramMessage,
  findConfigRoot,
  findSkillRoot,
  loadConfigEnv,
  redactToken,
  resolveTelegramConfig,
  sendDocument,
  sendMessage,
  truncateTelegramCaption,
} = require("./lib/telegram");
const {
  buildSendPlan,
} = require("./send-telegram");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "telegram-test-"));
const writeJson = (name, data) => {
  const filePath = path.join(root, name);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  return filePath;
};

const krDaily = writeJson("daily-news-kr.json", {
  reportType: "kr-daily-market-news",
  asOfDate: "2026-07-02",
  oneLine: "코스피 약세와 환율 변수가 부각됐습니다.",
  marketSummary: [{ summary: "반도체 급락" }],
  sectorNews: [{ sector: "반도체/AI", items: [{ headline: "HBM 투자 경계" }] }],
});
const krDailyMd = path.join(root, "daily-news-kr.md");
fs.writeFileSync(krDailyMd, "# KR daily\n\n## Summary\n");

const usDaily = writeJson("daily-news-us.json", {
  reportType: "us-daily-market-news",
  asOfDate: "2026-07-02",
  oneLine: "S&P flat, Nasdaq lower.",
  marketNews: [{ headline: "Tech dragged indexes" }],
});

const reportWatch = writeJson("report-watch.json", {
  skill: "kr-analyst-report-watch",
  asOfDate: "2026-07-05",
  collection: { dedupedReportCount: 2, sources: ["naver"] },
  reports: [
    { company: "한온시스템", broker: "DS투자증권", rating: "매수", targetRaw: "5,000원", summary: "하반기 회복이 관건" },
  ],
});

const leaders = writeJson("leaders.json", {
  date: "2026-07-04",
  universe: { includedOrdinaryStocks: 2531 },
  rankings: {
    shortTerm: [{ ticker: "000001", name: "단기전자", shortScore: 99.9 }],
    intermediateTerm: [{ ticker: "000002", name: "중기소재", intermediateScore: 91.2 }],
    structural: [{ ticker: "000003", name: "구조바이오", structuralScore: 93.1 }],
  },
});

const generic = writeJson("generic.json", { schemaVersion: 1, asOfDate: "2026-07-05", payload: { ok: true } });
const markdown = path.join(root, "memo.md");
fs.writeFileSync(markdown, "# Memo Title\n\n## Decision\n\n- First point\n- Second point\n");

const fakeSkill = path.join(root, "skills", "telegram-sender");
fs.mkdirSync(path.join(fakeSkill, "scripts"), { recursive: true });
fs.writeFileSync(path.join(fakeSkill, "SKILL.md"), "---\nname: telegram-sender\n---\n");
fs.writeFileSync(path.join(fakeSkill, ".env"), "TELEGRAM_BOT_TOKEN=111111:skill_token_value\nTELEGRAM_CHAT_ID=skill-chat\n");

assert(buildSendPlan({ input: krDaily }).summary.includes("Korean market daily news"));
assert(buildSendPlan({ input: usDaily }).summary.includes("U.S. market daily news"));
assert(buildSendPlan({ input: reportWatch }).summary.includes("Korean analyst report watch"));
assert(buildSendPlan({ input: leaders }).summary.includes("KR market leaders"));
assert(buildSendPlan({ input: generic }).summary.includes("Artifact: generic.json"));
assert(buildSendPlan({ input: markdown }).summary.includes("Markdown artifact: Memo Title"));
assert.strictEqual(buildSendPlan({ input: krDaily }).attachment, krDailyMd);
assert.strictEqual(buildSendPlan({ input: krDaily, attach: markdown }).attachment, markdown);
assert.strictEqual(buildSendPlan({ input: krDaily, "summary-only": true }).sendDocument, false);
assert.strictEqual(buildSendPlan({ input: krDaily, "document-only": true }).sendSummary, false);
assert.throws(() => buildSendPlan({ input: krDaily, "summary-only": true, "document-only": true }), /cannot be used together/);
assert.strictEqual(findSkillRoot(path.join(fakeSkill, "scripts")), fakeSkill);
assert.strictEqual(findConfigRoot(path.join(fakeSkill, "scripts")), fakeSkill);
assert.strictEqual(loadConfigEnv(fakeSkill).TELEGRAM_CHAT_ID, "skill-chat");
assert.strictEqual(resolveTelegramConfig({ configRoot: fakeSkill }).chatId, "skill-chat");

const calls = [];
const transport = async request => {
  calls.push(request);
  return { ok: true, result: { message_id: calls.length } };
};

(async () => {
  await sendMessage({ token: "123456:ABCDEF_secret_token_value", chatId: "42", apiBase: "https://telegram.example" }, "x".repeat(5000), { transport });
  assert.strictEqual(calls.length, 2);
  assert(calls[0].url.includes("/bot123456:ABCDEF_secret_token_value/sendMessage"));
  assert.strictEqual(calls[0].body.chat_id, "42");
  assert(calls[0].body.text.length <= 4096);

  await sendDocument({ token: "123456:ABCDEF_secret_token_value", chatId: "42", apiBase: "https://telegram.example" }, markdown, { caption: "c".repeat(2000), transport });
  assert.strictEqual(calls.length, 3);
  assert(calls[2].url.includes("/sendDocument"));
  assert.strictEqual(calls[2].fields.chat_id, "42");
  assert.strictEqual(calls[2].fields.caption.length, 1024);
  assert.strictEqual(calls[2].files[0].filename, "memo.md");

  assert.strictEqual(chunkTelegramMessage("a".repeat(9000)).length, 3);
  assert.strictEqual(truncateTelegramCaption("b".repeat(2000)).length, 1024);
  assert(!redactToken("bad 123456:ABCDEF_secret_token_value", "123456:ABCDEF_secret_token_value").includes("ABCDEF_secret"));
  await assert.rejects(() => sendMessage({ token: "", chatId: "", apiBase: "https://telegram.example" }, "hello", { transport }), /Missing Telegram credential/);
})().catch(error => {
  console.error(error.stack || error.message);
  process.exit(1);
}).then(() => {
  const dryRun = spawnSync(process.execPath, [path.resolve(__dirname, "send-telegram.js"), "--input", krDaily, "--dry-run"], { encoding: "utf8" });
  assert.strictEqual(dryRun.status, 0, dryRun.stderr);
  const dryRunJson = JSON.parse(dryRun.stdout);
  assert.strictEqual(dryRunJson.dryRun, true);
  assert.strictEqual(dryRunJson.sendSummary, true);
  assert.strictEqual(dryRunJson.sendDocument, true);
  assert.strictEqual(dryRunJson.attachment, krDailyMd);

  const missing = spawnSync(process.execPath, [path.resolve(__dirname, "send-telegram.js"), "--input", krDaily], {
    encoding: "utf8",
    env: { ...process.env, TELEGRAM_BOT_TOKEN: "", TELEGRAM_CHAT_ID: "" },
  });
  assert.notStrictEqual(missing.status, 0);
  assert(missing.stderr.includes("Missing Telegram credential"));
  assert(!missing.stderr.includes("123456:ABCDEF"));

  console.log("Telegram tests passed.");
});
