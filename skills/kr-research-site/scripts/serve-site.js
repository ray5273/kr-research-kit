#!/usr/bin/env node

// Local preview server for the built site (default site-dist/ on port 8080).

const fs = require("fs");
const http = require("http");
const path = require("path");

const TYPES = {
  ".js": "application/javascript; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
};

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 2) {
    if (!argv[i].startsWith("--")) throw new Error(`Unexpected argument: ${argv[i]}`);
    args[argv[i].slice(2)] = argv[i + 1];
  }
  return args;
}

function resolveFile(root, urlPath) {
  let decoded;
  try { decoded = decodeURIComponent(urlPath.split("?")[0]); } catch { return null; }
  const target = path.resolve(root, `.${decoded}`);
  if (target !== root && !target.startsWith(root + path.sep)) return null;
  if (fs.existsSync(target) && fs.statSync(target).isDirectory()) {
    const index = path.join(target, "index.html");
    return fs.existsSync(index) ? index : null;
  }
  return fs.existsSync(target) ? target : null;
}

function main() {
  const args = parseArgs(process.argv);
  const root = path.resolve(args.dir || "site-dist");
  const port = Number(args.port || 8080);
  if (!fs.existsSync(root)) throw new Error(`Build the site first: ${root} not found`);
  http.createServer((req, res) => {
    // Directory URLs without a trailing slash would break relative asset links.
    const pathname = req.url.split("?")[0];
    const direct = path.resolve(root, `.${decodeURIComponent(pathname)}`);
    if (!pathname.endsWith("/") && fs.existsSync(direct) && fs.statSync(direct).isDirectory()) {
      res.writeHead(301, { Location: `${pathname}/` });
      res.end();
      return;
    }
    const file = resolveFile(root, req.url);
    if (!file) {
      const notFound = path.join(root, "404.html");
      res.writeHead(404, { "Content-Type": TYPES[".html"] });
      res.end(fs.existsSync(notFound) ? fs.readFileSync(notFound) : "Not found");
      return;
    }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file).toLowerCase()] || "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  }).listen(port, () => {
    process.stdout.write(`Serving ${root} at http://localhost:${port}/\n`);
  });
}

try { main(); } catch (error) { console.error(error.message); process.exit(1); }
