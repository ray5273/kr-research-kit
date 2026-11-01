import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { deploy, REQUIRED_SECRETS } from "./deploy.mjs";
const directory = fs.mkdtempSync(
  path.join(os.tmpdir(), "research-deploy-test-"),
);
const configPath = path.join(directory, "wrangler.jsonc"),
  manifestPath = path.join(directory, "manifest.json");
const config = JSON.parse(
  fs.readFileSync("wrangler.jsonc", "utf8").replace(/^\s*\/\/.*$/gm, ""),
);
fs.writeFileSync(configPath, JSON.stringify(config));
fs.writeFileSync(manifestPath, "{}");
const options = { configPath, manifestPath };
try {
  const calls = [];
  deploy({ ...options, env: {}, run: (args) => calls.push(args) });
  assert.deepEqual(
    calls,
    [["d1", "migrations", "apply", "DB", "--remote"], ["deploy"]],
    "runtime-only secrets use native inheritance; no legacy secret-list preflight",
  );
  const env = {
    ADMIN_PASSWORD: "test-only-password-2026",
    ANALYTICS_HMAC_SECRET: "test-only-HMAC-secret-at-least-32-characters",
    UNRELATED_TOKEN: "never-upload-this",
  };
  let secretFile;
  deploy({
    ...options,
    env,
    run: (args) => {
      if (args[0] !== "deploy") return;
      assert.equal(args[1], "--secrets-file");
      secretFile = args[2];
      assert.deepEqual(
        JSON.parse(fs.readFileSync(secretFile)),
        Object.fromEntries(REQUIRED_SECRETS.map((n) => [n, env[n]])),
      );
      assert.equal(fs.statSync(secretFile).mode & 0o777, 0o600);
      assert.equal(fs.statSync(path.dirname(secretFile)).mode & 0o777, 0o700);
    },
  });
  assert.ok(
    !fs.existsSync(secretFile),
    "temporary secrets are removed after success",
  );
  assert.throws(
    () =>
      deploy({
        ...options,
        env,
        run: (args) => {
          if (args[0] === "deploy") {
            secretFile = args[2];
            throw Error("upload failed");
          }
        },
      }),
    /upload failed/,
  );
  assert.ok(
    !fs.existsSync(secretFile),
    "temporary secrets are removed after failure",
  );
  assert.throws(
    () =>
      deploy({
        ...options,
        env: { ADMIN_PASSWORD: "short" },
        run: () => assert.fail("must not deploy"),
      }),
    /Invalid build secret ADMIN_PASSWORD/,
  );
  assert.throws(
    () =>
      deploy({
        ...options,
        env: { ANALYTICS_HMAC_SECRET: "" },
        run: () => assert.fail("must not deploy"),
      }),
    /Invalid build secret ANALYTICS_HMAC_SECRET/,
  );
  deploy({
    ...options,
    env: { ADMIN_PASSWORD: env.ADMIN_PASSWORD },
    run: (args) => {
      if (args[0] === "deploy")
        assert.deepEqual(JSON.parse(fs.readFileSync(args[2])), {
          ADMIN_PASSWORD: env.ADMIN_PASSWORD,
        });
    },
  });
  console.log(
    "Deploy tests passed: required-secret inheritance, build-secret upload, permissions, additive partial upload and cleanup on success/failure.",
  );
} finally {
  fs.rmSync(directory, { recursive: true, force: true });
}
