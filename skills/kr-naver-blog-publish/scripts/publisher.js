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
const {
  extractMarkdownTables,
  markdownTableToTsv,
  parseMarkdownTableBlock,
} = require("./memo-to-post");

const TOKEN_TTL_MS = 30 * 60 * 1000;
const WRITE_URL = "https://blog.naver.com/GoBlogWrite.naver";
const GEMINI_URL = "https://gemini.google.com/app";
const PUBLISH_RUNTIME_DIR = process.env.NAVER_PUBLISH_RUNTIME_DIR || path.join(os.homedir(), ".gstack", "kr-naver-blog-publish");
const PUBLISH_LOCK_DIR = path.join(PUBLISH_RUNTIME_DIR, "publisher.lock");
const PUBLISH_AUDIT_LOG = path.join(PUBLISH_RUNTIME_DIR, "publisher-audit.jsonl");
const DEFAULT_BROWSE_STATE_FILE = path.join(PUBLISH_RUNTIME_DIR, "browse.json");
const PUBLICATION_VERIFY_TIMEOUT_MS = 120_000;

function nextKstBusinessSchedule(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" })
    .formatToParts(now)
    .reduce((out, item) => ({ ...out, [item.type]: item.value }), {});
  const base = new Date(`${parts.year}-${parts.month}-${parts.day}T00:00:00Z`);
  do { base.setUTCDate(base.getUTCDate() + 1); } while ([0, 6].includes(base.getUTCDay()));
  return { timezone: "Asia/Seoul", date: base.toISOString().slice(0, 10), time: "08:00" };
}

function scheduledPublication(manifest) {
  const configured = manifest.automation?.schedule || {};
  const fallback = nextKstBusinessSchedule();
  const date = configured.date || fallback.date;
  const time = configured.time || "08:00";
  assert(configured.timezone === "Asia/Seoul" || !configured.timezone, "Scheduled daily publication must use Asia/Seoul");
  assert(/^\d{4}-\d{2}-\d{2}$/.test(date) && /^\d{2}:\d{2}$/.test(time), "Scheduled publication date/time is invalid");
  return { timezone: "Asia/Seoul", date, time };
}
const SELECTORS = {
  title: [
    ".se-title-text",
    ".se-title-text [contenteditable='true']",
    ".se-documentTitle [contenteditable='true']",
    ".se-documentTitle textarea",
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
    "[contenteditable='true']",
  ],
  imageInput: ["input[data-kr-naver-image-input]", "input[type='file'][accept*='image']", "input[type='file'][multiple]"],
  saveDraft: ["button[class*='save_btn']", "button[class*='SaveButton']", "button[data-click-area*='save']"],
  publishOpen: ["button[class*='publish_btn']", "button[class*='PublishButton']", "button[data-click-area*='publish']"],
  publishConfirm: ["button[class*='confirm_btn']", "button[class*='ConfirmButton']", "button[data-click-area*='confirm']"],
  tags: ["input[placeholder*='태그']", "input[class*='tag_input']"],
  category: ["select[class*='category']", "select[name*='category']"],
  representativeThumbnail: [
    "input[type='file'][accept*='image']",
    "button[class*='thumbnail']",
    "button[class*='represent']",
    "button[aria-label*='대표']",
    "button[title*='대표']",
  ],
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

function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
}

function parseLegacyProfileDaemons(processList, profilePath, dedicatedStateFile) {
  const profile = path.resolve(profilePath);
  const dedicated = path.resolve(dedicatedStateFile);
  const results = [];
  for (const line of String(processList || "").split(/\r?\n/)) {
    const match = line.match(/^\s*(\d+)\s+(\d+)\s+([\s\S]+)$/);
    if (!match) continue;
    const [, pidText, ppidText, command] = match;
    if (!/gstack\/browse\/src\/(?:server|terminal-agent)\.ts|browse\/src\/(?:server|terminal-agent)\.ts/.test(command)) continue;
    const profileMatch = command.match(/(?:^|\s)CHROMIUM_PROFILE=([^\s]+)/);
    const stateMatch = command.match(/(?:^|\s)BROWSE_STATE_FILE=([^\s]+)/);
    if (!profileMatch || !stateMatch) continue;
    if (path.resolve(profileMatch[1]) !== profile) continue;
    const stateFile = path.resolve(stateMatch[1]);
    if (stateFile === dedicated) continue;
    results.push({ pid: Number(pidText), ppid: Number(ppidText), stateFile, command: command.slice(0, 500) });
  }
  return [...new Map(results.map(item => [item.pid, item])).values()];
}

function findLegacyProfileDaemons(profilePath, dedicatedStateFile) {
  if (process.platform === "win32") return [];
  let processList = "";
  try {
    processList = execFileSync("ps", ["eww", "-axo", "pid=,ppid=,command="], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 10_000,
      maxBuffer: 20 * 1024 * 1024,
    });
  } catch {
    return [];
  }
  return parseLegacyProfileDaemons(processList, profilePath, dedicatedStateFile).filter(item => isProcessAlive(item.pid));
}

function browserStartupRecoveryGuide() {
  return [
    "The dedicated Naver gstack browser did not start.",
    "After confirming that no other Naver publishing task is active, stop the stale dedicated session with:",
    "node skills/kr-naver-blog-publish/scripts/publisher.js cleanup-browser --confirm-stale-profile yes --force-dedicated-session yes",
    "Then retry the publishing action once. This command closes only the dedicated Naver publishing browser session; do not run it while another task is using that profile.",
  ].join("\\n");
}

function writeAudit(event, details = {}) {
  fs.mkdirSync(PUBLISH_RUNTIME_DIR, { recursive: true });
  const safeDetails = Object.fromEntries(Object.entries(details).filter(([key]) => !/token|cookie|password/i.test(key)));
  fs.appendFileSync(PUBLISH_AUDIT_LOG, `${JSON.stringify({ at: new Date().toISOString(), pid: process.pid, event, ...safeDetails })}\n`, "utf8");
}

function acquirePublisherLock(action, manifestPath) {
  fs.mkdirSync(PUBLISH_RUNTIME_DIR, { recursive: true });
  const acquire = () => {
    fs.mkdirSync(PUBLISH_LOCK_DIR);
    fs.writeFileSync(path.join(PUBLISH_LOCK_DIR, "owner.json"), `${JSON.stringify({ pid: process.pid, action, manifestPath, startedAt: new Date().toISOString() }, null, 2)}\n`, "utf8");
  };
  try {
    acquire();
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    let owner = null;
    try { owner = readJson(path.join(PUBLISH_LOCK_DIR, "owner.json")); } catch {}
    if (owner?.pid && isProcessAlive(Number(owner.pid))) {
      throw new Error(`Another Naver publisher is active (PID ${owner.pid}, action ${owner.action || "unknown"}); concurrent publication is blocked`);
    }
    fs.rmSync(PUBLISH_LOCK_DIR, { recursive: true, force: true });
    acquire();
  }
  return () => fs.rmSync(PUBLISH_LOCK_DIR, { recursive: true, force: true });
}

function isPublicNaverPostUrl(value) {
  try {
    const url = new URL(String(value || ""));
    if (url.protocol !== "https:" || url.hostname !== "blog.naver.com") return false;
    if (/GoBlogWrite|PostWriteForm|Redirect=Write|workingonit/i.test(`${url.pathname}${url.search}`)) return false;
    return /\/\d{6,}(?:$|[/?#])/.test(url.pathname) || /(?:^|[?&])logNo=\d{6,}(?:&|$)/.test(url.search);
  } catch {
    return false;
  }
}

function editorBody(markdown) {
  return normalizeText(markdownTablesToTsv(markdown)
    .replace(/^#\s+.+?[ \t]*$/m, "")
    .replace(/^!\[[^\]]*]\([^)]+\.png(?:\?[^)]*)?\)\s*$/gim, "")
    .replace(/^#{2,6}\s+(.+?)[ \t]*$/gm, "$1")
    .replace(/^---+[ \t]*$/gm, "────────")
    .replace(/^>\s?/gm, "")
    .replace(/\[(?:red|blue|brown):\s*([^\]]+)\]/g, "$1")
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

const COLOR_PALETTE = { red: "#d93025", blue: "#1a73e8", brown: "#8a5a2b" };

function colorMarkerHtml(color, value) {
  return `<span style="color:${COLOR_PALETTE[color]};font-weight:700;">${escapeHtml(value)}</span>`;
}

function inlineHtml(value) {
  const text = String(value);
  const tokenPattern = /(\[(?:red|blue|brown):[^\]]+\]|\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+]\(https?:\/\/[^)]+\))/g;
  let cursor = 0;
  let html = "";
  let match;
  while ((match = tokenPattern.exec(text)) !== null) {
    html += escapeHtml(text.slice(cursor, match.index));
    const token = match[0];
    const color = token.match(/^\[(red|blue|brown):\s*([^\]]+)\]$/);
    const strong = token.match(/^\*\*([^*]+)\*\*$/);
    const code = token.match(/^`([^`]+)`$/);
    const link = token.match(/^\[([^\]]+)]\((https?:\/\/[^)]+)\)$/);
    if (color) html += colorMarkerHtml(color[1], color[2].trim());
    else if (strong) html += `<strong>${escapeHtml(strong[1].replace(/`([^`]+)`/g, "$1"))}</strong>`;
    else if (code) html += `<code>${escapeHtml(code[1])}</code>`;
    else if (link) html += `${escapeHtml(link[1])} <span>(${escapeHtml(link[2])})</span>`;
    cursor = match.index + token.length;
  }
  html += escapeHtml(text.slice(cursor));
  return html;
}

function tableCellText(value) {
  return String(value)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/\[(?:red|blue|brown):\s*([^\]]+)\]/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)]\((https?:\/\/[^)]+)\)/g, "$1 ($2)");
}

function tableCellHtml(value) {
  return inlineHtml(String(value).replace(/<br\s*\/?>/gi, "\n")).replace(/\n/g, "<br>");
}

function renderExcelTableHtml(table) {
  const tableStyle = "border-collapse:collapse;table-layout:auto;margin:0;";
  const baseCellStyle = "border:1px solid #d9d9d9;padding:6px 8px;font-size:14px;line-height:1.45;white-space:pre-wrap;vertical-align:top;color:#222;";
  const alignStyle = (index) => `text-align:${table.alignments?.[index] || "left"};`;
  const header = `<tr>${table.headers.map((cell, index) => `<th style="${baseCellStyle}font-weight:700;background:#f3f4f6;${alignStyle(index)}">${tableCellHtml(cell)}</th>`).join("")}</tr>`;
  const body = table.rows.map(row => `<tr>${table.headers.map((_header, index) => `<td style="${baseCellStyle}${alignStyle(index)}">${tableCellHtml(row[index] || "")}</td>`).join("")}</tr>`).join("");
  return `<table border="0" cellspacing="0" cellpadding="0" style="${tableStyle}"><thead>${header}</thead><tbody>${body}</tbody></table>`;
}

function markdownTablesToTsv(markdown) {
  const lines = markdown.split(/\r?\n/);
  const output = [];
  for (let i = 0; i < lines.length; i += 1) {
    const table = parseMarkdownTableBlock(lines, i);
    if (!table) { output.push(lines[i]); continue; }
    output.push(markdownTableToTsv({
      ...table,
      headers: table.headers.map(tableCellText),
      rows: table.rows.map(row => row.map(tableCellText)),
    }));
    i = table.endIndex - 1;
  }
  return output.join("\n");
}

function editorHtml(markdown) {
  const lines = markdown
    .replace(/^#\s+.+?[ \t]*$/m, "")
    .replace(/^!\[[^\]]*]\([^)]+\.png(?:\?[^)]*)?\)\s*$/gim, "")
    .split(/\r?\n/);
  const blocks = [];
  let paragraph = [];
  let quotation = [];
  const bodyStyle = "font-size:15px;font-weight:400;line-height:1.7;margin:0;color:#222;";
  const bodyTextStyle = "font-size:15px;font-weight:400;line-height:1.7;color:#222;";
  const quoteStyle = "font-size:15px;font-weight:400;line-height:1.7;margin:0;padding:14px 18px;border-left:4px solid #03c75a;background:#f6f8f7;color:#222;";
  const spacer = `<p data-kr-naver-spacer="true" style="${bodyStyle}"><span style="${bodyTextStyle}"><br></span></p>`;
  const bodyBlock = (content) => `<p style="${bodyStyle}"><span style="${bodyTextStyle}">${content}</span></p>`;
  const pushBlock = (html) => {
    if (blocks.length && blocks.at(-1) !== "<hr>") blocks.push(spacer);
    blocks.push(html);
  };
  const flushParagraph = () => {
    if (!paragraph.length) return;
    pushBlock(bodyBlock(paragraph.map(inlineHtml).join("<br>")));
    paragraph = [];
  };
  const flushQuotation = () => {
    if (!quotation.length) return;
    const quoteParagraphs = quotation
      .map(line => `<p style="${bodyStyle}"><span style="${bodyTextStyle}">${inlineHtml(line)}</span></p>`)
      .join("");
    pushBlock(`<blockquote data-kr-naver-signature="true" style="${quoteStyle}">${quoteParagraphs}</blockquote>`);
    quotation = [];
  };
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    const table = parseMarkdownTableBlock(lines, lineIndex);
    if (table) {
      flushQuotation();
      flushParagraph();
      pushBlock(renderExcelTableHtml(table));
      lineIndex = table.endIndex - 1;
      continue;
    }
    const trimmed = line.trim();
    const quote = trimmed.match(/^>\s+(.+?)\s*$/);
    if (quote) {
      flushParagraph();
      quotation.push(quote[1]);
      continue;
    }
    flushQuotation();
    if (!trimmed) { flushParagraph(); continue; }
    const h2 = trimmed.match(/^##\s+(.+?)\s*$/);
    if (h2) {
      flushParagraph();
      if (blocks.length) blocks.push("<hr>");
      pushBlock(`<h2 style="font-size:28px;font-weight:700;line-height:1.45;margin:0;color:#222;"><strong style="font-size:28px;font-weight:700;line-height:1.45;color:#222;">${inlineHtml(h2[1])}</strong></h2>`);
      continue;
    }
    const h3 = trimmed.match(/^###\s+(.+?)\s*$/);
    if (h3) {
      flushParagraph();
      pushBlock(`<h3 style="font-size:24px;font-weight:700;line-height:1.45;margin:0;color:#222;"><strong style="font-size:24px;font-weight:700;line-height:1.45;color:#222;">${inlineHtml(h3[1])}</strong></h3>`);
      continue;
    }
    if (/^---+\s*$/.test(trimmed)) {
      flushParagraph();
      blocks.push("<hr>");
      continue;
    }
    const bullet = trimmed.match(/^-\s+(.+?)\s*$/);
    if (bullet) {
      flushParagraph();
      pushBlock(bodyBlock(`- ${inlineHtml(bullet[1])}`));
      continue;
    }
    const numbered = trimmed.match(/^(\d+)\.\s+(.+?)\s*$/);
    if (numbered) {
      flushParagraph();
      pushBlock(bodyBlock(`${numbered[1]}. ${inlineHtml(numbered[2])}`));
      continue;
    }
    if (/^https?:\/\/\S+$/i.test(trimmed) && lines[lineIndex + 1]?.trim() === "") {
      flushParagraph();
      pushBlock(bodyBlock(inlineHtml(trimmed)));
      blocks.push(spacer);
      continue;
    }
    paragraph.push(line);
  }
  flushQuotation();
  flushParagraph();
  return `<div>${blocks.join("\n")}</div>`;
}

function editorContentChunks(markdown) {
  const chunks = [];
  const lines = markdown.split(/(\r?\n)/);
  const logicalLines = [];
  for (let i = 0; i < lines.length; i += 2) logicalLines.push({ text: lines[i], newline: lines[i + 1] || "" });
  let buffer = [];
  const flush = () => {
    const markdownPart = buffer.map(line => `${line.text}${line.newline}`).join("");
    if (normalizeText(editorBody(markdownPart))) chunks.push({ type: "text", markdown: markdownPart });
    buffer = [];
  };
  for (let i = 0; i < logicalLines.length; i += 1) {
    const line = logicalLines[i].text;
    const table = parseMarkdownTableBlock(logicalLines.map(item => item.text), i);
    if (table) {
      flush();
      const markdownPart = logicalLines.slice(i, table.endIndex).map(item => `${item.text}${item.newline}`).join("");
      chunks.push({ type: "table", markdown: markdownPart });
      i = table.endIndex - 1;
      continue;
    }
    if (/^!\[[^\]]*]\([^)]+\.png(?:\?[^)]*)?\)\s*$/i.test(line)) {
      flush();
      chunks.push({ type: "image" });
      continue;
    }
    buffer.push(logicalLines[i]);
  }
  flush();
  return chunks;
}

function isBlankOrPlaceholder(value) {
  const text = normalizeText(value);
  return !text || /^(제목|본문|내용을 입력하세요|내용을 입력해 주세요|글을 입력하세요|나를 돌아보는 회고, 뜻밖의 발견을 기다립니다\. #모두의회고)$/.test(text);
}

function normalizeEditorText(value) {
  return normalizeText(normalizeText(value)
    .replace(/\n\n(?=(?:Codex \(or Claude\)|✓ |GitHub \())/g, "\n")
    .replace(/\n\n(?=(?:- |\d+\. ))/g, "\n")
    .replace(/(?:^|\n)────────(?:\n|$)/g, "\n"));
}

function compactEditorText(value) {
  return normalizeEditorText(value).replace(/\s+/g, "");
}

function manifestLinkCards(manifest) {
  if (!isDailyMarketManifest(manifest)) return [];
  return (manifest.post?.linkCards || []).filter(url => /^https?:\/\//.test(String(url || ""))).slice(0, 5);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripLinkCardUrls(value, urls) {
  let text = String(value || "");
  for (const url of urls) text = text.replaceAll(url, "");
  return normalizeText(text);
}

function stripDailyMarketNewsSection(value) {
  return normalizeText(String(value || "").replace(/시장 주요 뉴스[\s\S]*?업종\/테마별 흐름/, "시장 주요 뉴스\n업종/테마별 흐름"));
}

function plainHtmlText(value) {
  return normalizeText(String(value)
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&"));
}

function isSupportedImage(filePath) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return false;
  const buffer = fs.readFileSync(filePath);
  if (!buffer.length) return false;
  const png = buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const jpg = buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const webp = buffer.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP";
  return png || jpg || webp;
}

function thumbnailOutputPath(manifest) {
  const fileName = isDailyMarketManifest(manifest)
    ? `naver-thumbnail-${dailyMarketThumbnailDate(manifest)}.png`
    : "naver-thumbnail.png";
  return path.resolve(path.dirname(manifest.post.markdownPath), "assets", fileName);
}

function thumbnailPrompt(manifest) {
  return `${manifest.post.title} 주제로 텍스트 설명이 아니라 실제 블로그 썸네일 이미지 1장을 생성해줘. 16:9 비율, 모바일에서 읽기 쉬운 한국어 제목, 사람·기업 로고·저작권 캐릭터는 사용하지 마.`;
}

function dailyMarketThumbnailDate(manifest) {
  const date = manifest.post?.publicationDate || manifest.automation?.duplicateDate || manifest.source?.asOfDate;
  assert(/^\d{4}-\d{2}-\d{2}$/.test(date || ""), "Daily market-news thumbnail requires a YYYY-MM-DD publication date");
  return date;
}

function expectedThumbnailRelativePath(manifest) {
  return path.relative(path.dirname(manifest.post.markdownPath), thumbnailOutputPath(manifest)).replace(/\\/g, "/");
}

function expectedThumbnailMetadata(manifest) {
  const absolutePath = thumbnailOutputPath(manifest);
  return {
    prompt: thumbnailPrompt(manifest),
    relativePath: expectedThumbnailRelativePath(manifest),
    absolutePath,
    source: "gemini-web",
    status: "generated",
  };
}

function dailyMarketThumbnailMatches(manifest) {
  if (!isDailyMarketManifest(manifest) || !manifest.post.thumbnail) return false;
  const thumbnail = manifest.post.thumbnail;
  if (!thumbnail.absolutePath || !thumbnail.sha256) return false;
  const expected = expectedThumbnailMetadata(manifest);
  return thumbnail.prompt === expected.prompt
    && thumbnail.relativePath === expected.relativePath
    && path.resolve(thumbnail.absolutePath || "") === expected.absolutePath
    && thumbnail.source === expected.source
    && thumbnail.status === expected.status
    && fs.existsSync(thumbnail.absolutePath)
    && isSupportedImage(thumbnail.absolutePath)
    && fileSha256(thumbnail.absolutePath) === thumbnail.sha256;
}

function verifyThumbnailArtifact(manifest) {
  const thumbnail = manifest.post.thumbnail;
  assert(thumbnail, "Manifest thumbnail metadata missing; run prepare again");
  assert(thumbnail.status === "generated", `Thumbnail is not generated: ${thumbnail.status || "unknown"}`);
  assert(thumbnail.source === "gemini-web", `Unsupported thumbnail source: ${thumbnail.source || "unknown"}`);
  assert(thumbnail.prompt === thumbnailPrompt(manifest), "Thumbnail prompt does not match the generated blog title; run prepare again");
  if (isDailyMarketManifest(manifest)) {
    const expected = expectedThumbnailMetadata(manifest);
    assert(thumbnail.relativePath === expected.relativePath, `Daily market-news thumbnail path is stale; run prepare again: ${thumbnail.relativePath || thumbnail.absolutePath}`);
    assert(path.resolve(thumbnail.absolutePath || "") === expected.absolutePath, `Daily market-news thumbnail absolute path is stale; run prepare again: ${thumbnail.absolutePath || "missing"}`);
  }
  assert(fs.existsSync(thumbnail.absolutePath), `Thumbnail missing: ${thumbnail.relativePath || thumbnail.absolutePath}`);
  assert(isSupportedImage(thumbnail.absolutePath), `Thumbnail is not a supported non-empty PNG/JPG/WebP image: ${thumbnail.relativePath || thumbnail.absolutePath}`);
  assert(fileSha256(thumbnail.absolutePath) === thumbnail.sha256, `Thumbnail changed after prepare: ${thumbnail.relativePath || thumbnail.absolutePath}`);
}

function ensureThumbnailArtifact(manifest, driver) {
  const prompt = thumbnailPrompt(manifest);
  if (manifest.post.thumbnail) {
    if (isDailyMarketManifest(manifest) && !dailyMarketThumbnailMatches(manifest)) manifest.post.thumbnail = null;
    else {
      verifyThumbnailArtifact(manifest);
      return manifest.post.thumbnail;
    }
  }
  const absolutePath = thumbnailOutputPath(manifest);
  const relativePath = expectedThumbnailRelativePath(manifest);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  if (isDailyMarketManifest(manifest) || !isSupportedImage(absolutePath)) driver.generateGeminiThumbnail(prompt, absolutePath);
  assert(isSupportedImage(absolutePath), `Gemini thumbnail was not saved as a supported non-empty PNG/JPG/WebP image: ${absolutePath}`);
  manifest.post.thumbnail = {
    prompt,
    relativePath,
    absolutePath,
    sha256: fileSha256(absolutePath),
    source: "gemini-web",
    status: "generated",
    generatedAt: new Date().toISOString(),
  };
  return manifest.post.thumbnail;
}

function verifyExistingThumbnailForArtifacts(manifest) {
  if (!manifest.post.thumbnail) return;
  if (isDailyMarketManifest(manifest) && !dailyMarketThumbnailMatches(manifest)) return;
  verifyThumbnailArtifact(manifest);
}

function extractTablesFromHtml(html) {
  if (!html) return [];
  const tables = [];
  const tablePattern = /<table\b[\s\S]*?<\/table>/gi;
  let tableMatch;
  while ((tableMatch = tablePattern.exec(html)) !== null) {
    const rows = [];
    const rowPattern = /<tr\b[\s\S]*?<\/tr>/gi;
    let rowMatch;
    while ((rowMatch = rowPattern.exec(tableMatch[0])) !== null) {
      const cells = [];
      const cellPattern = /<t[hd]\b[\s\S]*?<\/t[hd]>/gi;
      let cellMatch;
      while ((cellMatch = cellPattern.exec(rowMatch[0])) !== null) cells.push(plainHtmlText(cellMatch[0]));
      if (cells.length) rows.push(cells);
    }
    if (rows.length) tables.push({ rows, rowCount: rows.length, columnCount: Math.max(...rows.map(row => row.length)) });
  }
  return tables;
}

function expectedTableData(markdown) {
  return extractMarkdownTables(markdown).map(table => {
    const rows = [
      table.headers.map(tableCellText),
      ...table.rows.map(row => row.map(tableCellText)),
    ];
    return { rows, rowCount: rows.length, columnCount: table.headers.length };
  });
}

function equivalentTableCellText(actualText, expectedText) {
  if (actualText === expectedText) return true;
  if (!expectedText.includes("\n")) return false;
  return actualText === expectedText.replace(/\n+/g, "");
}

function validateTables(actualTables = [], expectedTables = []) {
  assert(actualTables.length === expectedTables.length, `Editor table count mismatch: expected ${expectedTables.length}, got ${actualTables.length}`);
  for (let index = 0; index < expectedTables.length; index += 1) {
    const actual = actualTables[index];
    const expected = expectedTables[index];
    assert(actual.rowCount === expected.rowCount, `Editor table ${index + 1} row count mismatch: expected ${expected.rowCount}, got ${actual.rowCount}`);
    assert(actual.columnCount === expected.columnCount, `Editor table ${index + 1} column count mismatch: expected ${expected.columnCount}, got ${actual.columnCount}`);
    for (let rowIndex = 0; rowIndex < expected.rows.length; rowIndex += 1) {
      for (let cellIndex = 0; cellIndex < expected.rows[rowIndex].length; cellIndex += 1) {
        const expectedText = normalizeText(expected.rows[rowIndex][cellIndex]);
        const actualText = normalizeText(actual.rows[rowIndex]?.[cellIndex] || "");
        assert(equivalentTableCellText(actualText, expectedText), `Editor table ${index + 1} cell mismatch at row ${rowIndex + 1}, column ${cellIndex + 1}: expected "${expectedText}", got "${actualText}"`);
      }
    }
  }
}

function formatBlocksFromHtml(html) {
  if (!html) return [];
  const blocks = [];
  const pattern = /<(h2|h3|p)\b([^>]*)>([\s\S]*?)<\/\1>/gi;
  let match;
  while ((match = pattern.exec(html)) !== null) {
    if (/data-kr-naver-spacer=/i.test(match[2])) continue;
    const text = plainHtmlText(match[3]);
    if (!text) continue;
    const style = match[2].match(/style="([^"]*)"/i)?.[1] || "";
    const fontSize = style.match(/font-size\s*:\s*([^;]+)/i)?.[1]?.trim() || "";
    const fontWeight = style.match(/font-weight\s*:\s*([^;]+)/i)?.[1]?.trim() || "";
    blocks.push({
      kind: match[1].toLowerCase(),
      text,
      fontSizes: fontSize ? [fontSize] : [],
      fontWeights: fontWeight ? [fontWeight] : [],
      hasInlineStrong: /<(?:strong|b)\b|font-weight\s*:\s*(?:[6-9]00|bold)/i.test(match[3]),
    });
  }
  return blocks;
}

function validateBlockFormatting(actualBlocks, expectedHtml) {
  const expectedBlocks = formatBlocksFromHtml(expectedHtml);
  assert(Array.isArray(actualBlocks) && actualBlocks.length, "Editor block formatting inspection returned no text blocks");
  let cursor = 0;
  for (const expected of expectedBlocks) {
    const actualIndex = actualBlocks.findIndex((block, index) => index >= cursor && normalizeText(block.text) === expected.text);
    assert(actualIndex >= 0, `Editor formatting block missing: ${expected.text.slice(0, 80)}`);
    const actual = actualBlocks[actualIndex];
    cursor = actualIndex + 1;
    const expectedSize = expected.kind === "h2" ? "28px" : expected.kind === "h3" ? "24px" : "15px";
    const sizes = new Set((actual.fontSizes || []).map(String));
    assert(sizes.size === 1 && sizes.has(expectedSize), `Editor font size mismatch for "${expected.text.slice(0, 60)}": expected ${expectedSize}, got ${[...sizes].join(", ") || "unknown"}`);
    const weights = new Set((actual.fontWeights || []).map(value => String(value).toLowerCase()));
    if (expected.kind === "h2" || expected.kind === "h3") {
      assert([...weights].every(value => value === "700" || value === "bold") && weights.size > 0, `Editor heading weight mismatch for "${expected.text.slice(0, 60)}": expected 700, got ${[...weights].join(", ") || "unknown"}`);
    } else if (!expected.hasInlineStrong) {
      const bodyWeightOk = [...weights].every(value => value === "400" || value === "normal") && weights.size > 0;
      const weightOnlyMismatch = sizes.size === 1 && sizes.has(expectedSize) && [...weights].every(value => value === "700" || value === "bold");
      assert(bodyWeightOk || weightOnlyMismatch, `Editor body weight mismatch for "${expected.text.slice(0, 60)}": expected 400, got ${[...weights].join(", ") || "unknown"}`);
    }
  }
}

function assertWritableDraft(inspected, manifest, expectedBody) {
  const title = normalizeText(inspected.title);
  const body = normalizeText(inspected.body);
  const expectedTitle = normalizeText(manifest.post.title);
  const expected = normalizeText(expectedBody);
  const sameGeneratedStockDraft = body.includes(manifest.source.asOfDate)
    && body.includes(manifest.post.issue)
    && body.includes("RESEARCH COMPLETE")
    && body.includes("매수·매도를 권유하지 않습니다");
  const sameGeneratedDailyDraft = isDailyMarketManifest(manifest)
    && body.includes(manifest.source.asOfDate)
    && body.includes("시장 주요 요약")
    && body.includes("매수·매도를 권유하지 않습니다");
  const sameDailyDraftByTitle = isDailyMarketManifest(manifest)
    && title === expectedTitle;
  const titleOk = isBlankOrPlaceholder(title) || title === expectedTitle || sameGeneratedStockDraft || sameGeneratedDailyDraft;
  const incompleteSelfDraft = body.startsWith(expectedTitle) || expected.startsWith(body);
  const sameGeneratedDraft = title === expectedTitle && body.includes(manifest.post.company);
  const bodyOk = isBlankOrPlaceholder(body) || body === expected || incompleteSelfDraft || sameGeneratedDraft || sameGeneratedStockDraft || sameGeneratedDailyDraft || sameDailyDraftByTitle;
  assert(titleOk && bodyOk, "Editor already contains different draft content; open a new blank write screen before prepare");
}

function manifestSourcePath(manifest) {
  return manifest.source?.memoPath || manifest.source?.reportPath;
}

function manifestSourceSha256(manifest) {
  return manifest.source?.memoSha256 || manifest.source?.reportSha256;
}

function isDailyMarketManifest(manifest) {
  return manifest.contentType === "daily-market-news";
}

function assertScheduledPublishAllowed(args, manifest) {
  assert(args.scheduled === "yes", "Scheduled publish requires --scheduled yes");
  assert(isDailyMarketManifest(manifest), "Scheduled publish is only allowed for daily market-news manifests");
  assert(manifest.automation?.scheduledPublishAllowed === true, "Manifest does not allow scheduled public publishing");
}

function sameDayPublishedManifest(manifestPath, manifest) {
  if (!isDailyMarketManifest(manifest)) return null;
  const duplicateDate = manifest.automation?.duplicateDate || manifest.post?.publicationDate || manifest.source?.asOfDate;
  if (!duplicateDate) return null;
  const currentPath = path.resolve(manifestPath);
  const dir = path.dirname(currentPath);
  if (!fs.existsSync(dir)) return null;
  for (const entry of fs.readdirSync(dir)) {
    if (!/\.json$/i.test(entry)) continue;
    const candidatePath = path.resolve(dir, entry);
    if (candidatePath === currentPath) continue;
    let candidate;
    try { candidate = readJson(candidatePath); } catch { continue; }
    if (candidate.contentType !== "daily-market-news") continue;
    const candidateDate = candidate.automation?.duplicateDate || candidate.post?.publicationDate || candidate.source?.asOfDate;
    if (candidateDate !== duplicateDate) continue;
    if (candidate.status === "published" || candidate.status === "scheduled" || candidate.publish?.url) return { path: candidatePath, manifest: candidate };
  }
  return null;
}

function verifyArtifacts(manifest, options = {}) {
  assert(manifest.schemaVersion === 1, "Unsupported manifest schemaVersion");
  assert(manifest.status !== "published", "Manifest is already published; duplicate publish blocked");
  assert(manifest.status !== "scheduled", "Manifest is already scheduled; duplicate publish blocked");
  assert(!["publishing", "publication-unverified"].includes(manifest.status), "A public publish attempt is pending or unverified; do not prepare or click publish again until the public blog is reconciled");
  const sourcePath = manifestSourcePath(manifest);
  const sourceSha256 = manifestSourceSha256(manifest);
  assert(sourcePath, "Manifest source path missing");
  assert(sourceSha256, "Manifest source sha256 missing");
  assert(fs.existsSync(sourcePath), `Source document missing: ${sourcePath}`);
  assert(fileSha256(sourcePath) === sourceSha256, "Source document changed after conversion; reconvert before preparing");
  assert(fs.existsSync(manifest.post.markdownPath), `Post markdown missing: ${manifest.post.markdownPath}`);
  assert(fileSha256(manifest.post.markdownPath) === manifest.post.markdownSha256, "Post markdown changed after conversion; reconvert before preparing");
  for (const image of manifest.post.images) {
    assert(fs.existsSync(image.absolutePath), `Image missing: ${image.relativePath}`);
    assert(fileSha256(image.absolutePath) === image.sha256, `Image changed after conversion: ${image.relativePath}`);
  }
  if (options.allowDailyThumbnailRepair) verifyExistingThumbnailForArtifacts(manifest);
  else if (manifest.post.thumbnail) verifyThumbnailArtifact(manifest);
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
  setBody(value, html) { this.requireSelector("body"); this.fixture.editor.body = value; this.fixture.editor.bodyHtml = html; this.persist(); this.dismissPastePopups(); }
  appendBody(value, html) {
    this.requireSelector("body");
    this.fixture.editor.body = normalizeText([this.fixture.editor.body, value].filter(Boolean).join("\n\n"));
    this.fixture.editor.bodyHtml = [this.fixture.editor.bodyHtml, html].filter(Boolean).join("\n");
    this.persist();
    this.dismissPastePopups();
  }
  pasteLinkCard(url) {
    this.requireSelector("body");
    this.fixture.linkCardPasteCalls ||= [];
    this.fixture.linkCardPasteCalls.push(url);
    this.fixture.linkCardEnterCalls ||= [];
    this.fixture.linkCardEnterCalls.push(url);
    this.fixture.editor.linkCards ||= [];
    this.fixture.editor.linkCards.push(url);
    this.fixture.editor.body = normalizeText([this.fixture.editor.body, url].filter(Boolean).join("\n\n"));
    const style = "font-size:15px;font-weight:400;line-height:1.7;margin:0;color:#222;";
    const spanStyle = "font-size:15px;font-weight:400;line-height:1.7;color:#222;";
    this.fixture.editor.bodyHtml = [this.fixture.editor.bodyHtml, `<p style="${style}"><span style="${spanStyle}">${escapeHtml(url)}</span></p>`].filter(Boolean).join("\n");
    this.persist();
    this.dismissPastePopups();
  }
  pressEnterAfterLinkCard(url) {
    this.requireSelector("body");
    this.fixture.linkCardEnterCalls ||= [];
    this.fixture.linkCardEnterCalls.push(url);
    this.persist();
  }
  uploadImage(filePath, index) {
    this.requireSelector("imageInput");
    this.fixture.imageUploadAttempts ||= [];
    this.fixture.imageUploadAttempts.push({ index, filePath });
    this.persist();
    if ((this.fixture.imageUploadFailures || []).includes(index)) throw new Error(`Fixture image upload failed at index ${index}`);
    assert(fs.existsSync(filePath), `Fixture upload path missing: ${filePath}`);
    const beforeCount = this.fixture.editor.images;
    if ((this.fixture.imageUploadNoInsert || []).includes(index)) {
      this.fixture.editor.fileInputProcessed = true;
      this.persist();
      this.dismissPastePopups();
      throw new Error(`Image ${index} upload did not create a SmartEditor image node: expected ${beforeCount + 1}, got ${beforeCount}; file input was processed but SmartEditor image nodes were not created`);
    }
    this.fixture.editor.images += 1; this.persist();
    this.dismissPastePopups();
    assert(this.fixture.editor.images === beforeCount + 1, `Image ${index} upload did not create exactly one SmartEditor image node`);
  }
  generateGeminiThumbnail(prompt, outputPath) {
    if (this.fixture.geminiAuthRequired) throw new Error("Gemini login expired, CAPTCHA detected, or manual authentication is required; thumbnail generation was not attempted");
    this.fixture.geminiPrompts ||= [];
    this.fixture.geminiPrompts.push(prompt);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    const fixtureImage = this.fixture.geminiThumbnailPath;
    if (fixtureImage) fs.copyFileSync(fixtureImage, outputPath);
    else fs.writeFileSync(outputPath, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/l8BqWQAAAABJRU5ErkJggg==", "base64"));
    this.persist();
  }
  selectRepresentativeThumbnail(filePath) {
    this.requireSelector("representativeThumbnail");
    assert(fs.existsSync(filePath), `Representative thumbnail path missing: ${filePath}`);
    const beforeCount = this.fixture.editor.images;
    this.fixture.representativeThumbnail = { filePath, uploaded: true, selected: false, sha256: fileSha256(filePath) };
    if (this.fixture.thumbnailUploadInsertsBodyImage) this.fixture.editor.images += 1;
    this.persist();
    assert(this.fixture.editor.images === beforeCount, "Representative thumbnail selection inserted an image into the editor body");
    if (this.fixture.thumbnailSelectionFails || this.fixture.thumbnailRepresentativeButtonMissing) throw new Error("Fixture representative thumbnail selection failed: representative image setting button unavailable");
    this.fixture.representativeThumbnail.setAsRepresentativeClicked = true;
    this.persist();
    if (this.fixture.thumbnailSelectedMarkerMissing) throw new Error("Fixture representative thumbnail selection failed: selected marker was not detected");
    this.fixture.representativeThumbnail.selected = true;
    this.persist();
    assert(this.fixture.editor.images === beforeCount, "Representative thumbnail selection inserted an image into the editor body");
  }
  setCategory(value) { this.requireSelector("category"); this.fixture.editor.category = value; this.persist(); }
  setTags(values) { this.requireSelector("tags"); this.fixture.editor.tags = values; this.persist(); }
  pruneTags(values) { this.fixture.editor.tags = (this.fixture.editor.tags || []).filter(tag => values.includes(tag)); this.persist(); }
  recordClick(role) {
    this.requireSelector(role);
    if ((this.fixture.clickTimeoutRoles || []).includes(role)) {
      this.fixture.domClickFallbacks ||= [];
      this.fixture.domClickFallbacks.push(role);
    }
    this.persist();
  }
  recordPopupClick(kind, role, label) {
    this.fixture.popupClicks ||= [];
    this.fixture.popupClicks.push({ kind, role, label });
    this.persist();
  }
  dismissStartupPopups() {
    const popup = this.fixture.startupPopup;
    if (!popup || popup.dismissed) return false;
    const labels = popup.buttons || [];
    const unsafe = /불러오기|이어쓰기|복원/;
    const safeOverride = /이어쓰지 않기|이어쓰기 안 함|이어쓰기 안함/;
    const safe = labels.find(label => /닫기|취소|새 글 쓰기|새글쓰기|이어쓰지 않기|이어쓰기 안 함|이어쓰기 안함|나중에|확인/.test(label) && (!unsafe.test(label) || safeOverride.test(label)));
    if (!safe) return false;
    popup.dismissed = true;
    this.recordPopupClick("startup", "dismiss", safe);
    return true;
  }
  closeBlockingLayers() { return this.dismissStartupPopups(); }
  dismissPastePopups() {
    const popup = this.fixture.pastePopup;
    if (!popup || popup.dismissed) return false;
    const labels = popup.buttons || [];
    const primary = labels.find(label => /기본|권장|확인|붙여넣기|유지|적용/.test(label));
    const fallback = labels.find(label => /닫기|취소/.test(label));
    const clicked = primary || fallback;
    if (!clicked) return false;
    popup.dismissed = true;
    this.recordPopupClick("paste", primary ? "primary" : "dismiss", clicked);
    return true;
  }
  saveDraft() { this.recordClick("saveDraft"); this.fixture.editor.saved = true; this.persist(); }
  inspect() {
    const separatorCount = (this.fixture.editor.bodyHtml?.match(/<hr\b/g) || []).length;
    const quoteCount = (this.fixture.editor.bodyHtml?.match(/<blockquote\b/g) || []).length;
    const tables = this.fixture.editor.tables || extractTablesFromHtml(this.fixture.editor.bodyHtml);
    const formatBlocks = this.fixture.editor.formatBlocks || formatBlocksFromHtml(this.fixture.editor.bodyHtml);
    return { title: this.fixture.editor.title, body: this.fixture.editor.body, imageCount: this.fixture.editor.images, tags: this.fixture.editor.tags || [], separatorCount, quoteCount, tableCount: tables.length, tables, formatBlocks, linkCardUrls: this.fixture.editor.linkCards || [], representativeThumbnailSelected: Boolean(this.fixture.representativeThumbnail?.selected) };
  }
  screenshot(filePath) { fs.writeFileSync(filePath, Buffer.from("fixture preview\n", "utf8")); }
  editorUrl() { return this.fixture.editorUrl || "https://blog.naver.com/GoBlogWrite.naver?fixtureDraft=1"; }
  openPublishLayer() { this.recordClick("publishOpen"); this.fixture.publishLayerOpen = true; this.persist(); }
  closePublishLayer() { this.fixture.publishLayerOpen = false; this.persist(); }
  configureScheduledPublication(schedule) {
    this.requireSelector("publishConfirm");
    if (this.fixture.scheduleConfigurationFails) throw new Error("Fixture Naver schedule controls unavailable");
    this.fixture.schedule = { ...schedule, visibility: "public", scheduled: true, verified: true };
    this.persist();
    return this.fixture.schedule;
  }
  inspectScheduledPublication() { return this.fixture.schedule || null; }
  publish() {
    this.recordClick("publishConfirm");
    assert(this.fixture.publishLayerOpen, "Fixture publish layer was not opened");
    if (this.fixture.publishConfirmUnavailable) {
      const error = new Error("Fixture public confirmation button unavailable");
      error.publicConfirmationIssued = false;
      throw error;
    }
    this.fixture.publicClicked = true;
    this.fixture.publishedUrl ||= this.fixture.publishVerificationFails
      ? "https://blog.naver.com/GoBlogWrite.naver?fixtureDraft=1"
      : "https://blog.naver.com/fixture/123456789";
    this.persist();
    return this.fixture.publishedUrl;
  }
  schedule() {
    this.recordClick("publishConfirm");
    assert(this.fixture.publishLayerOpen, "Fixture publish layer was not opened");
    if (this.fixture.scheduleConfirmUnavailable) {
      const error = new Error("Fixture scheduled confirmation button unavailable");
      error.publicConfirmationIssued = false;
      throw error;
    }
    this.fixture.scheduleConfirmed = true;
    this.persist();
    return true;
  }
  publishedUrl() { return this.fixture.publishedUrl; }
  openPublicPost(url) {
    this.fixture.publicPostOpened = url;
    this.persist();
  }
  inspectPublicPost() {
    return {
      url: this.fixture.publicPostOpened || this.fixture.publishedUrl || "",
      text: this.fixture.publicPostText || `${this.fixture.editor.title || ""}\n${this.fixture.editor.body || ""}`,
    };
  }
  requireSelector(name) {
    if ((this.fixture.missingSelectors || []).includes(name)) throw new Error(`Required selector unavailable: ${name}`);
  }
}

class GstackDriver {
  constructor(options = {}) {
    const browse = require("../../kr-naver-browse/scripts/browse-naver.js");
    this.bin = browse.resolveBrowseBinary();
    this.supportsHeadedFlag = null;
    this.defaultProfile = path.join(os.homedir(), ".gstack", "kr-naver-blog-publish", "chromium-profile");
    this.publishProfile = process.env.NAVER_PUBLISH_PROFILE || this.defaultProfile;
    this.publishStateFile = process.env.NAVER_PUBLISH_STATE_FILE || DEFAULT_BROWSE_STATE_FILE;
    this.env = {
      ...process.env,
      CHROMIUM_PROFILE: this.publishProfile,
      BROWSE_STATE_FILE: this.publishStateFile,
      BROWSE_PARENT_PID: process.env.BROWSE_PARENT_PID || "0",
    };
    if (!options.skipLegacyPreflight) {
      const legacy = options.legacyProcessOutput == null
        ? findLegacyProfileDaemons(this.publishProfile, this.publishStateFile)
        : parseLegacyProfileDaemons(options.legacyProcessOutput, this.publishProfile, this.publishStateFile);
      assert(!legacy.length, `Legacy gstack daemons still reference the Naver publish profile through other state files; browser start blocked to prevent a profile collision. Run publisher.js cleanup-browser --confirm-stale-profile yes only after confirming no other Naver publishing task is active. Legacy PIDs: ${legacy.map(item => item.pid).join(", ")}`);
    }
  }
  withProfile(profilePath, callback) {
    const previous = this.env;
    const sameProfile = path.resolve(profilePath) === path.resolve(this.publishProfile);
    const stateFile = sameProfile
      ? this.publishStateFile
      : path.join(PUBLISH_RUNTIME_DIR, `browse-${sha256(path.resolve(profilePath)).slice(0, 12)}.json`);
    this.env = { ...previous, CHROMIUM_PROFILE: profilePath, BROWSE_STATE_FILE: stateFile };
    try {
      return callback();
    } finally {
      this.env = previous;
    }
  }
  run(args, timeout = 90_000) {
    if (this.supportsHeadedFlag === null) {
      try {
        execFileSync(this.bin, ["--headed", "status"], { encoding: "utf8", env: this.env, stdio: ["ignore", "pipe", "pipe"], timeout: 15_000, maxBuffer: 1024 * 1024 });
        this.supportsHeadedFlag = true;
      } catch (error) {
        this.supportsHeadedFlag = !/Unknown command: '--headed'/.test(String(error.stderr || error.stdout || error.message));
      }
    }
    const commandArgs = this.supportsHeadedFlag && !args.includes("--headed") ? ["--headed", ...args] : args;
    let lastError;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return execFileSync(this.bin, commandArgs, { encoding: "utf8", env: this.env, stdio: ["ignore", "pipe", "pipe"], timeout, maxBuffer: 10 * 1024 * 1024 }).trim();
      } catch (error) {
        lastError = error;
        const message = String(error.stderr || error.stdout || error.message || "");
        const startupFailure = /Server failed to start within|Timed out waiting for another instance to start|Another instance is starting the server/i.test(message);
        if (!startupFailure || attempt === 2) {
          if (startupFailure) throw new Error(`${message}\\n${browserStartupRecoveryGuide()}`);
          throw error;
        }
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
      }
    }
    throw lastError;
  }
  js(expression, timeout) { return this.run(["js", expression], timeout); }
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
  ensurePage() {
    try {
      const url = this.run(["url"], 15_000);
      if (url) return;
    } catch (error) {
      if (!/no\s+(?:open\s+)?(?:page|tab)|page.*(?:missing|closed|not found)|target.*closed|no active/i.test(String(error.message))) throw error;
    }
    this.run(["newtab", "about:blank"], 30_000);
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
  clickSmartEditorPopup(kind, config) {
    const result = this.js(`(() => {
      const config = ${JSON.stringify(config)};
      const textOf = element => (element.innerText || element.textContent || '').replace(/\\s+/g, ' ').trim();
      const isVisible = element => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.visibility !== 'hidden' && style.display !== 'none' && (rect.width > 0 || rect.height > 0 || style.position === 'fixed');
      };
      const includesAny = (text, terms) => terms.some(term => text.includes(term));
      const isUnsafe = text => includesAny(text, config.unsafeLabels || []) && !includesAny(text, config.safeUnsafeOverrides || []);
      const layerSelector = '[role=dialog], .layer, [class*=layer], [class*=Layer], [class*=popup], [class*=Popup], .se-popup, .se-help-panel, .se-material-panel, .se-popup-alert, .se-dialog';
      const layers = [...document.querySelectorAll(layerSelector)]
        .filter(isVisible)
        .map(layer => ({ layer, text: textOf(layer) }))
        .filter(item => includesAny(item.text, config.indicators));
      for (const { layer } of layers) {
        const buttons = [...layer.querySelectorAll('button,a,[role=button]')].filter(isVisible);
        const findButton = labels => buttons.find(button => {
          const text = textOf(button);
          return labels.some(label => text === label || text.includes(label));
        });
        let button = findButton(config.primaryLabels || []);
        if (button && isUnsafe(textOf(button))) button = null;
        if (!button) button = findButton(config.fallbackLabels || []);
        if (!button || isUnsafe(textOf(button))) continue;
        const clicked = textOf(button);
        button.click();
        return JSON.stringify({ clicked, kind: ${JSON.stringify(kind)} });
      }
      return '';
    })()`).replace(/^"|"$/g, "");
    if (result) this.js("new Promise(resolve => setTimeout(() => resolve('ok'), 700))");
    return result;
  }
  dismissStartupPopups() {
    return this.clickSmartEditorPopup("startup", {
      indicators: ["최근 임시글", "작성 중인 글", "임시저장", "불러오기"],
      primaryLabels: ["닫기", "취소", "새 글 쓰기", "새글쓰기", "이어쓰지 않기", "이어쓰기 안 함", "나중에"],
      fallbackLabels: ["닫기", "취소", "나중에"],
      unsafeLabels: ["불러오기", "이어쓰기", "복원"],
      safeUnsafeOverrides: ["이어쓰지 않기", "이어쓰기 안 함", "이어쓰기 안함"],
    });
  }
  closeBlockingLayers() { return this.dismissStartupPopups(); }
  dismissPastePopups() {
    return this.clickSmartEditorPopup("paste", {
      indicators: ["붙여넣는 방법", "붙여넣기 방법", "이미지 붙여넣기", "HTML", "서식 유지", "서식"],
      primaryLabels: ["기본", "권장", "확인", "붙여넣기", "서식 유지", "HTML 유지", "적용"],
      fallbackLabels: ["닫기", "취소"],
      unsafeLabels: [],
    });
  }
  focusEditable(selector, options = {}) {
    const selectAll = options.selectAll !== false;
    const result = this.js(`(() => {
      const e = document.querySelector(${JSON.stringify(selector)});
      const selectAll = ${JSON.stringify(selectAll)};
      if (!e) return 'missing';
      e.scrollIntoView({ block: 'center', inline: 'nearest' });
      e.click();
      e.focus();
      const doc = e.ownerDocument;
      const win = doc.defaultView;
      if (e.isContentEditable) {
        const range = doc.createRange();
        if (selectAll) range.selectNodeContents(e);
        else {
          range.selectNodeContents(e);
          range.collapse(false);
        }
        const selection = win.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
      } else if (typeof e.select === 'function' && selectAll) {
        e.select();
      } else if (typeof e.setSelectionRange === 'function') {
        const length = e.value.length;
        e.setSelectionRange(length, length);
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
  pasteClipboard(plainText, html, options = {}) {
    const plainBase64 = Buffer.from(plainText, "utf8").toString("base64");
    const htmlBase64 = Buffer.from(html || escapeHtml(plainText), "utf8").toString("base64");
    this.js(`(() => {
      try { window.focus(); } catch {}
      const active = document.activeElement;
      if (active && typeof active.focus === 'function') active.focus();
      return document.hasFocus ? String(document.hasFocus()) : 'unknown';
    })()`);
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
      this.js(`(() => {
        try { window.focus(); } catch {}
        return document.hasFocus ? String(document.hasFocus()) : 'unknown';
      })()`);
      const fallback = this.js(`navigator.clipboard.writeText(${JSON.stringify(plainText)}).then(() => 'clipboard-ok').catch(error => 'clipboard-error:' + error.message)`);
      assert(/clipboard-ok/i.test(fallback), `Browser clipboard rejected text insertion after focus retry; focus/clipboard retry needed: ${result}; fallback: ${fallback}`);
    }
    if (options.refocusSelector) this.clickOrDomClick(options.refocusSelector);
    this.run(["press", process.platform === "darwin" ? "Meta+V" : "Control+V"], 60_000);
    this.dismissPastePopups();
  }
  replaceEditorText(selector, plainText, html, options = {}) {
    this.focusEditable(selector, { selectAll: options.selectAll !== false });
    if (options.resetBodyFormatting) this.resetInheritedBodyFormatting();
    this.pasteClipboard(plainText, html);
  }
  resetInheritedBodyFormatting() {
    const boldSelected = /true/i.test(this.js(`(() => {
      const toolbarSelected = Boolean(document.querySelector('.se-bold-toolbar-button.se-is-selected, .se-bold-toolbar-button[aria-pressed=true]'));
      let commandSelected = false;
      try { commandSelected = Boolean(document.queryCommandState && document.queryCommandState('bold')); } catch {}
      return toolbarSelected || commandSelected;
    })()`));
    if (boldSelected) this.run(["press", process.platform === "darwin" ? "Meta+B" : "Control+B"], 30_000);
    this.js(`(() => {
      try { document.execCommand('foreColor', false, '#222222'); } catch {}
      try { document.execCommand('hiliteColor', false, 'transparent'); } catch {}
      return 'reset';
    })()`);
  }
  openEditor() { this.ensurePage(); this.run(["frame", "main"]); this.gotoAllowRedirectAbort(process.env.NAVER_BLOG_WRITE_URL || WRITE_URL); this.run(["wait", "--load"], 15_000); this.enterEditorFrame(); }
  openPreparedDraft(url) { assert(url, "Prepared draft URL is missing"); this.ensurePage(); this.run(["frame", "main"]); this.gotoAllowRedirectAbort(url); this.run(["wait", "--load"], 15_000); this.enterEditorFrame(); }
  openPublicPost(url) { assert(isPublicNaverPostUrl(url), "Reconciliation requires a valid public Naver Blog post URL"); this.ensurePage(); this.run(["frame", "main"]); this.gotoAllowRedirectAbort(url); this.run(["wait", "--load"], 20_000); this.enterEditorFrame(); }
  inspectPublicPost() { return { url: this.run(["url"], 15_000).replace(/^"|"$/g, ""), text: this.run(["text"], 30_000) }; }
  isLoggedIn() {
    const url = this.js("location.href");
    const text = this.run(["text"]);
    return !/nid\.naver\.com|captcha|자동입력 방지|로그인이 필요|로그인해 주세요/i.test(`${url}\n${text.slice(0, 3000)}`);
  }
  setTitle(value) {
    const selector = this.findSelector("title");
    this.clickOrDomClick(selector);
    this.run(["press", process.platform === "darwin" ? "Meta+A" : "Control+A"], 30_000);
    this.run(["type", value], 30_000);
  }
  setBody(value, html) {
    const selector = this.findSelector("body");
    this.clickOrDomClick(selector);
    this.run(["press", process.platform === "darwin" ? "Meta+A" : "Control+A"], 30_000);
    this.resetInheritedBodyFormatting();
    this.clickOrDomClick(selector);
    this.run(["press", process.platform === "darwin" ? "Meta+A" : "Control+A"], 30_000);
    this.pasteClipboard(value, html, { refocusSelector: selector });
  }
  appendBody(value, html) {
    const selector = this.findSelector("body");
    this.replaceEditorText(selector, value, html, { selectAll: false, resetBodyFormatting: true });
  }
  pasteLinkCard(url) {
    const selector = this.findSelector("body");
    this.clickOrDomClick(selector);
    this.focusEditable(selector, { selectAll: false });
    this.pasteClipboard(`\n${url}`, escapeHtml(url));
    this.run(["press", "Enter"], 30_000);
  }
  pressEnterAfterLinkCard(url) {
    const selector = this.findSelector("body");
    const placed = this.js(`(() => {
      const url = ${JSON.stringify(url)};
      const root = document.querySelector('.se-main-container, .se-content') || document.querySelector(${JSON.stringify(selector)}) || document.body;
      if (!root) return 'missing-root';
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        const index = (node.nodeValue || '').indexOf(url);
        if (index < 0) continue;
        const range = document.createRange();
        range.setStart(node, index + url.length);
        range.collapse(true);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        if (node.parentElement) node.parentElement.scrollIntoView({ block: 'center', inline: 'nearest' });
        return 'placed';
      }
      return 'missing-url';
    })()`).replace(/^"|"$/g, "");
    if (placed === "placed") this.run(["press", "Enter"], 30_000);
  }
  imageNodeCount() {
    return Number(this.js(`document.querySelectorAll('.se-main-container .se-module-image img, .se-content .se-image-resource').length`)) || 0;
  }
  imageUploadDiagnostic(inputSelector, beforeCount, index) {
    const result = this.js(`JSON.stringify((() => {
      const input = document.querySelector(${JSON.stringify(inputSelector)});
      return {
        imageIndex: ${JSON.stringify(index)},
        beforeCount: ${JSON.stringify(beforeCount)},
        afterCount: document.querySelectorAll('.se-main-container .se-module-image img, .se-content .se-image-resource').length,
        inputFound: Boolean(input),
        inputConnected: Boolean(input && input.isConnected),
        inputType: input && input.type,
        inputAccept: input && input.accept,
        inputMultiple: Boolean(input && input.multiple),
        inputFiles: input && input.files ? input.files.length : null,
        inputOuterHtml: input ? input.outerHTML.slice(0, 1000) : null,
        toolbarFound: Boolean(document.querySelector('.se-image-toolbar-button')),
        editorImageModules: document.querySelectorAll('.se-main-container .se-module-image, .se-content .se-image-resource').length
      };
    })())`);
    try { return JSON.parse(result); } catch { return { raw: result }; }
  }
  waitForImageNodeCount(expectedCount, inputSelector, beforeCount, index) {
    const result = this.js(`new Promise(resolve => {
      const selector = '.se-main-container .se-module-image img, .se-content .se-image-resource';
      const deadline = Date.now() + 30000;
      const poll = () => {
        const count = document.querySelectorAll(selector).length;
        if (count >= ${JSON.stringify(expectedCount)} || Date.now() >= deadline) return resolve(String(count));
        setTimeout(poll, 250);
      };
      poll();
    })`);
    const afterCount = Number(String(result).replace(/^"|"$/g, ""));
    if (afterCount !== expectedCount) {
      const diagnostic = this.imageUploadDiagnostic(inputSelector, beforeCount, index);
      throw new Error(`Image ${index} upload did not create exactly one SmartEditor image node: expected ${expectedCount}, got ${afterCount}; diagnostic=${JSON.stringify(diagnostic)}`);
    }
  }
  captureToolbarImageInput(index) {
    const marker = String(index);
    const installed = this.js(`(() => {
      if (window.__krNaverImageInputCapture) return 'installed';
      document.querySelectorAll('input[data-kr-naver-image-input]').forEach(input => input.removeAttribute('data-kr-naver-image-input'));
      const state = { input: null };
      const originalClick = HTMLInputElement.prototype.click;
      const originalRemove = Element.prototype.remove;
      const originalRemoveChild = Node.prototype.removeChild;
      window.__krNaverImageInputCapture = { state, originalClick, originalRemove, originalRemoveChild };
      HTMLInputElement.prototype.click = function() {
        if (this.type !== 'file') return originalClick.call(this);
        state.input = this;
        this.setAttribute('data-kr-naver-image-input', ${JSON.stringify(marker)});
        if (!this.isConnected) document.body.appendChild(this);
      };
      Element.prototype.remove = function() {
        if (this === state.input) return this;
        return originalRemove.call(this);
      };
      Node.prototype.removeChild = function(child) {
        if (child === state.input) return child;
        return originalRemoveChild.call(this, child);
      };
      return 'installed';
    })()`);
    assert(/installed/i.test(installed), `Unable to install native image input capture: ${installed}`);
    this.clickOrDomClick(".se-image-toolbar-button");
    const input = this.js(`(() => {
      const captured = window.__krNaverImageInputCapture && window.__krNaverImageInputCapture.state.input;
      if (!captured) return '';
      captured.setAttribute('data-kr-naver-image-input', ${JSON.stringify(marker)});
      if (!captured.isConnected) document.body.appendChild(captured);
      return 'input[data-kr-naver-image-input="' + ${JSON.stringify(marker)} + '"]';
    })()`).replace(/^"|"$/g, "");
    assert(input, "Toolbar click did not create a native image file input");
    return input;
  }
  releaseToolbarImageInput() {
    this.js(`(() => {
      const capture = window.__krNaverImageInputCapture;
      if (!capture) return false;
      HTMLInputElement.prototype.click = capture.originalClick;
      Element.prototype.remove = capture.originalRemove;
      Node.prototype.removeChild = capture.originalRemoveChild;
      const input = capture.state.input;
      delete window.__krNaverImageInputCapture;
      if (input && input.isConnected) input.remove();
      return true;
    })()`);
  }
  uploadImage(filePath, index) {
    const beforeCount = this.imageNodeCount();
    assert(/true/i.test(this.js("Boolean(document.querySelector('.se-image-toolbar-button'))")), "Required Naver SmartEditor image button unavailable");
    let input;
    try {
      input = this.captureToolbarImageInput(index);
      const beforeDiagnostic = this.imageUploadDiagnostic(input, beforeCount, index);
      assert(beforeDiagnostic.inputFound && beforeDiagnostic.inputConnected, `Toolbar native image input is not connected: ${JSON.stringify(beforeDiagnostic)}`);
      this.run(["upload", input, filePath], 60_000);
      this.dismissPastePopups();
      this.waitForImageNodeCount(beforeCount + 1, input, beforeCount, index);
    } finally {
      this.releaseToolbarImageInput();
    }
  }
  generateGeminiThumbnail(prompt, outputPath) {
    const profile = process.env.NAVER_GEMINI_PROFILE || process.env.NAVER_PUBLISH_PROFILE || this.defaultProfile;
    return this.withProfile(profile, () => {
      this.ensurePage();
      // Naver's write page may retain an iframe navigation context. Open Gemini
      // in a fresh tab so a pending GoBlogWrite redirect cannot abort the move.
      this.run(["newtab", process.env.GEMINI_URL || GEMINI_URL]);
      this.run(["wait", "--load"], 20_000);
      const auth = this.js(`JSON.stringify((() => {
        const url = location.href;
        const text = (document.body && document.body.innerText || '').slice(0, 4000);
        const manual = /accounts\\.google|signin|captcha|로그인|본인 인증|비정상적인 트래픽|로봇|계속하려면|확인 코드를/i.test(url + '\\n' + text);
        return { url, manual, text: text.slice(0, 800) };
      })())`);
      const authState = JSON.parse(auth);
      assert(!authState.manual, `Gemini login expired, CAPTCHA detected, or manual authentication is required; open the Gemini browser profile and complete it before prepare. url=${authState.url} text=${authState.text}`);
      const promptSelector = this.js(`(() => {
        const candidates = [
          'rich-textarea div[contenteditable=true]',
          'div[contenteditable=true][role=textbox]',
          'textarea',
          '[contenteditable=true]'
        ];
        const visible = element => {
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 20 && rect.height > 10;
        };
        const element = candidates.flatMap(selector => [...document.querySelectorAll(selector)]).find(visible);
        if (!element) return '';
        element.setAttribute('data-kr-gemini-prompt', 'true');
        return '[data-kr-gemini-prompt=true]';
      })()`).replace(/^"|"$/g, "");
      if (!promptSelector) {
        const diagnostic = this.run(["text"], 20_000).slice(0, 2000);
        throw new Error(`Gemini prompt box unavailable; manual intervention may be required. Page text: ${diagnostic}`);
      }
      this.clickOrDomClick(promptSelector);
      this.pasteClipboard(prompt, escapeHtml(prompt));
      this.run(["press", "Enter"], 30_000);
      const imageResult = this.js(`new Promise(resolve => {
        const started = Date.now();
        const authPattern = /accounts\\.google|signin|captcha|로그인|본인 인증|비정상적인 트래픽|로봇|계속하려면|확인 코드를/i;
        const usableImage = img => {
          const src = img.currentSrc || img.src || '';
          const rect = img.getBoundingClientRect();
          if (!src || rect.width < 64 || rect.height < 64) return false;
          if (/googleusercontent|generativelanguage|blob:|data:image/i.test(src)) return true;
          return /image|generated|response/i.test(img.alt || img.closest('[aria-label],[role]')?.getAttribute('aria-label') || '');
        };
        const poll = async () => {
          const text = (document.body && document.body.innerText || '').slice(0, 4000);
          if (authPattern.test(location.href + '\\n' + text)) return resolve(JSON.stringify({ status: 'auth', url: location.href, text: text.slice(0, 800) }));
          const img = [...document.querySelectorAll('img')].reverse().find(usableImage);
          if (img) {
            document.querySelectorAll('[data-kr-gemini-result-image]').forEach(element => element.removeAttribute('data-kr-gemini-result-image'));
            img.setAttribute('data-kr-gemini-result-image', 'true');
            return resolve(JSON.stringify({ status: 'ok', selector: 'img[data-kr-gemini-result-image=true]' }));
          }
          if (Date.now() - started > 120000) return resolve(JSON.stringify({ status: 'timeout', text: text.slice(0, 1200) }));
          setTimeout(poll, 1000);
        };
        poll();
      })`, 130_000);
      assert(String(imageResult || "").trim(), "Gemini image detection returned an empty browser response");
      const parsed = JSON.parse(String(imageResult).replace(/^"|"$/g, ""));
      assert(parsed.status !== "auth", `Gemini login expired, CAPTCHA detected, or manual authentication is required; thumbnail generation stopped. url=${parsed.url} text=${parsed.text}`);
      assert(parsed.status === "ok" && parsed.selector, `Gemini did not return a capturable image; status=${parsed.status} diagnostic=${JSON.stringify(parsed).slice(0, 1000)}`);
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      this.run(["screenshot", parsed.selector, outputPath], 60_000);
      return outputPath;
    });
  }
  selectRepresentativeThumbnail(filePath) {
    const beforeCount = this.imageNodeCount();
    let selector = this.js(`(() => {
      const visible = element => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && (rect.width > 0 || rect.height > 0);
      };
      const layer = [...document.querySelectorAll('[role=dialog], [class*=publish], [class*=Publish], [class*=layer], [class*=Layer]')]
        .filter(visible)
        .reverse()
        .find(element => /대표|썸네일|미리보기|발행/.test(element.innerText || element.textContent || '')) || document;
      const input = [...layer.querySelectorAll('input[type=file][accept*=image], input[type=file]')].find(visible) || [...layer.querySelectorAll('input[type=file][accept*=image], input[type=file]')][0];
      if (!input) return '';
      input.setAttribute('data-kr-naver-representative-thumbnail', 'true');
      return 'input[data-kr-naver-representative-thumbnail=true]';
    })()`).replace(/^"|"$/g, "");
    if (!selector) selector = this.captureCoverImageInput();
    if (!selector) {
      const diagnostic = this.run(["text"], 20_000).slice(0, 2000);
      throw new Error(`Required Naver representative thumbnail upload control unavailable; publish blocked. Page text: ${diagnostic}`);
    }
    this.run(["upload", selector, filePath], 60_000);
    try {
      this.run(["wait", "--networkidle"], 20_000);
    } catch {
      try { this.run(["wait", "--load"], 10_000); } catch {}
    }
    const afterCount = this.imageNodeCount();
    assert(afterCount === beforeCount, `Representative thumbnail upload inserted an editor body image: before ${beforeCount}, after ${afterCount}`);
    const selected = this.js(`new Promise(resolve => {
      const deadline = Date.now() + 15000;
      const visible = element => {
        if (!element) return false;
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
      };
      const labelOf = element => [
        element.getAttribute('aria-label'),
        element.getAttribute('title'),
        element.innerText,
        element.textContent,
      ].filter(Boolean).join(' ').trim();
      const clickConfirmPosition = () => {
        const confirm = document.querySelector('.se-cover-button-confirm-position');
        if (visible(confirm)) confirm.click();
      };
      const selectedState = () => {
        clickConfirmPosition();
        const selectedMarker = Boolean(document.querySelector([
          '[class*=selected] img',
          '[class*=Selected] img',
          '[aria-selected=true] img',
          '[aria-pressed=true] img',
          '.se-set-rep-image-button.se-is-selected',
          '[class*=rep-image][class*=selected]',
          '[class*=RepImage][class*=Selected]',
          'input[data-kr-naver-representative-thumbnail=true][value]',
          'input[data-kr-naver-cover-thumbnail=true][value]',
        ].join(',')));
        const coverMarker = Boolean(document.querySelector('.se-cover-button-del-image, .se-cover-button-set-position'));
        const doneText = [...document.querySelectorAll('button,[role=button],span,em,strong')]
          .filter(visible)
          .some(element => /대표\\s*이미지\\s*(설정\\s*)?(완료|됨)|대표\\s*설정\\s*(완료|됨)/.test(labelOf(element)));
        return selectedMarker || coverMarker || doneText;
      };
      const roots = () => {
        const scoped = [...document.querySelectorAll('[role=dialog], [class*=publish], [class*=Publish], [class*=layer], [class*=Layer], .se-cover, .se-cover-image')]
          .filter(visible)
          .filter(element => /대표|썸네일|미리보기|발행|cover|thumbnail/i.test(labelOf(element) + ' ' + element.className));
        return scoped.length ? scoped.reverse() : [document.body || document.documentElement];
      };
      const thumbnailCards = () => {
        const cardSelector = '[class*=thumbnail], [class*=Thumbnail], [class*=cover], [class*=Cover], [class*=image], [class*=Image], li, figure, label, div';
        const cards = [];
        for (const root of roots()) {
          for (const card of [...root.querySelectorAll('.se-cover, .se-cover-image, [class*=thumbnail], [class*=Thumbnail], [class*=cover], [class*=Cover]')]) {
            if (visible(card) && !cards.includes(card)) cards.push(card);
          }
          const images = [...root.querySelectorAll('img')].filter(img => {
            const rect = img.getBoundingClientRect();
            return visible(img) && rect.width > 20 && rect.height > 20;
          });
          for (const image of images) {
            const card = image.closest(cardSelector) || image.parentElement;
            if (card && visible(card) && !cards.includes(card)) cards.push(card);
          }
        }
        return cards.reverse();
      };
      const hoverElement = element => {
        const rect = element.getBoundingClientRect();
        const x = rect.left + Math.max(2, Math.min(rect.width / 2, 12));
        const y = rect.top + Math.max(2, Math.min(rect.height / 2, 12));
        for (const type of ['pointerover', 'pointerenter', 'mouseover', 'mouseenter', 'pointermove', 'mousemove']) {
          element.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, view: window }));
        }
      };
      const findRepresentativeButton = () => {
        const explicitSelector = 'button,[role=button],a,label,input[type=button],input[type=checkbox],.se-set-rep-image-button,[class*=rep-image],[class*=RepImage]';
        const explicitButton = () => {
          for (const root of [document, ...roots()]) {
            const button = [...root.querySelectorAll(explicitSelector)]
              .filter(visible)
              .find(element => /대표(\\s*이미지)?(\\s*(설정|지정))?/.test(labelOf(element)) || /se-set-rep-image-button|rep-image|RepImage/.test(String(element.className || '')));
            if (button) return button;
          }
          return null;
        };
        const textButton = explicitButton();
        if (textButton) return textButton;
        for (const card of thumbnailCards()) {
          hoverElement(card);
          const hoveredTextButton = explicitButton();
          if (hoveredTextButton) return hoveredTextButton;
          const cardRect = card.getBoundingClientRect();
          const overlayButton = [...document.querySelectorAll(explicitSelector)]
            .filter(visible)
            .find(element => {
              const rect = element.getBoundingClientRect();
              const centerX = rect.left + rect.width / 2;
              const centerY = rect.top + rect.height / 2;
              return centerX >= cardRect.left && centerX <= cardRect.left + cardRect.width * 0.55
                && centerY >= cardRect.top && centerY <= cardRect.top + cardRect.height * 0.55;
            });
          if (overlayButton) return overlayButton;
          const controls = [...card.querySelectorAll(explicitSelector)]
            .filter(visible)
            .filter(element => {
              const rect = element.getBoundingClientRect();
              const centerX = rect.left + rect.width / 2;
              const centerY = rect.top + rect.height / 2;
              return centerX <= cardRect.left + cardRect.width * 0.55 && centerY <= cardRect.top + cardRect.height * 0.55;
            });
          if (controls[0]) return controls[0];
        }
        return null;
      };
      if (selectedState()) return resolve('true');
      const representativeButton = findRepresentativeButton();
      if (!representativeButton) return resolve('button-missing');
      representativeButton.click();
      clickConfirmPosition();
      const poll = () => {
        if (selectedState()) return resolve('true');
        if (Date.now() >= deadline) return resolve('false');
        setTimeout(poll, 500);
      };
      poll();
    })`);
    assert(!/button-missing/i.test(selected), "Representative thumbnail validation failed; representative image setting button was not detected");
    assert(/true/i.test(selected), "Representative thumbnail validation failed; no selected representative thumbnail marker was detected after clicking the setting button");
  }
  captureCoverImageInput() {
    const selector = this.js(`(() => {
      const button = document.querySelector('.se-cover-button-local-image-upload');
      if (!button) return '';
      document.querySelectorAll('input[data-kr-naver-cover-thumbnail]').forEach(input => input.removeAttribute('data-kr-naver-cover-thumbnail'));
      const state = { input: null };
      const originalClick = HTMLInputElement.prototype.click;
      const originalRemove = Element.prototype.remove;
      const originalRemoveChild = Node.prototype.removeChild;
      HTMLInputElement.prototype.click = function() {
        if (this.type !== 'file') return originalClick.call(this);
        state.input = this;
        this.setAttribute('data-kr-naver-cover-thumbnail', 'true');
        if (!this.isConnected) document.body.appendChild(this);
      };
      Element.prototype.remove = function() {
        if (this === state.input) return this;
        return originalRemove.call(this);
      };
      Node.prototype.removeChild = function(child) {
        if (child === state.input) return child;
        return originalRemoveChild.call(this, child);
      };
      button.click();
      const input = state.input;
      HTMLInputElement.prototype.click = originalClick;
      Element.prototype.remove = originalRemove;
      Node.prototype.removeChild = originalRemoveChild;
      if (!input) return '';
      input.setAttribute('data-kr-naver-cover-thumbnail', 'true');
      if (!input.isConnected) document.body.appendChild(input);
      return 'input[data-kr-naver-cover-thumbnail=true]';
    })()`).replace(/^"|"$/g, "");
    return selector;
  }
  setCategory(value) { this.run(["select", this.findSelector("category"), value]); }
  setTags(values) {
    const selector = this.findSelector("tags");
    this.clickOrDomClick(selector);
    this.js(`(() => {
      const input = document.querySelector(${JSON.stringify(selector)});
      if (input) {
        input.focus();
        if ('value' in input) input.value = '';
      }
      return 'focused';
    })()`);
    for (let index = 0; index < 40; index += 1) {
      const tagSelector = this.js(`(() => {
        document.querySelectorAll('[data-kr-naver-clear-tag]').forEach(element => element.removeAttribute('data-kr-naver-clear-tag'));
        const tag = document.querySelector('[id^=tag-item-][aria-label]');
        if (!tag) return '';
        tag.setAttribute('data-kr-naver-clear-tag', 'true');
        return '[data-kr-naver-clear-tag=true]';
      })()`).replace(/^"|"$/g, "");
      if (!tagSelector) break;
      this.clickOrDomClick(tagSelector);
      this.run(["press", "Backspace"], 30_000);
    }
    for (const value of values) {
      this.run(["fill", selector, value], 30_000);
      this.run(["press", "Enter"], 30_000);
    }
    this.pruneTags(values);
  }
  pruneTags(values) {
    const expectedValues = values.map(String);
    for (let index = 0; index < 40; index += 1) {
      const tagSelector = this.js(`(() => {
        const expected = new Set(${JSON.stringify(expectedValues)});
        document.querySelectorAll('[data-kr-naver-prune-tag]').forEach(element => element.removeAttribute('data-kr-naver-prune-tag'));
        const tag = [...document.querySelectorAll('[id^=tag-item-][aria-label]')]
          .find(element => !expected.has(element.getAttribute('aria-label') || ''));
        if (!tag) return '';
        tag.setAttribute('data-kr-naver-prune-tag', 'true');
        return '[data-kr-naver-prune-tag=true]';
      })()`).replace(/^"|"$/g, "");
      if (!tagSelector) break;
      this.clickOrDomClick(tagSelector);
      this.run(["press", "Backspace"], 30_000);
    }
  }
  saveDraft() {
    const selector = this.markButtonByText("saveDraft", ["저장"]) || this.findSelector("saveDraft");
    this.clickOrDomClick(selector);
    try {
      this.run(["wait", "--networkidle"], 20_000);
    } catch {
      try { this.run(["wait", "--load"], 10_000); } catch {}
    }
  }
  readElement(selector) {
    return this.js(`(() => { const e=document.querySelector(${JSON.stringify(selector)}); return e ? (e.value ?? e.innerText ?? e.textContent ?? '') : ''; })()`).replace(/^"|"$/g, "");
  }
  readBodyText() {
    const result = this.js(`JSON.stringify((() => {
      const textOf = e => {
        const clone = e.cloneNode(true);
        clone.querySelectorAll([
          'button',
          'input',
          'textarea',
          'select',
          '[role=button]',
          '[contenteditable=false]',
          '[class*=toolbar]',
          '[class*=Toolbar]',
          '[class*=resize]',
          '[class*=Resize]',
          '[class*=control]',
          '[class*=Control]',
          '[class*=guide]',
          '[class*=Guide]',
          '[class*=placeholder]',
          '[class*=Placeholder]',
          '.se-table-context-menu',
          '.se-table-control',
          '.se-module-image-option',
          '.se-caption',
          '.se-source'
        ].join(',')).forEach(node => node.remove());
        return (clone.value ?? clone.innerText ?? clone.textContent ?? '')
          .split('\\n')
          .map(line => line.trim())
          .filter(line => line && line !== '출처 입력' && line !== '사진 설명을 입력하세요')
          .join('\\n')
          .trim();
      };
      const tableText = table => [...table.querySelectorAll('tr')]
        .map(row => [...row.querySelectorAll('th,td')].map(cell => textOf(cell)).join('\\t'))
        .join('\\n');
      const components = [...document.querySelectorAll('.se-component.se-text, .se-component.se-quotation, .se-component.se-table')];
      if (components.length) return components.map(component => {
        const table = component.matches('table') ? component : component.querySelector('table');
        return table ? tableText(table) : textOf(component);
      }).filter(Boolean).join('\\n\\n');
      const fallback = document.querySelector(${JSON.stringify(this.findSelector("body"))});
      if (!fallback) return '';
      const tables = [...fallback.querySelectorAll('table')];
      if (!tables.length) return textOf(fallback);
      return textOf(fallback).replace(/\\s*$/, '') + '\\n\\n' + tables.map(tableText).join('\\n\\n');
    })())`);
    try {
      return JSON.parse(result);
    } catch {
      return result.replace(/^"|"$/g, "");
    }
  }
  readTags() {
    const result = this.js(`JSON.stringify((() => {
      const selectors = ${JSON.stringify(SELECTORS.tags)};
      const input = selectors.map(selector => document.querySelector(selector)).find(Boolean);
      if (!input) return [];
      const root = input.closest('[class*=tag_textarea]') || input.parentElement?.parentElement || document;
      const committed = [...root.querySelectorAll('[id^="tag-item-"][aria-label]')]
        .map(tag => tag.getAttribute('aria-label') || '')
        .map(tag => tag.trim().replace(/^#/, ''))
        .filter(Boolean);
      const pending = String(input.value || '').split(',').map(tag => tag.trim().replace(/^#/, '')).filter(Boolean);
      return [...new Set([...committed, ...pending])];
    })())`);
    try { return JSON.parse(result); } catch { return []; }
  }
  readBlockFormatting() {
    const result = this.js(`JSON.stringify((() => {
      const root = document.querySelector('.se-main-container, .se-content') || document;
      let blocks = [...root.querySelectorAll('.se-component.se-text .se-text-paragraph, .se-section-text .se-text-paragraph, .se-component.se-quotation .se-text-paragraph, .se-component.se-quotation p, blockquote p')];
      if (!blocks.length) blocks = [...root.querySelectorAll('h2, h3, p')];
      return blocks.map(block => {
        const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
        const segments = [];
        let node;
        while ((node = walker.nextNode())) {
          const text = (node.nodeValue || '').replace(/\s+/g, ' ').trim();
          if (!text) continue;
          const style = getComputedStyle(node.parentElement || block);
          segments.push({ text, fontSize: style.fontSize, fontWeight: style.fontWeight });
        }
        return {
          text: (block.innerText || block.textContent || '').trim(),
          fontSizes: [...new Set(segments.map(segment => segment.fontSize))],
          fontWeights: [...new Set(segments.map(segment => segment.fontWeight))],
          segments,
        };
      }).filter(block => block.text);
    })())`);
    try { return JSON.parse(result); } catch { return []; }
  }
  readTableData() {
    const result = this.js(`JSON.stringify((() => {
      const root = document.querySelector('.se-main-container, .se-content') || document;
      const cellText = cell => {
        const clone = cell.cloneNode(true);
        clone.querySelectorAll('button,input,textarea,select,[role=button],[contenteditable=false],[class*=toolbar],[class*=Toolbar],[class*=resize],[class*=Resize],[class*=control],[class*=Control],[class*=guide],[class*=Guide]').forEach(node => node.remove());
        return (clone.innerText || clone.textContent || '').trim();
      };
      return [...root.querySelectorAll('table')].map(table => {
        const rows = [...table.querySelectorAll('tr')].map(row => [...row.querySelectorAll('th,td')].map(cellText));
        return { rows, rowCount: rows.length, columnCount: Math.max(0, ...rows.map(row => row.length)) };
      }).filter(table => table.rowCount > 0);
    })())`);
    try { return JSON.parse(result); } catch { return []; }
  }
  inspect() {
    const title = this.readElement(this.findSelector("title"));
    const body = this.readBodyText();
    const imageCount = this.imageNodeCount();
    const separatorCount = Number(this.js(`document.querySelectorAll('.se-main-container .se-horizontalLine, .se-content .se-horizontalLine').length`)) || 0;
    const quoteCount = Number(this.js(`document.querySelectorAll('.se-component.se-quotation, .se-component.se-quote, blockquote, [data-kr-naver-signature]').length`)) || 0;
    const tables = this.readTableData();
    const representativeThumbnailSelected = /true/i.test(this.js(`(() => {
      const coverMarker = Boolean(document.querySelector('.se-cover-button-del-image, .se-cover-button-set-position'));
      const selectedMarker = Boolean(document.querySelector('[class*=selected] img, [class*=Selected] img, [aria-selected=true] img, [aria-pressed=true] img, input[data-kr-naver-representative-thumbnail=true][value], input[data-kr-naver-cover-thumbnail=true][value]'));
      const visible = element => {
        if (!element) return false;
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
      };
      const doneText = [...document.querySelectorAll('button,[role=button],span,em,strong')]
        .filter(visible)
        .some(element => /대표\\s*이미지\\s*(설정\\s*)?(완료|됨)|대표\\s*설정\\s*(완료|됨)/.test([
          element.getAttribute('aria-label'),
          element.getAttribute('title'),
          element.innerText,
          element.textContent,
        ].filter(Boolean).join(' ')));
      return selectedMarker || coverMarker || doneText;
    })()`));
    const linkCardUrls = (() => {
      try {
        return JSON.parse(this.js(`JSON.stringify([...new Set([...document.querySelectorAll('a[href^="http"]')].map(a => a.href))])`));
      } catch {
        return [];
      }
    })();
    return { title, body, imageCount, separatorCount, quoteCount, tableCount: tables.length, tables, tags: this.readTags(), formatBlocks: this.readBlockFormatting(), linkCardUrls, representativeThumbnailSelected };
  }
  screenshot(filePath) { this.run(["screenshot", filePath], 60_000); }
  editorUrl() { return this.js("location.href").replace(/^"|"$/g, ""); }
  dismissRepresentativeThumbnailPosition() {
    const result = this.js(`(() => {
      const visible = element => {
        if (!element) return false;
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
      };
      const label = element => (element.getAttribute('aria-label') || element.innerText || element.textContent || '').replace(/\\s+/g, ' ').trim();
      const movingMessage = document.querySelector('.se-cover-moving-message');
      const layer = movingMessage?.closest('.se-documentTitle-cover-image, [class*=documentTitle]')
        || [...document.querySelectorAll('[role=dialog], [class*=cover], [class*=Cover], [class*=position], [class*=Position], [class*=layer], [class*=Layer]')]
          .filter(visible)
          .find(element => /이미지를 움직여 위치를 조정|대표 위치|위치 조정/.test(element.innerText || element.textContent || ''));
      if (!layer) return 'none';
      const confirm = [...layer.querySelectorAll('button,[role=button],.se-cover-button-confirm-position')].find(element => {
        const style = getComputedStyle(element);
        return style.display !== 'none' && style.visibility !== 'hidden' && /^(확인|완료)$/.test(label(element));
      });
      if (!confirm) return 'confirm-missing';
      confirm.click();
      return 'confirmed';
    })()`);
    assert(!/confirm-missing/i.test(result), "Representative thumbnail position layer is open but its safe confirmation button is unavailable");
    if (/confirmed/i.test(result)) this.js("new Promise(resolve => setTimeout(() => resolve('ok'), 500))");
    return result;
  }
  openPublishLayer() {
    this.dismissRepresentativeThumbnailPosition();
    const alreadyOpen = /true/i.test(this.js("Boolean(document.querySelector('[data-testid=preTimeRadioBtn], #radio_time2'))"));
    if (alreadyOpen) return;
    const selector = this.markButtonByText("publishOpen", ["발행"]) || this.findSelector("publishOpen");
    this.clickOrDomClick(selector, 90_000);
    const opened = this.js(`new Promise(resolve => {
      const deadline = Date.now() + 5000;
      const poll = () => {
        if (document.querySelector('[data-testid=preTimeRadioBtn], #radio_time2')) return resolve('opened');
        if (Date.now() >= deadline) return resolve('missing');
        setTimeout(poll, 100);
      };
      poll();
    })`);
    assert(/opened/i.test(opened), "Naver publish settings layer did not open");
  }
  closePublishLayer() {
    const selector = this.js(`(() => {
      const button = [...document.querySelectorAll('button')].find(element => {
        const label = (element.getAttribute('aria-label') || element.innerText || element.textContent || '').trim();
        return label === '발행 설정 닫기';
      });
      if (!button) return '';
      button.setAttribute('data-kr-naver-role', 'publishClose');
      return 'button[data-kr-naver-role=publishClose]';
    })()`).replace(/^"|"$/g, "");
    if (!selector) return;
    this.clickOrDomClick(selector);
  }
  configureScheduledPublication(schedule) {
    const calendarSetup = JSON.parse(this.js(`(() => {
      const visible = e => { const s=getComputedStyle(e), r=e.getBoundingClientRect(); return s.display!=='none' && s.visibility!=='hidden' && r.width>0 && r.height>0; };
      const text = e => (e.getAttribute('aria-label') || e.innerText || e.textContent || '').replace(/\\s+/g,' ').trim();
      const controls = [...document.querySelectorAll('button,label,input,[role=radio]')].filter(visible);
      const reserve = document.querySelector('label[for=radio_time2], [data-testid=preTimeRadioBtn]')
        || controls.find(e => /^예약(?: 발행)?$/.test(text(e)) || /예약 발행/.test(text(e)) || e.value === '예약');
      if (!reserve) return JSON.stringify({ error: 'schedule-option-missing' });
      reserve.click();
      const dateInput = document.querySelector('input[class*=input_date]');
      if (!dateInput) return JSON.stringify({ mode: 'native' });
      const days = [...document.querySelectorAll('button.ui-state-default')].filter(button => {
        const style = getComputedStyle(button);
        return style.display !== 'none' && style.visibility !== 'hidden';
      });
      if (!days.length) dateInput.click();
      return JSON.stringify({ mode: 'custom' });
    })()`));
    assert(!calendarSetup.error, `Naver scheduled publication configuration failed: ${calendarSetup.error}`);
    if (calendarSetup.mode === 'custom') this.run(['wait', 'div.ui-datepicker'], 3_000);
    const result = JSON.parse(this.js(`(() => {
      const visible = e => { const s=getComputedStyle(e), r=e.getBoundingClientRect(); return s.display!=='none' && s.visibility!=='hidden' && r.width>0 && r.height>0; };
      const text = e => (e.getAttribute('aria-label') || e.innerText || e.textContent || '').replace(/\\s+/g,' ').trim();
      const controls = [...document.querySelectorAll('button,label,input,[role=radio]')].filter(visible);
      const reserve = document.querySelector('label[for=radio_time2], [data-testid=preTimeRadioBtn]')
        || controls.find(e => /^예약(?: 발행)?$/.test(text(e)) || /예약 발행/.test(text(e)) || e.value === '예약');
      if (!reserve) return JSON.stringify({ error: 'schedule-option-missing' });
      reserve.click();
      const dates = [...document.querySelectorAll('input[type=date], input[placeholder*=날짜]')].filter(visible);
      const times = [...document.querySelectorAll('input[type=time], input[placeholder*=시간]')].filter(visible);
      const set = (el, value) => { const proto=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; proto.call(el,value); el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); };
      let dateValue = '';
      let timeValue = '';
      if (dates[0] && times[0]) {
        set(dates[0], ${JSON.stringify(schedule.date)}); set(times[0], ${JSON.stringify(schedule.time)});
        dateValue = dates[0].value; timeValue = times[0].value;
      } else {
        const dateInput = document.querySelector('input[class*=input_date]');
        const hour = document.querySelector('select[class*=hour_option]');
        const minute = document.querySelector('select[class*=minute_option]');
        if (!dateInput || !hour || !minute) return JSON.stringify({ error: 'schedule-date-time-missing' });
        const target = ${JSON.stringify(schedule.date)}.split('-').map(Number);
        const current = (dateInput.value.match(/(\\d{4})\\.\\s*(\\d{1,2})\\.\\s*(\\d{1,2})/) || []).slice(1).map(Number);
        if (current.length !== 3 || current[0] !== target[0] || current[1] !== target[1]) return JSON.stringify({ error: 'schedule-date-month-navigation-missing' });
        const calendarDays = () => [...document.querySelectorAll('button.ui-state-default')].filter(button => {
          const style = getComputedStyle(button);
          return style.display !== 'none' && style.visibility !== 'hidden';
        });
        // The Naver date input toggles its picker.  Do not click it when the
        // picker is already open, otherwise a safe retry closes the picker
        // and makes the requested day appear to be unavailable.
        if (!calendarDays().length) dateInput.click();
        const day = calendarDays().find(button => button.textContent.trim() === String(target[2]) && !button.closest('td')?.classList.contains('ui-state-disabled') && button.tabIndex !== -1);
        if (!day) return JSON.stringify({ error: 'schedule-date-day-missing' });
        day.click();
        hour.value = ${JSON.stringify(schedule.time.slice(0, 2))}; hour.dispatchEvent(new Event('change',{bubbles:true}));
        minute.value = ${JSON.stringify(schedule.time.slice(3, 5))}; minute.dispatchEvent(new Event('change',{bubbles:true}));
        dateValue = dateInput.value.replace(/\\.\\s*/g,'-').replace(/-$/,'').replace(/^(\\d{4})-(\\d)-(\\d)$/, '$1-0$2-0$3').replace(/^(\\d{4})-(\\d)-(\\d{2})$/, '$1-0$2-$3').replace(/^(\\d{4})-(\\d{2})-(\\d)$/, '$1-$2-0$3');
        timeValue = hour.value + ':' + minute.value;
      }
      const publicControl = controls.find(e => /전체공개|공개/.test(text(e)) && !/비공개|이웃/.test(text(e)));
      if (!publicControl) return JSON.stringify({ error: 'public-visibility-missing' });
      publicControl.click();
      return JSON.stringify({ date: dateValue, time: timeValue, visibility: text(publicControl) });
    })()`));
    assert(!result.error, `Naver scheduled publication configuration failed: ${result.error}`);
    assert(result.date === schedule.date && result.time === schedule.time && /공개/.test(result.visibility), "Naver scheduled publication values could not be verified");
    return result;
  }
  inspectScheduledPublication() {
    return JSON.parse(this.js(`(() => {
      const visible = e => { const s=getComputedStyle(e), r=e.getBoundingClientRect(); return s.display!=='none' && s.visibility!=='hidden' && r.width>0 && r.height>0; };
      const dates=[...document.querySelectorAll('input[type=date], input[placeholder*=날짜]')].filter(visible);
      const times=[...document.querySelectorAll('input[type=time], input[placeholder*=시간]')].filter(visible);
      const layerText=[...document.querySelectorAll('[role=dialog], [class*=publish_layer], [class*=PublishLayer], [class*=layer]')].filter(visible).map(e => e.innerText || '').join(' ');
      const dateInput = document.querySelector('input[class*=input_date]');
      const hour = document.querySelector('select[class*=hour_option]');
      const minute = document.querySelector('select[class*=minute_option]');
      const customDate = dateInput?.value.replace(/\\.\\s*/g,'-').replace(/-$/,'').replace(/^(\\d{4})-(\\d)-(\\d)$/, '$1-0$2-0$3').replace(/^(\\d{4})-(\\d)-(\\d{2})$/, '$1-0$2-$3').replace(/^(\\d{4})-(\\d{2})-(\\d)$/, '$1-$2-0$3') || '';
      return JSON.stringify({ date: dates[0]?.value || customDate, time: times[0]?.value || (hour && minute ? hour.value + ':' + minute.value : ''), scheduled: Boolean(document.querySelector('[data-testid=preTimeRadioBtn]:checked, #radio_time2:checked')) || /예약/.test(layerText), visibility: /전체공개|공개/.test(layerText) });
    })()`));
  }
  clickPublicConfirmOnce(selector) {
    let result;
    try {
      result = this.js(`(() => {
        const element = document.querySelector(${JSON.stringify(selector)});
        if (!element) return 'missing';
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        if (style.display === 'none' || style.visibility === 'hidden' || rect.width <= 0 || rect.height <= 0) return 'not-visible';
        if (element.disabled || element.getAttribute('aria-disabled') === 'true') return 'disabled';
        element.scrollIntoView({ block: 'center', inline: 'nearest' });
        element.click();
        return 'clicked-once';
      })()`).replace(/^"|"$/g, "");
    } catch (error) {
      error.publicConfirmationIssued = true;
      throw error;
    }
    if (result !== "clicked-once") {
      const error = new Error(`Final public confirmation was not clickable (${result}); public publish was not attempted`);
      error.publicConfirmationIssued = false;
      throw error;
    }
  }
  markPublicConfirmButton() {
    return this.js(`(() => {
      const visible = element => {
        if (!element) return false;
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
      };
      const label = element => (element.getAttribute('aria-label') || element.innerText || element.textContent || '').replace(/\\s+/g, ' ').trim();
      const buttons = [...document.querySelectorAll('button')]
        .filter(visible)
        .filter(element => label(element) === '발행' && !element.disabled && element.getAttribute('aria-disabled') !== 'true');
      const layerSelector = '[role=dialog], [class*=publish_layer], [class*=PublishLayer], [class*=publishLayer], [class*=layer], [class*=Layer]';
      const layered = buttons.filter(button => {
        const layer = button.closest(layerSelector);
        return layer && visible(layer) && /발행|공개|카테고리|예약/.test(label(layer));
      });
      const element = layered.at(-1) || buttons.at(-1);
      if (!element) return '';
      element.setAttribute('data-kr-naver-role', 'publishConfirmOnce');
      return 'button[data-kr-naver-role=publishConfirmOnce]';
    })()`).replace(/^"|"$/g, "");
  }
  publicationEvidenceUrls() {
    const urls = [];
    try { urls.push(this.run(["url"], 15_000).replace(/^"|"$/g, "")); } catch {}
    try {
      const tabs = this.run(["tabs"], 15_000);
      urls.push(...(tabs.match(/https:\/\/blog\.naver\.com\/[^\s)\]}]+/g) || []));
    } catch {}
    return [...new Set(urls)].filter(isPublicNaverPostUrl);
  }
  waitForPublishedUrl(baselineUrls = [], timeoutMs = PUBLICATION_VERIFY_TIMEOUT_MS) {
    const baseline = new Set(baselineUrls);
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const url = this.publicationEvidenceUrls().find(candidate => !baseline.has(candidate));
      if (url) return url;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 750);
    }
    return "";
  }
  publish() {
    const selector = this.markPublicConfirmButton();
    assert(selector, "Required visible Naver public confirmation button unavailable; public publish was not attempted");
    const baselineUrls = this.publicationEvidenceUrls();
    this.clickPublicConfirmOnce(selector);
    return this.waitForPublishedUrl(baselineUrls);
  }
  schedule() {
    const selector = this.markPublicConfirmButton();
    assert(selector, "Required visible Naver scheduled confirmation button unavailable; scheduled publish was not attempted");
    this.clickPublicConfirmOnce(selector);
    return true;
  }
  publishedUrl() { return this.js("location.href").replace(/^"|"$/g, ""); }
}

function createDriver(args) { return args.fixture ? new FixtureDriver(path.resolve(args.fixture)) : new GstackDriver(); }

function validateEditor(inspected, manifest, expectedBody, options = {}) {
  assert(normalizeText(inspected.title) === normalizeText(manifest.post.title), "Editor title does not match manifest");
  const linkCards = manifestLinkCards(manifest);
  const inspectedComparable = linkCards.length ? stripDailyMarketNewsSection(stripLinkCardUrls(inspected.body, linkCards)) : stripLinkCardUrls(inspected.body, linkCards);
  const expectedComparable = linkCards.length ? stripDailyMarketNewsSection(stripLinkCardUrls(expectedBody, linkCards)) : stripLinkCardUrls(expectedBody, linkCards);
  assert(compactEditorText(inspectedComparable) === compactEditorText(expectedComparable), "Editor body does not match generated post");
  for (const url of linkCards) {
    const found = String(inspected.body || "").includes(url) || (inspected.linkCardUrls || []).includes(url);
    assert(found, `Daily market-news link card URL missing from editor: ${url}`);
  }
  assert(Number(inspected.imageCount) === manifest.post.images.length, `Editor image count mismatch: expected ${manifest.post.images.length}, got ${inspected.imageCount}; file input was processed but SmartEditor image nodes were not created`);
  if (options.validateThumbnail) {
    verifyThumbnailArtifact(manifest);
    assert(inspected.representativeThumbnailSelected, "Representative thumbnail is not selected; public publish was not attempted");
  }
  if (options.expectedTables) validateTables(inspected.tables || [], options.expectedTables);
  if (expectedBody.includes("────────")) assert(Number(inspected.separatorCount) > 0, "Editor section separators are missing");
  if (/krresearchkit/i.test(expectedBody)) assert(Number(inspected.quoteCount) > 0, "Editor KrResearchKit signature quotation is missing");
  if (options.validateTags) {
    const actualTags = new Set((inspected.tags || []).map(tag => normalizeText(tag).replace(/^#/, "")));
    const expectedTags = new Set(manifest.post.tags.map(tag => normalizeText(tag).replace(/^#/, "")));
    const missingTags = [...expectedTags].filter(tag => !actualTags.has(tag));
    const unexpectedTags = [...actualTags].filter(tag => !expectedTags.has(tag));
    assert(!missingTags.length, `Editor tags do not match manifest; missing: ${missingTags.join(", ")}`);
    assert(!unexpectedTags.length, `Editor tags do not match manifest; unexpected: ${unexpectedTags.join(", ")}`);
  }
  assert(/(?:^|\n)출처(?:\n|$)/.test(expectedBody), "Generated post has no Sources section");
  assert(expectedBody.includes("매수·매도를 권유하지 않습니다"), "Generated post has no investment disclaimer");
  if (options.expectedHtml) validateBlockFormatting(inspected.formatBlocks, options.expectedHtml);
  return contentFingerprint({ title: inspected.title, body: normalizeEditorText(inspected.body), imageCount: inspected.imageCount });
}

function setBodyAndInlineImages(driver, markdown, manifest) {
  const chunks = editorContentChunks(markdown);
  const fullBody = editorBody(markdown);
  const fullHtml = editorHtml(markdown);
  let imageIndex = 0;
  let insertedText = false;
  if (!chunks.some((chunk) => chunk.type === "image")) {
    driver.setBody(fullBody, fullHtml);
    return;
  }
  for (const chunk of chunks) {
    if (chunk.type === "image") {
      const image = manifest.post.images[imageIndex];
      assert(image, "Generated post contains more image markers than manifest images");
      driver.uploadImage(image.absolutePath, imageIndex + 1);
      imageIndex += 1;
      continue;
    }
    const text = editorBody(chunk.markdown);
    const html = editorHtml(chunk.markdown);
    if (!insertedText) {
      driver.setBody(text, html);
      insertedText = true;
    } else if (typeof driver.appendBody === "function") {
      driver.appendBody(text, html);
    } else {
      driver.setBody(fullBody, fullHtml);
      break;
    }
  }
  assert(imageIndex === manifest.post.images.length, "Manifest image count does not match generated post image markers");
}

function setBodyWithDailyLinkCards(driver, markdown, manifest) {
  const linkCards = manifestLinkCards(manifest);
  assert(linkCards.length, "Daily market-news link card list is empty");
  assert(!manifest.post.images.length, "Daily market-news link-card placement does not support inline body images");
  for (const url of linkCards) {
    const linePattern = new RegExp(`(^|\\r?\\n)${escapeRegExp(url)}(?=\\r?\\n|$)`);
    assert(linePattern.test(markdown), `Daily market-news raw URL is missing from generated post body: ${url}`);
  }
  driver.setBody(editorBody(markdown), editorHtml(markdown));
  if (typeof driver.pressEnterAfterLinkCard === "function") {
    for (const url of linkCards) driver.pressEnterAfterLinkCard(url);
  }
}

function prepare(args, manifestPath, manifest) {
  if (args.scheduled) assertScheduledPublishAllowed(args, manifest);
  verifyArtifacts(manifest, { allowDailyThumbnailRepair: true });
  const duplicate = args.scheduled ? sameDayPublishedManifest(manifestPath, manifest) : null;
  if (duplicate) throw new Error(`Duplicate same-day daily market-news publication blocked: ${duplicate.path}`);
  const driver = createDriver(args);
  ensureThumbnailArtifact(manifest, driver);
  writeJsonAtomic(manifestPath, manifest);
  const markdown = fs.readFileSync(manifest.post.markdownPath, "utf8");
  const body = editorBody(markdown);
  const html = editorHtml(markdown);
  driver.openEditor();
  assert(driver.isLoggedIn(), "Naver login expired, CAPTCHA detected, or manual authentication is required; public publish was not attempted");
  if (typeof driver.dismissStartupPopups === "function") driver.dismissStartupPopups();
  else if (typeof driver.closeBlockingLayers === "function") driver.closeBlockingLayers();
  const startupInspected = driver.inspect();
  assertWritableDraft(startupInspected, manifest, body);
  driver.setTitle(manifest.post.title);
  if (manifestLinkCards(manifest).length) setBodyWithDailyLinkCards(driver, markdown, manifest);
  else setBodyAndInlineImages(driver, markdown, manifest);
  driver.saveDraft();
  const editorUrl = driver.editorUrl();
  driver.openPublishLayer();
  if (manifest.post.category) driver.setCategory(manifest.post.category);
  if (!isDailyMarketManifest(manifest)) driver.setTags(manifest.post.tags);
  driver.selectRepresentativeThumbnail(manifest.post.thumbnail.absolutePath);
  if (args.scheduled) {
    driver.openPublishLayer();
    driver.configureScheduledPublication(scheduledPublication(manifest));
  }
  if (!isDailyMarketManifest(manifest) && typeof driver.pruneTags === "function") driver.pruneTags(manifest.post.tags);
  driver.closePublishLayer();
  driver.saveDraft();
  driver.openPublishLayer();
  if (args.scheduled) {
    const schedule = scheduledPublication(manifest);
    const inspectedSchedule = driver.inspectScheduledPublication();
    assert(inspectedSchedule?.date === schedule.date && inspectedSchedule?.time === schedule.time && inspectedSchedule.visibility, "Naver scheduled publication values changed before draft validation");
  }
  if (!isDailyMarketManifest(manifest) && typeof driver.pruneTags === "function") driver.pruneTags(manifest.post.tags);
  const inspected = driver.inspect();
  const validateTags = !isDailyMarketManifest(manifest);
  const fingerprint = validateEditor(inspected, manifest, body, { validateTags, validateThumbnail: true, expectedHtml: html, expectedTables: expectedTableData(markdown) });
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
    approvalTokenHash: sha256(`${token}:${manifestSourceSha256(manifest)}:${manifest.post.markdownSha256}:${fingerprint}`),
    validation: { title: true, body: true, imageCount: true, sources: true, disclaimer: true, tags: validateTags, thumbnail: true, separators: true, formatting: true, signatureQuotation: true },
  };
  writeJsonAtomic(manifestPath, manifest);
  return { status: "prepared", manifestPath, screenshotPath, approvalToken: token, expiresAt };
}

function publish(args, manifestPath, manifest) {
  assert(manifest.status !== "published", "Manifest is already published; duplicate publish blocked");
  assert(manifest.status === "prepared" && manifest.prepare, "Prepare must complete before publish");
  if (args.scheduled) assertScheduledPublishAllowed(args, manifest);
  assert(args.token, "Publish requires --token from the latest prepare result");
  assert(args["confirm-public"] === "yes", "Publish requires --confirm-public yes after explicit user approval");
  const duplicate = sameDayPublishedManifest(manifestPath, manifest);
  if (duplicate) throw new Error(`Duplicate same-day daily market-news publication blocked: ${duplicate.path}`);
  assert(Date.now() <= Date.parse(manifest.prepare.expiresAt), "Approval token expired; run prepare again");
  verifyArtifacts(manifest);
  assert(typeof manifest.prepare.approvalTokenHash === "string" && /^[0-9a-f]{64}$/i.test(manifest.prepare.approvalTokenHash), "Approval token was cleared; run prepare again");
  const expectedHash = sha256(`${args.token}:${manifestSourceSha256(manifest)}:${manifest.post.markdownSha256}:${manifest.prepare.contentFingerprint}`);
  const actual = Buffer.from(expectedHash, "hex");
  const stored = Buffer.from(manifest.prepare.approvalTokenHash, "hex");
  assert(actual.length === stored.length && crypto.timingSafeEqual(actual, stored), "Approval token does not match the prepared draft");
  const driver = createDriver(args);
  driver.openPreparedDraft(manifest.prepare.editorUrl);
  assert(driver.isLoggedIn(), "Naver login expired or CAPTCHA detected; public publish was not attempted");
  const markdown = fs.readFileSync(manifest.post.markdownPath, "utf8");
  const body = editorBody(markdown);
  const html = editorHtml(markdown);
  let restored;
  try {
    restored = driver.inspect();
  } catch (error) {
    if (!/selector unavailable: title/i.test(error.message)) throw error;
    driver.openEditor();
    assert(driver.isLoggedIn(), "Naver login expired or CAPTCHA detected; public publish was not attempted");
    if (typeof driver.dismissStartupPopups === "function") driver.dismissStartupPopups();
    restored = driver.inspect();
  }
  const restoredMatches = normalizeText(restored.title) === normalizeText(manifest.post.title)
    && compactEditorText(stripLinkCardUrls(restored.body, manifestLinkCards(manifest))) === compactEditorText(stripLinkCardUrls(body, manifestLinkCards(manifest)))
    && Number(restored.imageCount) === manifest.post.images.length;
  if (!restoredMatches) {
    assertWritableDraft(restored, manifest, body);
    driver.setTitle(manifest.post.title);
    if (manifestLinkCards(manifest).length) setBodyWithDailyLinkCards(driver, markdown, manifest);
    else setBodyAndInlineImages(driver, markdown, manifest);
    driver.saveDraft();
  }
  driver.openPublishLayer();
  if (manifest.post.category) driver.setCategory(manifest.post.category);
  if (!isDailyMarketManifest(manifest)) driver.setTags(manifest.post.tags);
  driver.selectRepresentativeThumbnail(manifest.post.thumbnail.absolutePath);
  if (args.scheduled) {
    driver.openPublishLayer();
    driver.configureScheduledPublication(scheduledPublication(manifest));
  }
  if (!isDailyMarketManifest(manifest) && typeof driver.pruneTags === "function") driver.pruneTags(manifest.post.tags);
  const inspected = driver.inspect();
  const validateTags = !isDailyMarketManifest(manifest);
  const fingerprint = validateEditor(inspected, manifest, body, { validateTags, validateThumbnail: true, expectedHtml: html, expectedTables: expectedTableData(markdown) });
  assert(fingerprint === manifest.prepare.contentFingerprint, "Editor content changed after prepare; public publish was not attempted");
  let schedule = null;
  if (args.scheduled) {
    schedule = scheduledPublication(manifest);
    const inspectedSchedule = driver.inspectScheduledPublication();
    assert(inspectedSchedule?.date === schedule.date && inspectedSchedule?.time === schedule.time && inspectedSchedule.visibility, "Naver scheduled publication values changed before confirmation");
  }
  const attemptedAt = new Date().toISOString();
  manifest.status = "publishing";
  manifest.publish = { attemptedAt, result: "pending-verification", editorUrl: driver.publishedUrl() };
  manifest.prepare.approvalTokenHash = null;
  writeJsonAtomic(manifestPath, manifest);
  writeAudit("public-confirmation-armed", { manifestPath, contentType: manifest.contentType, publicationDate: manifest.post?.publicationDate || manifest.source?.asOfDate });
  let url = "";
  let confirmationIssued = false;
  try {
    if (args.scheduled) {
      driver.schedule();
      confirmationIssued = true;
      manifest.status = "scheduled";
      manifest.publish = { attemptedAt, scheduledAt: `${schedule.date}T${schedule.time}:00+09:00`, result: "scheduled", editorUrl: driver.publishedUrl() };
      writeJsonAtomic(manifestPath, manifest);
      writeAudit("publication-scheduled", { manifestPath, scheduledAt: manifest.publish.scheduledAt });
      return { status: "scheduled", manifestPath, scheduledAt: manifest.publish.scheduledAt };
    }
    url = driver.publish();
    confirmationIssued = true;
    assert(isPublicNaverPostUrl(url), `Public URL was not confirmed within ${PUBLICATION_VERIFY_TIMEOUT_MS / 1000} seconds`);
  } catch (error) {
    confirmationIssued = confirmationIssued || error.publicConfirmationIssued === true;
    let lastKnownUrl = url;
    if (!lastKnownUrl) {
      try { lastKnownUrl = driver.publishedUrl(); } catch { lastKnownUrl = ""; }
    }
    if (!confirmationIssued) {
      manifest.status = "prepared";
      manifest.publish = {
        attemptedAt,
        checkedAt: new Date().toISOString(),
        result: "not-attempted",
        editorUrl: manifest.publish.editorUrl,
        error: String(error.message || error).slice(0, 1000),
      };
      writeJsonAtomic(manifestPath, manifest);
      writeAudit("public-confirmation-not-issued", { manifestPath, error: manifest.publish.error });
      throw new Error(`Public confirmation was not issued. The approval token was cleared; run prepare again before retrying. Cause: ${error.message}`);
    }
    manifest.status = "publication-unverified";
    manifest.publish = {
      ...manifest.publish,
      checkedAt: new Date().toISOString(),
      result: "unverified",
      lastKnownUrl,
      error: String(error.message || error).slice(0, 1000),
    };
    writeJsonAtomic(manifestPath, manifest);
    writeAudit("public-confirmation-unverified", { manifestPath, lastKnownUrl: manifest.publish.lastKnownUrl, error: manifest.publish.error });
    throw new Error(`The public confirmation was issued once, but publication could not be verified. The manifest is now publication-unverified; do not click publish again. Reconcile the public blog first. Cause: ${error.message}`);
  }
  manifest.status = "published";
  manifest.publish = { attemptedAt, publishedAt: new Date().toISOString(), url, result: "published" };
  writeAudit("publication-verified", { manifestPath, url, publicationDate: manifest.post?.publicationDate || manifest.source?.asOfDate });
  writeJsonAtomic(manifestPath, manifest);
  return { status: "published", url, publishedAt: manifest.publish.publishedAt };
}

function validatePublicPostSnapshot(inspected, manifest) {
  const url = inspected?.url || "";
  const text = compactEditorText(inspected?.text || "");
  const expectedTitle = compactEditorText(manifest.post?.title || "");
  const asOfDate = compactEditorText(manifest.source?.asOfDate || manifest.post?.publicationDate || "");
  assert(isPublicNaverPostUrl(url), `Reconciliation did not resolve to a public Naver Blog post URL: ${url || "missing"}`);
  assert(expectedTitle && text.includes(expectedTitle), "Public post title does not match the manifest");
  assert(asOfDate && text.includes(asOfDate), "Public post basis/publication date does not match the manifest");
  assert(text.includes(compactEditorText("출처")), "Public post Sources section was not found");
  assert(text.includes(compactEditorText("매수·매도를 권유하지 않습니다")), "Public post investment disclaimer was not found");
  return { url, title: true, asOfDate: true, sources: true, disclaimer: true };
}

function reconcilePublication(args, manifestPath, manifest) {
  assert(["publishing", "publication-unverified"].includes(manifest.status), "Reconciliation is only allowed for publishing or publication-unverified manifests");
  const publicUrl = String(args["public-url"] || "").trim();
  const confirmedNotPublished = args["not-published"] === "yes";
  assert(Boolean(publicUrl) !== confirmedNotPublished, "Reconcile with exactly one of --public-url <url> or --not-published yes");
  const reconciledAt = new Date().toISOString();
  if (confirmedNotPublished) {
    assert(args["confirm-no-public-post"] === "yes", "Resetting an unverified publication requires --confirm-no-public-post yes after checking the public blog");
    manifest.status = "converted";
    manifest.prepare = null;
    manifest.publish = {
      ...(manifest.publish || {}),
      reconciledAt,
      result: "confirmed-not-published",
      url: null,
    };
    writeJsonAtomic(manifestPath, manifest);
    writeAudit("publication-reconciled-not-published", { manifestPath, publicationDate: manifest.post?.publicationDate || manifest.source?.asOfDate });
    return { status: "converted", result: "confirmed-not-published", manifestPath, reconciledAt };
  }
  assert(isPublicNaverPostUrl(publicUrl), "Reconciliation requires a valid public Naver Blog post URL");
  const driver = createDriver(args);
  driver.openPublicPost(publicUrl);
  const validation = validatePublicPostSnapshot(driver.inspectPublicPost(), manifest);
  const publishedAt = manifest.publish?.attemptedAt || reconciledAt;
  manifest.status = "published";
  manifest.prepare ||= {};
  manifest.prepare.approvalTokenHash = null;
  manifest.publish = {
    ...(manifest.publish || {}),
    publishedAt,
    verifiedAt: reconciledAt,
    publicationTimeBasis: manifest.publish?.attemptedAt ? "attemptedAt" : "verifiedAt",
    url: validation.url,
    result: "reconciled-published",
    validation,
  };
  writeJsonAtomic(manifestPath, manifest);
  writeAudit("publication-reconciled-published", { manifestPath, url: validation.url, publicationDate: manifest.post?.publicationDate || manifest.source?.asOfDate });
  return { status: "published", result: "reconciled-published", url: validation.url, publishedAt, verifiedAt: reconciledAt };
}

function cleanupLegacyBrowser(args) {
  assert(args["confirm-stale-profile"] === "yes", "Legacy browser cleanup requires --confirm-stale-profile yes after confirming no other Naver publishing task is active");
  const forceDedicatedSession = args["force-dedicated-session"] === "yes";
  const profilePath = process.env.NAVER_PUBLISH_PROFILE || path.join(os.homedir(), ".gstack", "kr-naver-blog-publish", "chromium-profile");
  const stateFile = process.env.NAVER_PUBLISH_STATE_FILE || DEFAULT_BROWSE_STATE_FILE;
  const legacy = findLegacyProfileDaemons(profilePath, stateFile);
  const nonOrphans = legacy.filter(item => item.ppid !== 1);
  assert(!nonOrphans.length, `Active legacy browser processes still have parent tasks and were not stopped: ${nonOrphans.map(item => item.pid).join(", ")}`);
  const browse = require("../../kr-naver-browse/scripts/browse-naver.js");
  const bin = browse.resolveBrowseBinary();
  for (const legacyState of [...new Set(legacy.map(item => item.stateFile))]) {
    try {
      execFileSync(bin, ["stop"], {
        encoding: "utf8",
        env: { ...process.env, CHROMIUM_PROFILE: profilePath, BROWSE_STATE_FILE: legacyState },
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 20_000,
        maxBuffer: 2 * 1024 * 1024,
      });
    } catch {
      // The explicit orphan PID cleanup below handles missing/stale state files.
    }
  }
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
  for (const item of legacy) {
    if (!isProcessAlive(item.pid)) continue;
    try { process.kill(item.pid, "SIGTERM"); } catch {}
  }
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 750);
  const remaining = findLegacyProfileDaemons(profilePath, stateFile);
  assert(!remaining.length, `Legacy Naver profile daemons remain after cleanup: ${remaining.map(item => item.pid).join(", ")}`);
  if (forceDedicatedSession) {
    const stopOptions = {
      encoding: "utf8",
      env: { ...process.env, CHROMIUM_PROFILE: profilePath, BROWSE_STATE_FILE: stateFile },
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 20_000,
      maxBuffer: 2 * 1024 * 1024,
    };
    try {
      execFileSync(bin, ["--headed", "stop"], stopOptions);
    } catch (error) {
      const output = String(error.stderr || error.stdout || error.message || "");
      if (/Unknown command: '--headed'/.test(output)) {
        execFileSync(bin, ["stop"], stopOptions);
      } else if (!/Server connection lost|Server crashed|no (?:running )?server/i.test(output)) {
        throw error;
      }
    }
  }
  writeAudit("legacy-browser-cleanup", { stoppedPids: legacy.map(item => item.pid).join(","), forcedDedicatedSession: forceDedicatedSession });
  return {
    status: "clean",
    stoppedPids: legacy.map(item => item.pid),
    forcedDedicatedSession: forceDedicatedSession,
    message: legacy.length || forceDedicatedSession ? undefined : "No stale Naver profile daemons found",
  };
}

function main() {
  const args = parseArgs(process.argv);
  const action = args._[0];
  assert(action === "prepare" || action === "publish" || action === "scheduled-publish" || action === "reconcile" || action === "cleanup-browser", "Usage: publisher.js <prepare|publish|scheduled-publish|reconcile|cleanup-browser> [--manifest <json>] [--fixture <json>] [--token <token> --confirm-public yes] [--scheduled yes] [--public-url <url> | --not-published yes --confirm-no-public-post yes] [--confirm-stale-profile yes --force-dedicated-session yes]");
  if (action !== "cleanup-browser") assert(args.manifest, "--manifest is required");
  const manifestPath = args.manifest ? path.resolve(args.manifest) : null;
  const releaseLock = acquirePublisherLock(action, manifestPath);
  writeAudit("action-started", { action, manifestPath });
  try {
    const manifest = manifestPath ? readJson(manifestPath) : null;
    const result = action === "cleanup-browser"
      ? cleanupLegacyBrowser(args)
      : action === "reconcile"
      ? reconcilePublication(args, manifestPath, manifest)
      : action === "prepare"
      ? prepare(args, manifestPath, manifest)
      : action === "scheduled-publish"
        ? (() => {
          const prepared = prepare({ ...args, scheduled: "yes" }, manifestPath, manifest);
          const latest = readJson(manifestPath);
          return publish({ ...args, scheduled: "yes", token: prepared.approvalToken, "confirm-public": "yes" }, manifestPath, latest);
        })()
        : publish(args, manifestPath, manifest);
    writeAudit("action-completed", { action, manifestPath, status: result.status, url: result.url || "" });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    writeAudit("action-failed", { action, manifestPath, error: String(error.message || error).slice(0, 1000) });
    throw error;
  } finally {
    releaseLock();
  }
}

if (require.main === module) {
  try { main(); } catch (error) { console.error(error.message); process.exit(1); }
}

module.exports = {
  FixtureDriver,
  GstackDriver,
  browserStartupRecoveryGuide,
  editorBody,
  editorHtml,
  expectedTableData,
  isPublicNaverPostUrl,
  parseLegacyProfileDaemons,
  prepare,
  publish,
  reconcilePublication,
  cleanupLegacyBrowser,
  renderExcelTableHtml,
  validateBlockFormatting,
  validateEditor,
  validateTables,
  verifyArtifacts,
};
