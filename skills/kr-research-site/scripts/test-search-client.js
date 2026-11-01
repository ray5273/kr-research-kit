const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  vm = require("node:vm");
const discovery = require("./discovery");
class Element {
  constructor() {
    this.children = [];
    this.listeners = {};
    this.value = "";
    this.textContent = "";
    this.hidden = false;
  }
  addEventListener(k, f) {
    this.listeners[k] = f;
  }
  append(...c) {
    this.children.push(...c);
  }
  replaceChildren() {
    this.children = [];
  }
  focus() {}
}
const selectors = [
  "#search-q",
  "#search-form",
  "#search-status",
  "#search-results",
  "#search-retry",
  "#search-reset",
  "#search-back",
];
const nodes = Object.fromEntries(selectors.map((s) => [s, new Element()])),
  listeners = {};
let location = new URL(
    "https://site.test/search/?q=" + encodeURIComponent("네이버 팩토리"),
  ),
  fail = true;
const context = {
  document: {
    querySelector: (s) => nodes[s],
    createElement: () => new Element(),
  },
  ResearchDiscovery: discovery,
  URL,
  window: {
    addEventListener: (k, f) => {
      listeners[k] = f;
    },
  },
  fetch: async () => {
    if (fail) throw Error();
    return {
      ok: true,
      json: async () => [
        {
          slug: "kr/naver",
          headline: "네이버 AI 팩토리",
          company: "네이버",
          ticker: "035420",
          sectors: ["클라우드"],
          tags: [],
          summary: "공개 요약",
          datePublished: "2026-11-01",
          order: 0,
        },
      ],
    };
  },
  history: {
    length: 1,
    pushState: (_s, _t, url) => {
      context.location = new URL(url, context.location);
    },
    back: () => {
      context.wentBack = true;
    },
  },
  location,
};
vm.runInNewContext(fs.readFileSync(__dirname + "/search.js", "utf8"), context);
const flush = async () => {
  for (let i = 0; i < 5; i++)
    await new Promise((resolve) => setImmediate(resolve));
};
(async () => {
  await flush();
  assert.equal(nodes["#search-q"].value, "네이버 팩토리");
  assert.equal(nodes["#search-retry"].hidden, false);
  assert.match(nodes["#search-status"].textContent, /불러오지 못/);
  fail = false;
  await nodes["#search-retry"].listeners.click();
  await flush();
  assert.match(nodes["#search-status"].textContent, /1개의/);
  assert.equal(nodes["#search-results"].children[0].href, "/kr/naver/");
  nodes["#search-q"].value = "없는말";
  nodes["#search-form"].listeners.submit({ preventDefault() {} });
  assert.equal(context.location.searchParams.get("q"), "없는말");
  assert.match(nodes["#search-status"].textContent, /0개의/);
  assert.match(
    nodes["#search-results"].children[0].textContent,
    /검색 결과가 없습니다/,
  );
  context.location = new URL("https://site.test/search/?q=035420");
  listeners.popstate();
  assert.equal(nodes["#search-q"].value, "035420");
  assert.match(nodes["#search-status"].textContent, /1개의/);
  nodes["#search-reset"].listeners.click({ preventDefault() {} });
  assert.equal(context.location.search, "");
  assert.equal(nodes["#search-q"].value, "");
  assert.match(nodes["#search-status"].textContent, /1개의/);
  context.history.length = 2;
  nodes["#search-back"].listeners.click({ preventDefault() {} });
  assert.equal(context.wentBack, true);
  console.log(
    "Search client tests passed: URL query restoration, AND results, failure/retry, empty state, reset and browser back.",
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
