import vm from "node:vm";
import fs from "node:fs";
import assert from "node:assert/strict";
const code = fs.readFileSync(new URL("./tracker.js", import.meta.url), "utf8");
async function scenario({ saved = null, blocked = false } = {}) {
  const stored = new Map(
      saved ? [["research.stats.consent", JSON.stringify(saved)]] : [],
    ),
    writes = [],
    requests = [],
    handlers = {},
    docHandlers = {};
  let now = Date.now(),
    mono = 0,
    interval;
  const panel = {
    hidden: false,
    innerHTML: "",
    setAttribute() {},
    querySelector() {
      return { hidden: false };
    },
    addEventListener(name, fn) {
      this[name] = fn;
    },
  };
  const settings = {
    addEventListener(name, fn) {
      this[name] = fn;
    },
  };
  const article = "/us/public/";
  const env = {
    console,
    crypto,
    URL,
    AbortController,
    Uint8Array,
    performance: { now: () => mono },
    Date: class extends Date {
      static now() {
        return now;
      }
    },
    localStorage: {
      getItem(k) {
        if (blocked) throw Error();
        return stored.get(k) || null;
      },
      setItem(k, v) {
        if (blocked) throw Error();
        writes.push([k, v]);
        stored.set(k, v);
      },
      removeItem(k) {
        if (blocked) throw Error();
        stored.delete(k);
      },
    },
    location: {
      href: "https://site.test" + article,
      pathname: article,
      origin: "https://site.test",
    },
    innerHeight: 800,
    document: {
      hidden: false,
      referrer: "",
      createElement() {
        return panel;
      },
      body: { append() {} },
      querySelector(s) {
        return s === "[data-stats-settings]"
          ? settings
          : { getBoundingClientRect: () => ({ top: 0, height: 800 }) };
      },
      addEventListener(n, fn) {
        docHandlers[n] = fn;
      },
    },
    addEventListener(n, fn) {
      handlers[n] = fn;
    },
    setInterval(fn) {
      interval = fn;
    },
    fetch: async (url, init) => {
      requests.push({ url, init });
      if (url === "/analytics-manifest.json")
        return {
          json: async () => ({
            paths: [article],
            articles: [{ path: article }],
          }),
        };
      return { ok: true, status: 202 };
    },
  };
  vm.runInNewContext(code, env);
  const settle = async () => {
    for (let i = 0; i < 12; i++) await Promise.resolve();
  };
  await settle();
  const click = async (choice) => {
    panel.click({ target: { dataset: { choice }, hasAttribute: () => false } });
    await settle();
  };
  const advance = async (seconds) => {
    now += seconds * 1000;
    mono += seconds * 1000;
    interval();
    await settle();
  };
  return {
    stored,
    writes,
    requests,
    click,
    advance,
    handlers,
    docHandlers,
    env,
    panel,
    settings,
  };
}
let s = await scenario();
assert.equal(s.requests.length, 0);
assert.equal(s.writes.length, 0);
await s.click("deny");
await s.advance(60);
assert.equal(s.requests.length, 0);
assert.ok(!s.stored.has("research.stats.browser"));
s = await scenario();
await s.click("allow");
assert.ok(s.stored.has("research.stats.browser"));
assert.equal(
  s.requests.filter((r) => r.url === "/api/analytics/events").length,
  1,
);
await s.advance(15);
await s.advance(15);
await s.advance(15);
const payloads = s.requests
  .filter((r) => r.url === "/api/analytics/events")
  .map((r) => JSON.parse(r.init.body));
assert.equal(
  Math.max(...payloads.flatMap((p) => p.events.map((e) => e.active || 0))),
  30,
  "active only within 30 seconds",
);
await s.click("deny");
const before = s.requests.length;
await s.advance(60);
assert.equal(s.requests.length, before);
assert.ok(!s.stored.has("research.stats.browser"));
s = await scenario({ blocked: true });
await s.click("allow");
assert.equal(s.writes.length, 0);
assert.equal(
  JSON.parse(
    s.requests.find((r) => r.url === "/api/analytics/events").init.body,
  ).browser,
  null,
  "page only fallback",
);
s = await scenario({ saved: { value: "deny", at: Date.now() } });
await s.advance(60);
assert.equal(s.requests.length, 0);
s = await scenario({
  saved: { value: "allow", at: Date.now() - 91 * 86400000 },
});
assert.equal(s.requests.length, 0);
assert.equal(s.panel.hidden, false);
s = await scenario();
await s.click("allow");
const firstId = JSON.parse(
  s.requests.find((r) => r.url === "/api/analytics/events").init.body,
).events[0].id;
await s.advance(1801);
s.handlers.pointerdown();
for (let i = 0; i < 15; i++) await Promise.resolve();
await s.advance(15);
const finalPayload = JSON.parse(
  s.requests.filter((r) => r.url === "/api/analytics/events").at(-1).init.body,
);
assert.notEqual(
  finalPayload.events[0].id,
  firstId,
  "new logical view after session inactivity",
);
s = await scenario();
await s.click("allow");
await s.advance(10);
s.env.document.hidden = true;
s.docHandlers.visibilitychange();
await s.advance(20);
const hiddenMax = Math.max(
  ...s.requests
    .filter((r) => r.url === "/api/analytics/events")
    .flatMap((r) => JSON.parse(r.init.body).events.map((e) => e.active || 0)),
);
assert.equal(hiddenMax, 10, "hidden time is excluded");
s = await scenario();
await s.click("allow");
s.stored.set(
  "research.stats.consent",
  JSON.stringify({ value: "deny", at: Date.now() }),
);
s.handlers.storage({ key: "research.stats.consent" });
const count = s.requests.length;
await s.advance(15);
assert.equal(
  s.requests.length,
  count,
  "withdrawal in another tab stops collection",
);
console.log(
  "Tracker tests passed: opt-in, denial, withdrawal, expiry, activity timeout, storage unavailable.",
);
