const fs = require("fs");
const https = require("https");
const path = require("path");

const DEFAULT_API_BASE = "https://api.telegram.org";
const MESSAGE_LIMIT = 4096;
const CAPTION_LIMIT = 1024;

function findSkillRoot(startDir = process.cwd()) {
  let current = path.resolve(startDir);
  while (true) {
    if (fs.existsSync(path.join(current, "SKILL.md"))) return current;
    const parent = path.dirname(current);
    if (parent === current) return "";
    current = parent;
  }
}

function findRepoRoot(startDir = process.cwd()) {
  let current = path.resolve(startDir);
  while (true) {
    if (fs.existsSync(path.join(current, "manifest.json")) || fs.existsSync(path.join(current, ".git"))) return current;
    const parent = path.dirname(current);
    if (parent === current) return path.resolve(startDir);
    current = parent;
  }
}

function findConfigRoot(startDir = process.cwd()) {
  const skillRoot = findSkillRoot(startDir);
  if (skillRoot) return skillRoot;
  return findRepoRoot(startDir);
}

function parseEnvLine(line) {
  const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (!match) return null;
  let value = match[2] || "";
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  return [match[1], value];
}

function loadConfigEnv(configRoot = findConfigRoot()) {
  const envPath = path.join(configRoot, ".env");
  if (!fs.existsSync(envPath)) return {};
  const env = {};
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const parsed = parseEnvLine(line);
    if (parsed) env[parsed[0]] = parsed[1];
  }
  return env;
}

function loadRepoEnv(repoRoot = findRepoRoot()) {
  return loadConfigEnv(repoRoot);
}

function resolveTelegramConfig(options = {}) {
  const configRoot = options.configRoot || options.skillRoot || options.repoRoot;
  const configEnv = loadConfigEnv(configRoot);
  const source = { ...configEnv, ...process.env };
  return {
    token: options.token || source.TELEGRAM_BOT_TOKEN || "",
    chatId: options.chatId || source.TELEGRAM_CHAT_ID || "",
    apiBase: options.apiBase || source.TELEGRAM_API_BASE || DEFAULT_API_BASE,
  };
}

function redactToken(value, token) {
  let text = String(value == null ? "" : value);
  if (token) text = text.split(token).join("[REDACTED_TELEGRAM_TOKEN]");
  text = text.replace(/bot[0-9]{6,}:[A-Za-z0-9_-]{20,}/g, "bot[REDACTED]");
  return text;
}

function requireTelegramConfig(config) {
  const missing = [];
  if (!config.token) missing.push("TELEGRAM_BOT_TOKEN");
  if (!config.chatId) missing.push("TELEGRAM_CHAT_ID");
  if (missing.length) {
    throw new Error(`Missing Telegram credential(s): ${missing.join(", ")}. Set them in the sender skill folder .env or pass --token/--chat-id.`);
  }
}

function chunkTelegramMessage(text, limit = MESSAGE_LIMIT) {
  const value = String(text || "");
  if (value.length <= limit) return [value];
  const chunks = [];
  let rest = value;
  while (rest.length > limit) {
    let splitAt = rest.lastIndexOf("\n", limit);
    if (splitAt < Math.floor(limit * 0.6)) splitAt = rest.lastIndexOf(" ", limit);
    if (splitAt < Math.floor(limit * 0.6)) splitAt = limit;
    chunks.push(rest.slice(0, splitAt).trimEnd());
    rest = rest.slice(splitAt).trimStart();
  }
  if (rest) chunks.push(rest);
  return chunks;
}

function truncateTelegramCaption(text) {
  const value = String(text || "");
  if (value.length <= CAPTION_LIMIT) return value;
  return `${value.slice(0, CAPTION_LIMIT - 3).trimEnd()}...`;
}

function requestJson({ method, url, body, token, transport }) {
  if (transport) return transport({ method, url, body, headers: { "content-type": "application/json" } });
  const payload = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method,
      headers: {
        "content-type": "application/json",
        "content-length": Buffer.byteLength(payload),
      },
    }, (res) => {
      const chunks = [];
      res.on("data", chunk => chunks.push(chunk));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let data;
        try { data = JSON.parse(text); } catch (_error) { data = { ok: false, description: text }; }
        if (res.statusCode >= 200 && res.statusCode < 300 && data.ok !== false) resolve(data);
        else reject(new Error(`Telegram API error ${res.statusCode}: ${redactToken(data.description || text, token)}`));
      });
    });
    req.on("error", error => reject(new Error(redactToken(error.message, token))));
    req.end(payload);
  });
}

function multipartBody(fields, files) {
  const boundary = `----kr-research-kit-${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
  const parts = [];
  for (const [name, value] of Object.entries(fields)) {
    if (value == null || value === "") continue;
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${String(value)}\r\n`));
  }
  for (const file of files) {
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${file.name}"; filename="${file.filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`));
    parts.push(file.content);
    parts.push(Buffer.from("\r\n"));
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`));
  return { boundary, body: Buffer.concat(parts) };
}

function requestMultipart({ method, url, fields, files, token, transport }) {
  const { boundary, body } = multipartBody(fields, files);
  const headers = { "content-type": `multipart/form-data; boundary=${boundary}`, "content-length": body.length };
  if (transport) return transport({ method, url, body, headers, fields, files });
  return new Promise((resolve, reject) => {
    const req = https.request(url, { method, headers }, (res) => {
      const chunks = [];
      res.on("data", chunk => chunks.push(chunk));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let data;
        try { data = JSON.parse(text); } catch (_error) { data = { ok: false, description: text }; }
        if (res.statusCode >= 200 && res.statusCode < 300 && data.ok !== false) resolve(data);
        else reject(new Error(`Telegram API error ${res.statusCode}: ${redactToken(data.description || text, token)}`));
      });
    });
    req.on("error", error => reject(new Error(redactToken(error.message, token))));
    req.end(body);
  });
}

async function sendMessage(config, text, options = {}) {
  requireTelegramConfig(config);
  const url = `${config.apiBase.replace(/\/$/, "")}/bot${config.token}/sendMessage`;
  const chunks = chunkTelegramMessage(text);
  const results = [];
  for (const chunk of chunks) {
    results.push(await requestJson({
      method: "POST",
      url,
      body: { chat_id: config.chatId, text: chunk, disable_web_page_preview: true },
      token: config.token,
      transport: options.transport,
    }));
  }
  return results;
}

async function sendDocument(config, filePath, options = {}) {
  requireTelegramConfig(config);
  const url = `${config.apiBase.replace(/\/$/, "")}/bot${config.token}/sendDocument`;
  const absolutePath = path.resolve(filePath);
  const content = fs.readFileSync(absolutePath);
  return requestMultipart({
    method: "POST",
    url,
    fields: { chat_id: config.chatId, caption: truncateTelegramCaption(options.caption || "") },
    files: [{ name: "document", filename: path.basename(absolutePath), content }],
    token: config.token,
    transport: options.transport,
  });
}

module.exports = {
  CAPTION_LIMIT,
  DEFAULT_API_BASE,
  MESSAGE_LIMIT,
  chunkTelegramMessage,
  findConfigRoot,
  findRepoRoot,
  findSkillRoot,
  loadConfigEnv,
  loadRepoEnv,
  redactToken,
  requestJson,
  requestMultipart,
  requireTelegramConfig,
  resolveTelegramConfig,
  sendDocument,
  sendMessage,
  truncateTelegramCaption,
};
