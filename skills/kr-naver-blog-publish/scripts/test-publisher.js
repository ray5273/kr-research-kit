#!/usr/bin/env node

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { buildPost } = require("./memo-to-post");
const { editorBody, editorHtml, expectedTableData, prepare, publish, renderExcelTableHtml, validateBlockFormatting } = require("./publisher");
const { readJson, writeJsonAtomic } = require("./lib");

assert(!editorBody("# 제목\n\n## 결론\n\n**강조**\n\n![차트](chart.png)").includes("#"));
assert(!editorBody("# 제목\n\n본문").includes("제목"));
assert(editorBody("# 제목\n\n## 결론\n\n**강조**").includes("결론\n\n강조"));
assert(!editorBody("> signature").includes(">"));
assert(editorHtml("> signature").includes('data-kr-naver-signature="true"'));
assert.strictEqual((editorHtml("> line 1\n> line 2\n> ✓ item").match(/<blockquote\b/g) || []).length, 1);
assert.strictEqual((editorHtml("> line 1\n> line 2\n> ✓ item").match(/<p\b/g) || []).length, 3);
{
  const tableMarkdown = [
    "# 제목",
    "",
    "## 표",
    "",
    "| 항목 | 값 | 비고 |",
    "| --- | ---: | :---: |",
    "| 매출 | **100** | 원문 |",
    "| 이익 | `20` | 확인 |",
  ].join("\n");
  const html = editorHtml(tableMarkdown);
  assert(html.includes("<table"));
  assert(html.includes("<thead>"));
  assert(html.includes("<tbody>"));
  assert(html.includes("<th"));
  assert(html.includes("<td"));
  assert(html.includes("background:#f3f4f6"));
  assert(html.includes("text-align:right"));
  assert(html.includes("text-align:center"));
  assert(editorBody(tableMarkdown).includes("항목\t값\t비고\n매출\t100\t원문\n이익\t20\t확인"));
  const rendered = renderExcelTableHtml(expectedTableData(tableMarkdown).map((table) => ({
    headers: table.rows[0],
    rows: table.rows.slice(1),
    alignments: ["left", "right", "center"],
  }))[0]);
  assert(rendered.includes("<table"));
}
{
  const html = editorHtml("# 제목\n\n## 결론\n\n본문\n다음 줄\n\n### 근거\n\n**강조**\n\n---\n\n![차트](chart.png)");
  assert(html.includes("<hr>"));
  assert(html.includes(">결론</strong></h2>"));
  assert(html.includes(">근거</strong></h3>"));
  assert(html.includes("<strong>강조</strong>"));
  assert(html.includes("본문<br>다음 줄"));
  assert(!html.includes("chart.png"));
}
{
  const html = editorHtml([
    "# 제목",
    "",
    "## 큰 소제목",
    "",
    "첫 문단입니다.",
    "",
    "둘째 문단입니다.",
    "",
    "### 작은 소제목",
    "",
    "- 첫 불릿",
    "- 둘째 불릿",
    "",
    "1. 첫 번호",
    "2. 둘째 번호",
  ].join("\n"));
  assert(html.includes('<h2 style="font-size:28px;font-weight:700;'));
  assert(html.includes('<h3 style="font-size:24px;font-weight:700;'));
  assert(html.includes('<p style="font-size:15px;font-weight:400;line-height:1.7;margin:0;"><span style="font-size:15px;font-weight:400;line-height:1.7;">첫 문단입니다.</span></p>'));
  assert(html.includes('<p style="font-size:15px;font-weight:400;line-height:1.7;margin:0;"><span style="font-size:15px;font-weight:400;line-height:1.7;">둘째 문단입니다.</span></p>'));
  assert(!html.includes("첫 문단입니다.<br>둘째 문단입니다."));
  assert(html.includes('style="font-size:15px;font-weight:400;line-height:1.7;">- 첫 불릿</span></p>'));
  assert(html.includes('style="font-size:15px;font-weight:400;line-height:1.7;">- 둘째 불릿</span></p>'));
  assert(!html.includes("• 첫 불릿"));
  assert(html.includes('style="font-size:15px;font-weight:400;line-height:1.7;">1. 첫 번호</span></p>'));
  assert(html.includes('style="font-size:15px;font-weight:400;line-height:1.7;">2. 둘째 번호</span></p>'));
  assert(html.includes('data-kr-naver-spacer="true" style="font-size:15px;font-weight:400;line-height:1.7;margin:0;"'));
  assert.strictEqual((html.match(/data-kr-naver-spacer="true"/g) || []).length, 7);
}
{
  const html = editorHtml("## 이미지 뒤 제목\n\n- 일반 목록\n- **선택 강조**가 있는 목록");
  assert(html.includes('<h2 style="font-size:28px;font-weight:700;'));
  assert(html.includes('style="font-size:15px;font-weight:400;line-height:1.7;">- 일반 목록'));
  assert(html.includes('style="font-size:15px;font-weight:400;line-height:1.7;">- <strong>선택 강조</strong>가 있는 목록'));
  validateBlockFormatting([
    { text: "이미지 뒤 제목", fontSizes: ["28px"], fontWeights: ["700"] },
    { text: "- 일반 목록", fontSizes: ["15px"], fontWeights: ["400"] },
    { text: "- 선택 강조가 있는 목록", fontSizes: ["15px"], fontWeights: ["400", "700"] },
  ], html);
  assert.throws(() => validateBlockFormatting([
    { text: "이미지 뒤 제목", fontSizes: ["28px"], fontWeights: ["700"] },
    { text: "- 일반 목록", fontSizes: ["28px"], fontWeights: ["700"] },
    { text: "- 선택 강조가 있는 목록", fontSizes: ["28px"], fontWeights: ["700"] },
  ], html), /font size mismatch/);
}
{
  const html = editorHtml("# 제목\n\n## 결론\n\n**순현금과 배당수익률**\n\n**별풍선 역성장과 마진 압축**\n\n**중립적 관찰 / 딥밸류 매수 전환 검토**\n\n**외부 고객 반복 판매 시 리레이팅 논리**\n\n**매출과 이익 기여는 제한적**");
  assert(html.includes("color:#d93025"));
  assert(html.includes("color:#1a73e8"));
  assert(html.includes("color:#8a5a2b"));
  assert(html.includes("font-size:28px"));
}
{
  const html = editorHtml("# 제목\n\n## 결론\n\n순현금과 배당수익률\n\n역성장과 마진 압축 리스크");
  assert(html.includes('<span style="color:#d93025;font-weight:700;">순현금과 배당수익률</span>'));
  assert(html.includes('<span style="color:#1a73e8;font-weight:700;">역성장과 마진 압축 리스크</span>'));
}
{
  const html = editorHtml([
    "# 제목",
    "",
    "## 토큰 보호",
    "",
    "`순현금` [배당수익률](https://example.com/positive) **역성장과 마진 압축 리스크** 순현금과 리스크",
  ].join("\n"));
  assert(html.includes("<code>순현금</code>"));
  assert(html.includes("배당수익률 <span>(https://example.com/positive)</span>"));
  assert(html.includes('<span style="color:#1a73e8;font-weight:700;">역성장과 마진 압축 리스크</span>'));
  assert(!html.includes('<code><span style="color:#d93025;font-weight:700;">순현금</span></code>'));
  assert(!html.includes('<span style="color:#d93025;font-weight:700;">배당수익률</span> <span>(https://example.com/positive)</span>'));
  assert(html.includes("순현금과 리스크"));
  assert(!html.includes('<span style="color:#d93025;font-weight:700;">순현금</span>과 <span style="color:#1a73e8;font-weight:700;">리스크</span>'));
}
{
  const tableMarkdown = [
    "# 제목",
    "",
    "## 표 자동 강조",
    "",
    "| 항목 | 내용 |",
    "| --- | --- |",
    "| 긍정 | 순현금과 배당수익률 |",
    "| 부정 | 역성장과 마진 압축 리스크 |",
  ].join("\n");
  const html = editorHtml(tableMarkdown);
  assert(html.includes('<span style="color:#d93025;font-weight:700;">순현금과 배당수익률</span>'));
  assert(html.includes('<span style="color:#1a73e8;font-weight:700;">역성장과 마진 압축 리스크</span>'));
  assert(editorBody(tableMarkdown).includes("긍정\t순현금과 배당수익률\n부정\t역성장과 마진 압축 리스크"));
}
{
  const text = "한글 clipboard UTF-8 검증";
  const payload = Buffer.from(text, "utf8").toString("base64");
  const decoded = new TextDecoder().decode(Uint8Array.from(Buffer.from(payload, "base64")));
  assert.strictEqual(decoded, text);
}

function makeCase(fixtureOverrides = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "kr-naver-publisher-test-"));
  const companyDir = path.join(root, "SOOP");
  const assetDir = path.join(companyDir, "assets");
  fs.mkdirSync(assetDir, { recursive: true });
  const pngBytes = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/l4kK3wAAAABJRU5ErkJggg==",
    "base64",
  );
  for (const fileName of [
    "SOOP-chart.png",
    "SOOP-chart-overlay.png",
    "SOOP-chart-momentum.png",
    "SOOP-chart-structure.png",
  ]) {
    fs.writeFileSync(path.join(assetDir, fileName), pngBytes);
  }
  const memo = path.join(companyDir, "memo.md");
  const post = path.join(companyDir, "naver-post.md");
  const manifest = path.join(companyDir, "naver-publish.json");
  const fixture = path.join(companyDir, "fixture.json");
  fs.writeFileSync(memo, [
    "# SOOP",
    "",
    "- 티커: 067160",
    "- 기준일: 2026-06-21",
    "",
    "## Summary",
    "",
    "**순현금과 배당수익률**은 긍정 요인입니다.",
    "",
    "## Decision Frame",
    "",
    "| 판단축 | 현재 판정 | 왜 중요한가 |",
    "| --- | --- | --- |",
    "| 성장 | 긍정 | 외부 고객 반복 판매 시 리레이팅 논리 |",
    "| 리스크 | 제한적 | 매출과 이익 기여는 제한적 |",
    "",
    "## Business and Thesis",
    "",
    "플랫폼 수익성과 비용 통제가 핵심입니다.",
    "",
    "## Chart and Positioning",
    "",
    "![SOOP main trend chart](assets/SOOP-chart.png)",
    "![SOOP overlay chart](assets/SOOP-chart-overlay.png)",
    "![SOOP momentum chart](assets/SOOP-chart-momentum.png)",
    "![SOOP structure chart](assets/SOOP-chart-structure.png)",
    "",
    "## Risks",
    "",
    "**별풍선 역성장과 마진 압축**은 부정 요인입니다.",
    "",
    "## Sources",
    "",
    "- Source: https://example.com/soop",
  ].join("\n"));
  fs.writeFileSync(fixture, `${JSON.stringify({ loggedIn: true, ...fixtureOverrides }, null, 2)}\n`);
  const converted = buildPost({ markdown: fs.readFileSync(memo, "utf8"), memoPath: memo });
  fs.writeFileSync(post, converted.postMarkdown);
  converted.manifest.post.markdownPath = post;
  writeJsonAtomic(manifest, converted.manifest);
  return { root, companyDir, memo, post, manifest, fixture };
}

{
  const test = makeCase();
  const prepared = prepare({ fixture: test.fixture }, test.manifest, readJson(test.manifest));
  assert(prepared.approvalToken);
  const preparedFixture = JSON.parse(fs.readFileSync(test.fixture, "utf8"));
  const preparedManifest = readJson(test.manifest);
  assert.strictEqual(preparedManifest.post.thumbnail.prompt, `${preparedManifest.post.title} 블로그 썸네일 만들어줘`);
  assert.strictEqual(preparedManifest.post.thumbnail.source, "gemini-web");
  assert.strictEqual(preparedManifest.post.thumbnail.status, "generated");
  assert(fs.existsSync(preparedManifest.post.thumbnail.absolutePath));
  assert.strictEqual(preparedManifest.post.thumbnail.sha256, readJson(test.manifest).post.thumbnail.sha256);
  assert.deepStrictEqual(preparedFixture.geminiPrompts, [preparedManifest.post.thumbnail.prompt]);
  assert.strictEqual(preparedFixture.representativeThumbnail.selected, true);
  assert.strictEqual(preparedFixture.editor.images, preparedManifest.post.images.length);
  assert(preparedFixture.editor.bodyHtml.includes("<h2 style="));
  assert(preparedFixture.editor.bodyHtml.includes("<table"));
  assert(preparedFixture.editor.body.includes("판단축\t현재 판정\t왜 중요한가"));
  assert(preparedFixture.editor.bodyHtml.includes("color:#d93025"));
  assert(preparedFixture.editor.body.includes("차트 분석"));
  assert(preparedFixture.editor.body.indexOf("차트 분석") < preparedFixture.editor.body.indexOf("투자 판단의 핵심 축"));
  assert(preparedFixture.editor.body.indexOf("차트 4.") < preparedFixture.editor.body.indexOf("투자 판단의 핵심 축"));
  assert(preparedFixture.editor.body.indexOf("차트 4.") < preparedFixture.editor.body.indexOf("판단축\t현재 판정\t왜 중요한가"));
  const published = publish({ fixture: test.fixture, token: prepared.approvalToken, "confirm-public": "yes" }, test.manifest, readJson(test.manifest));
  assert.strictEqual(published.status, "published");
  assert.throws(() => publish({ fixture: test.fixture, token: prepared.approvalToken, "confirm-public": "yes" }, test.manifest, readJson(test.manifest)), /already published/);
}

{
  const test = makeCase({ geminiAuthRequired: true });
  assert.throws(() => prepare({ fixture: test.fixture }, test.manifest, readJson(test.manifest)), /Gemini login expired|manual authentication/);
  assert.strictEqual(JSON.parse(fs.readFileSync(test.fixture, "utf8")).publicClicked, undefined);
}

{
  const test = makeCase();
  const prepared = prepare({ fixture: test.fixture }, test.manifest, readJson(test.manifest));
  const manifest = readJson(test.manifest);
  fs.unlinkSync(manifest.post.thumbnail.absolutePath);
  assert.throws(() => prepare({ fixture: test.fixture }, test.manifest, readJson(test.manifest)), /Thumbnail missing/);
  assert.throws(() => publish({ fixture: test.fixture, token: prepared.approvalToken, "confirm-public": "yes" }, test.manifest, readJson(test.manifest)), /Thumbnail missing/);
}

{
  const test = makeCase();
  const prepared = prepare({ fixture: test.fixture }, test.manifest, readJson(test.manifest));
  const manifest = readJson(test.manifest);
  fs.appendFileSync(manifest.post.thumbnail.absolutePath, "changed");
  assert.throws(() => prepare({ fixture: test.fixture }, test.manifest, readJson(test.manifest)), /Thumbnail changed after prepare/);
  assert.throws(() => publish({ fixture: test.fixture, token: prepared.approvalToken, "confirm-public": "yes" }, test.manifest, readJson(test.manifest)), /Thumbnail changed after prepare/);
}

{
  const test = makeCase({ thumbnailSelectionFails: true });
  assert.throws(() => prepare({ fixture: test.fixture }, test.manifest, readJson(test.manifest)), /representative thumbnail selection failed/i);
  assert.strictEqual(JSON.parse(fs.readFileSync(test.fixture, "utf8")).publicClicked, undefined);
}

{
  const test = makeCase({ clickTimeoutRoles: ["saveDraft", "publishOpen", "publishConfirm"] });
  const prepared = prepare({ fixture: test.fixture }, test.manifest, readJson(test.manifest));
  publish({ fixture: test.fixture, token: prepared.approvalToken, "confirm-public": "yes" }, test.manifest, readJson(test.manifest));
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(test.fixture, "utf8")).domClickFallbacks, ["saveDraft", "publishOpen", "saveDraft", "publishOpen", "publishOpen", "publishConfirm"]);
}

{
  const test = makeCase();
  const manifest = readJson(test.manifest);
  const markdown = fs.readFileSync(test.post, "utf8");
  const fixtureData = JSON.parse(fs.readFileSync(test.fixture, "utf8"));
  fixtureData.editor = { title: manifest.post.title, body: editorBody(markdown), images: 0, tags: [], category: null, saved: false };
  fs.writeFileSync(test.fixture, `${JSON.stringify(fixtureData, null, 2)}\n`);
  assert.doesNotThrow(() => prepare({ fixture: test.fixture }, test.manifest, manifest));
}

{
  const test = makeCase({ startupPopup: { buttons: ["불러오기", "닫기"] } });
  prepare({ fixture: test.fixture }, test.manifest, readJson(test.manifest));
  const fixture = JSON.parse(fs.readFileSync(test.fixture, "utf8"));
  assert.strictEqual(fixture.startupPopup.dismissed, true);
  assert.deepStrictEqual(fixture.popupClicks[0], { kind: "startup", role: "dismiss", label: "닫기" });
}

{
  const test = makeCase({ startupPopup: { buttons: ["이어쓰기", "새 글 쓰기"] } });
  prepare({ fixture: test.fixture }, test.manifest, readJson(test.manifest));
  const fixture = JSON.parse(fs.readFileSync(test.fixture, "utf8"));
  assert.strictEqual(fixture.startupPopup.dismissed, true);
  assert.deepStrictEqual(fixture.popupClicks[0], { kind: "startup", role: "dismiss", label: "새 글 쓰기" });
}

{
  const test = makeCase({ startupPopup: { buttons: ["불러오기", "이어쓰기 안 함"] } });
  prepare({ fixture: test.fixture }, test.manifest, readJson(test.manifest));
  const fixture = JSON.parse(fs.readFileSync(test.fixture, "utf8"));
  assert.strictEqual(fixture.startupPopup.dismissed, true);
  assert.deepStrictEqual(fixture.popupClicks[0], { kind: "startup", role: "dismiss", label: "이어쓰기 안 함" });
}

{
  const test = makeCase({
    startupPopup: { buttons: ["불러오기", "닫기"] },
    editor: { title: "", body: "", images: 0, tags: [], category: null, saved: false },
  });
  assert.doesNotThrow(() => prepare({ fixture: test.fixture }, test.manifest, readJson(test.manifest)));
}

{
  const test = makeCase({
    startupPopup: { buttons: ["불러오기", "닫기"] },
    editor: { title: "다른 임시글", body: "기존 본문", images: 0, tags: [], category: null, saved: false },
  });
  assert.throws(() => prepare({ fixture: test.fixture }, test.manifest, readJson(test.manifest)), /different draft content/);
  const fixture = JSON.parse(fs.readFileSync(test.fixture, "utf8"));
  assert.strictEqual(fixture.startupPopup.dismissed, true);
  assert.deepStrictEqual(fixture.popupClicks[0], { kind: "startup", role: "dismiss", label: "닫기" });
}

{
  const test = makeCase({ pastePopup: { buttons: ["취소", "기본 붙여넣기"] } });
  prepare({ fixture: test.fixture }, test.manifest, readJson(test.manifest));
  const fixture = JSON.parse(fs.readFileSync(test.fixture, "utf8"));
  assert.strictEqual(fixture.pastePopup.dismissed, true);
  assert.deepStrictEqual(fixture.popupClicks[0], { kind: "paste", role: "primary", label: "기본 붙여넣기" });
}

{
  const test = makeCase({ pastePopup: { buttons: ["닫기"] } });
  prepare({ fixture: test.fixture }, test.manifest, readJson(test.manifest));
  const fixture = JSON.parse(fs.readFileSync(test.fixture, "utf8"));
  assert.strictEqual(fixture.pastePopup.dismissed, true);
  assert.deepStrictEqual(fixture.popupClicks[0], { kind: "paste", role: "dismiss", label: "닫기" });
}

{
  const test = makeCase({ editor: { title: "다른 임시글", body: "기존 본문", images: 0, tags: [], category: null, saved: false } });
  assert.throws(() => prepare({ fixture: test.fixture }, test.manifest, readJson(test.manifest)), /different draft content/);
}

{
  const test = makeCase({ loggedIn: false });
  assert.throws(() => prepare({ fixture: test.fixture }, test.manifest, readJson(test.manifest)), /login expired/);
  assert.strictEqual(JSON.parse(fs.readFileSync(test.fixture)).publicClicked, undefined);
}

{
  const test = makeCase({ missingSelectors: ["body"] });
  assert.throws(() => prepare({ fixture: test.fixture }, test.manifest, readJson(test.manifest)), /selector unavailable: body/);
}

{
  const test = makeCase({ imageUploadFailures: [2] });
  assert.throws(() => prepare({ fixture: test.fixture }, test.manifest, readJson(test.manifest)), /upload failed/);
  assert.strictEqual(JSON.parse(fs.readFileSync(test.fixture)).publicClicked, undefined);
}

{
  const test = makeCase({ imageUploadNoInsert: [1, 2, 3, 4] });
  assert.throws(() => prepare({ fixture: test.fixture }, test.manifest, readJson(test.manifest)), /file input was processed but SmartEditor image nodes were not created/);
  assert.strictEqual(JSON.parse(fs.readFileSync(test.fixture)).publicClicked, undefined);
}

{
  const test = makeCase();
  const prepared = prepare({ fixture: test.fixture }, test.manifest, readJson(test.manifest));
  assert.throws(() => publish({ fixture: test.fixture, token: `${prepared.approvalToken}x`, "confirm-public": "yes" }, test.manifest, readJson(test.manifest)), /token does not match/);
  assert.strictEqual(JSON.parse(fs.readFileSync(test.fixture)).publicClicked, undefined);
}

{
  const test = makeCase();
  const prepared = prepare({ fixture: test.fixture }, test.manifest, readJson(test.manifest));
  fs.appendFileSync(test.memo, "\nsource changed\n");
  assert.throws(() => publish({ fixture: test.fixture, token: prepared.approvalToken, "confirm-public": "yes" }, test.manifest, readJson(test.manifest)), /Source memo changed/);
  assert.strictEqual(JSON.parse(fs.readFileSync(test.fixture)).publicClicked, undefined);
}

console.log("publisher fixture tests passed");
