import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";

export const REQUIRED_SECRETS = ["ADMIN_PASSWORD", "ANALYTICS_HMAC_SECRET"];
export function deploy({
  configPath = "wrangler.jsonc",
  manifestPath = "site-dist/analytics-manifest.json",
  env = process.env,
  run = (args) =>
    execFileSync(
      process.execPath,
      ["node_modules/wrangler/bin/wrangler.js", ...args],
      { stdio: "inherit" },
    ),
} = {}) {
  const config = JSON.parse(
    fs.readFileSync(configPath, "utf8").replace(/^\s*\/\/.*$/gm, ""),
  );
  if (
    !config.d1_databases?.[0]?.database_id ||
    config.d1_databases[0].database_id ===
      "00000000-0000-0000-0000-000000000000"
  )
    throw Error("Set the real D1 database_id in wrangler.jsonc first.");
  if (
    !REQUIRED_SECRETS.every((name) => config.secrets?.required?.includes(name))
  )
    throw Error("Declare both required secrets in wrangler.jsonc.");
  if (!fs.existsSync(manifestPath))
    throw Error("Run npm run check:site before deployment.");

  // Runtime secrets are inherited by Wrangler. Build secrets, when provided,
  // are uploaded as encrypted runtime bindings in the same deployment.
  const provided = {};
  for (const name of REQUIRED_SECRETS) {
    if (env[name] === undefined) continue;
    const value = env[name];
    const valid =
      typeof value === "string" &&
      (name === "ADMIN_PASSWORD"
        ? value.length >= 12 && value.length <= 256 && !/[\r\n]/.test(value)
        : value.length >= 32);
    if (!valid)
      throw Error(
        `Invalid build secret ${name}: check its length and formatting.`,
      );
    provided[name] = value;
  }
  let directory;
  try {
    const args = ["deploy"];
    if (Object.keys(provided).length) {
      directory = fs.mkdtempSync(path.join(os.tmpdir(), "research-deploy-"));
      fs.chmodSync(directory, 0o700);
      const file = path.join(directory, "secrets.json");
      fs.writeFileSync(file, JSON.stringify(provided), { mode: 0o600 });
      args.push("--secrets-file", file);
      console.log(
        `Providing runtime secrets from build environment: ${Object.keys(provided).join(", ")}`,
      );
    }
    run(["d1", "migrations", "apply", "DB", "--remote"]);
    // Native secrets.required validation checks the bindings actually deployed,
    // including inherited secrets and the additive secrets file above.
    run(args);
  } finally {
    if (directory) fs.rmSync(directory, { recursive: true, force: true });
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
)
  deploy();
