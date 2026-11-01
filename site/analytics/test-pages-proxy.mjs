import assert from "node:assert/strict";
import fs from "node:fs";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";

const mf = new Miniflare(convertV4MiniflareOptions({
  modules: true,
  script: fs.readFileSync(new URL("../pages-proxy/_worker.js", import.meta.url), "utf8"),
  compatibilityDate: "2026-10-01",
  serviceBindings: {
    RESEARCH: async request => {
      const url = new URL(request.url);
      if (url.pathname === "/admin/api/analytics") {
        return new Response("authentication required", { status: 401, headers: { "Cache-Control": "private, no-store" } });
      }
      if (url.pathname === "/admin/login") {
        if (request.headers.get("Origin") !== url.origin) return new Response("origin", { status: 403 });
        assert.equal(await request.text(), "password=local-test-value");
        return new Response(null, { status: 303, headers: { Location: "/admin/", "Set-Cookie": "__Host-test=session; Secure; HttpOnly; Path=/" } });
      }
      if (url.pathname === "/missing") return new Response("not found", { status: 404 });
      return Response.json({ url: request.url, method: request.method, cookie: request.headers.get("Cookie") });
    },
  },
}));
try {
  const base = "https://kr-research-site.pages.dev";
  const response = await mf.dispatchFetch(base + "/us/alphabet-2026-q3/?source=pages", { headers: { Cookie: "session=value" } });
  assert.deepEqual(await response.json(), { url: base + "/us/alphabet-2026-q3/?source=pages", method: "GET", cookie: "session=value" });
  assert.equal((await mf.dispatchFetch("https://preview.kr-research-site.pages.dev/")).headers.get("X-Robots-Tag"), "noindex, nofollow");
  const login = { method: "POST", headers: { Origin: base, "Content-Type": "application/x-www-form-urlencoded" }, body: "password=local-test-value", redirect: "manual" };
  const ok = await mf.dispatchFetch(base + "/admin/login", login);
  assert.equal(ok.status, 303);
  assert.equal(ok.headers.get("Location"), "/admin/");
  assert.match(ok.headers.get("Set-Cookie"), /Secure; HttpOnly/);
  assert.equal((await mf.dispatchFetch(base + "/admin/login", { ...login, headers: { ...login.headers, Origin: "https://attacker.test" } })).status, 403);
  const denied = await mf.dispatchFetch(base + "/admin/api/analytics");
  assert.equal(denied.status, 401);
  assert.equal(denied.headers.get("Cache-Control"), "private, no-store");
  assert.equal((await mf.dispatchFetch(base + "/missing")).status, 404);
  console.log("Pages proxy tests passed: original URL, query, cookies, POST body, origin, redirects, auth denial and 404.");
} finally {
  await mf.dispose();
}
