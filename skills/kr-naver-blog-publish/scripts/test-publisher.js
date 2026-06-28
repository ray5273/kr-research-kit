#!/usr/bin/env node

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { buildPost } = require("./memo-to-post");
const { editorBody, editorHtml, expectedTableData, prepare, publish, renderExcelTableHtml, validateBlockFormatting } = require("./publisher");
const { readJson, sha256, writeJsonAtomic } = require("./lib");

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
  assert(html.includes('<p style="font-size:15px;font-weight:400;line-height:1.7;margin:0;color:#222;"><span style="font-size:15px;font-weight:400;line-height:1.7;color:#222;">첫 문단입니다.</span></p>'));
  assert(html.includes('<p style="font-size:15px;font-weight:400;line-height:1.7;margin:0;color:#222;"><span style="font-size:15px;font-weight:400;line-height:1.7;color:#222;">둘째 문단입니다.</span></p>'));
  assert(!html.includes("첫 문단입니다.<br>둘째 문단입니다."));
  assert(html.includes('style="font-size:15px;font-weight:400;line-height:1.7;color:#222;">- 첫 불릿</span></p>'));
  assert(html.includes('style="font-size:15px;font-weight:400;line-height:1.7;color:#222;">- 둘째 불릿</span></p>'));
  assert(!html.includes("• 첫 불릿"));
  assert(html.includes('style="font-size:15px;font-weight:400;line-height:1.7;color:#222;">1. 첫 번호</span></p>'));
  assert(html.includes('style="font-size:15px;font-weight:400;line-height:1.7;color:#222;">2. 둘째 번호</span></p>'));
  assert(html.includes('data-kr-naver-spacer="true" style="font-size:15px;font-weight:400;line-height:1.7;margin:0;color:#222;"'));
  assert.strictEqual((html.match(/data-kr-naver-spacer="true"/g) || []).length, 7);
}
{
  const html = editorHtml("## 이미지 뒤 제목\n\n- 일반 목록\n- **선택 강조**가 있는 목록");
  assert(html.includes('<h2 style="font-size:28px;font-weight:700;'));
  assert(html.includes('style="font-size:15px;font-weight:400;line-height:1.7;color:#222;">- 일반 목록'));
  assert(html.includes('style="font-size:15px;font-weight:400;line-height:1.7;color:#222;">- <strong>선택 강조</strong>가 있는 목록'));
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
  const html = editorHtml([
    "# 제목",
    "",
    "## 결론",
    "",
    "[red: 자사주 소각으로 하방이 보강됐다.]",
    "",
    "[blue: 환율 리스크가 마진을 압박할 수 있다.]",
    "",
    "[brown: 현재 스탠스는 중립 관찰이다.]",
    "",
    "**일반 강조** 는 색 없이 굵게만 표시된다.",
  ].join("\n"));
  assert(html.includes('<span style="color:#d93025;font-weight:700;">자사주 소각으로 하방이 보강됐다.</span>'));
  assert(html.includes('<span style="color:#1a73e8;font-weight:700;">환율 리스크가 마진을 압박할 수 있다.</span>'));
  assert(html.includes('<span style="color:#8a5a2b;font-weight:700;">현재 스탠스는 중립 관찰이다.</span>'));
  assert(html.includes("<strong>일반 강조</strong>"));
  assert(!html.includes("<strong>일반 강조</strong>는 색"));
  assert(html.includes("font-size:28px"));
}
{
  const html = editorHtml("# 제목\n\n## 결론\n\n순현금과 배당수익률\n\n역성장과 마진 압축 리스크");
  assert(!html.includes("color:#d93025"));
  assert(!html.includes("color:#1a73e8"));
  assert(html.includes("순현금과 배당수익률"));
  assert(html.includes("역성장과 마진 압축 리스크"));
}
{
  const html = editorHtml([
    "# 제목",
    "",
    "## 토큰 보호",
    "",
    "`순현금` [배당수익률](https://example.com/positive) [blue: 환율 리스크가 마진을 압박할 수 있다.] 순현금과 리스크",
  ].join("\n"));
  assert(html.includes("<code>순현금</code>"));
  assert(html.includes("배당수익률 <span>(https://example.com/positive)</span>"));
  assert(html.includes('<span style="color:#1a73e8;font-weight:700;">환율 리스크가 마진을 압박할 수 있다.</span>'));
  assert(html.includes("순현금과 리스크"));
  assert(!html.includes('<span style="color:#d93025;font-weight:700;">순현금</span>'));
  assert(!html.includes('<span style="color:#1a73e8;font-weight:700;">리스크</span>'));
}
{
  const tableMarkdown = [
    "# 제목",
    "",
    "## 표 색 마커",
    "",
    "| 항목 | 내용 |",
    "| --- | --- |",
    "| 긍정 | [red: 순현금과 배당수익률이 받쳐준다.] |",
    "| 부정 | [blue: 역성장과 마진 압축 리스크가 부각된다.] |",
    "| 평문 | 순현금과 배당수익률 |",
  ].join("\n");
  const html = editorHtml(tableMarkdown);
  assert(html.includes('<span style="color:#d93025;font-weight:700;">순현금과 배당수익률이 받쳐준다.</span>'));
  assert(html.includes('<span style="color:#1a73e8;font-weight:700;">역성장과 마진 압축 리스크가 부각된다.</span>'));
  assert(!html.includes('<span style="color:#d93025;font-weight:700;">순현금과 배당수익률</span>'));
  assert(editorBody(tableMarkdown).includes("긍정\t순현금과 배당수익률이 받쳐준다.\n부정\t역성장과 마진 압축 리스크가 부각된다.\n평문\t순현금과 배당수익률"));
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
    "[red: 순현금과 배당수익률이 받쳐주는 강한 하방이 있다.]",
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
    "[blue: 별풍선 역성장과 마진 압축이 단기 실적의 핵심 부담이다.]",
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

function makeDailyCase(fixtureOverrides = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "kr-naver-publisher-daily-test-"));
  const report = path.join(root, "daily-news-2026-06-28.md");
  const post = path.join(root, "naver-post-2026-06-28.md");
  const manifest = path.join(root, "naver-publish-2026-06-28.json");
  const fixture = path.join(root, "fixture.json");
  const markdown = [
    "# 한국 시장 데일리 뉴스 (2026-06-28)",
    "",
    "## 시장 주요 요약",
    "",
    "1. 코스피와 코스닥 시장은 반도체 업종 강세에 상승 마감했습니다.",
    "2. 환율 하락과 외국인 수급 개선이 시장 흐름을 보탰습니다.",
    "",
    "## 시장 주요 뉴스",
    "",
    "1. 코스피, 반도체 강세에 상승 마감",
    "https://news.example.com/market1",
    "",
    "2. 환율 하락과 외국인 수급 개선",
    "https://news.example.com/market2",
    "",
    "## 업종/테마별 흐름",
    "",
    "| 업종/테마 | 흐름 | 대표 뉴스 |",
    "| --- | --- | --- |",
    "| 반도체/AI | 1건 확인 | 삼성전자 HBM 증설 기대 |",
    "| 이차전지/전기차 | 특이 뉴스 제한적 | 특이 뉴스 제한적 |",
    "",
    "## 공식 공시/자료",
    "",
    "| 내용 | 링크 |",
    "| --- | --- |",
    "| KRX 시장 공지 | [원문](https://kind.krx.co.kr/example) |",
    "",
    "## 출처",
    "",
    "| 내용 | 링크 |",
    "| --- | --- |",
    "| 코스피, 반도체 강세에 상승 마감 | [원문](https://news.example.com/market1) |",
    "| 환율 하락과 외국인 수급 개선 | [원문](https://news.example.com/market2) |",
    "| KRX 시장 공지 | [원문](https://kind.krx.co.kr/example) |",
    "",
    "---",
    "",
    "기준일: 2026-06-28",
    "",
    "본 글은 공개된 뉴스와 공시성 자료를 바탕으로 작성한 개인 시장 정리이며, 특정 종목의 매수·매도를 권유하지 않습니다. 투자 판단과 그 결과에 대한 책임은 투자자 본인에게 있습니다.",
  ].join("\n");
  fs.writeFileSync(report, markdown);
  fs.writeFileSync(post, markdown);
  writeJsonAtomic(manifest, {
    schemaVersion: 1,
    contentType: "daily-market-news",
    status: "converted",
    source: {
      reportPath: report,
      reportSha256: sha256(markdown),
      asOfDate: "2026-06-28",
    },
    post: {
      company: "한국 시장",
      ticker: "",
      title: "2026-06-28 한국 증시 데일리: 반도체 / AI 흐름 체크",
      issue: "코스피, 반도체 강세에 상승 마감",
      category: null,
      tags: ["한국증시", "코스피", "코스닥", "시장뉴스", "20260628"],
      markdownPath: post,
      markdownSha256: sha256(markdown),
      images: [],
      linkCards: ["https://news.example.com/market1", "https://news.example.com/market2"],
      thumbnail: null,
      publicationDate: "2026-06-28",
    },
    automation: {
      scheduledPublishAllowed: true,
      duplicateScope: "daily-market-news",
      duplicateDate: "2026-06-28",
    },
    prepare: null,
    publish: null,
  });
  fs.writeFileSync(fixture, `${JSON.stringify({ loggedIn: true, ...fixtureOverrides }, null, 2)}\n`);
  return { root, report, post, manifest, fixture };
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
  if (preparedFixture.geminiPrompts) assert.deepStrictEqual(preparedFixture.geminiPrompts, [preparedManifest.post.thumbnail.prompt]);
  assert.strictEqual(preparedFixture.representativeThumbnail.uploaded, true);
  assert.strictEqual(preparedFixture.representativeThumbnail.setAsRepresentativeClicked, true);
  assert.strictEqual(preparedFixture.representativeThumbnail.selected, true);
  assert.strictEqual(preparedFixture.editor.images, preparedManifest.post.images.length);
  assert(preparedFixture.editor.bodyHtml.includes("<h2 style="));
  assert(preparedFixture.editor.bodyHtml.includes("<table"));
  assert(preparedFixture.editor.body.includes("판단축\t현재 판정\t왜 중요한가"));
  assert(preparedFixture.editor.body.includes("Codex (or Claude) × KrResearchKit · Crafted by ray5273"));
  assert(preparedFixture.editor.body.includes("https://github.com/ray5273/kr-research-kit"));
  assert(!preparedFixture.editor.body.includes("Stock Research Skill"));
  assert(!preparedFixture.editor.body.includes("https://github.com/ray5273/stock-analysis-skill"));
  assert(preparedFixture.editor.bodyHtml.includes('data-kr-naver-signature="true"'));
  assert(preparedFixture.editor.bodyHtml.includes("color:#d93025"));
  assert(preparedFixture.editor.bodyHtml.includes("color:#1a73e8"));
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
  const thumbnailPath = path.join(test.companyDir, "assets", "naver-thumbnail.png");
  if (fs.existsSync(thumbnailPath)) fs.unlinkSync(thumbnailPath);
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
  const test = makeCase({ thumbnailRepresentativeButtonMissing: true });
  assert.throws(() => prepare({ fixture: test.fixture }, test.manifest, readJson(test.manifest)), /representative.*button unavailable/i);
  const fixture = JSON.parse(fs.readFileSync(test.fixture, "utf8"));
  assert.strictEqual(fixture.representativeThumbnail.uploaded, true);
  assert.strictEqual(fixture.representativeThumbnail.setAsRepresentativeClicked, undefined);
  assert.strictEqual(fixture.publicClicked, undefined);
}

{
  const test = makeCase({ thumbnailSelectedMarkerMissing: true });
  assert.throws(() => prepare({ fixture: test.fixture }, test.manifest, readJson(test.manifest)), /selected marker was not detected/i);
  const fixture = JSON.parse(fs.readFileSync(test.fixture, "utf8"));
  assert.strictEqual(fixture.representativeThumbnail.uploaded, true);
  assert.strictEqual(fixture.representativeThumbnail.setAsRepresentativeClicked, true);
  assert.strictEqual(fixture.representativeThumbnail.selected, false);
  assert.strictEqual(fixture.publicClicked, undefined);
}

{
  const test = makeCase({ thumbnailUploadInsertsBodyImage: true });
  assert.throws(() => prepare({ fixture: test.fixture }, test.manifest, readJson(test.manifest)), /inserted an image into the editor body/i);
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
  const test = makeDailyCase();
  const prepared = prepare({ fixture: test.fixture, scheduled: "yes" }, test.manifest, readJson(test.manifest));
  assert(prepared.approvalToken);
  assert.strictEqual(JSON.parse(fs.readFileSync(test.fixture, "utf8")).linkCardPasteCalls, undefined);
  assert.strictEqual(JSON.parse(fs.readFileSync(test.fixture, "utf8")).linkCardEnterCalls, undefined);
  assert(JSON.parse(fs.readFileSync(test.fixture, "utf8")).editor.bodyHtml.includes("<table"));
  assert(JSON.parse(fs.readFileSync(test.fixture, "utf8")).editor.body.includes("내용\t링크"));
  const dailyBody = JSON.parse(fs.readFileSync(test.fixture, "utf8")).editor.body;
  assert(!dailyBody.includes("관심종목 뉴스"));
  assert(!dailyBody.includes("- 기준일"));
  const marketNewsBody = dailyBody.split("시장 주요 뉴스")[1].split("업종/테마별 흐름")[0];
  assert(marketNewsBody.indexOf("1. 코스피, 반도체 강세에 상승 마감") < marketNewsBody.indexOf("https://news.example.com/market1"));
  assert(marketNewsBody.indexOf("https://news.example.com/market1") < marketNewsBody.indexOf("2. 환율 하락과 외국인 수급 개선"));
  assert(marketNewsBody.indexOf("2. 환율 하락과 외국인 수급 개선") < marketNewsBody.indexOf("https://news.example.com/market2"));
  const published = publish({ fixture: test.fixture, scheduled: "yes", token: prepared.approvalToken, "confirm-public": "yes" }, test.manifest, readJson(test.manifest));
  assert.strictEqual(published.status, "published");
  assert.strictEqual(readJson(test.manifest).contentType, "daily-market-news");
  assert.strictEqual(JSON.parse(fs.readFileSync(test.fixture, "utf8")).publicClicked, true);
}

{
  const test = makeDailyCase();
  const duplicatePath = path.join(test.root, "already-published.json");
  writeJsonAtomic(duplicatePath, {
    schemaVersion: 1,
    contentType: "daily-market-news",
    status: "published",
    source: { reportPath: test.report, reportSha256: sha256(fs.readFileSync(test.report)), asOfDate: "2026-06-28" },
    post: { publicationDate: "2026-06-28" },
    automation: { duplicateDate: "2026-06-28" },
    publish: { url: "https://blog.naver.com/fixture/existing", publishedAt: "2026-06-28T00:00:00.000Z" },
  });
  assert.throws(() => prepare({ fixture: test.fixture, scheduled: "yes" }, test.manifest, readJson(test.manifest)), /Duplicate same-day/);
  assert.strictEqual(JSON.parse(fs.readFileSync(test.fixture, "utf8")).publicClicked, undefined);
}

{
  const test = makeCase();
  const prepared = prepare({ fixture: test.fixture }, test.manifest, readJson(test.manifest));
  assert.strictEqual(JSON.parse(fs.readFileSync(test.fixture, "utf8")).linkCardPasteCalls, undefined);
  assert.strictEqual(JSON.parse(fs.readFileSync(test.fixture, "utf8")).linkCardEnterCalls, undefined);
  publish({ fixture: test.fixture, token: prepared.approvalToken, "confirm-public": "yes" }, test.manifest, readJson(test.manifest));
  assert.strictEqual(JSON.parse(fs.readFileSync(test.fixture, "utf8")).linkCardPasteCalls, undefined);
}

{
  const test = makeCase();
  assert.throws(() => prepare({ fixture: test.fixture, scheduled: "yes" }, test.manifest, readJson(test.manifest)), /only allowed for daily market-news/);
}

{
  const test = makeCase();
  const prepared = prepare({ fixture: test.fixture }, test.manifest, readJson(test.manifest));
  fs.appendFileSync(test.memo, "\nsource changed\n");
  assert.throws(() => publish({ fixture: test.fixture, token: prepared.approvalToken, "confirm-public": "yes" }, test.manifest, readJson(test.manifest)), /Source document changed/);
  assert.strictEqual(JSON.parse(fs.readFileSync(test.fixture)).publicClicked, undefined);
}

console.log("publisher fixture tests passed");
