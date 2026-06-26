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

function editorBody(markdown) {
  return normalizeText(markdownTablesToTsv(markdown)
    .replace(/^#\s+.+?[ \t]*$/m, "")
    .replace(/^!\[[^\]]*]\([^)]+\.png(?:\?[^)]*)?\)\s*$/gim, "")
    .replace(/^#{2,6}\s+(.+?)[ \t]*$/gm, "$1")
    .replace(/^---+[ \t]*$/gm, "────────")
    .replace(/^>\s?/gm, "")
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

const OPINION_STRONG_PATTERN = /중립적 관찰|매수 전환 검토|둘 다 맞고|스탠스|판단|검토|관찰|쪽이다|해석/;
const NEGATIVE_STRONG_PATTERN = /별풍선.*역성장|역성장|마진 압축|치지직|글로벌 미입증|가치 함정|감익|하락|리스크|악화|미실현|부정|약화|촉매 부재|점유율 상실|성장 엔진은 식었다|제한적|과소추정|잘못 본다|그칠 것|낮은 수수료|확산이 없다면|크지 않다/;
const POSITIVE_STRONG_PATTERN = /저평가|순현금|배당수익률|배당|자사주 소각|반전|촉매|강한 하방|딥밸류|싸다|하방 보강|긍정|의미가 커진다|부가가치|리레이팅|확산 레퍼런스|손익계산서에 보일 수 있는 규모|구축\/운영|반복 판매/;
const NEGATIVE_AUTO_PHRASES = [
  "역성장과 마진 압축 리스크",
  "성장 엔진은 식었다",
  "글로벌 미입증",
  "점유율 상실",
  "촉매 부재",
  "낮은 수수료",
  "마진 압축",
  "가치 함정",
  "별풍선 역성장",
  "역성장",
  "과소추정",
  "치지직",
  "감익",
  "하락",
  "리스크",
  "악화",
  "미실현",
  "부정",
  "약화",
  "제한적",
  "크지 않다",
  "그칠 것",
  "확산이 없다면",
  "잘못 본다",
];
const POSITIVE_AUTO_PHRASES = [
  "손익계산서에 보일 수 있는 규모",
  "순현금과 배당수익률",
  "외부 고객 반복 판매",
  "확산 레퍼런스",
  "자사주 소각",
  "강한 하방",
  "하방 보강",
  "배당수익률",
  "구축/운영",
  "부가가치",
  "리레이팅",
  "저평가",
  "순현금",
  "배당",
  "반전",
  "촉매",
  "딥밸류",
  "싸다",
  "긍정",
  "의미가 커진다",
  "반복 판매",
];
const AUTO_HIGHLIGHT_PHRASES = [
  ...POSITIVE_AUTO_PHRASES.map(phrase => ({ phrase, tone: "positive" })),
  ...NEGATIVE_AUTO_PHRASES.map(phrase => ({ phrase, tone: "negative" })),
].sort((a, b) => b.phrase.length - a.phrase.length);

function semanticStrongHtml(value) {
  const opinion = OPINION_STRONG_PATTERN.test(value);
  const negative = NEGATIVE_STRONG_PATTERN.test(value);
  const positive = POSITIVE_STRONG_PATTERN.test(value);
  if (opinion) return `<span style="color:#8a5a2b;font-weight:700;">${value}</span>`;
  if (negative) return `<span style="color:#1a73e8;font-weight:700;">${value}</span>`;
  if (positive) return `<span style="color:#d93025;font-weight:700;">${value}</span>`;
  return `<strong>${value}</strong>`;
}

function phraseTone(value) {
  const negative = NEGATIVE_STRONG_PATTERN.test(value);
  const positive = POSITIVE_STRONG_PATTERN.test(value);
  if (positive && !negative) return "positive";
  if (negative && !positive) return "negative";
  return null;
}

function autoStrongHtml(value, tone) {
  const color = tone === "positive" ? "#d93025" : "#1a73e8";
  return `<span style="color:${color};font-weight:700;">${escapeHtml(value)}</span>`;
}

function autoHighlightPlainText(value) {
  const text = String(value);
  const tone = phraseTone(text);
  if (!tone) return escapeHtml(text);
  const ranges = [];
  for (const { phrase, tone: phraseToneValue } of AUTO_HIGHLIGHT_PHRASES) {
    if (phraseToneValue !== tone) continue;
    let start = 0;
    while (start < text.length) {
      const index = text.indexOf(phrase, start);
      if (index < 0) break;
      const end = index + phrase.length;
      if (!ranges.some(range => index < range.end && end > range.start)) ranges.push({ start: index, end, tone });
      start = end;
    }
  }
  if (!ranges.length) return escapeHtml(text);
  ranges.sort((a, b) => a.start - b.start || b.end - a.end);
  let cursor = 0;
  let html = "";
  for (const range of ranges) {
    if (range.start < cursor) continue;
    html += escapeHtml(text.slice(cursor, range.start));
    html += autoStrongHtml(text.slice(range.start, range.end), range.tone);
    cursor = range.end;
  }
  html += escapeHtml(text.slice(cursor));
  return html;
}

function inlineHtml(value) {
  const text = String(value);
  const tokenPattern = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+]\(https?:\/\/[^)]+\))/g;
  let cursor = 0;
  let html = "";
  let match;
  while ((match = tokenPattern.exec(text)) !== null) {
    html += autoHighlightPlainText(text.slice(cursor, match.index));
    const token = match[0];
    const strong = token.match(/^\*\*([^*]+)\*\*$/);
    const code = token.match(/^`([^`]+)`$/);
    const link = token.match(/^\[([^\]]+)]\((https?:\/\/[^)]+)\)$/);
    if (strong) html += semanticStrongHtml(escapeHtml(strong[1].replace(/`([^`]+)`/g, "$1")));
    else if (code) html += `<code>${escapeHtml(code[1])}</code>`;
    else if (link) html += `${escapeHtml(link[1])} <span>(${escapeHtml(link[2])})</span>`;
    cursor = match.index + token.length;
  }
  html += autoHighlightPlainText(text.slice(cursor));
  return html;
}

function tableCellText(value) {
  return String(value)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)]\((https?:\/\/[^)]+)\)/g, "$1 ($2)");
}

function tableCellHtml(value) {
  return inlineHtml(String(value).replace(/<br\s*\/?>/gi, "\n")).replace(/\n/g, "<br>");
}

function renderExcelTableHtml(table) {
  const tableStyle = "border-collapse:collapse;table-layout:auto;margin:0;";
  const baseCellStyle = "border:1px solid #d9d9d9;padding:6px 8px;font-size:14px;line-height:1.45;white-space:pre-wrap;vertical-align:top;";
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
  const bodyStyle = "font-size:15px;font-weight:400;line-height:1.7;margin:0;";
  const bodyTextStyle = "font-size:15px;font-weight:400;line-height:1.7;";
  const quoteStyle = "font-size:15px;font-weight:400;line-height:1.7;margin:0;padding:14px 18px;border-left:4px solid #03c75a;background:#f6f8f7;";
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
      pushBlock(`<h2 style="font-size:28px;font-weight:700;line-height:1.45;margin:0;"><strong style="font-size:28px;font-weight:700;line-height:1.45;">${inlineHtml(h2[1])}</strong></h2>`);
      continue;
    }
    const h3 = trimmed.match(/^###\s+(.+?)\s*$/);
    if (h3) {
      flushParagraph();
      pushBlock(`<h3 style="font-size:24px;font-weight:700;line-height:1.45;margin:0;"><strong style="font-size:24px;font-weight:700;line-height:1.45;">${inlineHtml(h3[1])}</strong></h3>`);
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
  return path.resolve(path.dirname(manifest.post.markdownPath), "assets", "naver-thumbnail.png");
}

function thumbnailPrompt(manifest) {
  return `${manifest.post.title} 블로그 썸네일 만들어줘`;
}

function verifyThumbnailArtifact(manifest) {
  const thumbnail = manifest.post.thumbnail;
  assert(thumbnail, "Manifest thumbnail metadata missing; run prepare again");
  assert(thumbnail.status === "generated", `Thumbnail is not generated: ${thumbnail.status || "unknown"}`);
  assert(thumbnail.source === "gemini-web", `Unsupported thumbnail source: ${thumbnail.source || "unknown"}`);
  assert(thumbnail.prompt === thumbnailPrompt(manifest), "Thumbnail prompt does not match the generated blog title; run prepare again");
  assert(fs.existsSync(thumbnail.absolutePath), `Thumbnail missing: ${thumbnail.relativePath || thumbnail.absolutePath}`);
  assert(isSupportedImage(thumbnail.absolutePath), `Thumbnail is not a supported non-empty PNG/JPG/WebP image: ${thumbnail.relativePath || thumbnail.absolutePath}`);
  assert(fileSha256(thumbnail.absolutePath) === thumbnail.sha256, `Thumbnail changed after prepare: ${thumbnail.relativePath || thumbnail.absolutePath}`);
}

function ensureThumbnailArtifact(manifest, driver) {
  const prompt = thumbnailPrompt(manifest);
  if (manifest.post.thumbnail) {
    verifyThumbnailArtifact(manifest);
    return manifest.post.thumbnail;
  }
  const absolutePath = thumbnailOutputPath(manifest);
  const relativePath = path.relative(path.dirname(manifest.post.markdownPath), absolutePath).replace(/\\/g, "/");
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  if (!isSupportedImage(absolutePath)) driver.generateGeminiThumbnail(prompt, absolutePath);
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
        assert(actualText === expectedText, `Editor table ${index + 1} cell mismatch at row ${rowIndex + 1}, column ${cellIndex + 1}: expected "${expectedText}", got "${actualText}"`);
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
  const titleOk = isBlankOrPlaceholder(title) || title === expectedTitle || sameGeneratedStockDraft;
  const incompleteSelfDraft = body.startsWith(expectedTitle) || expected.startsWith(body);
  const sameGeneratedDraft = title === expectedTitle && body.includes(manifest.post.company);
  const bodyOk = isBlankOrPlaceholder(body) || body === expected || incompleteSelfDraft || sameGeneratedDraft || sameGeneratedStockDraft;
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
  if (manifest.post.thumbnail) verifyThumbnailArtifact(manifest);
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
    return { title: this.fixture.editor.title, body: this.fixture.editor.body, imageCount: this.fixture.editor.images, tags: this.fixture.editor.tags || [], separatorCount, quoteCount, tableCount: tables.length, tables, formatBlocks, representativeThumbnailSelected: Boolean(this.fixture.representativeThumbnail?.selected) };
  }
  screenshot(filePath) { fs.writeFileSync(filePath, Buffer.from("fixture preview\n", "utf8")); }
  editorUrl() { return this.fixture.editorUrl || "https://blog.naver.com/GoBlogWrite.naver?fixtureDraft=1"; }
  openPublishLayer() { this.recordClick("publishOpen"); this.fixture.publishLayerOpen = true; this.persist(); }
  closePublishLayer() { this.fixture.publishLayerOpen = false; this.persist(); }
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
    this.supportsHeadedFlag = null;
    this.defaultProfile = path.join(os.homedir(), ".gstack", "kr-naver-blog-publish", "chromium-profile");
    this.env = {
      ...process.env,
      CHROMIUM_PROFILE: process.env.NAVER_PUBLISH_PROFILE || this.defaultProfile,
    };
  }
  withProfile(profilePath, callback) {
    const previous = this.env;
    this.env = { ...process.env, CHROMIUM_PROFILE: profilePath };
    try {
      return callback();
    } finally {
      this.env = previous;
    }
  }
  run(args, timeout = 90_000) {
    if (this.supportsHeadedFlag === null) {
      try {
        execFileSync(this.bin, ["--headed", "status"], { encoding: "utf8", env: this.env, timeout: 15_000, maxBuffer: 1024 * 1024 });
        this.supportsHeadedFlag = true;
      } catch (error) {
        this.supportsHeadedFlag = !/Unknown command: '--headed'/.test(String(error.stderr || error.stdout || error.message));
      }
    }
    const commandArgs = this.supportsHeadedFlag && !args.includes("--headed") ? ["--headed", ...args] : args;
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
  pasteClipboard(plainText, html) {
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
      assert(/clipboard-ok/i.test(fallback), `Browser clipboard rejected text insertion: ${result}; fallback: ${fallback}`);
    }
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
  }
  openEditor() { this.run(["frame", "main"]); this.gotoAllowRedirectAbort(process.env.NAVER_BLOG_WRITE_URL || WRITE_URL); this.run(["wait", "--load"], 15_000); this.enterEditorFrame(); }
  openPreparedDraft(url) { assert(url, "Prepared draft URL is missing"); this.run(["frame", "main"]); this.gotoAllowRedirectAbort(url); this.run(["wait", "--load"], 15_000); this.enterEditorFrame(); }
  isLoggedIn() {
    const url = this.js("location.href");
    const text = this.run(["text"]);
    return !/nid\.naver\.com|captcha|자동입력 방지|로그인이 필요|로그인해 주세요/i.test(`${url}\n${text.slice(0, 3000)}`);
  }
  setTitle(value) {
    const selector = this.findSelector("title");
    this.clickOrDomClick(selector);
    this.run(["press", process.platform === "darwin" ? "Meta+A" : "Control+A"], 30_000);
    this.pasteClipboard(value, escapeHtml(value));
  }
  setBody(value, html) {
    const selector = this.findSelector("body");
    this.clickOrDomClick(selector);
    this.run(["press", process.platform === "darwin" ? "Meta+A" : "Control+A"], 30_000);
    this.resetInheritedBodyFormatting();
    this.pasteClipboard(value, html);
  }
  appendBody(value, html) {
    const selector = this.findSelector("body");
    this.replaceEditorText(selector, value, html, { selectAll: false, resetBodyFormatting: true });
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
      this.run(["frame", "main"]);
      this.gotoAllowRedirectAbort(process.env.GEMINI_URL || GEMINI_URL);
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
    this.run(["wait", "--networkidle"], 20_000);
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
    const existingCount = Number(this.js("document.querySelectorAll('[id^=tag-item-][aria-label]').length")) || 0;
    for (let index = 0; index < existingCount; index += 1) this.run(["press", "Backspace"], 30_000);
    for (const value of values) {
      this.run(["fill", selector, value], 30_000);
      this.run(["press", "Enter"], 30_000);
    }
  }
  saveDraft() {
    const selector = this.markButtonByText("saveDraft", ["저장"]) || this.findSelector("saveDraft");
    this.clickOrDomClick(selector); this.run(["wait", "--networkidle"], 20_000);
  }
  readElement(selector) {
    return this.js(`(() => { const e=document.querySelector(${JSON.stringify(selector)}); return e ? (e.value ?? e.innerText ?? e.textContent ?? '') : ''; })()`).replace(/^"|"$/g, "");
  }
  readBodyText() {
    const result = this.js(`JSON.stringify((() => {
      const textOf = e => (e.value ?? e.innerText ?? e.textContent ?? '').trim();
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
      return [...root.querySelectorAll('table')].map(table => {
        const rows = [...table.querySelectorAll('tr')].map(row => [...row.querySelectorAll('th,td')].map(cell => (cell.innerText || cell.textContent || '').trim()));
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
    return { title, body, imageCount, separatorCount, quoteCount, tableCount: tables.length, tables, tags: this.readTags(), formatBlocks: this.readBlockFormatting(), representativeThumbnailSelected };
  }
  screenshot(filePath) { this.run(["screenshot", filePath], 60_000); }
  editorUrl() { return this.js("location.href").replace(/^"|"$/g, ""); }
  openPublishLayer() {
    const selector = this.markButtonByText("publishOpen", ["발행"]) || this.findSelector("publishOpen");
    this.clickOrDomClick(selector);
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
  publish() {
    const selector = this.markButtonByText("publishConfirm", ["발행"]) || this.findSelector("publishConfirm");
    this.clickOrDomClick(selector); this.run(["wait", "--networkidle"], 30_000);
  }
  publishedUrl() { return this.js("location.href").replace(/^"|"$/g, ""); }
}

function createDriver(args) { return args.fixture ? new FixtureDriver(path.resolve(args.fixture)) : new GstackDriver(); }

function validateEditor(inspected, manifest, expectedBody, options = {}) {
  assert(normalizeText(inspected.title) === normalizeText(manifest.post.title), "Editor title does not match manifest");
  assert(normalizeEditorText(inspected.body) === normalizeEditorText(expectedBody), "Editor body does not match generated post");
  assert(Number(inspected.imageCount) === manifest.post.images.length, `Editor image count mismatch: expected ${manifest.post.images.length}, got ${inspected.imageCount}; file input was processed but SmartEditor image nodes were not created`);
  if (options.validateThumbnail) {
    verifyThumbnailArtifact(manifest);
    assert(inspected.representativeThumbnailSelected, "Representative thumbnail is not selected; public publish was not attempted");
  }
  if (options.expectedTables) validateTables(inspected.tables || [], options.expectedTables);
  if (expectedBody.includes("────────")) assert(Number(inspected.separatorCount) > 0, "Editor section separators are missing");
  if (/stock research skill/i.test(expectedBody)) assert(Number(inspected.quoteCount) > 0, "Editor research-skill signature quotation is missing");
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

function prepare(args, manifestPath, manifest) {
  verifyArtifacts(manifest);
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
  setBodyAndInlineImages(driver, markdown, manifest);
  driver.saveDraft();
  const editorUrl = driver.editorUrl();
  driver.openPublishLayer();
  if (manifest.post.category) driver.setCategory(manifest.post.category);
  driver.setTags(manifest.post.tags);
  driver.selectRepresentativeThumbnail(manifest.post.thumbnail.absolutePath);
  driver.closePublishLayer();
  driver.saveDraft();
  driver.openPublishLayer();
  const inspected = driver.inspect();
  const fingerprint = validateEditor(inspected, manifest, body, { validateTags: true, validateThumbnail: true, expectedHtml: html, expectedTables: expectedTableData(markdown) });
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
    validation: { title: true, body: true, imageCount: true, sources: true, disclaimer: true, tags: true, thumbnail: true, separators: true, formatting: true, signatureQuotation: true },
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
  driver.openPublishLayer();
  if (manifest.post.category) driver.setCategory(manifest.post.category);
  driver.setTags(manifest.post.tags);
  const inspected = driver.inspect();
  const fingerprint = validateEditor(inspected, manifest, editorBody(markdown), { validateTags: true, validateThumbnail: true, expectedHtml: editorHtml(markdown), expectedTables: expectedTableData(markdown) });
  assert(fingerprint === manifest.prepare.contentFingerprint, "Editor content changed after prepare; public publish was not attempted");
  driver.publish();
  const url = driver.publishedUrl();
  assert(/^https:\/\/blog\.naver\.com\//.test(url), `Unexpected published URL: ${url}`);
  assert(!/GoBlogWrite|PostWriteForm|Redirect=Write|workingonit/i.test(url), `Publish did not leave the editor; public URL was not confirmed: ${url}`);
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

module.exports = {
  FixtureDriver,
  editorBody,
  editorHtml,
  expectedTableData,
  prepare,
  publish,
  renderExcelTableHtml,
  validateBlockFormatting,
  validateEditor,
  verifyArtifacts,
};
