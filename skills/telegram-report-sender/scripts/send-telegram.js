#!/usr/bin/env node

const path = require("path");

const repoSender = path.resolve(__dirname, "../../../scripts/send-telegram.js");

try {
  process.env.TELEGRAM_CONFIG_ROOT = process.env.TELEGRAM_CONFIG_ROOT || path.resolve(__dirname, "..");
  Promise.resolve(require(repoSender).main(process.argv)).catch(error => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
} catch (error) {
  console.error([
    "telegram-report-sender was not fully installed.",
    "Run the skill installer so scripts/post-install.sh can copy the standalone sender into this skill folder.",
    `Missing source: ${repoSender}`,
  ].join("\n"));
  process.exit(1);
}
