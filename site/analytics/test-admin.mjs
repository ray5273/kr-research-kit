import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
const code = fs.readFileSync(
  new URL("./admin.client.js", import.meta.url),
  "utf8",
);
class Element {
  constructor(dataset = {}) {
    this.dataset = dataset;
    this.value = "";
    this.innerHTML = "";
    this.textContent = "";
    this.listeners = {};
    this.attrs = {};
    this.children = [];
  }
  addEventListener(n, fn) {
    this.listeners[n] = fn;
  }
  setAttribute(k, v) {
    this.attrs[k] = v;
  }
  removeAttribute(k) {
    delete this.attrs[k];
  }
}
const nodes = new Map();
const $ = (s) => {
  if (!nodes.has(s)) nodes.set(s, new Element());
  return nodes.get(s);
};
const screens = ["overview", "articles", "sources", "insights"].map(
  (screen) => new Element({ screen }),
);
$("#periods").children = [7, 30, 90, 365].map(
  (days) => new Element({ days: String(days) }),
);
const a = {
  path: "/us/test/",
  title: "테스트 <script>alert(1)</script>",
  market: "us",
  tags: ["공시"],
};
let response = {
  days: 7,
  start: "2026-10-26",
  today: "2026-11-01",
  articles: [a],
  rows: [
    {
      dimension: "article",
      key: a.path,
      path: a.path,
      views: 30,
      sessions: 20,
      returning_sessions: 4,
      completed: 8,
      active: 900,
      clicked: 2,
      depth: 2000,
    },
  ],
  trend: [{ day: "2026-11-01", views: 30, uniques: 20 }],
  uniqueBrowsers: 20,
  uniqueMode: "기간 중복 제거",
  insights: [
    {
      ...a,
      views: 30,
      prior: 20,
      completed: 8,
      clicked: 2,
      rules: ["읽기 개선 후보"],
      start: "2026-10-25",
      end: "2026-10-31",
    },
  ],
  health: {
    state: "ok",
    startedAt: Date.now(),
    lastCollectedAt: Date.now(),
    aggregatedAt: Date.now(),
  },
};
let status = 200;
const context = {
  console,
  Date,
  URL,
  JSON,
  Number,
  Map,
  Set,
  encodeURIComponent,
  document: { querySelector: $, querySelectorAll: () => screens },
  fetch: async () => ({
    ok: status === 200,
    status,
    json: async () => structuredClone(response),
  }),
};
vm.runInNewContext(code, context);
const settle = async () => {
  for (let i = 0; i < 15; i++) await Promise.resolve();
};
await settle();
assert.match($("#content").innerHTML, /일별 조회/);
assert.match($("#status").textContent, /KST/);
function navigate(screen) {
  $("nav").listeners.click({
    target: screens.find((b) => b.dataset.screen === screen),
  });
}
navigate("articles");
assert.match($("#content").innerHTML, /&lt;script&gt;/);
assert.ok(!$("#content").innerHTML.includes("<script>"));
$("#search").listeners.input({ target: { value: "없음" } });
assert.match($("#article-table").innerHTML, /조건에 맞는 글이 없습니다/);
navigate("sources");
for (const title of [
  "유입 도메인",
  "캠페인",
  "첫 진입 페이지",
  "실제 글 사이 이동",
])
  assert.ok($("#content").innerHTML.includes(title));
navigate("insights");
assert.match($("#content").innerHTML, /읽기 개선 후보/);
assert.match($("#content").innerHTML, /2026-10-25/);
$("#content").listeners.click({ target: { dataset: { path: a.path } } });
await settle();
assert.match($("#content").innerHTML, /읽기 행동/);
assert.match($("#content").innerHTML, /26.7%/);
response = {
  ...response,
  rows: [],
  trend: [],
  insights: [],
  health: { state: "empty" },
};
$("#refresh").onclick();
await settle();
assert.match($("#status").textContent, /수집 기록 없음/);
assert.match($("#content").innerHTML, /집계된 일별 데이터가 없습니다/);
navigate("insights");
assert.match($("#content").innerHTML, /표본 부족/);
status = 503;
$("#refresh").onclick();
await settle();
assert.equal($("#status").dataset.error, "true");
assert.match($("#content").innerHTML, /통계를 확인할 수 없습니다/);
status = 401;
$("#refresh").onclick();
await settle();
assert.match($("#status").textContent, /관리자 로그인/);
console.log(
  "Admin behavior tests passed: four screens, article detail, filtering, escaping, empty, insufficient sample, DB error and authentication error.",
);
