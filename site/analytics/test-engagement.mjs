import assert from "node:assert/strict";
import fs from "node:fs";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { issueSession, sessionCookie } from "./auth.mjs";
import { cleanupEngagement, engagement } from "./engagement.mjs";
import { notifyScheduled } from "./notify.mjs";
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
    d1Databases: ["DB", "MIGRATION"],
    serviceBindings: { ASSETS: () => new Response("asset") },
  }),
);
const routed = JSON.parse(
  fs.readFileSync("wrangler.jsonc", "utf8").replace(/^\s*\/\/.*$/gm, ""),
).assets.run_worker_first;
for (const route of [
  "/api/article-meta",
  "/api/article-counts",
  "/api/shares",
  "/api/comments",
])
  assert(routed.includes(route), `${route} must reach the Worker in production`);
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
  const gate = await dispatch("/admin/comments/?comment=" + c.requestId);
  assert.equal(gate.status, 303);
  assert.equal(gate.headers.get("Location"), "/admin/login?comment=" + c.requestId);
  const gateAll = await dispatch("/admin/comments/?comment=https://evil.test");
  assert.equal(gateAll.headers.get("Location"), "/admin/login");
  const loginForm = await (await dispatch("/admin/login?comment=" + c.requestId)).text();
  assert.ok(loginForm.includes(`action="/admin/login?comment=${c.requestId}"`));
  assert.ok(loginForm.includes(`href="/admin/comments/?comment=${c.requestId}"`));
  assert.ok(!(await (await dispatch("/admin/login")).text()).includes("{{"));
  const resumed = await dispatch("/admin/login?comment=" + c.requestId, {
    headers: { Cookie: cookie },
  });
  assert.equal(resumed.headers.get("Location"), "/admin/comments/?comment=" + c.requestId);
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
    409,
    "approved comments must pass through the trash first",
  );
  assert.equal(
    (
      await post(
        "/admin/api/comments/" + c.requestId + "/trash",
        {},
        { admin: true },
      )
    ).status,
    200,
  );
  assert.equal((await shares()).comments, 0);
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
  // Moderation: transitions, bulk, replies, classification, blocks, privacy.
  let ipSeed = 10;
  const nextIp = () => `198.51.100.${ipSeed++}`;
  const act = (cid, action, data = {}) =>
    post(`/admin/api/comments/${cid}/${action}`, data, { admin: true });
  const adminGet = async (query = "") =>
    (
      await dispatch("/admin/api/comments" + query, {
        headers: { Cookie: cookie },
      })
    ).json();
  const rowOf = (cid) =>
    db.prepare("SELECT * FROM comments WHERE id=?").bind(cid).first();
  const submit = async (extra = {}, ip = nextIp()) => {
    const value = comment({ nickname: "독자", body: "좋은 글입니다", ...extra });
    assert.equal((await post("/api/comments", value, { ip })).status, 202);
    return value.requestId;
  };
  const table = {
    pending: { approve: "approved", spam: "spam", trash: "trash", hide: null, restore: null, delete: null },
    approved: { hide: "hidden", trash: "trash", approve: null, spam: null, restore: null, delete: null },
    hidden: { approve: "approved", trash: "trash", hide: null, spam: null, restore: null, delete: null },
    spam: { approve: "approved", trash: "trash", hide: null, spam: null, restore: null, delete: null },
    trash: { delete: "deleted", approve: null, hide: null, spam: null, trash: null },
  };
  const reach = async (state) => {
    const cid = await submit();
    if (state === "approved") await act(cid, "approve");
    if (state === "hidden") {
      await act(cid, "approve");
      await act(cid, "hide");
    }
    if (state === "spam") await act(cid, "spam");
    if (state === "trash") await act(cid, "trash");
    assert.equal((await rowOf(cid)).status, state);
    return cid;
  };
  for (const [state, moves] of Object.entries(table))
    for (const [action, target] of Object.entries(moves)) {
      const cid = await reach(state),
        result = await act(cid, action);
      assert.equal(result.status, target ? 200 : 409, `${state} ${action}`);
      assert.equal((await rowOf(cid)).status, target || state, `${state} ${action}`);
    }
  for (const prior of ["pending", "approved", "hidden", "spam"]) {
    const cid = await reach(prior);
    await act(cid, "trash");
    assert.equal((await rowOf(cid)).prior_status, prior);
    assert.equal((await act(cid, "restore")).status, 200);
    const restored = await rowOf(cid);
    assert.equal(restored.status, prior);
    assert.equal(restored.prior_status, null);
    assert.equal(restored.trashed_at, null);
  }
  assert.equal((await act(id(), "approve")).status, 404);
  // A pending comment past its deadline cannot come back from the trash.
  const stale = await submit();
  await act(stale, "trash");
  await db
    .prepare("UPDATE comments SET created=? WHERE id=?")
    .bind(Date.now() - 31 * 86400000, stale)
    .run();
  assert.equal((await act(stale, "restore")).status, 409);
  assert.equal((await rowOf(stale)).status, "trash");

  const bulkIds = [await submit(), await submit(), await reach("hidden")];
  const bulkResult = await post(
    "/admin/api/comments/bulk",
    { ids: [...bulkIds, bulkIds[0], id()], action: "spam" },
    { admin: true },
  );
  assert.deepEqual(
    { processed: (await bulkResult.json()).processed },
    { processed: 2 },
    "the hidden and unknown rows are skipped",
  );
  assert.equal((await rowOf(bulkIds[0])).status, "spam");
  assert.equal((await rowOf(bulkIds[2])).status, "hidden");
  assert.equal(
    (
      await post(
        "/admin/api/comments/bulk",
        { ids: Array.from({ length: 21 }, id), action: "trash" },
        { admin: true },
      )
    ).status,
    400,
  );
  assert.equal(
    (await post("/admin/api/comments/bulk", { ids: [id()], action: "reply" }, { admin: true })).status,
    400,
  );
  assert.equal(
    (await post("/admin/api/comments/bulk", { ids: [id()], action: "trash" })).status,
    401,
  );

  // A reply is public only together with its approved comment.
  const replied = await submit();
  const findPublic = async () => {
    let cur = "",
      found;
    do {
      const page = await (
        await dispatch(publicURL + (cur ? "&cursor=" + cur : ""))
      ).json();
      found = page.comments.find((x) => x.id === replied) || found;
      for (const x of page.comments) assert.ok(!("ip_hash" in x));
      cur = page.cursor;
    } while (cur);
    return found;
  };
  assert.equal((await act(replied, "reply", { reply: "x".repeat(2001) })).status, 400);
  assert.equal((await act(replied, "reply", { reply: "답변 <b>드립니다</b>" })).status, 200);
  assert.equal(await findPublic(), undefined, "pending reply stays private");
  await act(replied, "approve");
  const shown = await findPublic();
  assert.equal(shown.reply, "답변 <b>드립니다</b>");
  assert.ok(shown.replied_at > 0);
  await act(replied, "hide");
  assert.equal(await findPublic(), undefined, "hidden reply stays private");
  await act(replied, "approve");
  assert.equal((await act(replied, "reply", { reply: "  " })).status, 200);
  assert.equal((await findPublic()).reply, null);
  assert.equal((await rowOf(replied)).replied_at, null);
  const spamReply = await reach("spam");
  assert.equal((await act(spamReply, "reply", { reply: "안됨" })).status, 409);

  // Classification, including whitespace-split evasion.
  for (const [body, reason] of [
    ["리 딩 방 들어오세요", "word:리딩방"],
    ["수익\n보장 합니다", "word:수익보장"],
    ["자세한 건 https://evil.example 참고", "link"],
    ["WWW.EVIL.EXAMPLE", "link"],
    ["open . kakao . com/o/abc", "link"],
    ["가입은 evil.co.kr 에서", "link"],
    ["영업이익률 3.5% 개선, e.g. 수주 증가", null],
  ]) {
    const cid = await submit({ body });
    const row = await rowOf(cid);
    assert.equal(row.spam_reason, reason, body);
    assert.equal(row.status, reason ? "spam" : "pending", body);
  }
  assert.equal((await rowOf(await submit({ nickname: "리딩방" }))).status, "spam");
  const wordsURL = "/admin/api/comments/words";
  assert.equal(
    (await (await post(wordsURL, { word: "테스트 금칙" }, { admin: true })).json()).word,
    "테스트금칙",
  );
  assert.equal((await post(wordsURL, { word: "테스트" })).status, 401);
  assert.equal((await rowOf(await submit({ body: "테스트금 칙" }))).status, "spam");
  assert.ok(
    (await (await dispatch(wordsURL, { headers: { Cookie: cookie } })).json()).words.includes("테스트금칙"),
  );
  await post(wordsURL + "/delete", { word: "테스트금칙" }, { admin: true });
  assert.equal((await rowOf(await submit({ body: "테스트금칙" }))).status, "pending");

  // Blocks are silent, survive the daily hash change, and expire.
  const blockedIp = nextIp(),
    offender = await submit({}, blockedIp);
  assert.match((await rowOf(offender)).ip_hash, /^[a-f0-9]{64}$/);
  assert.ok(!(await rowOf(offender)).ip_hash.includes(blockedIp));
  assert.equal((await act(offender, "block")).status, 200);
  const silent = comment({ nickname: "독자", body: "또 왔어요" });
  assert.equal((await post("/api/comments", silent, { ip: blockedIp })).status, 202);
  assert.equal(await rowOf(silent.requestId), null, "blocked author is not stored");
  const blockCount = async () =>
    (await (await dispatch("/admin/api/comments/blocks", { headers: { Cookie: cookie } })).json()).count;
  assert.equal(await blockCount(), 1);
  const listed = await adminGet("?id=" + offender);
  assert.equal(listed.comments[0].blocked, 1);
  assert.equal(listed.comments[0].blockable, 1);
  assert.equal((await act(offender, "unblock")).status, 200);
  assert.equal(await blockCount(), 0);
  await act(offender, "block");
  assert.equal(
    (await post("/admin/api/comments/blocks/clear", {}, { admin: true })).status,
    200,
  );
  assert.equal(await blockCount(), 0);
  assert.equal((await post("/api/comments", comment({ body: "복귀" }), { ip: blockedIp })).status, 202);

  // Admin listing: counts, sort, search, single lookup, no hash anywhere.
  const needle = "찾기전용 100%_문구";
  const needleId = await submit({ body: needle });
  await submit({ body: "찾기전용 100X_문구" });
  const searched = await adminGet("?q=" + encodeURIComponent("100%_"));
  assert.deepEqual(searched.comments.map((x) => x.id), [needleId], "LIKE wildcards are literal");
  assert.equal(searched.articles[0].path, path);
  assert.ok(searched.articles[0].title);
  assert.ok(searched.counts.pending >= 2 && searched.counts.spam >= 1);
  assert.ok(!("deleted" in searched.counts));
  const newest = await adminGet("?status=pending"),
    oldest = await adminGet("?status=pending&sort=oldest");
  assert.ok(newest.comments[0].seq > newest.comments[1].seq);
  assert.ok(oldest.comments[0].seq < oldest.comments[1].seq);
  if (newest.cursor) {
    const page = await adminGet("?status=pending&cursor=" + newest.cursor);
    assert.ok(page.comments[0].seq < newest.comments.at(-1).seq);
  }
  assert.equal(newest.comments[0].expires, newest.comments[0].created + 30 * 86400000);
  assert.equal((await adminGet("?status=approved")).comments[0].expires, null);
  for (const row of [...newest.comments, ...oldest.comments])
    assert.ok(!("ip_hash" in row));
  assert.equal((await adminGet("?id=" + needleId)).comments.length, 1);
  assert.equal(
    (await dispatch("/admin/api/comments?status=deleted", { headers: { Cookie: cookie } })).status,
    400,
  );
  const summary = await (
    await dispatch("/admin/api/comments/summary", { headers: { Cookie: cookie } })
  ).json();
  assert.equal(summary.pending, searched.counts.pending);
  assert.equal((await dispatch("/admin/api/comments/summary")).status, 401);

  // Retention: trash and spam expire, public comments only lose their hash.
  const later = Date.now() + 31 * 86400000;
  const keptApproved = await reach("approved"),
    trashedOld = await reach("trash"),
    spamOld = await reach("spam"),
    freshTrash = await reach("trash");
  await db
    .prepare("UPDATE comments SET trashed_at=? WHERE id=?")
    .bind(later, freshTrash)
    .run();
  await db
    .prepare("INSERT INTO comment_blocks VALUES('expired-hash',0,?)")
    .bind(later - 1)
    .run();
  await cleanupEngagement(db, later);
  for (const cid of [trashedOld, spamOld]) {
    const row = await rowOf(cid);
    assert.deepEqual(
      [row.status, row.nickname, row.body, row.reply, row.ip_hash],
      ["deleted", "", "", null, null],
    );
  }
  assert.equal((await rowOf(freshTrash)).status, "trash");
  const approvedLater = await rowOf(keptApproved);
  assert.equal(approvedLater.status, "approved");
  assert.equal(approvedLater.ip_hash, null);
  assert.equal(approvedLater.nickname, "독자");
  assert.equal(
    (await db.prepare("SELECT COUNT(*) n FROM comment_blocks WHERE ip_hash='expired-hash'").first()).n,
    0,
  );
  assert.equal((await act(keptApproved, "block")).status, 409, "no hash after 30 days");

  // Telegram with a fake fetch: success, duplicates, failure, retry, missing secrets.
  const realFetch = globalThis.fetch;
  try {
    const titles = new Map([[path, "글 제목"]]);
    const tg = {
      DB: db,
      ANALYTICS_HMAC_SECRET: env.ANALYTICS_HMAC_SECRET,
      TELEGRAM_BOT_TOKEN: "test-token",
      TELEGRAM_CHAT_ID: "42",
    };
    let sent = [],
      online = true;
    globalThis.fetch = async (url, init) => {
      sent.push({ url, payload: JSON.parse(init.body) });
      if (!online) throw Error("offline");
      return new Response("{}", { status: 200 });
    };
    const direct = async (value, ip, environment = tg, now = Date.now()) => {
      const jobs = [];
      const response = await engagement(
        new Request(origin + "/api/comments", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: origin,
            "CF-Connecting-IP": ip,
          },
          body: JSON.stringify(value),
        }),
        environment,
        titles,
        { ctx: { waitUntil: (p) => jobs.push(p) }, baseUrl: origin, now },
      );
      await Promise.all(jobs);
      return response;
    };
    const fresh = comment({ nickname: "*독자*", body: "가".repeat(250) });
    assert.equal((await direct(fresh, nextIp())).status, 202);
    assert.equal(sent.length, 1);
    assert.match(sent[0].url, /api\.telegram\.org\/bottest-token\/sendMessage$/);
    assert.equal(sent[0].payload.chat_id, "42");
    assert.equal(sent[0].payload.parse_mode, undefined);
    assert.ok(sent[0].payload.text.includes("*독자*"));
    assert.ok(sent[0].payload.text.includes("글 제목"));
    assert.ok(sent[0].payload.text.includes("가".repeat(200) + "…"));
    assert.ok(!sent[0].payload.text.includes("가".repeat(201)));
    assert.ok(sent[0].payload.text.includes(`${origin}/admin/comments/?comment=${fresh.requestId}`));
    assert.ok((await rowOf(fresh.requestId)).notified_at > 0);
    assert.equal((await direct(fresh, nextIp())).status, 200);
    assert.equal(sent.length, 1, "a retried request does not notify again");
    sent = [];
    await direct(comment({ nickname: "독자", body: "리딩방 입장" }), nextIp());
    assert.equal(sent.length, 0, "spam is not notified");

    online = false;
    const lost = comment({ nickname: "독자", body: "전송 실패 사례" });
    assert.equal((await direct(lost, nextIp())).status, 202, "failure never blocks the comment");
    assert.equal((await rowOf(lost.requestId)).notified_at, null);
    online = true;
    sent = [];
    const midday = Date.UTC(2030, 0, 2, 5, 5);
    await db.prepare("UPDATE comments SET notified_at=1 WHERE notified_at IS NULL AND id!=?").bind(lost.requestId).run();
    await db.prepare("UPDATE comments SET created=? WHERE id=?").bind(midday - 3600000, lost.requestId).run();
    await notifyScheduled(tg, titles, origin, midday);
    assert.equal(sent.length, 1);
    assert.ok(sent[0].payload.text.includes("전송 실패 사례"));
    assert.ok((await rowOf(lost.requestId)).notified_at > 0);
    sent = [];
    await notifyScheduled(tg, titles, origin, midday + 3600000);
    assert.equal(sent.length, 0, "retry sends once");
    const inFlight = comment({ nickname: "독자", body: "방금 작성" });
    online = false;
    await direct(inFlight, nextIp());
    online = true;
    sent = [];
    await db.prepare("UPDATE comments SET created=? WHERE id=?").bind(midday - 60000, inFlight.requestId).run();
    await notifyScheduled(tg, titles, origin, midday);
    assert.equal(sent.length, 0, "the grace period avoids racing a live send");
    await db.prepare("UPDATE comments SET notified_at=1 WHERE id=?").bind(inFlight.requestId).run();

    // Expiry notice only at 09:05 KST, and only when something is close to expiring.
    await db.prepare("UPDATE comments SET status='approved' WHERE status='pending'").run();
    const morning = Date.UTC(2030, 0, 3, 0, 5);
    await notifyScheduled(tg, titles, origin, morning);
    assert.equal(sent.length, 0);
    const soon = id();
    await db
      .prepare("INSERT INTO comments(id,path,nickname,body,created,notified_at) VALUES(?,?,?,?,?,1)")
      .bind(soon, path, "독자", "곧 만료", morning - 25 * 86400000)
      .run();
    await notifyScheduled(tg, titles, origin, morning + 3600000);
    assert.equal(sent.length, 0, "only the morning run reports expiry");
    await notifyScheduled(tg, titles, origin, morning);
    assert.equal(sent.length, 1);
    assert.match(sent[0].payload.text, /1건이 7일 안에 만료/);

    sent = [];
    const { TELEGRAM_BOT_TOKEN, ...noSecret } = tg;
    void TELEGRAM_BOT_TOKEN;
    const quiet = comment({ nickname: "독자", body: "시크릿 없음" });
    assert.equal((await direct(quiet, nextIp(), noSecret)).status, 202);
    await notifyScheduled(noSecret, titles, origin, morning);
    assert.equal(sent.length, 0);
    assert.equal((await rowOf(quiet.requestId)).notified_at, null);
  } finally {
    globalThis.fetch = realFetch;
  }

  // 0003 -> 0004 keeps rows, seq and tombstones, and marks only the old queue as notified.
  const legacy = await mf.getD1Database("MIGRATION");
  const sql = (name) =>
    fs
      .readFileSync("site/analytics/migrations/" + name, "utf8")
      .replace(/--[^\n]*/g, "")
      .replace(/\n/g, " ");
  await legacy.exec(sql("0003_engagement.sql"));
  await legacy.batch(
    [
      [3, "a", "대기 독자", "대기 본문", "pending"],
      [7, "b", "공개 독자", "공개 본문", "approved"],
      [9, "c", "", "", "deleted"],
    ].map(([seq, cid, nick, text, state]) =>
      legacy
        .prepare("INSERT INTO comments(seq,id,path,nickname,body,status,created) VALUES(?,?,?,?,?,?,1000)")
        .bind(seq, cid, path, nick, text, state),
    ),
  );
  await legacy.exec(sql("0004_comment_moderation.sql"));
  const migrated = (
    await legacy.prepare("SELECT seq,id,nickname,body,status,created,notified_at FROM comments ORDER BY seq").all()
  ).results;
  assert.deepEqual(
    migrated.map((r) => [r.seq, r.id, r.nickname, r.body, r.status, r.created]),
    [
      [3, "a", "대기 독자", "대기 본문", "pending", 1000],
      [7, "b", "공개 독자", "공개 본문", "approved", 1000],
      [9, "c", "", "", "deleted", 1000],
    ],
  );
  assert.ok(migrated[0].notified_at > 0);
  assert.equal(migrated[1].notified_at, null);
  assert.equal(migrated[2].notified_at, null);
  await legacy
    .prepare("INSERT INTO comments(id,path,nickname,body,created) VALUES('d',?,'n','b',1)")
    .bind(path)
    .run();
  assert.equal(
    (await legacy.prepare("SELECT seq FROM comments WHERE id='d'").first()).seq,
    10,
    "AUTOINCREMENT continues after the highest migrated seq",
  );
  const indexes = (
    await legacy.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='comments' AND name NOT LIKE 'sqlite_%'").all()
  ).results.map((r) => r.name);
  for (const name of ["comments_public", "comments_queue", "comments_pending_expiry"])
    assert.ok(indexes.includes(name), name);
  assert.ok(
    (await legacy.prepare("SELECT COUNT(*) n FROM comment_banned_words WHERE word='리딩방'").first()).n === 1,
  );

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
    "Engagement tests passed: real Worker/D1 concurrent dedup/counters, moderation transitions, bulk, replies, spam classification, silent blocks, Telegram, 0004 migration, paging, CSRF/auth, body bounds, rate limits, retention, failure states.",
  );
} finally {
  await mf.dispose();
}
