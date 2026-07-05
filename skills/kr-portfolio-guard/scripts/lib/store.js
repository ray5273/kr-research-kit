"use strict";

// Durable file primitives for kr-portfolio-guard.
//
// Single-truth files (portfolio.json, decision-ledger.ndjson, state.json) are
// updated via temp-file + rename with a one-generation .bak of the previous
// content. On DrvFs (/mnt/c) rename is not perfectly atomic, so the .bak is
// the recovery path — never edit these files with plain overwrites.

const fs = require("fs");
const path = require("path");

function atomicWriteFile(filePath, content) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  if (fs.existsSync(filePath)) {
    fs.copyFileSync(filePath, `${filePath}.bak`);
  }
  const tmp = path.join(dir, `.${path.basename(filePath)}.tmp-${process.pid}`);
  fs.writeFileSync(tmp, content);
  fs.renameSync(tmp, filePath);
}

function atomicWriteJson(filePath, obj) {
  atomicWriteFile(filePath, `${JSON.stringify(obj, null, 2)}\n`);
}

function readNdjson(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const lines = fs.readFileSync(filePath, "utf8").split("\n");
  const rows = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line) continue;
    try {
      rows.push(JSON.parse(line));
    } catch (err) {
      throw new Error(
        `Corrupt ndjson line ${i + 1} in ${filePath}: ${err.message}. ` +
          `Restore from ${filePath}.bak before continuing.`
      );
    }
  }
  return rows;
}

// Append-only ledger write. Rewrites the whole file atomically (files stay
// small at personal scale) so a mid-write crash can never leave a torn line.
function writeNdjson(filePath, rows) {
  const content = rows.map((r) => JSON.stringify(r)).join("\n") + (rows.length ? "\n" : "");
  atomicWriteFile(filePath, content);
}

function loadState(privateDir) {
  const p = path.join(privateDir, "state.json");
  if (!fs.existsSync(p)) {
    return { lastRunAt: null, ackedCoverageFlags: {} };
  }
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch (err) {
    throw new Error(
      `Corrupt state.json (${p}): ${err.message}. Restore from ${p}.bak before continuing.`
    );
  }
}

function saveState(privateDir, state) {
  atomicWriteJson(path.join(privateDir, "state.json"), state);
}

module.exports = { atomicWriteFile, atomicWriteJson, readNdjson, writeNdjson, loadState, saveState };
