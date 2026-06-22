#!/usr/bin/env node

const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const {
  assert,
  contentFingerprint,
  fileSha256,
  normalizeText,
  readJson,
  sha256,
  writeJsonAtomic,
} = require("./lib");

const TOKEN_TTL_MS = 30 * 60 * 1000;
const WRITE_URL = "https://blog.naver.com/GoBlogWrite.naver";
const SELECTORS = {
  title: [
    ".se-documentTitle .se-text-paragraph",
    "textarea.se_textarea",
    "textarea[placeholder*='제목']",
    "[contenteditable='true'][data-placeholder*='제목']",
  ],
  body: [
    ".se-component.se-text .se-text-paragraph",
    ".se-component-content [contenteditable='true']",
    ".se-section-text",
    "[contenteditable='true'][data-placeholder*='본문']",
  ],
  imageInput: ["input[data-kr-naver-image-input]", "input[type='file'][accept*='image']", "input[type='file'][multiple]"],
  saveDraft: ["button[class*='save_btn']", "button[class*='SaveButton']", "button[data-click-area*='save']"],
  publishOpen: ["button[class*='publish_btn']", "button[class*='PublishButton']", "button[data-click-area*='publish']"],
  publishConfirm: ["button[class*='confirm_btn']", "button[class*='ConfirmButton']", "button[data-click-area*='confirm']"],
  tags: ["input[placeholder*='태그']", "input[class*='tag_input']"],
  category: ["select[class*='category']", "select[name*='category']"],
};

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 2; i < argv.length; i += 1) {
    const value = argv[i];
    if (!value.startsWith("--")) { args._.push(value); continue; }
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) args[value.slice(2)] = true;
    else { args[value.slice(2)] = next; i += 1; }
  }
  return args;
}

function editorBody(markdown) {
  return normalizeText(markdown
    .replace(/^#\s+.+?[ \t]*$/m, "")
    .replace(/^!\[[^\]]*]\([^)]+\.png(?:\?[^)]*)?\)\s*$/gim, "")
    .replace(/^#{2,6}\s+(.+?)[ \t]*$/gm, "$1")
    .replace(/^---+[ \t]*$/gm, "────────")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)]\((https?:\/\/[^)]+)\)/g, "$1 ($2)"));
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function inlineHtml(value) {
  return escapeHtml(value)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\[([^\]]+)]\((https?:\/\/[^)]+)\)/g, "$1 <span>($2)</span>");
}

function editorHtml(markdown) {
  const lines = markdown
    .replace(/^#\s+.+?[ \t]*$/m, "")
    .replace(/^!\[[^\]]*]\([^)]+\.png(?:\?[^)]*)?\)\s*$/gim, "")
    .split(/\r?\n/);
  const blocks = [];
  let paragraph = [];
  const flushParagraph = () => {
    if (!paragraph.length) return;
    blocks.push(`<p>${paragraph.map(inlineHtml).join("<br>")}</p>`);
    paragraph = [];
  };
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) { flushParagraph(); continue; }
    const h2 = trimmed.match(/^##\s+(.+?)\s*$/);
    if (h2) {
      flushParagraph();
      if (blocks.length) blocks.push("<hr>");
      blocks.push(`<h2><strong>${inlineHtml(h2[1])}</strong></h2>`);
      continue;
    }
    const h3 = trimmed.match(/^###\s+(.+?)\s*$/);
    if (h3) {
      flushParagraph();
      blocks.push(`<h3><strong>${inlineHtml(h3[1])}</strong></h3>`);
      continue;
    }
    if (/^---+\s*$/.test(trimmed)) {
      flushParagraph();
      blocks.push("<hr>");
      continue;
    }
    paragraph.push(line);
  }
  flushParagraph();
  return `<div>${blocks.join("\n")}</div>`;
}

function isBlankOrPlaceholder(value) {
  const text = normalizeText(value);
  return !text || /^(제목|본문|내용을 입력하세요|내용을 입력해 주세요|글을 입력하세요)$/.test(text);
}

function assertWritableDraft(inspected, manifest, expectedBody) {
  const title = normalizeText(inspected.title);
  const body = normalizeText(inspected.body);
  const expectedTitle = normalizeText(manifest.post.title);
  const expected = normalizeText(expectedBody);
  const titleOk = isBlankOrPlaceholder(title) || title === expectedTitle;
  const bodyOk = isBlankOrPlaceholder(body) || body === expected;
  assert(titleOk && bodyOk, "Editor already contains different draft content; open a new blank write screen before prepare");
}

function verifyArtifacts(manifest) {
  assert(manifest.schemaVersion === 1, "Unsupported manifest schemaVersion");
  assert(manifest.status !== "published", "Manifest is already published; duplicate publish blocked");
  assert(fs.existsSync(manifest.source.memoPath), `Source memo missing: ${manifest.source.memoPath}`);
  assert(fileSha256(manifest.source.memoPath) === manifest.source.memoSha256, "Source memo changed after conversion; reconvert before preparing");
  assert(fs.existsSync(manifest.post.markdownPath), `Post markdown missing: ${manifest.post.markdownPath}`);
  assert(fileSha256(manifest.post.markdownPath) === manifest.post.markdownSha256, "Post markdown changed after conversion; reconvert before preparing");
  for (const image of manifest.post.images) {
    assert(fs.existsSync(image.absolutePath), `Image missing: ${image.relativePath}`);
    assert(fileSha256(image.absolutePath) === image.sha256, `Image changed after conversion: ${image.relativePath}`);
  }
}

class FixtureDriver {
  constructor(filePath) {
    this.filePath = filePath;
    this.fixture = readJson(filePath);
    this.fixture.editor ||= { title: "", body: "", images: 0, tags: [], category: null, saved: false };
  }
  persist() { writeJsonAtomic(this.filePath, this.fixture); }
  openEditor() {}
  openPreparedDraft() {}
  isLoggedIn() { return this.fixture.loggedIn !== false; }
  setTitle(value) { this.requireSelector("title"); this.fixture.editor.title = value; this.persist(); }
  setBody(value, html) { this.requireSelector("body"); this.fixture.editor.body = value; this.fixture.editor.bodyHtml = html; this.persist(); }
  uploadImage(filePath, index) {
    this.requireSelector("imageInput");
    if ((this.fixture.imageUploadFailures || []).includes(index)) throw new Error(`Fixture image upload failed at index ${index}`);
    assert(fs.existsSync(filePath), `Fixture upload path missing: ${filePath}`);
    if ((this.fixture.imageUploadNoInsert || []).includes(index)) {
      this.fixture.editor.fileInputProcessed = true;
      this.persist();
      return;
    }
    this.fixture.editor.images += 1; this.persist();
  }
  setCategory(value) { this.requireSelector("category"); this.fixture.editor.category = value; this.persist(); }
  setTags(values) { this.requireSelector("tags"); this.fixture.editor.tags = values; this.persist(); }
  recordClick(role) {
    this.requireSelector(role);
    if ((this.fixture.clickTimeoutRoles || []).includes(role)) {
      this.fixture.domClickFallbacks ||= [];
      this.fixture.domClickFallbacks.push(role);
    }
    this.persist();
  }
  saveDraft() { this.recordClick("saveDraft"); this.fixture.editor.saved = true; this.persist(); }
  inspect() { return { title: this.fixture.editor.title, body: this.fixture.editor.body, imageCount: this.fixture.editor.images }; }
  screenshot(filePath) { fs.writeFileSync(filePath, Buffer.from("fixture preview\n", "utf8")); }
  editorUrl() { return this.fixture.editorUrl || "https://blog.naver.com/GoBlogWrite.naver?fixtureDraft=1"; }
  openPublishLayer() { this.recordClick("publishOpen"); this.fixture.publishLayerOpen = true; this.persist(); }
  publish() {
    this.recordClick("publishConfirm");
    assert(this.fixture.publishLayerOpen, "Fixture publish layer was not opened");
    this.fixture.publicClicked = true;
    this.fixture.publishedUrl ||= "https://blog.naver.com/fixture/123456789";
    this.persist();
  }
  publishedUrl() { return this.fixture.publishedUrl; }
  requireSelector(name) {
    if ((this.fixture.missingSelectors || []).includes(name)) throw new Error(`Required selector unavailable: ${name}`);
  }
}

class GstackDriver {
  constructor() {
    const browse = require("../../kr-naver-browse/scripts/browse-naver.js");
    this.bin = browse.resolveBrowseBinary();
    this.env = {
      ...process.env,
      CHROMIUM_PROFILE: process.env.NAVER_PUBLISH_PROFILE || path.join(os.homedir(), ".gstack", "kr-naver-blog-publish", "chromium-profile"),
    };
  }
  run(args, timeout = 30_000) {
    const commandArgs = args.includes("--headed") ? args : ["--headed", ...args];
    return execFileSync(this.bin, commandArgs, { encoding: "utf8", env: this.env, timeout, maxBuffer: 10 * 1024 * 1024 }).trim();
  }
  js(expression) { return this.run(["js", expression]); }
  enterEditorFrame() {
    const hasMainFrame = /true/i.test(this.js("Boolean(document.querySelector('#mainFrame'))"));
    if (hasMainFrame) {
      this.run(["frame", "#mainFrame"]);
      this.run(["wait", "--load"], 15_000);
    }
  }
  gotoAllowRedirectAbort(url) {
    try {
      this.run(["goto", url]);
    } catch (error) {
      if (!/net::ERR_ABORTED/.test(error.message)) throw error;
    }
  }
  findSelector(name) {
    const candidates = SELECTORS[name];
    const expression = `(() => { const xs=${JSON.stringify(candidates)}; const selector=xs.find(x => document.querySelector(x)); if (!selector) return ''; const e=document.querySelector(selector); if (e.id) return '#' + CSS.escape(e.id); if (document.querySelectorAll(selector).length === 1) return selector; e.setAttribute('data-kr-naver-selector', ${JSON.stringify(name)}); return '[data-kr-naver-selector=${name}]'; })()`;
    const found = this.js(expression).replace(/^"|"$/g, "");
    if (!found) {
      const diagnostic = this.js(`JSON.stringify([...document.querySelectorAll('textarea,input,[contenteditable],[class*=title],[class*=document]')].slice(0,80).map(e => ({tag:e.tagName,id:e.id,class:String(e.className || ''),placeholder:e.getAttribute('placeholder'),contenteditable:e.getAttribute('contenteditable'),role:e.getAttribute('role')})))`);
      throw new Error(`Required Naver SmartEditor selector unavailable: ${name}\nCandidates: ${diagnostic}`);
    }
    return found;
  }
  markButtonByText(role, labels) {
    const expression = `(() => { const labels=${JSON.stringify(labels)}; const e=[...document.querySelectorAll('button')].find(x => labels.includes((x.innerText || x.textContent || '').trim())); if (!e) return ''; e.setAttribute('data-kr-naver-role', ${JSON.stringify(role)}); return 'button[data-kr-naver-role=${role}]'; })()`;
    return this.js(expression).replace(/^"|"$/g, "");
  }
  closeBlockingLayers() {
    this.js(`(() => {
      const labels = ['취소', '닫기', '나중에', '확인'];
      for (const button of [...document.querySelectorAll('button,a')]) {
        const text = (button.innerText || button.textContent || '').trim();
        const visible = button.offsetParent !== null || getComputedStyle(button).position === 'fixed';
        if (visible && labels.includes(text)) {
          const layer = button.closest('[role=dialog], .layer, .se-popup, .se-help-panel, .se-material-panel');
          if (layer) { button.click(); return true; }
        }
      }
      return false;
    })()`);
  }
  focusEditable(selector) {
    const result = this.js(`(() => {
      const e = document.querySelector(${JSON.stringify(selector)});
      if (!e) return 'missing';
      e.scrollIntoView({ block: 'center', inline: 'nearest' });
      e.focus();
      const doc = e.ownerDocument;
      const win = doc.defaultView;
      if (e.isContentEditable) {
        const range = doc.createRange();
        range.selectNodeContents(e);
        const selection = win.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
      } else if (typeof e.select === 'function') {
        e.select();
      }
      return 'focused';
    })()`);
    assert(/focused/i.test(result), `Unable to focus SmartEditor target: ${selector}`);
  }
  clickOrDomClick(selector, timeout = 30_000) {
    try {
      this.run(["click", selector], timeout);
    } catch (error) {
      const clicked = this.js(`(() => {
        const e = document.querySelector(${JSON.stringify(selector)});
        if (!e) return 'missing';
        e.scrollIntoView({ block: 'center', inline: 'nearest' });
        e.click();
        return 'dom-clicked';
      })()`);
      assert(/dom-clicked/i.test(clicked), `Unable to click ${selector}: ${error.message}`);
    }
  }
  replaceEditorText(selector, plainText, html) {
    this.focusEditable(selector);
    const plainBase64 = Buffer.from(plainText, "utf8").toString("base64");
    const htmlBase64 = Buffer.from(html || escapeHtml(plainText), "utf8").toString("base64");
    const result = this.js(`(() => {
      const decode = value => new TextDecoder().decode(Uint8Array.from(atob(value), c => c.charCodeAt(0)));
      const plain = decode(${JSON.stringify(plainBase64)});
      const html = decode(${JSON.stringify(htmlBase64)});
      try {
        if (typeof ClipboardItem === 'undefined' || !navigator.clipboard.write) return 'clipboard-error:ClipboardItem unavailable';
        const item = new ClipboardItem({
          'text/plain': new Blob([plain], { type: 'text/plain' }),
          'text/html': new Blob([html], { type: 'text/html' })
        });
        return navigator.clipboard.write([item]).then(() => 'clipboard-ok').catch(error => 'clipboard-error:' + error.message);
      } catch (error) {
        return 'clipboard-error:' + error.message;
      }
    })()`);
    if (!/clipboard-ok/i.test(result)) {
      const fallback = this.js(`navigator.clipboard.writeText(${JSON.stringify(plainText)}).then(() => 'clipboard-ok').catch(error => 'clipboard-error:' + error.message)`);
      assert(/clipboard-ok/i.test(fallback), `Browser clipboard rejected text insertion for ${selector}: ${result}; fallback: ${fallback}`);
    }
    this.run(["press", process.platform === "darwin" ? "Meta+V" : "Control+V"], 60_000);
  }
  openEditor() { this.run(["frame", "main"]); this.gotoAllowRedirectAbort(process.env.NAVER_BLOG_WRITE_URL || WRITE_URL); this.run(["wait", "--load"], 15_000); this.enterEditorFrame(); }
  openPreparedDraft(url) { assert(url, "Prepared draft URL is missing"); this.run(["frame", "main"]); this.gotoAllowRedirectAbort(url); this.run(["wait", "--load"], 15_000); this.enterEditorFrame(); }
  isLoggedIn() {
    const url = this.js("location.href");
    const text = this.run(["text"]);
    return !/nid\.naver\.com|captcha|자동입력 방지|로그인이 필요|로그인해 주세요/i.test(`${url}\n${text.slice(0, 3000)}`);
  }
  setTitle(value) { const selector = this.findSelector("title"); this.focusEditable(selector); this.replaceEditorText(selector, value, escapeHtml(value)); }
  setBody(value, html) { const selector = this.findSelector("body"); this.focusEditable(selector); this.replaceEditorText(selector, value, html); }
  uploadImage(filePath) {
    let input = this.js(`(() => { const xs=${JSON.stringify(SELECTORS.imageInput)}; return xs.find(x => document.querySelector(x)) || ''; })()`).replace(/^"|"$/g, "");
    if (!input) {
      assert(/true/i.test(this.js("Boolean(document.querySelector('.se-image-toolbar-button'))")), "Required Naver SmartEditor image button unavailable");
      this.js(`(() => { const original=HTMLInputElement.prototype.click; HTMLInputElement.prototype.click=function() { if (this.type === 'file') { this.setAttribute('data-kr-naver-image-input', 'true'); document.body.appendChild(this); HTMLInputElement.prototype.click=original; return; } return original.call(this); }; return true; })()`);
      this.clickOrDomClick(".se-image-toolbar-button");
      input = this.findSelector("imageInput");
    }
    this.run(["upload", input, filePath], 60_000);
  }
  setCategory(value) { this.run(["select", this.findSelector("category"), value]); }
  setTags(values) { this.run(["fill", this.findSelector("tags"), values.join(",")]); }
  saveDraft() {
    const selector = this.markButtonByText("saveDraft", ["저장"]) || this.findSelector("saveDraft");
    this.clickOrDomClick(selector); this.run(["wait", "--networkidle"], 20_000);
  }
  readElement(selector) {
    return this.js(`(() => { const e=document.querySelector(${JSON.stringify(selector)}); return e ? (e.value ?? e.innerText ?? e.textContent ?? '') : ''; })()`).replace(/^"|"$/g, "");
  }
  inspect() {
    const title = this.readElement(this.findSelector("title"));
    const bodySelector = this.findSelector("body");
    const body = this.readElement(bodySelector);
    const imageCount = Number(this.js(`document.querySelectorAll('.se-main-container .se-module-image img, .se-content .se-image-resource').length`)) || 0;
    return { title, body, imageCount };
  }
  screenshot(filePath) { this.run(["screenshot", filePath], 60_000); }
  editorUrl() { return this.js("location.href").replace(/^"|"$/g, ""); }
  openPublishLayer() {
    const selector = this.markButtonByText("publishOpen", ["발행"]) || this.findSelector("publishOpen");
    this.clickOrDomClick(selector);
  }
  publish() {
    const selector = this.markButtonByText("publishConfirm", ["발행"]) || this.findSelector("publishConfirm");
    this.clickOrDomClick(selector); this.run(["wait", "--networkidle"], 30_000);
  }
  publishedUrl() { return this.js("location.href").replace(/^"|"$/g, ""); }
}

function createDriver(args) { return args.fixture ? new FixtureDriver(path.resolve(args.fixture)) : new GstackDriver(); }

function validateEditor(inspected, manifest, expectedBody) {
  assert(normalizeText(inspected.title) === normalizeText(manifest.post.title), "Editor title does not match manifest");
  assert(normalizeText(inspected.body) === normalizeText(expectedBody), "Editor body does not match generated post");
  assert(Number(inspected.imageCount) === manifest.post.images.length, `Editor image count mismatch: expected ${manifest.post.images.length}, got ${inspected.imageCount}; file input was processed but SmartEditor image nodes were not created`);
  assert(/(?:^|\n)출처(?:\n|$)/.test(expectedBody), "Generated post has no Sources section");
  assert(expectedBody.includes("매수·매도를 권유하지 않습니다"), "Generated post has no investment disclaimer");
  return contentFingerprint({ title: inspected.title, body: inspected.body, imageCount: inspected.imageCount });
}

function prepare(args, manifestPath, manifest) {
  verifyArtifacts(manifest);
  const driver = createDriver(args);
  const markdown = fs.readFileSync(manifest.post.markdownPath, "utf8");
  const body = editorBody(markdown);
  const html = editorHtml(markdown);
  driver.openEditor();
  assert(driver.isLoggedIn(), "Naver login expired, CAPTCHA detected, or manual authentication is required; public publish was not attempted");
  if (typeof driver.closeBlockingLayers === "function") driver.closeBlockingLayers();
  assertWritableDraft(driver.inspect(), manifest, body);
  driver.setTitle(manifest.post.title);
  driver.setBody(body, html);
  for (let i = 0; i < manifest.post.images.length; i += 1) driver.uploadImage(manifest.post.images[i].absolutePath, i + 1);
  driver.saveDraft();
  const editorUrl = driver.editorUrl();
  driver.openPublishLayer();
  if (manifest.post.category) driver.setCategory(manifest.post.category);
  driver.setTags(manifest.post.tags);
  const inspected = driver.inspect();
  const fingerprint = validateEditor(inspected, manifest, body);
  const screenshotPath = path.resolve(args.screenshot || path.join(path.dirname(manifest.post.markdownPath), "naver-preview.png"));
  driver.screenshot(screenshotPath);
  const token = crypto.randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString();
  manifest.status = "prepared";
  manifest.prepare = {
    preparedAt: new Date().toISOString(),
    expiresAt,
    screenshotPath,
    editorUrl,
    contentFingerprint: fingerprint,
    approvalTokenHash: sha256(`${token}:${manifest.source.memoSha256}:${manifest.post.markdownSha256}:${fingerprint}`),
    validation: { title: true, body: true, imageCount: true, sources: true, disclaimer: true },
  };
  writeJsonAtomic(manifestPath, manifest);
  return { status: "prepared", manifestPath, screenshotPath, approvalToken: token, expiresAt };
}

function publish(args, manifestPath, manifest) {
  assert(manifest.status !== "published", "Manifest is already published; duplicate publish blocked");
  assert(manifest.status === "prepared" && manifest.prepare, "Prepare must complete before publish");
  assert(args.token, "Publish requires --token from the latest prepare result");
  assert(args["confirm-public"] === "yes", "Publish requires --confirm-public yes after explicit user approval");
  assert(Date.now() <= Date.parse(manifest.prepare.expiresAt), "Approval token expired; run prepare again");
  verifyArtifacts(manifest);
  const expectedHash = sha256(`${args.token}:${manifest.source.memoSha256}:${manifest.post.markdownSha256}:${manifest.prepare.contentFingerprint}`);
  const actual = Buffer.from(expectedHash, "hex");
  const stored = Buffer.from(manifest.prepare.approvalTokenHash, "hex");
  assert(actual.length === stored.length && crypto.timingSafeEqual(actual, stored), "Approval token does not match the prepared draft");
  const driver = createDriver(args);
  driver.openPreparedDraft(manifest.prepare.editorUrl);
  assert(driver.isLoggedIn(), "Naver login expired or CAPTCHA detected; public publish was not attempted");
  const markdown = fs.readFileSync(manifest.post.markdownPath, "utf8");
  const inspected = driver.inspect();
  const fingerprint = validateEditor(inspected, manifest, editorBody(markdown));
  assert(fingerprint === manifest.prepare.contentFingerprint, "Editor content changed after prepare; public publish was not attempted");
  driver.openPublishLayer();
  driver.publish();
  const url = driver.publishedUrl();
  assert(/^https:\/\/blog\.naver\.com\//.test(url), `Unexpected published URL: ${url}`);
  manifest.status = "published";
  manifest.publish = { publishedAt: new Date().toISOString(), url, result: "published" };
  manifest.prepare.approvalTokenHash = null;
  writeJsonAtomic(manifestPath, manifest);
  return { status: "published", url, publishedAt: manifest.publish.publishedAt };
}

function main() {
  const args = parseArgs(process.argv);
  const action = args._[0];
  assert(action === "prepare" || action === "publish", "Usage: publisher.js <prepare|publish> --manifest <json> [--fixture <json>] [--token <token> --confirm-public yes]");
  assert(args.manifest, "--manifest is required");
  const manifestPath = path.resolve(args.manifest);
  const manifest = readJson(manifestPath);
  const result = action === "prepare" ? prepare(args, manifestPath, manifest) : publish(args, manifestPath, manifest);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (require.main === module) {
  try { main(); } catch (error) { console.error(error.message); process.exit(1); }
}

module.exports = { FixtureDriver, editorBody, editorHtml, prepare, publish, validateEditor, verifyArtifacts };
