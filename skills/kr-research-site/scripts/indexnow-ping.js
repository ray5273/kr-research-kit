#!/usr/bin/env node

// Notify IndexNow engines (Bing, Naver, Yandex, Seznam …) about changed URLs.
// Changed = new, content hash changed, or removed compared with the previous
// urls.json (a file or the live site). Without a previous snapshot every URL is
// sent. Cloudflare Workers Builds deploys on its own, so --wait-live <seconds> polls the
// live urls.json until it matches this build before pinging.

const fs = require("fs");
const https = require("https");
const path = require("path");

const DEFAULT_ENDPOINTS = ["https://api.indexnow.org/indexnow", "https://searchadvisor.naver.com/indexnow"];
const MAX_URLS = 10000;

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith("--")) throw new Error(`Unexpected argument: ${key}`);
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) { args[key.slice(2)] = true; continue; }
    args[key.slice(2)] = value;
    i += 1;
  }
  return args;
}

function request(url, { method = "GET", body = null, timeoutMs = 15000 } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? Buffer.from(JSON.stringify(body)) : null;
    const req = https.request(url, {
      method,
      headers: {
        "User-Agent": "kr-research-site/1.0 (+https://github.com/ray5273/kr-research-kit)",
        ...(payload ? { "Content-Type": "application/json; charset=utf-8", "Content-Length": payload.length } : {}),
      },
      timeout: timeoutMs,
    }, res => {
      const chunks = [];
      res.on("data", chunk => chunks.push(chunk));
      res.on("end", () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString("utf8") }));
    });
    req.on("timeout", () => req.destroy(new Error(`timeout after ${timeoutMs}ms`)));
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function loadPrevious(source) {
  if (!source) return null;
  try {
    if (/^https:\/\//.test(source)) {
      const res = await request(source);
      if (res.status !== 200) return null;
      return JSON.parse(res.body);
    }
    return JSON.parse(fs.readFileSync(path.resolve(source), "utf8"));
  } catch {
    return null;
  }
}

function sameUrls(a, b) {
  return JSON.stringify(a?.urls || null) === JSON.stringify(b?.urls || null);
}

async function waitForLive(baseUrl, current, timeoutSeconds) {
  const deadline = Date.now() + timeoutSeconds * 1000;
  while (Date.now() < deadline) {
    const live = await loadPrevious(`${baseUrl}/urls.json?ts=${Date.now()}`);
    if (sameUrls(live, current)) return true;
    await new Promise(resolve => setTimeout(resolve, 20000));
  }
  return false;
}

function changedUrls(current, previous) {
  if (!previous || !Array.isArray(previous.urls)) return current.urls.map(entry => entry.loc);
  const before = new Map(previous.urls.map(entry => [entry.loc, entry.sha256]));
  const now = new Set(current.urls.map(entry => entry.loc));
  const changed = current.urls.filter(entry => before.get(entry.loc) !== entry.sha256).map(entry => entry.loc);
  const removed = previous.urls.map(entry => entry.loc).filter(loc => !now.has(loc));
  return [...changed, ...removed];
}

async function main() {
  const args = parseArgs(process.argv);
  const root = path.resolve(args.root || process.cwd());
  const config = JSON.parse(fs.readFileSync(path.resolve(root, args.config || "site/site.config.json"), "utf8"));
  const current = JSON.parse(fs.readFileSync(path.resolve(root, args.current || "site-dist/urls.json"), "utf8"));
  const key = process.env.INDEXNOW_KEY || config.indexNow?.key;
  if (!key) {
    process.stdout.write("IndexNow key is not configured (site.config.json indexNow.key); skipping ping.\n");
    return;
  }
  const previous = args.all ? null : await loadPrevious(args.previous || `${config.baseUrl}/urls.json`);
  if (args["wait-live"] && !args["dry-run"]) {
    const live = await waitForLive(config.baseUrl, current, Number(args["wait-live"]));
    if (!live) {
      process.stdout.write(`WARN live ${config.baseUrl}/urls.json did not match this build within ${args["wait-live"]}s; skipping ping.\n`);
      return;
    }
  }
  const urls = changedUrls(current, previous).slice(0, MAX_URLS);
  if (!urls.length) {
    process.stdout.write("No changed URLs; nothing to ping.\n");
    return;
  }
  const host = new URL(config.baseUrl).host;
  const body = { host, key, keyLocation: `${config.baseUrl}/${key}.txt`, urlList: urls };
  if (args["dry-run"]) {
    process.stdout.write(`${JSON.stringify({ previousFound: Boolean(previous), ...body }, null, 2)}\n`);
    return;
  }
  const endpoints = config.indexNow?.endpoints?.length ? config.indexNow.endpoints : DEFAULT_ENDPOINTS;
  let ok = 0;
  for (const endpoint of endpoints) {
    try {
      const res = await request(endpoint, { method: "POST", body });
      const accepted = res.status === 200 || res.status === 202;
      if (accepted) ok += 1;
      process.stdout.write(`${accepted ? "OK" : "WARN"} ${endpoint} -> ${res.status} (${urls.length} URLs)\n`);
    } catch (error) {
      process.stdout.write(`WARN ${endpoint} -> ${error.message}\n`);
    }
  }
  if (!ok && args.strict) throw new Error("No IndexNow endpoint accepted the ping");
}

if (require.main === module) {
  main().catch(error => { console.error(error.message); process.exit(1); });
}

module.exports = { changedUrls, sameUrls };
