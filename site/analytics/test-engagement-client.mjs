import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
const code = fs.readFileSync("site/engagement.js", "utf8");
class Element {
  constructor() {
    this.listeners = {};
    this.children = [];
    this.dataset = {};
    this.disabled = false;
    this.textContent = "";
    this.value = "";
    this.hidden = false;
    this.style = {};
  }
  addEventListener(type, fn) {
    this.listeners[type] = fn;
  }
  querySelector(selector) {
    return this.nodes?.[selector];
  }
  append(...nodes) {
    this.children.push(...nodes);
  }
  focus() {}
  select() {}
  remove() {}
}
const flush = async () => {
  for (let i = 0; i < 12; i++)
    await new Promise((resolve) => setImmediate(resolve));
};
async function fixture({
  share,
  copy = async () => {},
  fetchFail = false,
  kakaoFail = false,
  kakaoInitialized = false,
} = {}) {
  const group = new Element(),
    shareStatus = new Element(),
    form = new Element(),
    submit = new Element(),
    elements = {};
  for (const name of ["nickname", "body", "website"])
    elements[name] = new Element();
  form.elements = elements;
  form.nodes = { button: submit };
  form.reset = () => {
    for (const e of Object.values(elements)) e.value = "";
  };
  group.dataset = {
    url: "https://site.test/us/test/",
    title: "짧은 제목",
    summary: "공개 요약",
    image: "https://site.test/share/card.png",
    kakaoKey: "test-key",
  };
  group.nodes = { "[role=status]": shareStatus };
  const nodes = Object.fromEntries(
    [
      "#comment-list",
      "#comments-status",
      "#comments-more",
      "#comments-retry",
      "#comment-status",
      "[data-share-count]",
      "[data-comment-count]",
    ].map((s) => [s, new Element()]),
  );
  nodes["#comment-form"] = form;
  const calls = [],
    kakao = [];
  let failed = fetchFail;
  const document = {
    querySelector: (s) => nodes[s],
    querySelectorAll: (s) =>
      s === ".sharing" ? [group] : nodes[s] ? [nodes[s]] : [],
    createElement: () => new Element(),
    body: new Element(),
  };
  const navigator = {
    clipboard: { writeText: copy },
    ...(share ? { share } : {}),
  };
  let initialized = kakaoInitialized;
  let initCalls = 0;
  const shareModule = {
    sendDefault: async (value) => {
      if (kakaoFail) throw Error("SDK 실패");
      kakao.push(value);
    },
  };
  // Match the official SDK: a fresh page has init(), but no Share yet.
  const sdk = {
    isInitialized: () => initialized,
    init(key) {
      assert.equal(key, group.dataset.kakaoKey);
      assert.equal(initialized, false, "must not initialize twice");
      initialized = true;
      initCalls++;
      this.Share = shareModule;
    },
    ...(initialized ? { Share: shareModule } : {}),
  };
  const fetch = async (url, options) => {
    calls.push({ url, payload: options ? JSON.parse(options.body) : null });
    if (failed) throw Error("offline");
    return {
      ok: true,
      json: async () =>
        url.startsWith("/api/article-meta")
          ? { shares: 7, comments: 1 }
          : url.startsWith("/api/comments?")
            ? {
                comments: [
                  {
                    nickname: "<b>독자</b>",
                    body: "<script>실행 금지</script>",
                    created: Date.now(),
                  },
                ],
                cursor: null,
              }
            : { accepted: true },
    };
  };
  vm.runInNewContext(code, {
    document,
    navigator,
    crypto,
    URL,
    fetch,
    Kakao: sdk,
    window: { Kakao: sdk },
  });
  await flush();
  return {
    calls,
    kakao,
    sdk,
    initCalls: () => initCalls,
    nodes,
    form,
    group,
    shareStatus,
    setFailure: (value) => {
      failed = value;
    },
    click: async (channel) => {
      const button = new Element();
      button.dataset.share = channel;
      await group.listeners.click({ target: { closest: () => button } });
      await flush();
      assert.equal(button.disabled, false);
    },
  };
}
let copied = "";
let f = await fixture({
  copy: async (url) => {
    copied = url;
  },
});
await f.click("copy");
assert.equal(copied, "https://site.test/us/test/");
assert.equal(
  f.calls.filter((c) => c.url === "/api/shares")[0].payload.channel,
  "copy",
);
assert.equal(f.nodes["[data-share-count]"].textContent, "공유 7회");
assert.equal(
  f.nodes["#comment-list"].children[0].children.at(-1).textContent,
  "<script>실행 금지</script>",
);
await f.click("native");
assert.equal(
  f.calls.filter((c) => c.url === "/api/shares").at(-1).payload.channel,
  "copy",
);
f = await fixture({ share: async () => {} });
await f.click("native");
assert.equal(f.calls.filter((c) => c.url === "/api/shares").length, 1);
f = await fixture({
  share: async () => {
    throw Object.assign(Error("cancel"), { name: "AbortError" });
  },
});
await f.click("native");
assert.equal(f.calls.filter((c) => c.url === "/api/shares").length, 0);
assert.match(f.shareStatus.textContent, /취소/);
f = await fixture({
  copy: async () => {
    throw Error("복사 실패");
  },
});
await f.click("copy");
assert.equal(f.calls.filter((c) => c.url === "/api/shares").length, 0);
assert.match(f.shareStatus.textContent, /실패/);
f = await fixture();
assert.equal(f.sdk.Share, undefined, "official SDK has no Share before init");
await f.click("kakao");
assert.equal(f.initCalls(), 1);
await f.click("kakao");
assert.equal(f.initCalls(), 1);
assert.equal(f.kakao.length, 2);
assert.equal(f.kakao[0].objectType, "feed");
assert.equal(f.kakao[0].content.link.webUrl, "https://site.test/us/test/");
assert.equal(
  f.calls.filter((c) => c.url === "/api/shares")[0].payload.channel,
  "kakao",
);
f = await fixture({ kakaoInitialized: true });
await f.click("kakao");
assert.equal(f.initCalls(), 0);
assert.equal(f.kakao.length, 1);
f = await fixture({ kakaoFail: true });
await f.click("kakao");
assert.equal(f.calls.filter((c) => c.url === "/api/shares").length, 0);
f = await fixture({ fetchFail: true });
await f.click("copy");
assert.match(f.shareStatus.textContent, /복사했습니다/);
assert.equal(f.nodes["[data-share-count]"].textContent, "공유 —");
const attempts = f.calls.filter((c) => c.url === "/api/shares");
assert.equal(attempts.length, 2);
assert.equal(attempts[0].payload.requestId, attempts[1].payload.requestId);
f = await fixture();
f.form.elements.nickname.value = "독자";
f.form.elements.body.value = "댓글";
f.setFailure(true);
await f.form.listeners.submit({ preventDefault() {} });
await f.form.listeners.submit({ preventDefault() {} });
let submissions = f.calls.filter((c) => c.url === "/api/comments");
assert.equal(
  submissions[0].payload.requestId,
  submissions[1].payload.requestId,
);
f.setFailure(false);
await f.form.listeners.submit({ preventDefault() {} });
assert.match(f.nodes["#comment-status"].textContent, /관리자 승인 후 공개/);
console.log(
  "Reader client tests passed: share success/cancel/failure/fallback, canonical URL, Kakao feed, outage-independent sharing, retry dedup, text-only comments and moderation notice.",
);
