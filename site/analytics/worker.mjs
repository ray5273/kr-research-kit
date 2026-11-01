import manifest from "../../site-dist/analytics-manifest.json";
import adminHTML from "./admin.html";
import adminJS from "./admin.client.js";
import {
  authorize,
  configured,
  checkPassword,
  issueSession,
  sessionCookie,
  sameOrigin,
  consumeAttempt,
} from "./auth.mjs";
import { engagement, cleanupEngagement } from "./engagement.mjs";
import commentsHTML from "./comments.html";
import commentsJS from "./comments.client.js";
import loginHTML from "./login.html";
import { sanitizeEvent, uuid } from "./core.mjs";
import { aggregate, report } from "./store.mjs";
const paths = new Set(manifest.paths),
  articles = new Set(manifest.articles.map((a) => a.path));
const headers = {
  "Cache-Control": "private, no-store",
  "X-Robots-Tag": "noindex, nofollow",
  "X-Content-Type-Options": "nosniff",
};
const json = (data, status = 200) => Response.json(data, { status, headers });
async function hash(value, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return Array.from(
    new Uint8Array(
      await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)),
    ),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
}
export async function collect(request, env, now = Date.now()) {
  if (request.method !== "POST") return json({ error: "method" }, 405);
  if (
    request.headers.get("Origin") !== new URL(request.url).origin ||
    request.headers.get("Sec-Fetch-Site") === "cross-site"
  )
    return json({ error: "origin" }, 403);
  if (!request.headers.get("Content-Type")?.startsWith("application/json"))
    return json({ error: "content type" }, 415);
  if (
    !env.DB ||
    !env.ANALYTICS_HMAC_SECRET ||
    env.ANALYTICS_HMAC_SECRET.length < 32
  )
    return json({ error: "collection unavailable" }, 503);
  // Bound streaming input even when Content-Length is absent or dishonest.
  const reader = request.body?.getReader();
  if (!reader) return json({ error: "body" }, 400);
  let chunks = [],
    size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 32768) {
      await reader.cancel();
      return json({ error: "too large" }, 413);
    }
    chunks.push(value);
  }
  let data, events;
  try {
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    data = JSON.parse(new TextDecoder().decode(bytes));
    if (
      data.consent !== true ||
      !Number.isSafeInteger(data.activityAt) ||
      data.activityAt > now + 60000 ||
      data.activityAt < now - 2 * 86400000 ||
      (data.browser !== null && !uuid(data.browser)) ||
      !Array.isArray(data.events) ||
      !data.events.length ||
      data.events.length > 30
    )
      throw Error();
    events = data.events.map((e) => sanitizeEvent(e, paths, articles, now));
    if (
      new Set(events.map((e) => e.viewId)).size !== 1 ||
      new Set(events.map((e) => e.path)).size !== 1 ||
      !events.some((e) => e.kind === "page_view")
    )
      throw Error();
  } catch {
    return json({ error: "invalid events" }, 400);
  }
  const activityAt = Math.min(now, data.activityAt);
  const browser = data.browser
    ? await hash(data.browser, env.ANALYTICS_HMAC_SECRET)
    : null;
  const view = events[0].viewId;
  // Use the existing view's session on retries. Concurrent tabs share the last active session.
  const candidate = crypto.randomUUID(),
    entry = events.find((e) => e.kind === "page_view");
  await env.DB.prepare(
    `INSERT OR IGNORE INTO sessions(id,browser,started,last_seen,returning_sessions,referrer,source,medium,campaign)
 SELECT COALESCE((SELECT session_id FROM events WHERE view_id=? LIMIT 1),
 (SELECT id FROM sessions WHERE browser=? AND last_seen>? ORDER BY last_seen DESC LIMIT 1),?), ?,?,?,
 EXISTS(SELECT 1 FROM sessions s WHERE browser=? AND EXISTS(SELECT 1 FROM events e WHERE e.session_id=s.id AND e.kind='page_view')),?,?,?,?`,
  )
    .bind(
      view,
      browser,
      now - 1800000,
      candidate,
      browser,
      now,
      activityAt,
      browser,
      entry.referrer,
      entry.source,
      entry.medium,
      entry.campaign,
    )
    .run();
  const session = await env.DB.prepare(
    `SELECT COALESCE((SELECT session_id FROM events WHERE view_id=? LIMIT 1),
 (SELECT id FROM sessions WHERE browser=? AND last_seen>? ORDER BY last_seen DESC LIMIT 1),?) id`,
  )
    .bind(view, browser, now - 1800000, candidate)
    .first();
  const attribution = await env.DB.prepare(
    "SELECT referrer,source,medium,campaign FROM sessions WHERE id=?",
  )
    .bind(session.id)
    .first();
  const statements = [];
  // Explicit columns avoid accidental schema-order coupling.
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    statements[i] = env.DB.prepare(
      `INSERT OR IGNORE INTO events(id,view_id,session_id,kind,path,at,depth,active,target,referrer,source,medium,campaign) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).bind(
      e.id,
      e.viewId,
      session.id,
      e.kind,
      e.path,
      e.at,
      e.depth,
      e.active,
      e.target,
      attribution.referrer,
      attribution.source,
      attribution.medium,
      attribution.campaign,
    );
  }
  statements.push(
    env.DB.prepare(
      "UPDATE sessions SET last_seen=MAX(last_seen,?) WHERE id=?",
    ).bind(activityAt, session.id),
    env.DB.prepare("INSERT OR IGNORE INTO health VALUES('started_at',?)").bind(
      String(now),
    ),
    env.DB.prepare(
      "INSERT INTO health VALUES('last_collected_at',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
    ).bind(String(now)),
  );
  await env.DB.batch(statements);
  return json({ accepted: true }, 202);
}
const csp =
  "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'";
const redirect = (location, cookie) =>
  new Response(null, {
    status: 303,
    headers: {
      ...headers,
      Location: location,
      ...(cookie ? { "Set-Cookie": cookie } : {}),
    },
  });
const loginPage = (message = "", status = 200) =>
  new Response(loginHTML.replace("{{message}}", message), {
    status,
    headers: {
      ...headers,
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": csp,
    },
  });
async function login(request, env) {
  if (!configured(env))
    return loginPage(
      "Cloudflare에 ADMIN_PASSWORD(12~256자)와 ANALYTICS_HMAC_SECRET(32자 이상) Secret을 설정하세요.",
      503,
    );
  if (request.method === "GET")
    return (await authorize(request, env)) ? redirect("/admin/") : loginPage();
  if (request.method !== "POST") return json({ error: "method" }, 405);
  if (!sameOrigin(request)) return json({ error: "origin" }, 403);
  if (
    !request.headers
      .get("Content-Type")
      ?.startsWith("application/x-www-form-urlencoded")
  )
    return json({ error: "content type" }, 415);
  const reader = request.body?.getReader();
  if (!reader) return json({ error: "body" }, 400);
  const chunks = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 2048) {
      await reader.cancel();
      return json({ error: "too large" }, 413);
    }
    chunks.push(value);
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const value of chunks) {
    body.set(value, offset);
    offset += value.length;
  }
  if (!env.DB || !(await consumeAttempt(env.DB)))
    return loginPage(
      "로그인 시도가 너무 많습니다. 최대 15분 후 다시 시도하세요.",
      429,
    );
  const form = new URLSearchParams(new TextDecoder().decode(body));
  if (
    form.getAll("password").length !== 1 ||
    !(await checkPassword(form.get("password"), env))
  )
    return loginPage("비밀번호가 올바르지 않습니다.", 401);
  return redirect(
    "/admin/",
    sessionCookie(await issueSession(env, new URL(request.url).origin)),
  );
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (["/api/article-meta", "/api/article-counts", "/api/shares", "/api/comments"].includes(url.pathname))
        return await engagement(request, env, articles);
      if (url.pathname === "/api/analytics/events")
        return await collect(request, env);
      if (url.pathname === "/admin" || url.pathname.startsWith("/admin/")) {
        if (
          url.protocol !== "https:" &&
          !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
        ) {
          url.protocol = "https:";
          return new Response(null, {
            status: 308,
            headers: { ...headers, Location: url.href },
          });
        }
        if (url.pathname === "/admin/login") return await login(request, env);
        if (url.pathname === "/admin/logout") {
          if (request.method !== "POST") return json({ error: "method" }, 405);
          if (!sameOrigin(request)) return json({ error: "origin" }, 403);
          return redirect("/admin/login", sessionCookie("", 0));
        }
        if (!(await authorize(request, env))) {
          if (
            request.method === "GET" &&
            ["/admin", "/admin/", "/admin/index.html"].includes(url.pathname)
          )
            return redirect("/admin/login");
          return json({ error: "관리자 로그인이 필요합니다." }, 401);
        }
        if (url.pathname === "/admin/api/comments" || url.pathname.startsWith("/admin/api/comments/"))
          return await engagement(request, env, articles, {admin: true});
        if (["/admin/comments/", "/admin/comments.js"].includes(url.pathname) && ["GET", "HEAD"].includes(request.method))
          return new Response(request.method === "HEAD" ? null : (url.pathname.endsWith(".js") ? commentsJS : commentsHTML), {headers: {...headers, "Content-Type": url.pathname.endsWith(".js") ? "text/javascript; charset=utf-8" : "text/html; charset=utf-8", "Content-Security-Policy": csp}});
        if (!["GET", "HEAD"].includes(request.method))
          return json({ error: "method" }, 405);
        if (url.pathname === "/admin/api/analytics") {
          const days = Number(url.searchParams.get("days") || 7),
            path = url.searchParams.get("path") || "";
          if (![7, 30, 90, 365].includes(days) || (path && !articles.has(path)))
            return json({ error: "invalid filter" }, 400);
          if (!env.DB)
            return json(
              { error: "database unavailable", health: { state: "error" } },
              503,
            );
          return json(await report(env.DB, manifest, days, path));
        }
        if (["/admin", "/admin/", "/admin/index.html"].includes(url.pathname))
          return new Response(request.method === "HEAD" ? null : adminHTML, {
            headers: {
              ...headers,
              "Content-Type": "text/html; charset=utf-8",
              "Content-Security-Policy": csp,
            },
          });
        if (url.pathname === "/admin/app.js")
          return new Response(request.method === "HEAD" ? null : adminJS, {
            headers: {
              ...headers,
              "Content-Type": "text/javascript; charset=utf-8",
            },
          });
        return json({ error: "not found" }, 404);
      }
      return env.ASSETS.fetch(request);
    } catch {
      return json(
        {
          error:
            "통계 저장소 오류입니다. 마지막 집계 이후 수치는 확인할 수 없습니다.",
          health: { state: "error" },
        },
        503,
      );
    }
  },
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(Promise.all([aggregate(env.DB, controller.scheduledTime), cleanupEngagement(env.DB, controller.scheduledTime)]));
  },
};
