#!/usr/bin/env node
"use strict";

// Offline tests for kr-chatgpt-review. No browser, no network.
//
//   node skills/kr-chatgpt-review/scripts/test-chatgpt-review.js

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const review = require("./chatgpt-review.js");

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ok  ${name}`);
  } catch (err) {
    console.error(`  FAIL ${name}`);
    console.error(`       ${err.message}`);
    process.exitCode = 1;
  }
}

const MEMO = [
  "# 샘플 (000000)",
  "",
  "기준일: 2026-09-15",
  "",
  "## Summary",
  "",
  "**운임을 올린 건 유가였다.**",
  "",
  "![차트](assets/chart.png)",
  "",
  "[blue: 화물 비중 급등은 한 분기 현상에 가깝다.]",
  "",
  "## Sources",
  "",
  "- https://example.com/report",
].join("\n");

console.log("kr-chatgpt-review offline tests");

test("prompt carries the fixed feedback headings and the memo", () => {
  const prompt = review.buildPrompt({ memoText: MEMO, focus: "화물 운임 지속성" });
  for (const section of review.FEEDBACK_SECTIONS) {
    assert.ok(prompt.includes(`## ${section.number}. ${section.title}`), section.title);
  }
  assert.ok(prompt.includes("메모 기준일은 2026-09-15"));
  assert.ok(prompt.includes("화물 운임 지속성"));
  assert.ok(prompt.includes("https://example.com/report"));
});

test("prompt strips images and Naver color markers", () => {
  const prompt = review.buildPrompt({ memoText: MEMO });
  assert.ok(!prompt.includes("assets/chart.png"));
  assert.ok(!prompt.includes("[blue:"));
  assert.ok(prompt.includes("화물 비중 급등은 한 분기 현상에 가깝다."));
});

test("parses a well-formed reply", () => {
  const reply = [
    "## 0. 한 줄 판정",
    "부분 지지 — 할증료 추정이 장거리 요율에 기대고 있다.",
    "## 1. 논리 비약",
    "| # | 원문 주장 | 왜 약한가 | 무엇이 있으면 성립하나 | 심각도 |",
    "|---|---|---|---|---|",
    "| 1 | 141% | 장거리 요율 일괄 적용 | 노선별 물량 | 상 |",
    "## 2. 숫자·계산 점검",
    "없음",
    "## 3. 빠진 반대 논리",
    "1. 기본운임 인상 — 결론 약화",
    "## 4. 확신도 점검",
    "없음",
    "## 5. 결론을 뒤집을 데이터",
    "1. 3Q 화물 비중",
    "## 6. 먼저 고칠 3가지",
    "1. 할증료 추정 범위",
  ].join("\n");
  const parsed = review.parseFeedback(reply);
  assert.strictEqual(parsed.verdict, "부분 지지");
  assert.deepStrictEqual(parsed.missing, []);
  assert.ok(parsed.sections.logicGaps.includes("141%"));
  assert.strictEqual(parsed.sections.numbers, "없음");
});

test("tolerates bold headings without hashes and reports missing sections", () => {
  const reply = ["**0. 한 줄 판정:**", "지지 안 함 — 결론이 근거보다 앞선다.", "**1. 논리 비약**", "- 비약 하나"].join("\n");
  const parsed = review.parseFeedback(reply);
  assert.strictEqual(parsed.verdict, "지지 안 함");
  assert.ok(parsed.sections.logicGaps.includes("비약 하나"));
  assert.ok(parsed.missing.includes("6. 먼저 고칠 3가지"));
});

test("numbered lists inside a section are not mistaken for headings", () => {
  const reply = ["## 3. 빠진 반대 논리", "1. 기본운임 인상 — 영향 있음", "2. 환율 — 영향 있음", "## 6. 먼저 고칠 3가지", "1. 첫째"].join("\n");
  const parsed = review.parseFeedback(reply);
  assert.ok(parsed.sections.counterArguments.includes("환율"));
  assert.strictEqual(parsed.sections.verdict, undefined);
});

test("refuses memos from private directories", () => {
  const privateFile = path.join(os.homedir(), "stock-analysis-private", "guard", "report.md");
  assert.strictEqual(review.isPrivatePath(privateFile), true);
  assert.strictEqual(review.isPrivatePath(path.join(os.tmpdir(), "memo.md")), false);
});

test("refuses memos that mention holdings or the voice profile", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "kr-chatgpt-review-"));
  const file = path.join(tmp, "memo.md");
  fs.writeFileSync(file, `${MEMO}\n\n참고: decision-ledger.ndjson\n`, "utf8");
  assert.throws(() => review.loadMemo(file), /refusing/);
  fs.writeFileSync(file, MEMO, "utf8");
  assert.strictEqual(review.loadMemo(file).text, MEMO);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("browse js output is unwrapped whether or not it is quoted", () => {
  assert.deepStrictEqual(review.parseJsResult('{"a":1}'), { a: 1 });
  assert.deepStrictEqual(review.parseJsResult(JSON.stringify('{"a":1}')), { a: 1 });
  assert.strictEqual(review.parseJsResult("clicked"), "clicked");
  assert.strictEqual(review.parseJsResult("3"), 3);
});

console.log("");
if (process.exitCode) {
  console.error(`FAILED — ${passed} passed, see failures above`);
} else {
  console.log(`All ${passed} tests passed.`);
}
