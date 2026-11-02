import assert from "node:assert/strict";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { aggregate, report } from "./store.mjs";
import { DAY, kstDay, dayStart, insights } from "./core.mjs";
import {
  authorize,
  issueSession,
  sessionCookie,
  checkPassword,
} from "./auth.mjs";
const root = new URL("../../", import.meta.url);
process.chdir(root.pathname);
execFileSync(
  process.execPath,
  [
    "node_modules/wrangler/bin/wrangler.js",
    "deploy",
    "--dry-run",
    "--outdir",
    ".tmp/analytics-bundle",
  ],
  { stdio: "pipe", env: { ...process.env, WRANGLER_SEND_METRICS: "false" } },
);
const manifest = JSON.parse(
  fs.readFileSync("site-dist/analytics-manifest.json"),
);
const now = Date.now(),
  path = manifest.articles[0].path,
  next = manifest.articles[1].path;
const authEnv = {
  ADMIN_PASSWORD: "local-test-admin-password-2026",
  ANALYTICS_HMAC_SECRET: "local-test-secret-32-characters-only",
};
const token = await issueSession(authEnv, "https://site.test");
const authHeaders = { Cookie: sessionCookie(token).split(";")[0] };
const request = (token) =>
  new Request("https://site.test/admin/", {
    headers: token ? { Cookie: sessionCookie(token).split(";")[0] } : {},
  });
assert.equal(await authorize(request(), authEnv), false);
assert.equal(await authorize(request(token), authEnv), true);
assert.equal(await authorize(request(token), {}), false);
assert.equal(
  await authorize(request(token), {
    ...authEnv,
    ADMIN_PASSWORD: "changed-password-2026",
  }),
  false,
);
assert.equal(
  await authorize(
    request(token.slice(0, -1) + (token.endsWith("a") ? "b" : "a")),
    authEnv,
  ),
  false,
);
assert.equal(
  await authorize(
    request(
      await issueSession(
        authEnv,
        "https://site.test",
        Date.now() - 9 * 3600000,
      ),
    ),
    authEnv,
  ),
  false,
);
assert.equal(
  await authorize(
    new Request("https://other.test/admin/", { headers: authHeaders }),
    authEnv,
  ),
  false,
);
assert.equal(await checkPassword(authEnv.ADMIN_PASSWORD, authEnv), true);
assert.equal(await checkPassword("wrong", authEnv), false);
const bundleDir = ".tmp/analytics-bundle/";
const modules = [
  "worker.js",
  ...fs
    .readdirSync(bundleDir)
    .filter((f) => f.endsWith(".html") || f.endsWith(".client.js")),
].map((f) => ({
  type: f === "worker.js" ? "ESModule" : "Text",
  path: bundleDir + f,
}));
const mf = new Miniflare(
  convertV4MiniflareOptions({
    modules,
    compatibilityDate: "2026-10-01",
    bindings: {
      ...authEnv,
      ANALYTICS_HMAC_SECRET: "local-test-secret-32-characters-only",
    },
    d1Databases: ["DB"],
    serviceBindings: { ASSETS: () => new Response("public asset") },
  }),
);
const dispatch = (url, init = {}) =>
  mf.dispatchFetch(url, { redirect: "manual", ...init });
try {
  const naverFile = await dispatch("https://site.example/naver6736590d1423cf8c8d99e84e8271208d.html");
  assert.equal(naverFile.status, 200);
  assert.equal(await naverFile.text(), "naver-site-verification: naver6736590d1423cf8c8d99e84e8271208d.html");
  const googleFile = await dispatch("https://site.example/googlee0724e2c9ff15f87.html");
  assert.equal(googleFile.status, 200);
  assert.equal(await googleFile.text(), "google-site-verification: googlee0724e2c9ff15f87.html");
  const db = await mf.getD1Database("DB");
  const schema = fs.readFileSync(
    "site/analytics/migrations/0001_analytics.sql",
    "utf8",
  );
  await db.exec(schema.replace(/\n/g, " "));
  await db.exec(
    fs
      .readFileSync("site/analytics/migrations/0002_admin_password.sql", "utf8")
      .replace(/--[^\n]*/g, "")
      .replace(/\n/g, " "),
  );
  const login = (password, origin = "https://site.test") =>
    dispatch("https://site.test/admin/login", {
      method: "POST",
      headers: {
        Origin: origin,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ password }).toString(),
    });
  assert.equal((await dispatch("https://site.test/admin/login")).status, 200);
  assert.equal((await dispatch("http://site.test/admin/login")).status, 308);
  assert.equal(
    await authorize(request(token), {
      ...authEnv,
      ANALYTICS_HMAC_SECRET: "changed-HMAC-secret-at-least-32-characters",
    }),
    false,
  );
  assert.equal((await login("wrong")).status, 401);
  assert.equal(
    (await login(authEnv.ADMIN_PASSWORD, "https://attacker.test")).status,
    403,
  );
  const loggedIn = await login(authEnv.ADMIN_PASSWORD);
  assert.equal(loggedIn.status, 303);
  assert.equal(loggedIn.headers.get("Location"), "/admin/");
  const cookie = loggedIn.headers.get("Set-Cookie");
  for (const attribute of [
    "HttpOnly",
    "Secure",
    "SameSite=Strict",
    "Path=/",
    "Max-Age=28800",
  ])
    assert.ok(cookie.includes(attribute));
  assert.equal(
    await authorize(
      new Request("https://site.test/admin/", {
        headers: { Cookie: cookie.split(";")[0] },
      }),
      authEnv,
    ),
    true,
  );
  const logout = await dispatch("https://site.test/admin/logout", {
    method: "POST",
    headers: { ...authHeaders, Origin: "https://site.test" },
  });
  assert.equal(logout.status, 303);
  assert.ok(logout.headers.get("Set-Cookie").includes("Max-Age=0"));
  assert.equal(
    (
      await dispatch("https://site.test/admin/logout", {
        method: "POST",
        headers: { ...authHeaders, Origin: "https://attacker.test" },
      })
    ).status,
    403,
  );

  const post = (events, browser = crypto.randomUUID(), extra = {}) =>
    dispatch("https://site.test/api/analytics/events", {
      method: "POST",
      headers: {
        Origin: "https://site.test",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        consent: true,
        activityAt: Date.now(),
        browser,
        events,
        ...extra,
      }),
    });
  let pageSequence = 0;
  const page = (p = path, at = now + pageSequence++) => {
    const id = crypto.randomUUID();
    return { id, viewId: id, kind: "page_view", path: p, at };
  };
  const browser = crypto.randomUUID(),
    p = {
      ...page(),
      referrer: "https://search.naver.com/search?secret=never-store",
      source: "naver",
      medium: "blog",
      campaign: "q3",
    };
  let response = await post([p], browser);
  assert.equal(response.status, 202, await response.text());
  assert.equal((await post([p], browser)).status, 202);
  assert.equal(
    (await db.prepare("SELECT COUNT(*) n FROM events").first()).n,
    1,
  );
  const engagement = {
    ...p,
    id: crypto.randomUUID(),
    kind: "engagement",
    depth: 95,
    active: 42,
  };
  const click = {
    ...p,
    id: crypto.randomUUID(),
    kind: "internal_click",
    target: next,
  };
  await post([p, engagement, click], browser);
  await post([p, engagement, click], browser);
  await post([page(next)], browser);
  assert.equal(
    (await db.prepare("SELECT COUNT(*) n FROM sessions").first()).n,
    1,
    "same browser session",
  );
  assert.equal(
    (
      await db
        .prepare(
          "SELECT referrer FROM events WHERE path=? AND kind='page_view'",
        )
        .bind(next)
        .first()
    ).referrer,
    "search.naver.com",
    "session source persists across pages",
  );
  assert.ok(
    !JSON.stringify(
      (await db.prepare("SELECT * FROM events").all()).results,
    ).includes("never-store"),
  );
  const stored = await db
    .prepare("SELECT browser FROM sessions LIMIT 1")
    .first();
  assert.notEqual(stored.browser, browser);
  assert.equal(stored.browser.length, 64);
  await db
    .prepare("UPDATE sessions SET last_seen=?")
    .bind(now - 1800001)
    .run();
  await post([page(path)], browser);
  assert.equal(
    (await db.prepare("SELECT COUNT(*) n FROM sessions").first()).n,
    2,
    "30 minute expiry",
  );
  assert.equal(
    (await db.prepare("SELECT SUM(returning_sessions) n FROM sessions").first())
      .n,
    1,
    "returning_sessions",
  );
  await post([page()], null);
  await post([page()], null);
  assert.equal(
    (
      await db
        .prepare("SELECT COUNT(*) n FROM sessions WHERE browser IS NULL")
        .first()
    ).n,
    2,
    "storage disabled: page only",
  );
  assert.equal((await post([page("/private/")])).status, 400);
  assert.equal((await post([page()], browser, { consent: false })).status, 400);
  assert.equal((await post([page()], browser, { browser: "bad" })).status, 400);
  assert.equal(
    (await post(Array.from({ length: 31 }, () => page()))).status,
    400,
  );
  assert.equal(
    (
      await dispatch("https://site.test/api/analytics/events", {
        method: "POST",
        headers: {
          Origin: "https://evil.test",
          "Content-Type": "application/json",
        },
        body: "{}",
      })
    ).status,
    403,
  );
  const invalid = await dispatch("https://site.test/api/analytics/events", {
    method: "POST",
    headers: {
      Origin: "https://site.test",
      "Content-Type": "application/json",
    },
    body: "x".repeat(33000),
  });
  assert.equal(invalid.status, 413);
  await aggregate(db, now + 1000);
  const first = JSON.stringify(
    (
      await db
        .prepare("SELECT * FROM daily ORDER BY day,dimension,key,path")
        .all()
    ).results,
  );
  await aggregate(db, now + 1000);
  assert.equal(
    JSON.stringify(
      (
        await db
          .prepare("SELECT * FROM daily ORDER BY day,dimension,key,path")
          .all()
      ).results,
    ),
    first,
    "idempotent aggregate",
  );
  let result = await report(db, manifest, 7, "", now + 1000);
  const overview = result.rows.find((r) => r.dimension === "overview");
  assert.equal(overview.views, 5);
  assert.equal(overview.sessions, 4);
  assert.equal(overview.returning_sessions, 1);
  assert.equal(overview.completed, 1);
  assert.equal(overview.clicked, 1);
  assert.equal(result.uniqueBrowsers, 1);
  assert.equal(
    result.rows.find(
      (r) => r.dimension === "transition" && r.key === path && r.path === next,
    ).views,
    1,
    "actual next page distinct from click",
  );
  const late = {
    ...p,
    id: crypto.randomUUID(),
    kind: "engagement",
    depth: 100,
    active: 80,
  };
  await post([p, late], browser);
  await aggregate(db, now + 1000);
  result = await report(db, manifest, 7, path, now + 1000);
  assert.equal(
    result.rows.find((r) => r.dimension === "article").active,
    80,
    "late cumulative metric uses max",
  );
  assert.equal(kstDay(Date.parse("2026-10-31T15:00:00Z")), "2026-11-01");
  assert.equal(kstDay(Date.parse("2026-10-31T14:59:59Z")), "2026-10-31");
  // Store events on both sides of KST midnight, rather than testing only date helpers.
  const midnight = dayStart(kstDay(now));
  await post([page(path, midnight - 1)], null);
  await post([page(path, midnight)], null);
  await aggregate(db, now + 1000);
  const boundary = (
    await db
      .prepare(
        "SELECT day,views FROM daily WHERE dimension='overview' ORDER BY day",
      )
      .all()
  ).results;
  assert.equal(boundary.find((r) => r.day === kstDay(midnight - 1)).views, 1);
  assert.equal(boundary.find((r) => r.day === kstDay(midnight)).views, 6);
  // Raw detail expires, but past identifier-free aggregates survive.
  await aggregate(db, now + 91 * DAY);
  assert.equal(
    (await db.prepare("SELECT COUNT(*) n FROM events").first()).n,
    0,
  );
  assert.ok((await db.prepare("SELECT COUNT(*) n FROM daily").first()).n > 0);
  result = await report(db, manifest, 365, "", now + 91 * DAY);
  assert.equal(result.uniqueBrowsers, null);
  assert.ok(result.trend.length > 0);
  await aggregate(db, now + 366 * DAY);
  assert.equal((await db.prepare("SELECT COUNT(*) n FROM daily").first()).n, 0);
  const rules = insights(
    [{ path, views: 60, completed: 40, clicked: 20 }],
    [{ path, views: 30 }],
    kstDay(now - DAY),
  )[0];
  assert.deepEqual(rules.rules, ["유입 증가", "추천 검토 후보"]);
  assert.deepEqual(
    insights(
      [{ path, views: 29, completed: 0, clicked: 0 }],
      [],
      kstDay(now - DAY),
    )[0].rules,
    ["표본 부족"],
  );
  for (const adminPath of [
    "/admin",
    "/admin/",
    "/admin/index.html",
    "/admin/app.js",
    "/admin/api/analytics",
    "/admin/anything",
  ]) {
    const r = await dispatch("https://site.test" + adminPath);
    assert.equal(
      r.status,
      ["/admin", "/admin/", "/admin/index.html"].includes(adminPath)
        ? 303
        : 401,
      adminPath,
    );
    assert.match(r.headers.get("Cache-Control"), /no-store/);
  }
  for (const adminPath of ["/admin/app.js", "/admin/api/analytics"]) {
    assert.equal(
      (
        await dispatch("https://site.test" + adminPath, {
          headers: { Cookie: "__Host-research_admin=forged" },
        })
      ).status,
      401,
    );
  }
  const authorized = await dispatch("https://site.test/admin/", {
    headers: authHeaders,
  });
  assert.equal(authorized.status, 200);
  assert.match(await authorized.text(), /읽힌 글/);
  assert.equal(
    (
      await dispatch("https://site.test/admin/api/analytics?days=365", {
        headers: authHeaders,
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await dispatch("https://site.test/admin/api/analytics?days=8", {
        headers: authHeaders,
      })
    ).status,
    400,
  );
  assert.ok(
    !fs.existsSync("site-dist/admin"),
    "admin never written into public assets",
  );
  for (const filename of ["sitemap.xml", "urls.json", "feed.xml", "llms.txt"])
    assert.ok(
      !fs.readFileSync("site-dist/" + filename, "utf8").includes("/admin"),
      filename,
    );
  for (let i = 0; i < 18; i++) assert.equal((await login("wrong")).status, 401);
  assert.equal(
    (await login(authEnv.ADMIN_PASSWORD)).status,
    429,
    "global persistent login budget",
  );
  assert.equal(
    (await db.prepare("SELECT COUNT(*) n FROM admin_login_attempts").first()).n,
    1,
  );
  await db.exec("DROP TABLE daily;");
  const failed = await dispatch("https://site.test/admin/api/analytics", {
    headers: authHeaders,
  });
  assert.equal(failed.status, 503);
  assert.equal((await failed.json()).health.state, "error");
  console.log(
    "Analytics tests passed: password login, signed cookies, CSRF, attempt limits, consent validation, D1 collection, sessions, deduplication, KST, aggregation, late events, retention, protected routes.",
  );
} finally {
  await mf.dispose();
}
