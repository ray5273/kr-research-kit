import { sameOrigin } from "./auth.mjs";
const headers = {
  "Cache-Control": "private, no-store",
  "X-Robots-Tag": "noindex, nofollow",
  "X-Content-Type-Options": "nosniff",
};
const json = (data, status = 200) => Response.json(data, { status, headers });
const fail = (status, error) => {
  throw Object.assign(new Error(error), { status });
};
const uuid = (v) =>
  typeof v === "string" &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
    v,
  );
async function body(request) {
  if (!sameOrigin(request)) fail(403, "origin");
  if (!request.headers.get("Content-Type")?.startsWith("application/json"))
    fail(415, "content type");
  const reader = request.body?.getReader();
  if (!reader) fail(400, "body");
  let size = 0;
  const chunks = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 16384) {
      await reader.cancel();
      fail(413, "too large");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let i = 0;
  for (const c of chunks) {
    bytes.set(c, i);
    i += c.length;
  }
  try {
    const value = JSON.parse(new TextDecoder().decode(bytes));
    if (!value || Array.isArray(value) || typeof value !== "object")
      throw Error();
    return value;
  } catch {
    fail(400, "invalid JSON");
  }
}
async function limit(request, env, kind, now) {
  if (!env.ANALYTICS_HMAC_SECRET || env.ANALYTICS_HMAC_SECRET.length < 32)
    fail(503, "unavailable");
  const day = Math.floor(now / 86400000),
    slot = Math.floor(now / 600000);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(env.ANALYTICS_HMAC_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(
      `engagement:${day}:${request.headers.get("CF-Connecting-IP") || "unknown"}`,
    ),
  );
  const subject = Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
  const row = await env.DB.prepare(
    `INSERT INTO engagement_limits(subject,kind,slot,attempts,expires) VALUES(?,?,?,1,?) ON CONFLICT(subject,kind,slot) DO UPDATE SET attempts=attempts+1 WHERE attempts<? RETURNING attempts`,
  )
    .bind(subject, kind, slot, now + 86400000, kind === "share" ? 30 : 3)
    .first();
  if (!row) fail(429, "요청이 많습니다. 10분 후 다시 시도해 주세요.");
}
export async function cleanupEngagement(db, now = Date.now()) {
  await db.batch([
    db.prepare("DELETE FROM engagement_limits WHERE expires<=?").bind(now),
    db
      .prepare(
        "UPDATE comments SET nickname='',body='',status='deleted' WHERE status='pending' AND created<?",
      )
      .bind(now - 30 * 86400000),
  ]);
}
export async function engagement(
  request,
  env,
  articles,
  { admin = false, now = Date.now() } = {},
) {
  try {
    if (!env.DB) fail(503, "unavailable");
    const url = new URL(request.url),
      route = url.pathname,
      db = env.DB;
    const validPath = (path) => {
      if (!articles.has(path)) fail(400, "invalid public article");
      return path;
    };
    const cursorValue = (value) => {
      if (value !== null && !/^\d{1,15}$/.test(value))
        fail(400, "invalid cursor");
      return Number(value || 0);
    };
    if (admin) {
      if (route === "/admin/api/comments" && request.method === "GET") {
        const path = url.searchParams.get("path") || "",
          status = url.searchParams.get("status") || "pending",
          cursor = cursorValue(url.searchParams.get("cursor"));
        if (path) validPath(path);
        if (!["pending", "approved"].includes(status))
          fail(400, "invalid status");
        const rows = (
          await db
            .prepare(
              "SELECT seq,id,path,nickname,body,status,created FROM comments WHERE status=? AND (?='' OR path=?) AND seq>? AND (status!='pending' OR created>=?) ORDER BY seq LIMIT 21",
            )
            .bind(status, path, path, cursor, now - 30 * 86400000)
            .all()
        ).results;
        return json({
          articles: [...articles],
          comments: rows.slice(0, 20),
          cursor: rows.length > 20 ? String(rows[19].seq) : null,
        });
      }
      const match =
        /^\/admin\/api\/comments\/([a-f0-9-]+)\/(approve|delete)$/.exec(route);
      if (!match) fail(404, "not found");
      if (request.method !== "POST") fail(405, "method");
      await body(request);
      if (!uuid(match[1])) fail(400, "invalid id");
      const sql =
        match[2] === "approve"
          ? "UPDATE comments SET status='approved' WHERE id=? AND status='pending' AND created>=? RETURNING id"
          : "UPDATE comments SET status='deleted',nickname='',body='' WHERE id=? AND status!='deleted' RETURNING id";
      const stmt = db.prepare(sql),
        row = await (
          match[2] === "approve"
            ? stmt.bind(match[1], now - 30 * 86400000)
            : stmt.bind(match[1])
        ).first();
      if (!row) fail(404, "comment unavailable");
      return json({ ok: true });
    }
    if (request.method === "GET") {
      const path = validPath(url.searchParams.get("path"));
      if (route === "/api/article-meta") {
        const shares = await db
          .prepare("SELECT total FROM article_shares WHERE path=?")
          .bind(path)
          .first();
        const comments = await db
          .prepare(
            "SELECT COUNT(*) n FROM comments WHERE path=? AND status='approved'",
          )
          .bind(path)
          .first();
        return json({ shares: shares?.total || 0, comments: comments.n });
      }
      if (route === "/api/comments") {
        const cursor = cursorValue(url.searchParams.get("cursor"));
        const rows = (
          await db
            .prepare(
              "SELECT seq,id,nickname,body,created FROM comments WHERE path=? AND status='approved' AND seq>? ORDER BY seq LIMIT 21",
            )
            .bind(path, cursor)
            .all()
        ).results;
        return json({
          comments: rows.slice(0, 20),
          cursor: rows.length > 20 ? String(rows[19].seq) : null,
        });
      }
      fail(405, "method");
    }
    if (
      request.method !== "POST" ||
      !["/api/shares", "/api/comments"].includes(route)
    )
      fail(405, "method");
    const data = await body(request),
      path = validPath(data.path);
    if (!uuid(data.requestId)) fail(400, "invalid request ID");
    if (route === "/api/shares") {
      if (!["kakao", "native", "copy"].includes(data.channel))
        fail(400, "invalid channel");
      const existing = await db
        .prepare("SELECT path,channel FROM share_requests WHERE id=?")
        .bind(data.requestId)
        .first();
      if (existing) {
        if (existing.path !== path || existing.channel !== data.channel)
          fail(409, "request ID conflict");
        return json({ accepted: true });
      }
      await limit(request, env, "share", now);
      await db
        .prepare(
          "INSERT OR IGNORE INTO share_requests(id,path,channel,created) VALUES(?,?,?,?)",
        )
        .bind(data.requestId, path, data.channel, now)
        .run();
      return json({ accepted: true }, 202);
    }
    if (data.website) fail(400, "invalid submission");
    if (typeof data.nickname !== "string" || typeof data.body !== "string")
      fail(400, "invalid comment");
    const nickname = data.nickname.trim(),
      text = data.body.trim();
    if (
      !nickname ||
      [...nickname].length > 30 ||
      !text ||
      [...text].length > 2000 ||
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(nickname + text)
    )
      fail(400, "닉네임 1~30자, 댓글 1~2,000자를 입력해 주세요.");
    const existing = await db
      .prepare("SELECT path FROM comments WHERE id=?")
      .bind(data.requestId)
      .first();
    if (existing) {
      if (existing.path !== path) fail(409, "request ID conflict");
      return json({ accepted: true });
    }
    await limit(request, env, "comment", now);
    await db
      .prepare(
        "INSERT OR IGNORE INTO comments(id,path,nickname,body,created) VALUES(?,?,?,?,?)",
      )
      .bind(data.requestId, path, nickname, text, now)
      .run();
    return json({ accepted: true }, 202);
  } catch (error) {
    return json(
      {
        error: error.status
          ? error.message
          : "일시적으로 사용할 수 없습니다. 다시 시도해 주세요.",
      },
      error.status || 503,
    );
  }
}
