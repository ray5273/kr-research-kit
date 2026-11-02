import { sameOrigin } from "./auth.mjs";
import { notifyComment, telegramReady } from "./notify.mjs";
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
async function hmacHex(secret, message) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(message),
  );
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
async function limit(request, env, kind, now) {
  if (!env.ANALYTICS_HMAC_SECRET || env.ANALYTICS_HMAC_SECRET.length < 32)
    fail(503, "unavailable");
  const day = Math.floor(now / 86400000),
    slot = Math.floor(now / 600000);
  const subject = await hmacHex(
    env.ANALYTICS_HMAC_SECRET,
    `engagement:${day}:${request.headers.get("CF-Connecting-IP") || "unknown"}`,
  );
  const row = await env.DB.prepare(
    `INSERT INTO engagement_limits(subject,kind,slot,attempts,expires) VALUES(?,?,?,1,?) ON CONFLICT(subject,kind,slot) DO UPDATE SET attempts=attempts+1 WHERE attempts<? RETURNING attempts`,
  )
    .bind(subject, kind, slot, now + 86400000, kind === "share" ? 30 : 3)
    .first();
  if (!row) fail(429, "요청이 많습니다. 10분 후 다시 시도해 주세요.");
}
const DAY = 86400000,
  RETENTION = 30 * DAY,
  BLOCK_DAYS = 90;
const WIPE =
  "nickname='',body='',status='deleted',reply=NULL,replied_at=NULL,prior_status=NULL,trashed_at=NULL,spam_reason=NULL,ip_hash=NULL";
// The single source of allowed moves, shared by single and bulk actions.
const TRANSITIONS = {
  pending: { approve: "approved", spam: "spam", trash: "trash" },
  approved: { hide: "hidden", trash: "trash" },
  hidden: { approve: "approved", trash: "trash" },
  spam: { approve: "approved", trash: "trash" },
  trash: { restore: "prior", delete: "deleted" },
};
const SET = {
  approve: "status='approved',spam_reason=NULL",
  hide: "status='hidden'",
  spam: "status='spam',spam_reason='manual'",
  trash: "status='trash',prior_status=status,trashed_at=?",
  restore: "status=?,prior_status=NULL,trashed_at=NULL",
  delete: WIPE,
};
const expired = (row, now) => row.created < now - RETENTION;
function transition(db, row, action, now) {
  if (row.status === "pending" && expired(row, now))
    fail(404, "comment unavailable");
  if (!TRANSITIONS[row.status]?.[action]) fail(409, "현재 상태에서 할 수 없는 동작입니다.");
  const binds = [];
  if (action === "trash") binds.push(now);
  if (action === "restore") {
    const next = row.prior_status || "pending";
    // Cleanup would wipe these on its next run, so restoring would only lose them later.
    if (["pending", "spam"].includes(next) && expired(row, now))
      fail(409, "보관 기한이 지나 복원할 수 없습니다.");
    binds.push(next);
  }
  return db
    .prepare(
      `UPDATE comments SET ${SET[action]} WHERE id=? AND status=? RETURNING id`,
    )
    .bind(...binds, row.id, row.status);
}
const normalizeWord = (text) =>
  text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s\u200b-\u200d\ufeff]+/g, "");
const LINK_COMPACT = /https?:\/\/|www\.|open\.kakao|t\.me\//;
const LINK_DOMAIN =
  /(?:^|[^a-z0-9@.-])[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|net|org|kr|io|me|ly|gg|xyz|info|shop|site|link|top|app|to|biz|club|vip)(?![a-z0-9-])/;
async function classify(db, nickname, text) {
  const compact = normalizeWord(nickname + "\n" + text);
  const { results } = await db
    .prepare("SELECT word FROM comment_banned_words")
    .all();
  const word = results.find((r) => compact.includes(r.word));
  if (word) return "word:" + word.word;
  if (
    LINK_COMPACT.test(compact) ||
    LINK_DOMAIN.test((nickname + " " + text).normalize("NFKC").toLowerCase())
  )
    return "link";
  return null;
}
// Date-independent so a block outlives the daily rate-limit hash.
const authorHash = (request, env) => {
  const ip = request.headers.get("CF-Connecting-IP");
  return ip ? hmacHex(env.ANALYTICS_HMAC_SECRET, "comment-author:" + ip) : null;
};
export async function cleanupEngagement(db, now = Date.now()) {
  const cutoff = now - RETENTION;
  await db.batch([
    db.prepare("DELETE FROM engagement_limits WHERE expires<=?").bind(now),
    db
      .prepare(`UPDATE comments SET ${WIPE} WHERE status='pending' AND created<?`)
      .bind(cutoff),
    db
      .prepare(`UPDATE comments SET ${WIPE} WHERE status='spam' AND created<?`)
      .bind(cutoff),
    db
      .prepare(`UPDATE comments SET ${WIPE} WHERE status='trash' AND trashed_at<?`)
      .bind(cutoff),
    db.prepare("DELETE FROM comment_blocks WHERE expires<=?").bind(now),
    db
      .prepare("UPDATE comments SET ip_hash=NULL WHERE ip_hash IS NOT NULL AND created<?")
      .bind(cutoff),
  ]);
}
const ROW =
  "seq,id,path,nickname,body,status,created,reply,replied_at,prior_status,trashed_at,spam_reason,ip_hash IS NOT NULL AS blockable,EXISTS(SELECT 1 FROM comment_blocks b WHERE b.ip_hash=comments.ip_hash AND b.expires>?) AS blocked";
const expiresAt = (c) =>
  c.status === "trash"
    ? c.trashed_at + RETENTION
    : ["pending", "spam"].includes(c.status)
      ? c.created + RETENTION
      : null;
const LIST_STATUSES = ["pending", "approved", "hidden", "spam", "trash"];
const replyText = (value) => {
  if (typeof value !== "string") fail(400, "invalid reply");
  const text = value.trim();
  if (
    [...text].length > 2000 ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)
  )
    fail(400, "답글은 2,000자까지 입력할 수 있습니다.");
  return text;
};
async function moderate(request, db, route, url, articles, now, validPath, cursorValue) {
  const summary = route === "/admin/api/comments/summary",
    words = route === "/admin/api/comments/words",
    blocks = route === "/admin/api/comments/blocks";
  if (request.method === "GET") {
    if (summary) {
      const row = await db
        .prepare("SELECT COUNT(*) n FROM comments WHERE status='pending' AND created>=?")
        .bind(now - RETENTION)
        .first();
      return json({ pending: row.n });
    }
    if (words) {
      const { results } = await db
        .prepare("SELECT word FROM comment_banned_words ORDER BY word")
        .all();
      return json({ words: results.map((r) => r.word) });
    }
    if (blocks) {
      const row = await db
        .prepare("SELECT COUNT(*) n FROM comment_blocks WHERE expires>?")
        .bind(now)
        .first();
      return json({ count: row.n });
    }
    if (route !== "/admin/api/comments") fail(404, "not found");
    const params = url.searchParams,
      path = params.get("path") || "",
      id = params.get("id") || "",
      status = params.get("status") || "pending",
      sort = params.get("sort") || "newest",
      q = (params.get("q") || "").trim(),
      cursor = cursorValue(params.get("cursor"));
    if (path) validPath(path);
    if (id && !uuid(id)) fail(400, "invalid id");
    if (!LIST_STATUSES.includes(status)) fail(400, "invalid status");
    if (!["newest", "oldest"].includes(sort)) fail(400, "invalid sort");
    if ([...q].length > 100) fail(400, "invalid search");
    const cutoff = now - RETENTION,
      conditions = ["status!='deleted'", "(status!='pending' OR created>=?)"],
      binds = [now, cutoff];
    if (id) {
      conditions.push("id=?");
      binds.push(id);
    } else {
      conditions.push("status=?");
      binds.push(status);
      if (path) {
        conditions.push("path=?");
        binds.push(path);
      }
      if (q) {
        const like = `%${q.replace(/[\\%_]/g, "\\$&")}%`;
        conditions.push("(nickname LIKE ? ESCAPE '\\' OR body LIKE ? ESCAPE '\\')");
        binds.push(like, like);
      }
      if (cursor) {
        conditions.push(sort === "newest" ? "seq<?" : "seq>?");
        binds.push(cursor);
      }
    }
    const rows = (
      await db
        .prepare(
          `SELECT ${ROW} FROM comments WHERE ${conditions.join(" AND ")} ORDER BY seq ${sort === "newest" ? "DESC" : "ASC"} LIMIT 21`,
        )
        .bind(...binds)
        .all()
    ).results;
    const counts = (
      await db
        .prepare(
          "SELECT status,COUNT(*) n FROM comments WHERE status!='deleted' AND (status!='pending' OR created>=?) AND (?='' OR path=?) GROUP BY status",
        )
        .bind(cutoff, path, path)
        .all()
    ).results;
    return json({
      articles: [...articles].map(([p, title]) => ({ path: p, title })),
      counts: Object.fromEntries(counts.map((r) => [r.status, r.n])),
      comments: rows
        .slice(0, 20)
        .map((c) => ({ ...c, expires: expiresAt(c) })),
      cursor: rows.length > 20 ? String(rows[19].seq) : null,
    });
  }
  if (request.method !== "POST") fail(405, "method");
  if (route === "/admin/api/comments/bulk") {
    const data = await body(request);
    if (
      !Array.isArray(data.ids) ||
      !data.ids.length ||
      data.ids.length > 20 ||
      !data.ids.every(uuid) ||
      !Object.hasOwn(SET, data.action)
    )
      fail(400, "invalid bulk request");
    const ids = [...new Set(data.ids)];
    const { results } = await db
      .prepare(
        `SELECT id,status,created,prior_status FROM comments WHERE id IN (${ids.map(() => "?").join(",")})`,
      )
      .bind(...ids)
      .all();
    const statements = [];
    for (const row of results) {
      try {
        statements.push(transition(db, row, data.action, now));
      } catch (error) {
        if (!error.status) throw error;
      }
    }
    const done = statements.length ? await db.batch(statements) : [];
    const processed = done.reduce((n, r) => n + r.results.length, 0);
    return json({ ok: true, processed, skipped: ids.length - processed });
  }
  if (words) {
    const data = await body(request);
    if (typeof data.word !== "string") fail(400, "invalid word");
    const word = normalizeWord(data.word);
    if (!word || [...word].length > 50) fail(400, "금칙어는 1~50자로 입력해 주세요.");
    const { n } = await db
      .prepare("SELECT COUNT(*) n FROM comment_banned_words")
      .first();
    if (n >= 200) fail(409, "금칙어는 200개까지 등록할 수 있습니다.");
    await db
      .prepare("INSERT OR IGNORE INTO comment_banned_words(word,created) VALUES(?,?)")
      .bind(word, now)
      .run();
    return json({ ok: true, word });
  }
  if (route === "/admin/api/comments/words/delete") {
    const data = await body(request);
    if (typeof data.word !== "string") fail(400, "invalid word");
    await db
      .prepare("DELETE FROM comment_banned_words WHERE word=?")
      .bind(data.word)
      .run();
    return json({ ok: true });
  }
  if (route === "/admin/api/comments/blocks/clear") {
    await body(request);
    await db.prepare("DELETE FROM comment_blocks").run();
    return json({ ok: true });
  }
  const match =
    /^\/admin\/api\/comments\/([a-f0-9-]+)\/(approve|hide|spam|trash|restore|delete|reply|block|unblock)$/.exec(
      route,
    );
  if (!match) fail(404, "not found");
  const data = await body(request),
    [, id, action] = match;
  if (!uuid(id)) fail(400, "invalid id");
  const row = await db
    .prepare("SELECT id,status,created,prior_status,ip_hash FROM comments WHERE id=?")
    .bind(id)
    .first();
  if (!row || row.status === "deleted") fail(404, "comment unavailable");
  if (action === "block" || action === "unblock") {
    if (!row.ip_hash) fail(409, "작성 후 30일이 지나 차단 정보가 없습니다.");
    await (action === "block"
      ? db
          .prepare(
            "INSERT INTO comment_blocks(ip_hash,created,expires) VALUES(?,?,?) ON CONFLICT(ip_hash) DO UPDATE SET expires=excluded.expires",
          )
          .bind(row.ip_hash, now, now + BLOCK_DAYS * DAY)
      : db.prepare("DELETE FROM comment_blocks WHERE ip_hash=?").bind(row.ip_hash)
    ).run();
    return json({ ok: true });
  }
  if (action === "reply") {
    if (row.status === "pending" && expired(row, now))
      fail(404, "comment unavailable");
    if (!["pending", "approved", "hidden"].includes(row.status))
      fail(409, "현재 상태에서는 답글을 달 수 없습니다.");
    const reply = replyText(data.reply);
    await db
      .prepare("UPDATE comments SET reply=?,replied_at=? WHERE id=?")
      .bind(reply || null, reply ? now : null, id)
      .run();
    return json({ ok: true });
  }
  const done = await transition(db, row, action, now).first();
  if (!done) fail(409, "다른 곳에서 먼저 처리되었습니다.");
  return json({ ok: true });
}
export async function engagement(
  request,
  env,
  articles,
  { admin = false, now = Date.now(), ctx, baseUrl = "" } = {},
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
    if (admin)
      return await moderate(request, db, route, url, articles, now, validPath, cursorValue);
    if (request.method === "GET") {
      if (route === "/api/article-counts") {
        const [shares, comments] = await db.batch([
          db.prepare("SELECT path,total n FROM article_shares"),
          db.prepare(
            "SELECT path,COUNT(*) n FROM comments WHERE status='approved' GROUP BY path",
          ),
        ]);
        const counts = {};
        const add = (rows, key) => {
          for (const row of rows.results)
            if (articles.has(row.path))
              (counts[row.path] ||= { shares: 0, comments: 0 })[key] = row.n;
        };
        add(shares, "shares");
        add(comments, "comments");
        return Response.json(counts, {
          headers: { ...headers, "Cache-Control": "public, max-age=60" },
        });
      }
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
              "SELECT seq,id,nickname,body,created,reply,replied_at FROM comments WHERE path=? AND status='approved' AND seq>? ORDER BY seq LIMIT 21",
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
    const author = await authorHash(request, env);
    if (author) {
      const blocked = await db
        .prepare("SELECT 1 FROM comment_blocks WHERE ip_hash=? AND expires>?")
        .bind(author, now)
        .first();
      // Same answer as a stored comment, so a blocked author learns nothing.
      if (blocked) return json({ accepted: true }, 202);
    }
    const reason = await classify(db, nickname, text);
    const inserted = await db
      .prepare(
        "INSERT OR IGNORE INTO comments(id,path,nickname,body,status,spam_reason,ip_hash,created) VALUES(?,?,?,?,?,?,?,?) RETURNING id",
      )
      .bind(
        data.requestId,
        path,
        nickname,
        text,
        reason ? "spam" : "pending",
        reason,
        author,
        now,
      )
      .first();
    if (inserted && !reason && ctx && telegramReady(env))
      ctx.waitUntil(
        notifyComment(
          env,
          { id: data.requestId, nickname, body: text },
          articles.get(path),
          baseUrl,
          now,
        ),
      );
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
