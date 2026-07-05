"use strict";

// Private-data resolution for kr-portfolio-guard.
//
//   resolution order for the private dir (never hardcode a user path here —
//   this file ships in a public repo):
//     1. --private-dir CLI arg
//     2. KR_PORTFOLIO_GUARD_HOME env (repo-root .env is auto-loaded)
//     3. ~/stock-analysis-private
//
// The private dir holds portfolio.json / guard-config.json / decision-ledger.ndjson /
// state.json / reports/ and must NEVER be committed or passed to publish skills.

const fs = require("fs");
const os = require("os");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..", "..");

// Same pattern as kr-stock-dart-analysis/scripts/fetch-nps-holdings.js loadEnvFile.
function loadEnvFile() {
  const envPath = path.join(REPO_ROOT, ".env");
  if (!fs.existsSync(envPath)) return;
  const text = fs.readFileSync(envPath, "utf8");
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const name = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(name in process.env)) process.env[name] = value;
  }
}

function resolvePrivateDir(cliArg) {
  loadEnvFile();
  const dir =
    cliArg ||
    process.env.KR_PORTFOLIO_GUARD_HOME ||
    path.join(os.homedir(), "stock-analysis-private");
  return path.resolve(dir);
}

const SETUP_GUIDE = [
  "kr-portfolio-guard 첫 실행 안내:",
  "  1) private 디렉토리를 만드세요 (공개 리포 밖):",
  "       mkdir -p <PRIVATE_DIR>/reports",
  "  2) <PRIVATE_DIR>/portfolio.json 을 작성하세요:",
  '       {"asOf":"YYYY-MM-DD","holdings":[{"ticker":"066970.KQ","name":"엘앤에프",',
  '        "market":"KR","currency":"KRW","quantity":100,"avgCost":95000,',
  '        "memo":"analysis-example/kr/엘앤에프/memo.md"}]}',
  "     quantity 필수, memo 는 리포 상대경로 또는 \"none\".",
  "  3) <PRIVATE_DIR>/guard-config.json 을 작성하세요 (임계값·total_capital·벤치마크).",
  "  4) 경로를 고정하려면 리포 루트 .env 에:",
  "       KR_PORTFOLIO_GUARD_HOME=/path/to/stock-analysis-private",
].join("\n");

function loadJsonOrDie(filePath, what) {
  if (!fs.existsSync(filePath)) {
    const guide = SETUP_GUIDE.replace(/<PRIVATE_DIR>/g, path.dirname(filePath));
    throw new Error(`${what} not found: ${filePath}\n\n${guide}`);
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (err) {
    throw new Error(`${what} is not valid JSON (${filePath}): ${err.message}`);
  }
}

module.exports = { REPO_ROOT, loadEnvFile, resolvePrivateDir, loadJsonOrDie, SETUP_GUIDE };
