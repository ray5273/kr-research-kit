import assert from "node:assert/strict";
import fs from "node:fs";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { issueSession, sessionCookie } from "./auth.mjs";
import { cleanupEngagement } from "./engagement.mjs";
const dir = ".tmp/analytics-bundle/";
const modules = [
  "worker.js",
  ...fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".html") || f.endsWith(".client.js")),
].map((f) => ({
  type: f === "worker.js" ? "ESModule" : "Text",
  path: dir + f,
}));
const env = {
  ADMIN_PASSWORD: "local-engagement-password",
  ANALYTICS_HMAC_SECRET: "local-test-secret-at-least-32-characters",
};
const mf = new Miniflare(
  convertV4MiniflareOptions({
    modules,
    compatibilityDate: "2026-10-01",
    bindings: env,
    d1Databases: ["DB"],
    serviceBindings: { ASSETS: () => new Response("asset") },
  }),
);
const origin = "https://site.test",
  path = JSON.parse(fs.readFileSync("site-dist/analytics-manifest.json"))
    .articles[0].path;
const cookie = sessionCookie(await issueSession(env, origin)).split(";")[0];
const dispatch = (url, init = {}) =>
  mf.dispatchFetch(origin + url, { redirect: "manual", ...init });
const post = (
  url,
  data,
  { admin = false, ip = "192.0.2.1", source = origin } = {},
) =>
  dispatch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: source,
      "CF-Connecting-IP": ip,
      ...(admin ? { Cookie: cookie } : {}),
    },
    body: JSON.stringify(data),
  });
const id = () => crypto.randomUUID();
const comment = (extra) => ({
  path,
  nickname: "독자 <b>",
  body: "좋은 글\n<script>alert(1)</script>",
  requestId: id(),
  website: "",
  ...extra,
});
const shares = () =>
  dispatch("/api/article-meta?path=" + encodeURIComponent(path)).then((r) =>
    r.json(),
  );
try {
  const db = await mf.getD1Database("DB");
  for (const file of fs.readdirSync("site/analytics/migrations").sort())
    await db.exec(
      fs
        .readFileSync("site/analytics/migrations/" + file, "utf8")
        .replace(/--[^\n]*/g, "")
        .replace(/\n/g, " "),
    );
  assert.deepEqual(await shares(), { shares: 0, comments: 0 });
  const share = { path, channel: "copy", requestId: id() };
  const results = await Promise.all(
    Array.from({ length: 8 }, () => post("/api/shares", share)),
  );
  assert.ok(results.every((r) => r.status === 200 || r.status === 202));
  assert.equal((await shares()).shares, 1);
  await Promise.all(
    Array.from({ length: 8 }, () =>
      post(
        "/api/shares",
        { path, channel: "native", requestId: id() },
        { ip: "192.0.2.2" },
      ),
    ),
  );
  assert.equal((await shares()).shares, 9);
  assert.equal(
    (await post("/api/shares", { ...share, channel: "kakao" })).status,
    409,
  );
  for (const url of ["/api/shares", "/api/comments"]) {
    assert.equal(
      (
        await post(url, url.endsWith("shares") ? share : comment(), {
          source: "https://evil.test",
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await post(
          url,
          url.endsWith("shares")
            ? { ...share, path: "/private/" }
            : comment({ path: "/private/" }),
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await dispatch(url, {
          method: "POST",
          headers: { Origin: origin, "Content-Type": "application/json" },
          body: "x".repeat(17000),
        })
      ).status,
      413,
    );
  }
  assert.equal(
    (await post("/api/comments", comment({ website: "spam.example" }))).status,
    400,
  );
  assert.equal(
    (await post("/api/comments", comment({ nickname: "x".repeat(31) }))).status,
    400,
  );
  assert.equal(
    (await post("/api/comments", comment({ body: "x".repeat(2001) }))).status,
    400,
  );
  const c = comment();
  assert.equal((await post("/api/comments", c)).status, 202);
  assert.equal((await post("/api/comments", c)).status, 200);
  const publicURL = "/api/comments?path=" + encodeURIComponent(path);
  assert.deepEqual((await (await dispatch(publicURL)).json()).comments, []);
  assert.equal((await shares()).comments, 0);
  assert.equal((await dispatch("/admin/api/comments")).status, 401);
  assert.equal((await dispatch("/admin/comments/")).status, 401);
  const admin = await dispatch("/admin/comments/", {
    headers: { Cookie: cookie },
  });
  assert.equal(admin.status, 200);
  const queue = await (
    await dispatch("/admin/api/comments", { headers: { Cookie: cookie } })
  ).json();
  assert.equal(queue.comments[0].id, c.requestId);
  const approve = "/admin/api/comments/" + c.requestId + "/approve";
  assert.equal((await post(approve, {})).status, 401);
  assert.equal(
    (await post(approve, {}, { admin: true, source: "https://evil.test" }))
      .status,
    403,
  );
  assert.equal((await post(approve, {}, { admin: true })).status, 200);
  assert.equal((await shares()).comments, 1);
  const visible = await (await dispatch(publicURL)).json();
  assert.equal(visible.comments[0].body, c.body);
  assert.ok(!("path" in visible.comments[0]));
  assert.equal(
    (
      await post(
        "/admin/api/comments/" + c.requestId + "/delete",
        {},
        { admin: true },
      )
    ).status,
    200,
  );
  assert.equal((await shares()).comments, 0);
  assert.equal((await post("/api/comments", c)).status, 200);
  assert.deepEqual(
    await db
      .prepare("SELECT nickname,body,status FROM comments WHERE id=?")
      .bind(c.requestId)
      .first(),
    { nickname: "", body: "", status: "deleted" },
  );
  for (let i = 0; i < 3; i++)
    assert.equal(
      (await post("/api/comments", comment(), { ip: "192.0.2.3" })).status,
      202,
    );
  assert.equal(
    (await post("/api/comments", comment(), { ip: "192.0.2.3" })).status,
    429,
  );
  for (let i = 0; i < 30; i++)
    assert.equal(
      (
        await post(
          "/api/shares",
          { ...share, requestId: id() },
          { ip: "192.0.2.4" },
        )
      ).status,
      202,
    );
  assert.equal(
    (
      await post(
        "/api/shares",
        { ...share, requestId: id() },
        { ip: "192.0.2.4" },
      )
    ).status,
    429,
  );
  const limited = (
    await db.prepare("SELECT subject,expires FROM engagement_limits").all()
  ).results;
  assert.ok(limited.every((r) => /^[a-f0-9]{64}$/.test(r.subject)));
  // Paging is stable with equal timestamps, and pending rows never leak.
  for (let i = 0; i < 22; i++)
    await db
      .prepare(
        "INSERT INTO comments(id,path,nickname,body,status,created) VALUES(?,?,?,?,'approved',?)",
      )
      .bind(id(), path, "독자", "본문", Date.now())
      .run();
  const first = await (await dispatch(publicURL)).json();
  assert.equal(first.comments.length, 20);
  assert.ok(first.cursor);
  const second = await (
    await dispatch(publicURL + "&cursor=" + first.cursor)
  ).json();
  assert.equal(second.comments.length, 2);
  assert.equal(second.cursor, null);
  assert.ok(second.comments[0].seq > first.comments.at(-1).seq);
  assert.equal((await dispatch(publicURL + "&cursor=oops")).status, 400);
  const old = id();
  await db
    .prepare(
      "INSERT INTO comments(id,path,nickname,body,created) VALUES(?,?,?,?,?)",
    )
    .bind(old, path, "오래된", "대기", Date.now() - 31 * 86400000)
    .run();
  assert.equal(
    (await post("/admin/api/comments/" + old + "/approve", {}, { admin: true }))
      .status,
    404,
  );
  const total = (await shares()).shares;
  await cleanupEngagement(db, Date.now() + 2 * 86400000);
  assert.equal(
    (await db.prepare("SELECT COUNT(*) n FROM engagement_limits").first()).n,
    0,
  );
  assert.equal((await shares()).shares, total);
  assert.equal((await shares()).comments, 22);
  assert.equal(
    (await db.prepare("SELECT body FROM comments WHERE id=?").bind(old).first())
      .body,
    "",
  );
  const counts = await dispatch("/api/article-counts");
  assert.equal(counts.status, 200);
  assert.equal(counts.headers.get("Cache-Control"), "public, max-age=60");
  const countsBody = await counts.json(),
    meta = await shares();
  assert.deepEqual(countsBody[path], meta);
  await db
    .prepare("INSERT INTO article_shares(path,total) VALUES('/retired/',9)")
    .run();
  assert.equal("/retired/" in (await (await dispatch("/api/article-counts")).json()), false);
  assert.equal((await post("/api/article-counts", {})).status, 405);
  await db.exec("DROP TABLE article_shares");
  const failed = await dispatch(
    "/api/article-meta?path=" + encodeURIComponent(path),
  );
  assert.equal(failed.status, 503);
  assert.equal("shares" in (await failed.json()), false);
  const failedCounts = await dispatch("/api/article-counts");
  assert.equal(failedCounts.status, 503);
  assert.equal(failedCounts.headers.get("Cache-Control"), "private, no-store");
  console.log(
    "Engagement tests passed: real Worker/D1 concurrent dedup/counters, approval, deletion, paging, CSRF/auth, body bounds, rate limits, retention, failure states.",
  );
} finally {
  await mf.dispose();
}
