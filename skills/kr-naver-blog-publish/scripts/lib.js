#!/usr/bin/env node

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

function sha256(value) {
  const hash = crypto.createHash("sha256");
  if (Buffer.isBuffer(value)) hash.update(value);
  else hash.update(String(value), "utf8");
  return hash.digest("hex");
}

function fileSha256(filePath) {
  return sha256(fs.readFileSync(filePath));
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJsonAtomic(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(temporary, filePath);
}

function resolveFrom(baseFile, target) {
  return path.resolve(path.dirname(baseFile), target);
}

function normalizeText(value) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function contentFingerprint({ title, body, imageCount }) {
  return sha256(JSON.stringify({
    title: normalizeText(title),
    body: normalizeText(body),
    imageCount: Number(imageCount),
  }));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

module.exports = {
  assert,
  contentFingerprint,
  fileSha256,
  normalizeText,
  readJson,
  resolveFrom,
  sha256,
  writeJsonAtomic,
};
