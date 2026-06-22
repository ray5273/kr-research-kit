#!/usr/bin/env node

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { buildPost } = require("./memo-to-post");
const { editorBody, editorHtml, prepare, publish } = require("./publisher");
const { readJson, writeJsonAtomic } = require("./lib");
const sourceDir = path.resolve(__dirname, "../../../analysis-example/kr/SOOP");

assert(!editorBody("# 제목\n\n## 결론\n\n**강조**\n\n![차트](chart.png)").includes("#"));
assert(!editorBody("# 제목\n\n본문").includes("제목"));
assert(editorBody("# 제목\n\n## 결론\n\n**강조**").includes("결론\n\n강조"));
{
  const html = editorHtml("# 제목\n\n## 결론\n\n본문\n다음 줄\n\n### 근거\n\n**강조**\n\n---\n\n![차트](chart.png)");
  assert(html.includes("<hr>"));
  assert(html.includes("<h2><strong>결론</strong></h2>"));
  assert(html.includes("<h3><strong>근거</strong></h3>"));
  assert(html.includes("<strong>강조</strong>"));
  assert(html.includes("본문<br>다음 줄"));
  assert(!html.includes("chart.png"));
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
  fs.cpSync(sourceDir, companyDir, { recursive: true });
  const memo = path.join(companyDir, "memo.md");
  const post = path.join(companyDir, "naver-post.md");
  const manifest = path.join(companyDir, "naver-publish.json");
  const fixture = path.join(companyDir, "fixture.json");
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
  assert(preparedFixture.editor.bodyHtml.includes("<h2><strong>"));
  const published = publish({ fixture: test.fixture, token: prepared.approvalToken, "confirm-public": "yes" }, test.manifest, readJson(test.manifest));
  assert.strictEqual(published.status, "published");
  assert.throws(() => publish({ fixture: test.fixture, token: prepared.approvalToken, "confirm-public": "yes" }, test.manifest, readJson(test.manifest)), /already published/);
}

{
  const test = makeCase({ clickTimeoutRoles: ["saveDraft", "publishOpen", "publishConfirm"] });
  const prepared = prepare({ fixture: test.fixture }, test.manifest, readJson(test.manifest));
  publish({ fixture: test.fixture, token: prepared.approvalToken, "confirm-public": "yes" }, test.manifest, readJson(test.manifest));
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(test.fixture, "utf8")).domClickFallbacks, ["saveDraft", "publishOpen", "publishOpen", "publishConfirm"]);
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
