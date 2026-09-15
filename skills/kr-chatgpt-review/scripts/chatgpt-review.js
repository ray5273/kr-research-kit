#!/usr/bin/env node
"use strict";

// kr-chatgpt-review — send a finished memo's reasoning to the logged-in
// ChatGPT website (the user's paid web account, not the API or Codex) and save
// the reply as structured feedback.
//
//   node chatgpt-review.js login                         # open the dedicated browser, log in once
//   node chatgpt-review.js status                        # check login state
//   node chatgpt-review.js build-prompt --memo memo.md   # write the review prompt only
//   node chatgpt-review.js review --memo memo.md [--focus "..."] [--out-dir DIR] [--timeout-min 20]
//   node chatgpt-review.js stop                          # close the dedicated browser
//
// The browser is the gstack `browse` binary vendored by kr-naver-browse, run
// against its own persistent profile so the ChatGPT login survives restarts
// and never collides with the Naver publishing profile.

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const CHATGPT_URL = process.env.CHATGPT_REVIEW_URL || "https://chatgpt.com/";
const RUNTIME_DIR = process.env.CHATGPT_REVIEW_HOME || path.join(os.homedir(), ".gstack", "kr-chatgpt-review");
const PROFILE_DIR = process.env.CHATGPT_REVIEW_PROFILE || path.join(RUNTIME_DIR, "chromium-profile");
const STATE_FILE = path.join(RUNTIME_DIR, "browse.json");
const PROMPT_WARN_CHARS = 60_000;
const POLL_MS = 5_000;

// ChatGPT's DOM changes often (the logged-out composer is a plain textarea,
// the logged-in one a ProseMirror div; test ids come and go), so every page
// script starts from these helpers and tries several candidates.
const DOM_HELPERS = `
  const kVisible = e => { if (!e) return false; const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
  const kFirst = selectors => selectors.flatMap(x => [...document.querySelectorAll(x)]).find(kVisible) || null;
  const kComposer = () => kFirst(['#prompt-textarea', 'div.ProseMirror[contenteditable=true]', '[contenteditable=true][role=textbox]', 'textarea#mobile-composer-prompt', 'form textarea', 'main textarea']);
  const kSend = () => kFirst(['[data-testid="send-button"]', '#composer-submit-button', 'button[aria-label="Send message"]', 'button[aria-label="Send prompt"]', 'button[aria-label*="메시지 보내기"]', 'button[aria-label*="보내기"]']);
  const kStop = () => kFirst(['[data-testid="stop-button"]', 'button[aria-label*="Stop"]', 'button[aria-label*="중지"]']);
  const kAssistants = () => { const a = [...document.querySelectorAll('[data-message-author-role="assistant"]')]; return a.length ? a : [...document.querySelectorAll('[data-turn="assistant"]')]; };
  const kLoggedOut = () => [...document.querySelectorAll('button, a')].filter(kVisible).some(e => /^(log in|sign up for free|sign up|로그인|무료로 회원 ?가입|회원 ?가입)$/i.test((e.innerText || '').trim()));
  const kModel = () => { const m = kFirst(['[data-testid="model-switcher-dropdown-button"]', 'button[aria-label*="Model selector"]', 'button[aria-label*="모델"]']); return m ? m.innerText.trim() : ''; };
`;

const FEEDBACK_SECTIONS = [
  { key: "verdict", number: 0, title: "한 줄 판정" },
  { key: "logicGaps", number: 1, title: "논리 비약" },
  { key: "numbers", number: 2, title: "숫자·계산 점검" },
  { key: "counterArguments", number: 3, title: "빠진 반대 논리" },
  { key: "confidence", number: 4, title: "확신도 점검" },
  { key: "falsifiers", number: 5, title: "결론을 뒤집을 데이터" },
  { key: "topFixes", number: 6, title: "먼저 고칠 3가지" },
];

// Holdings, the decision ledger and the private voice corpus must never leave
// the machine, so they are refused by path and by telltale content.
function privateRoots() {
  return [
    process.env.KR_PORTFOLIO_GUARD_HOME,
    process.env.KR_MY_VOICE_HOME,
    path.join(os.homedir(), "stock-analysis-private"),
    path.join(os.homedir(), "folio-private"),
  ].filter(Boolean).map((p) => path.resolve(p));
}

function isPrivatePath(filePath) {
  const resolved = path.resolve(filePath);
  return privateRoots().some((root) => resolved === root || resolved.startsWith(root + path.sep));
}

const PRIVATE_CONTENT_RX = /decision-ledger|portfolio\.json|voice-profile\.md|voice-metrics\.json/i;

function cleanMemo(text) {
  return String(text)
    .replace(/^\s*!\[[^\]]*\]\([^)]*\)\s*$/gm, "")
    .replace(/\[(?:red|blue|brown):\s*([^\]]+)\]/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function asOfDate(text) {
  const m = String(text).match(/^\s*(?:[-*+]\s+)?기준일\s*[:：]\s*(\d{4}-\d{2}-\d{2})/m);
  return m ? m[1] : null;
}

function buildPrompt({ memoText, focus = "" }) {
  const memo = cleanMemo(memoText);
  const basis = asOfDate(memoText);
  const lines = [
    "너는 한국 주식 리서치 메모를 검토하는 까다로운 반대편 애널리스트다.",
    "아래 메모의 결론이 근거에서 논리적으로 따라 나오는지 공격적으로 검토해라.",
    "",
    "규칙",
    "- 칭찬, 메모 요약, 일반론은 쓰지 않는다. 약점만 쓴다.",
    "- 지적할 때는 원문을 짧게 인용해서 어디를 말하는지 분명히 한다.",
    "- 원문에 없는 사실이나 숫자를 쓸 때는 출처 URL을 붙인다. 출처가 없으면 \"확인 필요\"라고 적는다.",
    "- 메모의 계산은 직접 다시 해본다. 틀렸으면 올바른 식을 적는다.",
    basis
      ? `- 메모 기준일은 ${basis}이다. 그 뒤의 정보를 쓰면 "기준일 이후"라고 표시한다.`
      : "- 메모 기준일 이후의 정보를 쓰면 \"기준일 이후\"라고 표시한다.",
    "- 지적할 게 없는 섹션은 \"없음\"이라고만 쓴다. 억지로 채우지 않는다.",
    "- 아래 출력 형식의 제목 번호와 표 머리글을 그대로 지킨다.",
  ];
  if (String(focus).trim()) {
    lines.push("", "특히 볼 것", `- ${String(focus).trim()}`);
  }
  lines.push(
    "",
    "출력 형식",
    "",
    "## 0. 한 줄 판정",
    "지지 / 부분 지지 / 지지 안 함 중 하나와 이유 한 줄.",
    "",
    "## 1. 논리 비약",
    "| # | 원문 주장 | 왜 약한가 | 무엇이 있으면 성립하나 | 심각도(상/중/하) |",
    "|---|---|---|---|---|",
    "",
    "## 2. 숫자·계산 점검",
    "| # | 원문 수치·계산 | 문제 | 다시 계산하거나 확인할 것 |",
    "|---|---|---|---|",
    "",
    "## 3. 빠진 반대 논리",
    "번호 목록. 각 항목은 \"반대 논리 — 메모 결론에 미치는 영향\" 한 줄.",
    "",
    "## 4. 확신도 점검",
    "| 원문 표현 | 과장/과소 | 제안 표현 |",
    "|---|---|---|",
    "",
    "## 5. 결론을 뒤집을 데이터",
    "결론이 틀렸다고 판정할 수 있는 관측 가능한 데이터와 확인 시점. 번호 목록.",
    "",
    "## 6. 먼저 고칠 3가지",
    "우선순위 1~3. 각 항목은 한 줄.",
    "",
    "--- 메모 시작 ---",
    memo,
    "--- 메모 끝 ---",
  );
  return lines.join("\n");
}

// ChatGPT sometimes drops the `##`, bolds the heading, or adds a colon, so
// sections are matched by number + title rather than by exact markdown.
function parseFeedback(markdown) {
  const text = String(markdown || "");
  const lines = text.split(/\r?\n/);
  const headingRx = /^\s*(?:#{1,6}\s*)?(?:\*\*)?\s*([0-6])\s*[.)]\s*(.+?)(?:\*\*)?\s*:?\s*$/;
  const found = [];
  lines.forEach((line, index) => {
    const m = line.match(headingRx);
    if (!m) return;
    const section = FEEDBACK_SECTIONS.find((s) => s.number === Number(m[1]));
    const title = m[2].replace(/\*\*/g, "").replace(/\s+/g, "");
    if (section && title.startsWith(section.title.replace(/\s+/g, "").slice(0, 2))) {
      found.push({ section, index });
    }
  });
  const sections = {};
  found.forEach((entry, i) => {
    const end = i + 1 < found.length ? found[i + 1].index : lines.length;
    if (sections[entry.section.key] !== undefined) return;
    sections[entry.section.key] = lines.slice(entry.index + 1, end).join("\n").trim();
  });
  const verdictText = sections.verdict || "";
  const verdict = /지지\s*안\s*함/.test(verdictText)
    ? "지지 안 함"
    : /부분\s*지지/.test(verdictText)
      ? "부분 지지"
      : /지지/.test(verdictText)
        ? "지지"
        : null;
  const missing = FEEDBACK_SECTIONS.filter((s) => sections[s.key] === undefined).map((s) => `${s.number}. ${s.title}`);
  return { verdict, sections, missing };
}

// ---------------------------------------------------------------------------
// Browser
// ---------------------------------------------------------------------------

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function parseJsResult(output) {
  let value = output;
  for (let i = 0; i < 2 && typeof value === "string"; i += 1) {
    try {
      value = JSON.parse(value);
    } catch {
      break;
    }
  }
  return value;
}

class ChatGptBrowser {
  constructor() {
    const browse = require("../../kr-naver-browse/scripts/browse-naver.js");
    this.bin = browse.resolveBrowseBinary();
    fs.mkdirSync(RUNTIME_DIR, { recursive: true });
    this.env = {
      ...process.env,
      CHROMIUM_PROFILE: PROFILE_DIR,
      BROWSE_STATE_FILE: STATE_FILE,
      BROWSE_PARENT_PID: process.env.BROWSE_PARENT_PID || "0",
    };
    this.headedPrefix = undefined;
  }

  run(args, timeout = 90_000) {
    // Same probe as kr-naver-blog-publish: older gstack builds take a global
    // `--headed` prefix, newer ones reject it as an unknown command.
    if (this.headedPrefix === undefined) {
      try {
        execFileSync(this.bin, ["--headed", "status"], { env: this.env, stdio: ["ignore", "pipe", "pipe"], timeout: 60_000 });
        this.headedPrefix = true;
      } catch (error) {
        this.headedPrefix = !/Unknown command:\s*'?--headed'?/.test(String(error.stderr || error.stdout || error.message));
      }
    }
    const commandArgs = this.headedPrefix ? ["--headed", ...args] : args;
    return execFileSync(this.bin, commandArgs, {
      encoding: "utf8",
      env: this.env,
      stdio: ["ignore", "pipe", "pipe"],
      timeout,
      maxBuffer: 20 * 1024 * 1024,
    }).trim();
  }

  js(expression, timeout = 60_000) {
    return parseJsResult(this.run(["js", expression], timeout));
  }

  pageState() {
    return this.js(`JSON.stringify((() => {${DOM_HELPERS}
      const body = (document.body && document.body.innerText) || '';
      const prompt = kComposer();
      return {
        url: location.href,
        hasPrompt: Boolean(prompt),
        loggedIn: Boolean(prompt) && !kLoggedOut(),
        challenge: /captcha|verify you are human|사람인지 확인|unusual activity/i.test(body.slice(0, 4000)),
        model: kModel(),
      };
    })())`);
  }

  openNewChat() {
    this.run(["newtab", CHATGPT_URL], 60_000);
    try {
      this.run(["wait", "--load"], 30_000);
    } catch {
      // ChatGPT keeps long-lived connections open; the prompt poll below decides.
    }
    const deadline = Date.now() + 60_000;
    let state = this.pageState();
    while (!state.hasPrompt && !state.challenge && Date.now() < deadline) {
      sleepSync(2_000);
      state = this.pageState();
    }
    return state;
  }

  assistantCount() {
    return Number(this.js(`(() => {${DOM_HELPERS} return kAssistants().length; })()`)) || 0;
  }

  insertPrompt(text) {
    const b64 = Buffer.from(text, "utf8").toString("base64");
    const decode = `new TextDecoder().decode(Uint8Array.from(atob(${JSON.stringify(b64)}), c => c.charCodeAt(0)))`;
    const pasted = this.js(`(() => {${DOM_HELPERS}
      const el = kComposer();
      if (!el) return 'missing';
      el.focus();
      if (el.tagName === 'TEXTAREA') {
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
        setter.call(el, ${decode});
        el.dispatchEvent(new Event('input', { bubbles: true }));
        return 'set-value';
      }
      const data = new DataTransfer();
      data.setData('text/plain', ${decode});
      el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
      return 'pasted';
    })()`, 120_000);
    if (pasted === "missing") throw new Error("ChatGPT prompt box not found (composer selectors may have changed)");
    sleepSync(2_000);
    const landed = () => this.js(`JSON.stringify((() => {${DOM_HELPERS}
      const el = kComposer();
      const composer = el && (el.closest('form') || el.parentElement);
      const tiles = composer ? composer.querySelectorAll('[data-testid*="attachment"], [class*="file-tile"], [aria-label*="Pasted"], [aria-label*="붙여"]').length : 0;
      return { chars: el ? (el.tagName === 'TEXTAREA' ? el.value.length : el.innerText.length) : 0, tiles };
    })())`);
    let state = landed();
    if (state.chars < Math.min(200, text.length / 2) && state.tiles === 0) {
      // Paste handler did not take it; fall back to a plain text insertion.
      this.js(`(() => {${DOM_HELPERS}
        const el = kComposer();
        el.focus();
        document.execCommand('insertText', false, ${decode});
        return 'inserted';
      })()`, 120_000);
      sleepSync(2_000);
      state = landed();
    }
    if (state.chars < Math.min(200, text.length / 2) && state.tiles === 0) {
      throw new Error(`Prompt did not land in the ChatGPT composer (chars=${state.chars})`);
    }
    return state;
  }

  send() {
    const deadline = Date.now() + 90_000;
    while (Date.now() < deadline) {
      const clicked = this.js(`(() => {${DOM_HELPERS}
        const button = kSend();
        if (!button) return 'missing';
        if (button.disabled || button.getAttribute('aria-disabled') === 'true') return 'disabled';
        button.click();
        return 'clicked';
      })()`);
      if (clicked === "clicked") return;
      sleepSync(2_000);
    }
    throw new Error("ChatGPT send button never became enabled (pasted text may still be uploading)");
  }

  waitForAnswer(beforeCount, timeoutMs) {
    const started = Date.now();
    let lastLength = -1;
    let stablePolls = 0;
    let lastLog = 0;
    while (Date.now() - started < timeoutMs) {
      sleepSync(POLL_MS);
      const state = this.js(`JSON.stringify((() => {${DOM_HELPERS}
        const messages = kAssistants();
        const last = messages[messages.length - 1];
        const tail = ((document.body && document.body.innerText) || '').slice(-3000);
        return {
          count: messages.length,
          generating: Boolean(kStop()),
          length: last ? last.innerText.trim().length : 0,
          limited: /reached (?:your|the) (?:\\w+ )?limit|usage cap|한도에 도달|한도를 초과|too many requests/i.test(tail),
          challenge: /captcha|verify you are human|사람인지 확인/i.test(tail),
        };
      })())`);
      if (state.challenge) throw new Error("ChatGPT asked for a human check; finish it in the dedicated browser and rerun");
      if (state.limited && !state.generating) throw new Error("ChatGPT reported a usage limit; stop and retry later");
      if (state.count > beforeCount && !state.generating && state.length > 0) {
        stablePolls = state.length === lastLength ? stablePolls + 1 : 0;
        if (stablePolls >= 2) return;
      }
      lastLength = state.length;
      if (Date.now() - lastLog > 30_000) {
        lastLog = Date.now();
        const elapsed = Math.round((Date.now() - started) / 1000);
        process.stderr.write(`[chatgpt-review] ${elapsed}s: ${state.generating ? "generating" : "waiting"}, ${state.length} chars\n`);
      }
    }
    throw new Error(`ChatGPT did not finish within ${Math.round(timeoutMs / 60000)} minutes; the conversation is still open in the dedicated browser`);
  }

  // Rebuild markdown from the rendered reply so tables and headings survive;
  // innerText would flatten tables into tab-separated lines.
  extractLastAnswer() {
    return this.js(`JSON.stringify((() => {${DOM_HELPERS}
      const messages = kAssistants();
      const message = messages[messages.length - 1];
      if (!message) return { ok: false };
      const root = message.querySelector('.markdown') || message;
      const inline = node => {
        if (node.nodeType === 3) return node.textContent;
        if (node.nodeType !== 1) return '';
        const tag = node.tagName;
        const inner = [...node.childNodes].map(inline).join('');
        if (tag === 'STRONG' || tag === 'B') return inner.trim() ? '**' + inner.trim() + '**' : '';
        if (tag === 'EM' || tag === 'I') return inner.trim() ? '*' + inner.trim() + '*' : '';
        if (tag === 'CODE') return '\`' + inner + '\`';
        if (tag === 'A') return node.href && !inner.includes(node.href) ? inner + ' (' + node.href + ')' : inner;
        if (tag === 'BR') return '\\n';
        return inner;
      };
      const cell = c => inline(c).replace(/\\|/g, '\\\\|').replace(/\\s+/g, ' ').trim();
      const block = (node, depth) => {
        if (node.nodeType === 3) return node.textContent.trim() ? node.textContent.trim() + '\\n\\n' : '';
        if (node.nodeType !== 1) return '';
        const tag = node.tagName;
        if (/^H[1-6]$/.test(tag)) return '#'.repeat(Number(tag[1])) + ' ' + inline(node).trim() + '\\n\\n';
        if (tag === 'P') return inline(node).trim() + '\\n\\n';
        if (tag === 'UL' || tag === 'OL') {
          let n = 0;
          return [...node.children].map(li => {
            n += 1;
            const parts = [...li.childNodes].map(child => {
              if (child.nodeType === 1 && (child.tagName === 'UL' || child.tagName === 'OL')) return '\\n' + block(child, depth + 1).trimEnd();
              if (child.nodeType === 1 && child.tagName === 'P') return inline(child).trim() + ' ';
              return inline(child);
            }).join('').trim();
            return '  '.repeat(depth) + (tag === 'OL' ? n + '. ' : '- ') + parts;
          }).join('\\n') + '\\n\\n';
        }
        if (tag === 'TABLE') {
          const rows = [...node.querySelectorAll('tr')].map(row => [...row.children].map(cell));
          if (!rows.length) return '';
          const width = Math.max(...rows.map(r => r.length));
          const line = r => '| ' + Array.from({ length: width }, (_, k) => r[k] || '').join(' | ') + ' |';
          return [line(rows[0]), '|' + Array(width).fill('---').join('|') + '|', ...rows.slice(1).map(line)].join('\\n') + '\\n\\n';
        }
        if (tag === 'PRE') return '\`\`\`\\n' + node.innerText.trim() + '\\n\`\`\`\\n\\n';
        if (tag === 'BLOCKQUOTE') return '> ' + node.innerText.trim().replace(/\\n/g, '\\n> ') + '\\n\\n';
        if (tag === 'HR') return '---\\n\\n';
        if (tag === 'BUTTON' || tag === 'svg' || tag === 'SVG') return '';
        return [...node.childNodes].map(child => block(child, depth)).join('');
      };
      return {
        ok: true,
        markdown: block(root, 0).replace(/\\n{3,}/g, '\\n\\n').trim(),
        text: message.innerText.trim(),
        url: location.href,
        model: kModel(),
      };
    })())`, 120_000);
  }
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const opts = { command: argv[0], memo: null, focus: "", outDir: null, timeoutMin: 20 };
  for (let i = 1; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      if (argv[i + 1] === undefined) throw new Error(`Missing value for ${arg}`);
      i += 1;
      return argv[i];
    };
    switch (arg) {
      case "--memo": opts.memo = next(); break;
      case "--focus": opts.focus = next(); break;
      case "--out-dir": opts.outDir = next(); break;
      case "--timeout-min": opts.timeoutMin = Number(next()); break;
      default: throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return opts;
}

function loadMemo(memoPath) {
  if (!memoPath) throw new Error("--memo is required");
  const resolved = path.resolve(memoPath);
  if (!fs.existsSync(resolved)) throw new Error(`memo not found: ${resolved}`);
  if (isPrivatePath(resolved)) throw new Error(`refusing to send a file from a private directory: ${resolved}`);
  const text = fs.readFileSync(resolved, "utf8");
  if (PRIVATE_CONTENT_RX.test(text)) {
    throw new Error("memo references holdings, the decision ledger, or the private voice profile; refusing to send it to ChatGPT");
  }
  return { resolved, text };
}

function writePrompt(opts) {
  const { resolved, text } = loadMemo(opts.memo);
  const outDir = path.resolve(opts.outDir || path.dirname(resolved));
  fs.mkdirSync(outDir, { recursive: true });
  const prompt = buildPrompt({ memoText: text, focus: opts.focus });
  const promptPath = path.join(outDir, "chatgpt-review-prompt.md");
  fs.writeFileSync(promptPath, `${prompt}\n`, "utf8");
  if (prompt.length > PROMPT_WARN_CHARS) {
    process.stderr.write(`[chatgpt-review] warning: prompt is ${prompt.length} chars; ChatGPT may turn it into a pasted-text attachment\n`);
  }
  return { memoPath: resolved, outDir, prompt, promptPath };
}

function feedbackMarkdown({ memoPath, answer, parsed, requestedAt }) {
  return [
    "# ChatGPT 논리 검토 피드백",
    "",
    `- 메모: ${memoPath}`,
    `- 요청 시각: ${requestedAt}`,
    `- 대화 URL: ${answer.url}`,
    `- 모델 표시: ${answer.model || "(확인 안 됨)"}`,
    `- 판정: ${parsed.verdict || "(판정 문구 없음)"}`,
    `- 형식 누락 섹션: ${parsed.missing.length ? parsed.missing.join(", ") : "없음"}`,
    "",
    "> ChatGPT 답변 원문이다. 사실 출처가 아니며, 반영 전에 1차 자료로 확인한다.",
    "",
    "---",
    "",
    answer.markdown || answer.text,
    "",
  ].join("\n");
}

function commandStatus(browser, { open }) {
  const state = open ? browser.openNewChat() : browser.pageState();
  console.log(JSON.stringify({ profile: PROFILE_DIR, ...state }, null, 2));
  if (!state.loggedIn) {
    console.log("\n로그인이 필요하다. 열린 전용 브라우저 창에서 ChatGPT 유료 계정으로 직접 로그인한 뒤 `status`를 다시 실행한다.");
  }
  return state;
}

function commandReview(opts) {
  const { memoPath, outDir, prompt, promptPath } = writePrompt(opts);
  const browser = new ChatGptBrowser();
  const state = browser.openNewChat();
  if (state.challenge) throw new Error("ChatGPT is showing a human check; complete it in the dedicated browser, then rerun");
  if (!state.loggedIn) {
    throw new Error("ChatGPT is not logged in on the dedicated profile; run `chatgpt-review.js login`, log in by hand, then rerun");
  }
  const requestedAt = new Date().toISOString();
  const before = browser.assistantCount();
  browser.insertPrompt(prompt);
  browser.send();
  browser.waitForAnswer(before, Math.max(1, opts.timeoutMin) * 60_000);
  const answer = browser.extractLastAnswer();
  if (!answer || !answer.ok) throw new Error("Could not read the ChatGPT reply from the page");
  const parsed = parseFeedback(answer.markdown || answer.text);
  const feedbackPath = path.join(outDir, "chatgpt-feedback.md");
  const jsonPath = path.join(outDir, "chatgpt-feedback.json");
  fs.writeFileSync(feedbackPath, feedbackMarkdown({ memoPath, answer, parsed, requestedAt }), "utf8");
  fs.writeFileSync(jsonPath, `${JSON.stringify({
    memoPath,
    promptPath,
    requestedAt,
    conversationUrl: answer.url,
    model: answer.model,
    verdict: parsed.verdict,
    missingSections: parsed.missing,
    sections: parsed.sections,
    generatedBy: "kr-chatgpt-review/chatgpt-review.js",
  }, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    status: "reviewed",
    verdict: parsed.verdict,
    missingSections: parsed.missing,
    conversationUrl: answer.url,
    model: answer.model,
    feedbackPath,
    jsonPath,
    promptPath,
  }, null, 2));
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  switch (opts.command) {
    case "build-prompt": {
      const { promptPath, prompt } = writePrompt(opts);
      console.log(JSON.stringify({ promptPath, chars: prompt.length }, null, 2));
      break;
    }
    case "login":
      commandStatus(new ChatGptBrowser(), { open: true });
      break;
    case "status":
      commandStatus(new ChatGptBrowser(), { open: true });
      break;
    case "review":
      commandReview(opts);
      break;
    case "stop":
      console.log(new ChatGptBrowser().run(["stop"], 30_000));
      break;
    default:
      throw new Error("Usage: chatgpt-review.js <login|status|build-prompt|review|stop> [--memo memo.md] [--focus text] [--out-dir dir] [--timeout-min 20]");
  }
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

module.exports = {
  FEEDBACK_SECTIONS,
  asOfDate,
  buildPrompt,
  cleanMemo,
  isPrivatePath,
  loadMemo,
  parseArgs,
  parseFeedback,
  parseJsResult,
};
