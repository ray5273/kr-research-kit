#!/usr/bin/env node

// Reusable Naver browse helpers. Node stdlib only.
//
// Other KR Naver skills (kr-naver-blogger, kr-naver-insight) require this
// module. It wraps the skill-local gstack browse binary and encodes Naver-specific URL
// patterns that are known to render text in headless mode.

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const DEFAULT_TIMEOUT_MS = 30_000;
const REQUEST_DELAY_MS = 1_000;
const EMPTY_RETRY_WAIT_MS = 5_000;
const MAX_BUFFER = 5 * 1024 * 1024;
const POST_TEXT_TRUNCATE = 3000;

let cachedBin = null;
let lastRequestAt = 0;

// ---------------------------------------------------------------------------
// Binary resolution
// ---------------------------------------------------------------------------

function executableCandidates(baseName) {
  if (process.platform === "win32") {
    return [`${baseName}.exe`, `${baseName}.cmd`, `${baseName}.bat`, baseName];
  }
  return [baseName];
}

function firstExecutableInDir(dirPath, baseName) {
  if (!dirPath) return null;
  for (const candidateName of executableCandidates(baseName)) {
    const candidate = path.join(dirPath, candidateName);
    if (!fs.existsSync(candidate)) continue;
    if (process.platform === "win32") return candidate;
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return candidate;
    } catch {
      // keep looking
    }
  }
  return null;
}

function assertGstackBrowseBinary(binPath) {
  if (!binPath || !fs.existsSync(binPath)) return false;
  if (process.platform !== "win32") {
    try {
      fs.accessSync(binPath, fs.constants.X_OK);
    } catch {
      return false;
    }
  }
  try {
    const out = execFileSync(binPath, ["--help"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 5_000,
      maxBuffer: MAX_BUFFER,
    });
    return /gstack browse|Usage:\s*browse/i.test(out);
  } catch {
    return false;
  }
}

function resolveBrowseBinary() {
  if (cachedBin) return cachedBin;

  if (process.env.GSTACK_BROWSE_BIN) {
    const explicit = path.resolve(process.env.GSTACK_BROWSE_BIN);
    if (assertGstackBrowseBinary(explicit)) {
      cachedBin = explicit;
      return cachedBin;
    }
    throw new Error(`GSTACK_BROWSE_BIN is not a usable gstack browse binary: ${explicit}`);
  }

  const localBin = firstExecutableInDir(
    path.join(__dirname, "..", "vendor", "gstack", "browse", "dist"),
    "browse"
  );
  if (assertGstackBrowseBinary(localBin)) {
    cachedBin = localBin;
    return cachedBin;
  }

  // Mac/Linux skill-install fallback: look for browse binary in installed Codex
  // or Claude skill locations so source-repo scripts still work when vendor/
  // has not been built in the repo itself.
  if (process.platform === "darwin" || process.platform === "linux") {
    const codexHome = process.env.CODEX_HOME || path.join(process.env.HOME || "", ".codex");
    const claudeHome = process.env.CLAUDE_HOME || path.join(process.env.HOME || "", ".claude");
    const installFallbacks = [
      path.join(codexHome, "skills", "kr-naver-browse", "vendor", "gstack", "browse", "dist"),
      path.join(codexHome, "skills", "gstack", "browse", "dist"),
      path.join(claudeHome, "skills", "kr-naver-browse", "vendor", "gstack", "browse", "dist"),
      path.join(claudeHome, "skills", "gstack", "browse", "dist"),
    ];
    for (const dir of installFallbacks) {
      const candidate = firstExecutableInDir(dir, "browse");
      if (assertGstackBrowseBinary(candidate)) {
        cachedBin = candidate;
        return cachedBin;
      }
    }
  }

  const codexHome = process.env.CODEX_HOME || path.join(process.env.HOME || "", ".codex");
  const claudeHome = process.env.CLAUDE_HOME || path.join(process.env.HOME || "", ".claude");
  throw new Error(
    "gstack browse binary not found or not executable.\n" +
      "Searched:\n" +
      `  1. $GSTACK_BROWSE_BIN (not set or invalid)\n` +
      `  2. ${path.join(__dirname, "..", "vendor", "gstack", "browse", "dist", "browse")}\n` +
      (process.platform === "darwin" || process.platform === "linux"
        ? `  3. ${path.join(codexHome, "skills", "kr-naver-browse", "vendor", "gstack", "browse", "dist", "browse")}\n` +
          `  4. ${path.join(codexHome, "skills", "gstack", "browse", "dist", "browse")}\n` +
          `  5. ${path.join(claudeHome, "skills", "kr-naver-browse", "vendor", "gstack", "browse", "dist", "browse")}\n` +
          `  6. ${path.join(claudeHome, "skills", "gstack", "browse", "dist", "browse")}\n`
        : "") +
      "Fix: run  bash scripts/install-skill.sh kr-naver-browse  or  bash scripts/install-claude-skill.sh kr-naver-browse  to build the binary,\n" +
      "or set GSTACK_BROWSE_BIN to an existing gstack browse binary path."
  );
}

// ---------------------------------------------------------------------------
// Low-level browse command
// ---------------------------------------------------------------------------

function sleepSync(ms) {
  if (ms <= 0) return;
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      execFileSync("sh", ["-c", `sleep ${(ms / 1000).toFixed(3)}`], {
        stdio: "ignore",
      });
      return;
    } catch {
      while (Date.now() < end) {
        /* spin */
      }
      return;
    }
  }
}

function enforceRequestDelay() {
  const since = Date.now() - lastRequestAt;
  if (since < REQUEST_DELAY_MS) {
    sleepSync(REQUEST_DELAY_MS - since);
  }
  lastRequestAt = Date.now();
}

function runBrowse(args, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const bin = resolveBrowseBinary();
  try {
    return execFileSync(bin, args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: timeoutMs,
      maxBuffer: MAX_BUFFER,
    });
  } catch (err) {
    const stderr = err.stderr ? err.stderr.toString("utf8") : "";
    const wrapped = new Error(
      `${bin} ${args.join(" ")} failed: ${err.message}${stderr ? `\n${stderr}` : ""}`
    );
    wrapped.cause = err;
    throw wrapped;
  }
}

function browseTextOnce(url, opts) {
  enforceRequestDelay();
  runBrowse(["goto", url], opts);
  try {
    runBrowse(["wait", "--load"], { timeoutMs: 10_000 });
  } catch {
    // non-fatal
  }
  const text = runBrowse(["text"], opts);
  return text ? text.trim() : "";
}

function browseText(url, opts = {}) {
  const normalized = normalizeNaverUrl(url);
  let text = "";
  let lastErr = null;
  try {
    text = browseTextOnce(normalized, opts);
  } catch (err) {
    lastErr = err;
    if (isFatalBrowseError(err)) throw err;
    if (opts.verbose) console.error(`[browse-naver] first attempt failed: ${err.message}`);
  }
  if (text && text.length > 50) return text;

  sleepSync(EMPTY_RETRY_WAIT_MS);
  try {
    text = browseTextOnce(normalized, opts);
  } catch (err) {
    lastErr = err;
    if (isFatalBrowseError(err)) throw err;
    if (opts.verbose) console.error(`[browse-naver] retry failed: ${err.message}`);
    if (isRuntimeBrowseFailure(err)) throw err;
    return null;
  }
  if ((!text || text.length <= 50) && lastErr && isRuntimeBrowseFailure(lastErr)) {
    throw lastErr;
  }
  return text && text.length > 50 ? text : null;
}

function browseLinksOnce(url, opts) {
  enforceRequestDelay();
  runBrowse(["goto", url], opts);
  try {
    runBrowse(["wait", "--load"], { timeoutMs: 10_000 });
  } catch {
    // non-fatal
  }
  const raw = runBrowse(["links"], opts);
  return raw ? raw.trim() : "";
}

function browseLinks(url, opts = {}) {
  const normalized = normalizeNaverUrl(url);
  let raw = "";
  let lastErr = null;
  try {
    raw = browseLinksOnce(normalized, opts);
  } catch (err) {
    lastErr = err;
    if (isFatalBrowseError(err)) throw err;
    if (opts.verbose) console.error(`[browse-naver] links first attempt failed: ${err.message}`);
  }
  if (raw && raw.length > 50) return raw;

  sleepSync(EMPTY_RETRY_WAIT_MS);
  try {
    raw = browseLinksOnce(normalized, opts);
  } catch (err) {
    lastErr = err;
    if (isFatalBrowseError(err)) throw err;
    if (opts.verbose) console.error(`[browse-naver] links retry failed: ${err.message}`);
    if (isRuntimeBrowseFailure(err)) throw err;
    return null;
  }
  if ((!raw || raw.length <= 50) && lastErr && isRuntimeBrowseFailure(lastErr)) {
    throw lastErr;
  }
  return raw && raw.length > 50 ? raw : null;
}

function isFatalBrowseError(err) {
  const message = err && err.message ? err.message : "";
  return /gstack browse (?:binary|runtime) not found|GSTACK_BROWSE_BIN|not a usable gstack browse binary|ENOENT/.test(message);
}

function isRuntimeBrowseFailure(err) {
  const message = err && err.message ? err.message : "";
  return (
    isFatalBrowseError(err) ||
    /No available port after \d+ attempts|Server failed to start|Failed to start: \[browse\]|EADDRINUSE|ECONNREFUSED|timed out/i.test(
      message
    )
  );
}

// ---------------------------------------------------------------------------
// URL normalization
// ---------------------------------------------------------------------------

function normalizeNaverUrl(url) {
  if (!url) return url;
  const trimmed = String(url).trim();

  // Desktop blog post URLs render the body inside #mainFrame, which `browse
  // text` cannot reach. Rewrite every blog-post variant to the mobile form,
  // which serves the body inline.
  const pathMatch = trimmed.match(
    /^https?:\/\/(?:m\.)?blog\.naver\.com\/([A-Za-z0-9_-]+)\/(\d{6,})/
  );
  if (pathMatch) {
    const [, blogId, logNo] = pathMatch;
    return `https://m.blog.naver.com/${blogId}/${logNo}`;
  }

  const postViewMatch = trimmed.match(
    /^https?:\/\/(?:m\.)?blog\.naver\.com\/PostView\.naver\?[^#]*\bblogId=([A-Za-z0-9_-]+)[^#]*\blogNo=(\d{6,})/
  );
  if (postViewMatch) {
    const [, blogId, logNo] = postViewMatch;
    return `https://m.blog.naver.com/${blogId}/${logNo}`;
  }

  return trimmed;
}

// ---------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------

function parseNaverSearchResults(text) {
  if (!text) return [];
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const urlRegex = /https?:\/\/(?:m\.)?blog\.naver\.com\/[A-Za-z0-9_?=&/-]+/g;
  const results = [];
  const seen = new Set();

  for (let i = 0; i < lines.length; i += 1) {
    const matches = lines[i].match(urlRegex);
    if (!matches) continue;

    for (const raw of matches) {
      const normalized = normalizeNaverUrl(raw);
      if (seen.has(normalized)) continue;
      seen.add(normalized);

      const ctx = lines.slice(Math.max(0, i - 3), Math.min(lines.length, i + 4));
      const blogIdMatch = normalized.match(/blogId=([A-Za-z0-9_-]+)/);
      const logNoMatch = normalized.match(/logNo=(\d+)/);
      const dateMatch = ctx.join(" ").match(/\b(20\d{2})[./-](\d{1,2})[./-](\d{1,2})\b/);

      let title = "";
      for (let j = i - 1; j >= Math.max(0, i - 3); j -= 1) {
        const candidate = lines[j];
        if (!candidate) continue;
        if (/https?:\/\/(?:m\.)?blog\.naver\.com\//.test(candidate)) continue;
        if (candidate.length < 4) continue;
        title = candidate;
        break;
      }

      let snippet = "";
      for (let j = i + 1; j <= Math.min(lines.length - 1, i + 3); j += 1) {
        const candidate = lines[j];
        if (!candidate) continue;
        if (/https?:\/\/(?:m\.)?blog\.naver\.com\//.test(candidate)) continue;
        if (candidate.length < 10) continue;
        snippet = candidate;
        break;
      }

      results.push({
        blogId: blogIdMatch ? blogIdMatch[1] : null,
        logNo: logNoMatch ? logNoMatch[1] : null,
        url: normalized,
        title,
        snippet,
        date: dateMatch
          ? `${dateMatch[1]}-${dateMatch[2].padStart(2, "0")}-${dateMatch[3].padStart(2, "0")}`
          : null,
      });
    }
  }
  return results;
}

function parsePostList(text) {
  if (!text) return [];
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const results = [];
  const seen = new Set();

  for (let i = 0; i < lines.length; i += 1) {
    const logNoMatch = lines[i].match(/logNo=(\d{6,})/) || lines[i].match(/\/(\d{10,})\b/);
    if (!logNoMatch) continue;
    const logNo = logNoMatch[1];
    if (seen.has(logNo)) continue;
    seen.add(logNo);

    let title = "";
    for (let j = i - 1; j >= Math.max(0, i - 2); j -= 1) {
      if (lines[j] && !/logNo=|blog\.naver/.test(lines[j])) {
        title = lines[j];
        break;
      }
    }

    const ctx = lines.slice(Math.max(0, i - 2), Math.min(lines.length, i + 3)).join(" ");
    const dateMatch = ctx.match(/\b(20\d{2})[./-](\d{1,2})[./-](\d{1,2})\b/);

    results.push({
      logNo,
      title,
      date: dateMatch
        ? `${dateMatch[1]}-${dateMatch[2].padStart(2, "0")}-${dateMatch[3].padStart(2, "0")}`
        : null,
    });
  }
  return results;
}

// Parse the `browse links` output from a blogger's PostList page.
// Each line looks like: "Post title → https://blog.naver.com/PostView.naver?blogId=...&logNo=..."
function parsePostListFromLinks(linksText) {
  if (!linksText) return [];
  const lines = linksText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const results = [];
  const seen = new Set();

  for (const line of lines) {
    const logNoMatch = line.match(/logNo=(\d{6,})/);
    if (!logNoMatch) continue;
    const logNo = logNoMatch[1];
    if (seen.has(logNo)) continue;
    seen.add(logNo);

    const arrowIdx = line.indexOf(" → ");
    const title = arrowIdx > 0 ? line.slice(0, arrowIdx).trim() : "";
    if (!title || title.length < 4) continue;

    const dateMatch = line.match(/\b(20\d{2})[./-](\d{1,2})[./-](\d{1,2})\b/);

    results.push({
      logNo,
      title,
      date: dateMatch
        ? `${dateMatch[1]}-${dateMatch[2].padStart(2, "0")}-${dateMatch[3].padStart(2, "0")}`
        : null,
    });
  }
  return results;
}

// Mobile Naver blog chrome lines and our own browse-tool wrappers that should
// never count as the post title or body.
const POST_VIEW_CHROME = new Set([
  "본문 바로가기",
  "블로그",
  "카테고리 이동",
  "카테고리",
  "검색",
  "MY메뉴 열기",
  "이웃추가",
  "이웃",
  "URL복사",
  "신고하기",
  "공유하기",
  "본문 기타 기능",
  "본문 폰트 크기 조정",
  "본문 폰트 크기 작게 보기",
  "본문 폰트 크기 크게 보기",
  "가",
  "닫기",
  "취소",
  "확인",
  // Login-wall / hamburger sidebar chrome that some posts return ahead of the body.
  "로그인이 필요합니다.",
  "로그인이 필요합니다",
  "내소식",
  "이웃목록",
  "통계",
  "클립만들기",
  "글쓰기",
  "My Menu 닫기",
  "내 체크인",
  "최근 본 글",
  "내 동영상",
  "내 클립",
  "내 상품 관리",
  "NEW",
  "마켓 플레이스",
  "장바구니",
  "마켓 구매내역",
  "블로그팀 공식블로그",
  "이달의 블로그",
  "공식 블로그",
  "블로그 앱",
  "로그인",
  "PC버전으로 보기",
  "블로그 고객센터",
  "ⓒ NAVER Corp.",
  "Category",
  "Menu",
  "URL",
  "Share",
  "Copy URL",
  "Advertisement",
]);

function isPostViewChrome(line) {
  if (!line) return true;
  if (POST_VIEW_CHROME.has(line)) return true;
  if (/^---\s*(BEGIN|END)\s+UNTRUSTED\b/i.test(line)) return true;
  if (/^https?:/.test(line)) return true;
  return false;
}

function parsePostView(text) {
  if (!text) return null;
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

  // Title detection: on mobile Naver, the post body is preceded by a
  //   <blog name> -> <category> -> <title> -> <author> -> <date>
  // header band. The title is the line immediately above the author line,
  // which itself sits one line above the publish date `YYYY. M. D. HH:MM`.
  const datePattern = /^\d{4}\.\s*\d{1,2}\.\s*\d{1,2}\./;
  let title = "";
  let dateLineIdx = -1;
  for (let i = 0; i < Math.min(lines.length, 60); i += 1) {
    if (datePattern.test(lines[i])) {
      dateLineIdx = i;
      break;
    }
  }
  if (dateLineIdx > 1) {
    // Walk backwards from the date line, skip chrome, the first non-chrome
    // line is the author. The next non-chrome line above is the title.
    let nonChromeSeen = 0;
    for (let i = dateLineIdx - 1; i >= 0 && nonChromeSeen < 2; i -= 1) {
      const candidate = lines[i];
      if (isPostViewChrome(candidate)) continue;
      if (candidate.length < 2 || candidate.length > 200) continue;
      nonChromeSeen += 1;
      if (nonChromeSeen === 2) {
        title = candidate;
        break;
      }
    }
  }
  if (!title) {
    // Fallback: longest non-chrome line in the first 8 non-chrome lines.
    const candidates = [];
    for (const line of lines) {
      if (candidates.length >= 8) break;
      if (isPostViewChrome(line)) continue;
      if (line.length < 2 || line.length > 200) continue;
      if (datePattern.test(line)) continue;
      candidates.push(line);
    }
    for (const cand of candidates) {
      if (cand.length > title.length) title = cand;
    }
  }

  const dateMatch = text.match(
    /\b(20\d{2})[.\/-]\s*(\d{1,2})[.\/-]\s*(\d{1,2})\b/
  );
  const date = dateMatch
    ? `${dateMatch[1]}-${dateMatch[2].padStart(2, "0")}-${dateMatch[3].padStart(2, "0")}`
    : null;

  const body = lines
    .filter((line) => !isPostViewChrome(line))
    .join("\n")
    .trim();

  const truncated =
    body.length > POST_TEXT_TRUNCATE ? `${body.slice(0, POST_TEXT_TRUNCATE)}...` : body;

  return { title, date, text: truncated };
}

// Parse `browse links` output from a blogger's PostSearchList page.
// Post links there look like:
//   "title → https://blog.naver.com/<blogId>?Redirect=Log&logNo=<logNo>&from=postView&..."
// We filter to links where the blogId segment matches the target so unrelated
// navigation links (e.g. profile, category) cannot inflate the count.
function parseBlogSearchResults(linksText, blogId) {
  if (!linksText || !blogId) return [];
  const lines = linksText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const escId = blogId.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
  const rx = new RegExp(
    "https?://(?:m\\.)?blog\\.naver\\.com/" + escId + "(?:\\?|/)[^\\s]*logNo=(\\d{6,})"
  );
  const results = [];
  const seen = new Set();

  for (const line of lines) {
    const m = line.match(rx);
    if (!m) continue;
    const logNo = m[1];
    if (seen.has(logNo)) continue;
    seen.add(logNo);

    const arrowIdx = line.indexOf(" → ");
    const title = arrowIdx > 0 ? line.slice(0, arrowIdx).trim() : "";
    if (!title || title.length < 2) continue;

    results.push({
      blogId,
      logNo,
      title,
      url: `https://blog.naver.com/PostView.naver?blogId=${blogId}&logNo=${logNo}`,
    });
  }
  return results;
}

// Count pagination links (`javascript:goPage(N)`) in a PostSearchList page.
// Used as a depth indicator / tie-break signal for blogger coverage.
function countBlogSearchPaginationPages(linksText) {
  if (!linksText) return 0;
  const matches = linksText.match(/javascript:goPage\(\d+\)/g);
  return matches ? matches.length : 0;
}

function parseNaverSearchLinks(linksText) {
  if (!linksText) return [];
  const lines = linksText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const blogUrlRegex = /https?:\/\/(?:m\.)?blog\.naver\.com\/([A-Za-z0-9_-]+)\/(\d{6,})/;
  const results = [];
  const seen = new Set();

  for (const line of lines) {
    const match = line.match(blogUrlRegex);
    if (!match) continue;
    const [, blogId, logNo] = match;
    const normalized = `https://blog.naver.com/PostView.naver?blogId=${blogId}&logNo=${logNo}`;
    if (seen.has(normalized)) continue;
    seen.add(normalized);

    const urlIndex = line.indexOf("http");
    const title =
      urlIndex > 0 ? line.slice(0, urlIndex).trim().replace(/\s*[-–>→]+$/, "").trim() : "";
    const dateMatch = line.match(/\b(20\d{2})[./-](\d{1,2})[./-](\d{1,2})\b/);

    results.push({
      blogId,
      logNo,
      url: normalized,
      title: title.length >= 4 ? title : "",
      snippet: "",
      date: dateMatch
        ? `${dateMatch[1]}-${dateMatch[2].padStart(2, "0")}-${dateMatch[3].padStart(2, "0")}`
        : null,
    });
  }
  return results;
}

// ---------------------------------------------------------------------------
// High-level helpers
// ---------------------------------------------------------------------------

// Parse Naver's 연관검색어 (related queries) block from a blog search results
// page. Related-query links are the ones pointing back to search.naver.com
// with `sm=tab_she` in the querystring — that's Naver's marker for
// suggestions/related queries surfaced under the search box. Returns
// `[{ text, nickname, wholeQuery }]` where `nickname` is the text after the
// company prefix (or the whole text if it's attached as a suffix), and
// `wholeQuery` is true when no separable nickname could be extracted.
function parseRelatedQueries(linksText, company) {
  if (!linksText || !company) return [];
  const lines = linksText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const results = [];
  const seen = new Set();

  for (const line of lines) {
    const arrowIdx = line.indexOf(" → ");
    if (arrowIdx < 0) continue;
    const text = line.slice(0, arrowIdx).trim();
    const url = line.slice(arrowIdx + 3).trim();
    if (!text || !url) continue;
    // Related-search URLs carry sm=tab_she (from the suggestion box).
    // Also require an ssc=tab.nx.all to avoid the "더보기" pagination links.
    if (!/sm=tab_she/.test(url)) continue;
    if (!/ssc=tab\.nx\.all/.test(url)) continue;
    // Text must start with the company name (space-separated OR suffix-attached).
    if (!text.startsWith(company)) continue;
    if (seen.has(text)) continue;
    seen.add(text);

    // Strip company prefix + any whitespace to extract the tail.
    let tail = text.slice(company.length).replace(/^[\s·]+/, "").trim();
    const wholeQuery = tail.length === 0;
    results.push({ text, nickname: wholeQuery ? null : tail, wholeQuery });
    if (results.length >= 20) break;
  }
  return results;
}

// Fetch Naver blog-search related queries for a company name. Returns an array
// of { text, nickname, wholeQuery } objects. May return an empty array if the
// 연관검색어 block is absent (quiet tickers).
function fetchRelatedQueries(company, opts = {}) {
  if (!company) return [];
  const url =
    `https://search.naver.com/search.naver?where=blog&query=${encodeURIComponent(company)}`;
  const raw = browseLinks(url, opts);
  if (!raw) return [];
  return parseRelatedQueries(raw, company);
}

// Scan a blog post's full page text for references to other Naver blogs.
// Returns a deduped list of blogIds mentioned via `blog.naver.com/<blogId>`
// links (excluding the blogId of the post being read and Naver's own reserved
// segments like PostView / PostList). Used by discover-bloggers.js to mine
// seed blogIds from roundup posts like "3인 3색(무영, 강비호, 문벵이)".
const RESERVED_BLOG_PATH_SEGMENTS = new Set([
  "PostView",
  "PostList",
  "PostSearchList",
  "BuddyBlogList",
  "PostThumbnailList",
  "CategoryList",
  "api",
]);

function extractBlogIdRefs(pageText, { excludeBlogId = null } = {}) {
  if (!pageText) return [];
  const rx = /blog\.naver\.com\/([A-Za-z0-9_-]+)/g;
  const seen = new Set();
  let m;
  while ((m = rx.exec(pageText)) !== null) {
    const id = m[1];
    if (RESERVED_BLOG_PATH_SEGMENTS.has(id)) continue;
    if (excludeBlogId && id === excludeBlogId) continue;
    seen.add(id);
  }
  return [...seen];
}

function searchNaverBlog(query, { max = 10 } = {}) {
  const encoded = encodeURIComponent(query);
  const url = `https://search.naver.com/search.naver?where=blog&query=${encoded}`;

  const linksRaw = browseLinks(url);
  if (linksRaw) {
    const fromLinks = parseNaverSearchLinks(linksRaw);
    if (fromLinks.length > 0) return fromLinks.slice(0, max);
  }

  const text = browseText(url);
  if (!text) return [];
  return parseNaverSearchResults(text).slice(0, max);
}

function readBlogPostList(blogId, { max = 20 } = {}) {
  if (!blogId) return [];
  const url = `https://blog.naver.com/PostList.naver?blogId=${encodeURIComponent(blogId)}&categoryNo=0&from=postList`;

  const linksRaw = browseLinks(url);
  if (linksRaw) {
    const fromLinks = parsePostListFromLinks(linksRaw);
    if (fromLinks.length > 0) return fromLinks.slice(0, max);
  }

  const text = browseText(url);
  if (!text) return [];
  return parsePostList(text).slice(0, max);
}

// Parse post dates from the `browse text` rendering of a PostSearchList
// page. The text layout shows each result as two adjacent lines:
//   "<title>|<category>"
//   "YYYY/MM/DD HH:MM"
// followed by the snippet. `browse links` drops the date line because it
// isn't part of any anchor, so we have to scan the text dump. Returns a
// Map keyed by the trimmed title for merging into `parseBlogSearchResults`
// output (which has authoritative logNo/url but no date).
function parseBlogSearchDatesFromText(text) {
  const map = new Map();
  if (!text) return map;
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  const dateRx = /^(20\d{2})[./-](\d{1,2})[./-](\d{1,2})\b/;
  for (let i = 0; i < lines.length - 1; i += 1) {
    const titleLine = lines[i];
    const dateLine = lines[i + 1];
    if (!titleLine || !dateLine) continue;
    const m = dateLine.match(dateRx);
    if (!m) continue;
    // Title line looks like "<title>|<category>" — drop the trailing category
    // tag when present. Also strip it if the whole line is the title.
    const pipeIdx = titleLine.lastIndexOf("|");
    const title = (pipeIdx > 0 ? titleLine.slice(0, pipeIdx) : titleLine).trim();
    if (!title || title.length < 2) continue;
    const iso = `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
    if (!map.has(title)) map.set(title, iso);
  }
  return map;
}

// Search a single blogger's posts for a query via Naver's PostSearchList.
// Returns { posts: [{logNo, title, url, blogId, date}], paginationPages }.
// posts are the page-1 results (up to ~10). Callers should filter by title
// mention of the company to strip body-only matches. `date` is a "YYYY-MM-DD"
// string pulled from the text rendering (second fetch) or null if the date
// token could not be parsed.
function searchWithinBlog(blogId, query, { orderBy = "date" } = {}) {
  if (!blogId || !query) return { posts: [], paginationPages: 0 };
  const encoded = encodeURIComponent(query);
  const url =
    `https://blog.naver.com/PostSearchList.naver` +
    `?blogId=${encodeURIComponent(blogId)}` +
    `&SearchText=${encoded}` +
    `&orderBy=${orderBy}` +
    `&range=all`;

  const raw = browseLinks(url);
  if (!raw) return { posts: [], paginationPages: 0 };

  const posts = parseBlogSearchResults(raw, blogId);
  const paginationPages = countBlogSearchPaginationPages(raw);

  // Merge dates from the text rendering. browseLinks output does not include
  // the date tokens, so this is a second fetch against the same URL.
  // parseBlogSearchResults truncates titles at the first " → " separator
  // (it's the anchor-text delimiter), so when merging we also try a prefix
  // match against the full text-rendering title for posts whose real title
  // happens to contain ` → `.
  const text = browseText(url);
  const dateByTitle = parseBlogSearchDatesFromText(text);
  const textTitles = Array.from(dateByTitle.keys());
  for (const p of posts) {
    if (!p.title) {
      p.date = null;
      continue;
    }
    let date = dateByTitle.get(p.title) || null;
    if (!date) {
      const prefixHit = textTitles.find((t) => t.startsWith(p.title));
      if (prefixHit) date = dateByTitle.get(prefixHit);
    }
    p.date = date || null;
  }

  return { posts, paginationPages };
}

// Search Naver News for a query and return an array of headline/snippet strings.
// Used by build-query-set.js to extract trending keywords for a company.
// Returns up to `max` text fragments (default 30). Each element is a plain
// string (headline or snippet), not a structured object — callers tokenize
// the text downstream for keyword frequency analysis.
function searchNaverNews(query, { max = 30, verbose = false } = {}) {
  const encoded = encodeURIComponent(query);
  const url = `https://search.naver.com/search.naver?where=news&query=${encoded}&sort=1`;

  // browseLinks gives "snippet → publisher_url" lines, much cleaner than
  // browseText for news pages (which dumps everything as one blob).
  const raw = browseLinks(url);
  if (raw) {
    const headlines = parseNewsHeadlinesFromLinks(raw);
    if (headlines.length > 0) return headlines.slice(0, max);
  }

  // Fallback to browseText if links failed
  const text = browseText(url);
  if (!text) return [];
  return parseNewsHeadlines(text).slice(0, max);
}

// Parse news article text from the browseLinks output of a Naver news search.
// Each line is "text → url". We keep lines whose URL points to an external
// news publisher (not Naver internal pages) and return the text portion.
function parseNewsHeadlinesFromLinks(linksText) {
  if (!linksText) return [];
  const lines = linksText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const results = [];
  const seen = new Set();

  // Naver internal URLs to exclude
  const internalRx =
    /search\.naver\.com|help\.naver\.com|nid\.naver\.com|section\.(blog|cafe)\.naver\.com|pay\.naver\.com|mail\.naver\.com|comic\.naver\.com|book\.naver\.com|kin\.naver\.com|stock\.naver\.com|dict\.naver\.com|calendar\.naver\.com|blog\.naver\.com|cafe\.naver\.com|news\.naver\.com$|chzzk\.naver\.com|point\.pay\.naver\.com|m\.notify\.naver\.com|talks\.naver\.com/;

  for (const line of lines) {
    const arrowIdx = line.indexOf(" → ");
    if (arrowIdx < 0) continue;
    const text = line.slice(0, arrowIdx).trim();
    const url = line.slice(arrowIdx + 3).trim();

    if (!url || !/^https?:/.test(url)) continue;
    // Keep only external publisher URLs (the actual news articles)
    if (internalRx.test(url)) continue;
    if (!text || text.length < 10) continue;
    if (!/[\uac00-\ud7af]/.test(text)) continue;
    if (seen.has(text)) continue;
    seen.add(text);
    results.push(text);
  }
  return results;
}

// Fallback: extract news headlines from the browseText dump of a Naver news
// search page. The text is one big blob, so we split on "Keep에 저장Keep에
// 바로가기" markers which precede each article.
function parseNewsHeadlines(text) {
  if (!text) return [];
  // Split on article boundary markers
  const segments = text.split(/Keep에 저장Keep에 바로가기/);
  const results = [];
  const seen = new Set();

  for (const seg of segments) {
    if (!seg || seg.length < 20) continue;
    // Take the first sentence-like portion (up to first period + space/digit)
    const match = seg.match(/^(.{10,150}?)[.。]\s/);
    const candidate = match ? match[1].trim() : seg.slice(0, 100).trim();
    if (candidate.length < 10) continue;
    if (!/[\uac00-\ud7af]/.test(candidate)) continue;
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    results.push(candidate);
  }
  return results;
}

// --- Structured news search -------------------------------------------------
//
// `searchNaverNews` returns headline strings only. Callers that need article
// URLs, press names, and dates (kr-foreign-analyst) use the structured variant
// below, which joins two views of the same search page:
//
//   browseText  -> press / date / title / snippet, in reading order
//   browseLinks -> "title새 창 열림 → url" lines, the authoritative URLs
//
// The two are joined on the exact title string (both views truncate long titles
// identically, so equality holds).

const NEWS_ITEM_MARKER = "Keep에 저장Keep에 바로가기새 창 열림";
const NEWS_LINK_SUFFIX = "새 창 열림";

// "3일 전" / "1주 전" / "2시간 전" / "2026.08.15." -> ISO yyyy-mm-dd.
// Returns null when no date token is present.
function parseNewsDateToken(raw, now = new Date()) {
  if (!raw) return null;

  const absolute = raw.match(/(\d{4})\.(\d{2})\.(\d{2})\./);
  if (absolute) return `${absolute[1]}-${absolute[2]}-${absolute[3]}`;

  const relative = raw.match(/(\d+)\s*(분|시간|일|주|개월|달|년)\s*전/);
  if (!relative) return null;

  const amount = Number(relative[1]);
  if (!Number.isFinite(amount)) return null;

  const d = new Date(now.getTime());
  switch (relative[2]) {
    case "분":
      d.setMinutes(d.getMinutes() - amount);
      break;
    case "시간":
      d.setHours(d.getHours() - amount);
      break;
    case "일":
      d.setDate(d.getDate() - amount);
      break;
    case "주":
      d.setDate(d.getDate() - amount * 7);
      break;
    case "개월":
    case "달":
      d.setMonth(d.getMonth() - amount);
      break;
    case "년":
      d.setFullYear(d.getFullYear() - amount);
      break;
    default:
      return null;
  }
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Each result block in the text dump reads:
//   새 창 열림<PRESS>새 창 열림<DATE>[네이버뉴스]<MARKER><TITLE>새 창 열림<SNIPPET>
// so the press/date for item i sit at the tail of the segment *before* it.
function parseNewsItemsFromText(text, now = new Date()) {
  if (!text) return [];
  const segments = text.split(NEWS_ITEM_MARKER);
  if (segments.length < 2) return [];

  const items = [];
  for (let i = 1; i < segments.length; i += 1) {
    const body = segments[i].split(NEWS_LINK_SUFFIX);
    const title = (body[0] || "").trim();
    if (!title) continue;

    const snippet = (body[1] || "").trim();

    // Walk the previous segment backwards to the first part carrying a date
    // token; the part right before it is the press name.
    const head = segments[i - 1].split(NEWS_LINK_SUFFIX);
    let date = null;
    let press = null;
    for (let j = head.length - 1; j >= 0; j -= 1) {
      const parsed = parseNewsDateToken(head[j], now);
      if (parsed) {
        date = parsed;
        press = (head[j - 1] || "").trim() || null;
        break;
      }
    }

    items.push({ title, snippet, press, date });
  }
  return items;
}

// Map exact title -> article URL from the browseLinks dump. Only deep links
// count; a bare publisher root is the press logo, not an article.
function parseNewsLinkMap(linksText) {
  const map = new Map();
  if (!linksText) return map;

  for (const line of linksText.split(/\r?\n/)) {
    const arrowIdx = line.indexOf(" → ");
    if (arrowIdx < 0) continue;

    let title = line.slice(0, arrowIdx).trim();
    const url = line.slice(arrowIdx + 3).trim();
    if (!/^https?:/.test(url)) continue;
    if (!title.endsWith(NEWS_LINK_SUFFIX)) continue;

    title = title.slice(0, -NEWS_LINK_SUFFIX.length).trim();
    if (!title) continue;

    // Require a path beyond "/" so publisher home pages drop out.
    let pathname = "";
    try {
      pathname = new URL(url).pathname;
    } catch {
      continue;
    }
    if (!pathname || pathname === "/") continue;

    if (!map.has(title)) map.set(title, url);
  }
  return map;
}

function searchNaverNewsStructured(query, { max = 30, verbose = false } = {}) {
  const encoded = encodeURIComponent(query);
  const url = `https://search.naver.com/search.naver?where=news&query=${encoded}&sort=1`;

  const linksRaw = browseLinks(url, { verbose });
  const textRaw = browseText(url, { verbose });

  const linkMap = parseNewsLinkMap(linksRaw);
  const items = parseNewsItemsFromText(textRaw);

  const results = [];
  const seen = new Set();
  for (const item of items) {
    const articleUrl = linkMap.get(item.title);
    if (!articleUrl) continue; // no resolvable URL -> not fetchable downstream
    if (seen.has(articleUrl)) continue;
    seen.add(articleUrl);
    results.push({
      title: item.title,
      url: articleUrl,
      press: item.press,
      date: item.date,
      snippet: item.snippet,
    });
    if (results.length >= max) break;
  }
  return results;
}

function readBlogPost(blogId, logNo) {
  if (!blogId || !logNo) return null;
  // Naver desktop PostView.naver renders the body inside an iframe (#mainFrame),
  // and `browse text` only captures the outer document — we get chrome only.
  // The mobile URL has no iframe, so the body is reachable in a single text dump.
  const url = `https://m.blog.naver.com/${encodeURIComponent(blogId)}/${encodeURIComponent(logNo)}`;
  const text = browseText(url);
  if (!text) return null;
  const parsed = parsePostView(text);
  if (!parsed) return null;
  return { ...parsed, url, blogId, logNo };
}

// ---------------------------------------------------------------------------
// CLI (smoke test)
// ---------------------------------------------------------------------------

function runSmokeTest() {
  try {
    const bin = resolveBrowseBinary();
    console.log(`browse binary: ${bin}`);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }

  const query = "엘앤에프 주가";
  console.log(`Searching Naver blogs for: ${query}`);
  const results = searchNaverBlog(query, { max: 3 });
  if (!results.length) {
    console.error("No results returned. Either Naver blocked the request or the parser needs work.");
    process.exit(1);
  }
  for (const result of results) {
    console.log(`- [${result.blogId || "?"}] ${result.title || "(no title)"}`);
    console.log(`  ${result.url}`);
    if (result.date) console.log(`  date: ${result.date}`);
  }
  console.log(`OK - ${results.length} result(s).`);

  console.log(`\nFetching related queries for: 엘앤에프`);
  const related = fetchRelatedQueries("엘앤에프");
  if (!related.length) {
    console.error("No related queries parsed. Parser may need tuning.");
  } else {
    for (const r of related) {
      const tag = r.wholeQuery ? "(whole)" : `nickname=${r.nickname}`;
      console.log(`- ${r.text}  ${tag}`);
    }
    console.log(`OK - ${related.length} related query/queries.`);
  }
}

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.includes("--test")) {
    runSmokeTest();
  } else {
    console.log("browse-naver.js - Naver blog browse helpers.");
    console.log("Usage: node browse-naver.js --test");
    console.log("This module is designed to be required by other skills.");
  }
}

module.exports = {
  resolveBrowseBinary,
  browseText,
  browseLinks,
  searchNaverBlog,
  searchNaverNews,
  searchNaverNewsStructured,
  readBlogPostList,
  readBlogPost,
  searchWithinBlog,
  fetchRelatedQueries,
  parseRelatedQueries,
  extractBlogIdRefs,
  normalizeNaverUrl,
  parseNaverSearchResults,
  parseNaverSearchLinks,
  parseNewsHeadlines,
  parseNewsHeadlinesFromLinks,
  parseNewsItemsFromText,
  parseNewsLinkMap,
  parseNewsDateToken,
  parsePostList,
  parsePostListFromLinks,
  parseBlogSearchResults,
  parseBlogSearchDatesFromText,
  countBlogSearchPaginationPages,
  parsePostView,
};
