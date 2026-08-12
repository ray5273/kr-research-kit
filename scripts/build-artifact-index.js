#!/usr/bin/env node

// Generates docs/ARTIFACTS.md from the analysis-example/ tree.
// Run after adding an example; never hand-edit the generated file.
// With --check, fails when the committed index is stale (used by validate-skills).

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const repoRoot = path.resolve(__dirname, "..");
const sourceDir = "analysis-example";
const outputPath = "docs/ARTIFACTS.md";

// Markets rendered as one block per company (memo + sibling artifacts on one line).
// Everything else is rendered as a dated bullet list.
const COMPANY_MARKETS = new Set(["kr", "us", "global", "cn"]);

const MARKET_LABELS = {
  kr: "KR — Korean single-stock research",
  "kr-market": "KR — market-wide screens, daily news, and strategy backtests",
  "kr-sector": "KR — sector and industry research",
  "kr-reports": "KR — brokerage report watch",
  us: "US — single-stock research",
  "us-market": "US — market-wide and strategy backtests",
  "global-sector": "Global — sector research",
  global: "Global — fact-checks and cross-market notes",
  cn: "CN — single-stock research",
};

// Order artifacts inside a company block by workflow stage, not alphabetically.
const ARTIFACT_ORDER = [
  "memo",
  "data-pack",
  "dart-analysis",
  "dart-reference",
  "sec-analysis",
  "sec-reference",
  "리서치브리프",
  "analyst-report-insight",
  "foreign-views",
  "naver-insights",
  "chart-analysis",
  "naver-post",
];

function readNormalized(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

// Index only what the repository actually ships. Local scratch work under
// analysis-example/ would otherwise produce an index full of links that 404 for
// everyone else and break link validation on a fresh clone. Add an example to git
// first, then regenerate. Falls back to indexing everything outside a git checkout.
function loadTrackedPaths() {
  try {
    const output = execSync(`git ls-files -z -- ${sourceDir}`, { cwd: repoRoot, maxBuffer: 1 << 28 });
    const paths = output.toString("utf8").split("\0").filter(Boolean);
    return paths.length > 0 ? new Set(paths) : null;
  } catch {
    return null;
  }
}

const trackedPaths = loadTrackedPaths();

function isShipped(relativePath) {
  return trackedPaths === null || trackedPaths.has(relativePath);
}

// Markdown is the artifact; a JSON twin (machine-readable ledger or publish manifest)
// rides along on its markdown entry instead of claiming its own line. Every other
// JSON under analysis-example/ is an intermediate cache and stays out of the index.
function walkMarkdown(relativeDir) {
  const results = [];
  const entries = fs.readdirSync(path.join(repoRoot, relativeDir), { withFileTypes: true });
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const relativePath = path.posix.join(relativeDir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "assets") {
        continue;
      }
      results.push(...walkMarkdown(relativePath));
    } else if (entry.name.endsWith(".md") && isShipped(relativePath)) {
      results.push(relativePath);
    }
  }
  return results;
}

function findJsonTwin(relativePath) {
  const twin = relativePath.replace(/\.md$/, ".json");
  if (isShipped(twin) && fs.existsSync(path.join(repoRoot, twin))) {
    return twin;
  }
  // Naver drafts pair with a publish manifest that carries a different basename.
  if (path.basename(relativePath) === "naver-post.md") {
    const manifest = path.posix.join(path.dirname(relativePath), "naver-publish.json");
    if (isShipped(manifest) && fs.existsSync(path.join(repoRoot, manifest))) {
      return manifest;
    }
  }
  return null;
}

function extractTitle(text, fallback) {
  const match = text.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : fallback;
}

// Prefer the document's own stated date over anything derived from the filesystem,
// so regenerating on a fresh clone produces a byte-identical index.
function extractDate(text, relativePath) {
  const labels = ["최근 업데이트일", "기준일", "기준 종가", "작성일"];
  for (const label of labels) {
    const match = text.match(new RegExp(`${label}\\s*[::]\\s*(\\d{4}-\\d{2}-\\d{2})`));
    if (match) {
      return match[1];
    }
  }
  const fromName = path.basename(relativePath).match(/(\d{4}-\d{2}-\d{2})/);
  return fromName ? fromName[1] : "";
}

// The repo convention is angle-bracket link targets whenever a path would otherwise
// break markdown parsing. validate-contracts.js strips the brackets before resolving.
function linkTarget(relativePath) {
  const target = path.posix.join("..", relativePath);
  return /[ ()]/.test(target) ? `<${target}>` : target;
}

function loadArtifacts() {
  return walkMarkdown(sourceDir).map((relativePath) => {
    const text = readNormalized(relativePath);
    const segments = relativePath.split("/");
    return {
      relativePath,
      market: segments[1],
      // Company markets group by company even when artifacts nest deeper (e.g. per-month
      // folders); strategy markets keep the full sub-path so each strategy stays separate.
      group: segments.length > 3 ? segments[2] : "",
      groupPath: segments.slice(2, -1).join("/"),
      basename: path.basename(relativePath, ".md"),
      title: extractTitle(text, path.basename(relativePath, ".md")),
      date: extractDate(text, relativePath),
      jsonTwin: findJsonTwin(relativePath),
    };
  });
}

function byDateDescending(a, b) {
  if (a.date !== b.date) {
    return b.date.localeCompare(a.date);
  }
  return a.relativePath.localeCompare(b.relativePath);
}

function artifactRank(artifact) {
  const index = ARTIFACT_ORDER.indexOf(artifact.basename);
  return index === -1 ? ARTIFACT_ORDER.length : index;
}

function renderCompanyMarket(artifacts, lines) {
  const groups = new Map();
  for (const artifact of artifacts) {
    const key = artifact.group || artifact.basename;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(artifact);
  }

  const ordered = [...groups.entries()]
    .map(([name, items]) => {
      const sorted = [...items].sort((a, b) => artifactRank(a) - artifactRank(b) || a.basename.localeCompare(b.basename));
      const headline = sorted.find((item) => item.basename === "memo") || sorted[0];
      const date = items.map((item) => item.date).filter(Boolean).sort().pop() || "";
      return { name, sorted, headline, date };
    })
    .sort((a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name));

  for (const group of ordered) {
    const dateSuffix = group.date ? ` — ${group.date}` : "";
    lines.push(`### ${group.name}${dateSuffix}`);
    lines.push("");
    lines.push(group.headline.title);
    lines.push("");
    const chips = [];
    for (const item of group.sorted) {
      chips.push(`[${item.basename}](${linkTarget(item.relativePath)})`);
      if (item.jsonTwin) {
        chips.push(`[${path.basename(item.jsonTwin, ".json")}.json](${linkTarget(item.jsonTwin)})`);
      }
    }
    lines.push(chips.join(" · "));
    lines.push("");
  }
}

function renderListMarket(artifacts, lines) {
  const groups = new Map();
  for (const artifact of artifacts) {
    const key = artifact.groupPath;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(artifact);
  }

  const rootItems = groups.get("") || [];
  groups.delete("");

  if (rootItems.length > 0) {
    for (const artifact of [...rootItems].sort(byDateDescending)) {
      lines.push(renderBullet(artifact));
    }
    lines.push("");
  }

  const namedGroups = [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  for (const [name, items] of namedGroups) {
    lines.push(`### ${name}`);
    lines.push("");
    for (const artifact of [...items].sort(byDateDescending)) {
      lines.push(renderBullet(artifact));
    }
    lines.push("");
  }
}

function renderBullet(artifact) {
  const dateSuffix = artifact.date ? ` — ${artifact.date}` : "";
  const jsonSuffix = artifact.jsonTwin ? ` · [json](${linkTarget(artifact.jsonTwin)})` : "";
  return `- [${artifact.title}](${linkTarget(artifact.relativePath)})${dateSuffix}${jsonSuffix}`;
}

function render(artifacts) {
  const markets = new Map();
  for (const artifact of artifacts) {
    if (!markets.has(artifact.market)) {
      markets.set(artifact.market, []);
    }
    markets.get(artifact.market).push(artifact);
  }

  const lines = [
    "<!-- Generated by scripts/build-artifact-index.js. Do not edit by hand. -->",
    "",
    "# Analysis Artifacts",
    "",
    `Complete index of every artifact under \`analysis-example/\` (${artifacts.length} files).`,
    "Regenerate with `node scripts/build-artifact-index.js` after adding an example.",
    "",
    "For the curated shortlist of audited golden examples, see [EXAMPLES.md](EXAMPLES.md).",
    "For strategy methodology and performance comparison, see [CODEX-STRATEGY-METHODOLOGY-PERFORMANCE.md](CODEX-STRATEGY-METHODOLOGY-PERFORMANCE.md).",
    "",
  ];

  const orderedMarkets = [...markets.keys()].sort((a, b) => {
    const rankA = Object.keys(MARKET_LABELS).indexOf(a);
    const rankB = Object.keys(MARKET_LABELS).indexOf(b);
    return (rankA === -1 ? 99 : rankA) - (rankB === -1 ? 99 : rankB) || a.localeCompare(b);
  });

  for (const market of orderedMarkets) {
    const items = markets.get(market);
    lines.push(`## ${MARKET_LABELS[market] || market} (${items.length})`);
    lines.push("");
    if (COMPANY_MARKETS.has(market)) {
      renderCompanyMarket(items, lines);
    } else {
      renderListMarket(items, lines);
    }
  }

  return `${lines.join("\n").replace(/\n{3,}/g, "\n\n").trim()}\n`;
}

const generated = render(loadArtifacts());
const absoluteOutput = path.join(repoRoot, outputPath);

if (process.argv.includes("--check")) {
  const current = fs.existsSync(absoluteOutput) ? readNormalized(outputPath) : "";
  if (current !== generated) {
    console.error(`${outputPath} is stale. Run: node scripts/build-artifact-index.js`);
    process.exit(1);
  }
  console.log(`${outputPath} is up to date.`);
} else {
  fs.writeFileSync(absoluteOutput, generated);
  console.log(`Wrote ${outputPath}`);
}
