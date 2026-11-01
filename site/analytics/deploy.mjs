import fs from "node:fs";
import { execFileSync } from "node:child_process";
const config = JSON.parse(
  fs.readFileSync("wrangler.jsonc", "utf8").replace(/^\s*\/\/.*$/gm, ""),
);
const fail = (message) => {
  throw Error(message);
};
if (
  config.d1_databases[0].database_id === "00000000-0000-0000-0000-000000000000"
)
  fail("Set the real D1 database_id in wrangler.jsonc first.");
const run = (args) =>
  execFileSync(
    process.execPath,
    ["node_modules/wrangler/bin/wrangler.js", ...args],
    { stdio: "inherit" },
  );
const secrets = JSON.parse(
  execFileSync(
    process.execPath,
    ["node_modules/wrangler/bin/wrangler.js", "secret", "list"],
    { encoding: "utf8" },
  ),
);
for (const name of ["ADMIN_PASSWORD", "ANALYTICS_HMAC_SECRET"]) {
  if (!secrets.some((s) => s.name === name))
    fail(`Register ${name} in the Worker's Variables and Secrets first.`);
}
if (!fs.existsSync("site-dist/analytics-manifest.json"))
  fail("Run npm run check:site before deployment.");
run(["d1", "migrations", "apply", "DB", "--remote"]);
run(["deploy"]);
