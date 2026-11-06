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
  observer,
  commentRows,
  scrollY = 0,
  digest,
  write,
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
    naverImage: "https://site.test/naver/test-0123456789abcdef.jpg",
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
      "#comment-jump",
      "#comments",
      ".stats-consent",
    ].map((s) => [s, new Element()]),
  );
  nodes["#comment-form"] = form;
  if (digest) {
    nodes["#share-digest"] = new Element();
    nodes["#share-digest"].textContent = JSON.stringify(digest);
  }
  const calls = [],
    kakao = [],
    created = [];
  let failed = fetchFail;
  const document = {
    querySelector: (s) => nodes[s],
    querySelectorAll: (s) =>
      s === ".sharing" ? [group] : nodes[s] ? [nodes[s]] : [],
    createElement: () => {
      const e = new Element();
      e.click = () => created.push(e);
      return e;
    },
    body: new Element(),
  };
  const navigator = {
    clipboard: { writeText: copy, ...(write ? { write } : {}) },
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
      blob: async () => new Blob(["jpg"], { type: "image/jpeg" }),
      json: async () =>
        url.startsWith("/api/article-meta")
          ? { shares: 7, comments: 1 }
          : url.startsWith("/api/comments?")
            ? {
                comments: commentRows || [
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
  nodes[".stats-consent"].hidden = true;
  const windowListeners = {};
  const win = {
    Kakao: sdk,
    ...(write
      ? {
          ClipboardItem: function (items) {
            this.items = items;
          },
        }
      : {}),
    scrollY,
    ...(observer
      ? {
          IntersectionObserver: function (fn) {
            observer.fire = fn;
            this.observe = () => {};
          },
          addEventListener: (type, fn) => (windowListeners[type] = fn),
        }
      : {}),
  };
  vm.runInNewContext(code, {
    document,
    navigator,
    crypto,
    URL,
    fetch,
    Kakao: sdk,
    Blob,
    setTimeout,
    window: win,
  });
  await flush();
  return {
    calls,
    created,
    win,
    windowListeners,
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
// Article pages copy the build-time digest: HTML for the Naver editor plus plain text.
{
  const digest = {
    text: "제목\n기준일 2026-06-21\n원문 전체 보기: https://site.test/us/test/",
    html: '<p><strong>제목</strong></p><a href="https://site.test/us/test/">원문</a>',
  };
  let items = null;
  let plain = "";
  f = await fixture({
    digest,
    write: async (value) => {
      items = value;
    },
    copy: async (value) => {
      plain = value;
    },
  });
  await f.click("copy");
  assert.equal(items.length, 1);
  assert.deepEqual(Object.keys(items[0].items).sort(), ["text/html", "text/plain"]);
  assert.equal(await items[0].items["text/html"].text(), digest.html);
  assert.equal(items[0].items["text/html"].type, "text/html");
  assert.equal(await items[0].items["text/plain"].text(), digest.text);
  assert.equal(plain, "", "rich copy does not fall through to writeText");
  assert.match(f.shareStatus.textContent, /요약과 링크를 복사했습니다/);
  assert.equal(
    f.calls.filter((c) => c.url === "/api/shares")[0].payload.channel,
    "copy",
  );
  // No ClipboardItem: the plain digest still goes out through writeText.
  f = await fixture({
    digest,
    copy: async (value) => {
      plain = value;
    },
  });
  await f.click("copy");
  assert.equal(plain, digest.text);
  await f.click("native");
  assert.match(f.shareStatus.textContent, /요약과 링크를 복사했습니다/);
  // A refused rich write falls back to the plain digest.
  plain = "";
  f = await fixture({
    digest,
    write: async () => {
      throw Error("denied");
    },
    copy: async (value) => {
      plain = value;
    },
  });
  await f.click("copy");
  assert.equal(plain, digest.text);
  assert.equal(f.calls.filter((c) => c.url === "/api/shares").length, 1);
  // Both clipboard paths failing is reported and not counted.
  f = await fixture({
    digest,
    write: async () => {
      throw Error("denied");
    },
    copy: async () => {
      throw Error("복사 실패");
    },
  });
  await f.click("copy");
  assert.match(f.shareStatus.textContent, /실패/);
  assert.equal(f.calls.filter((c) => c.url === "/api/shares").length, 0);
  // Pages without a digest keep copying only the URL.
  f = await fixture({
    write: async () => {
      throw Error("must not use rich copy without a digest");
    },
    copy: async (value) => {
      plain = value;
    },
  });
  await f.click("copy");
  assert.equal(plain, "https://site.test/us/test/");
  assert.equal(f.shareStatus.textContent, "링크를 복사했습니다.");
}
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
// Operator replies render as text, under their comment, and only when present.
f = await fixture({
  commentRows: [
    {
      nickname: "독자",
      body: "질문",
      created: Date.now(),
      reply: "<img src=x onerror=alert(1)>",
      replied_at: Date.now(),
    },
    { nickname: "독자2", body: "답글 없음", created: Date.now(), reply: null },
  ],
});
{
  const [withReply, without] = f.nodes["#comment-list"].children,
    reply = withReply.children.at(-1);
  assert.equal(reply.className, "comment-reply");
  assert.equal(reply.children[0].textContent, "KR Research 운영자");
  assert.equal(reply.children.at(-1).textContent, "<img src=x onerror=alert(1)>");
  assert.equal(reply.innerHTML, undefined);
  assert.equal(without.children.at(-1).textContent, "답글 없음");
}
// The jump button needs JS, appears after scrolling, and yields to the comments and consent.
{
  f = await fixture();
  assert.equal(f.nodes["#comment-jump"].hidden, false, "untouched without IntersectionObserver");
  const observer = {};
  f = await fixture({ observer });
  const jump = f.nodes["#comment-jump"];
  assert.equal(jump.textContent, "댓글 1");
  assert.equal(jump.hidden, true, "hidden at the top of the page");
  f.win.scrollY = 900;
  f.windowListeners.scroll();
  assert.equal(jump.hidden, false);
  observer.fire([{ isIntersecting: true, boundingClientRect: { top: 100 } }]);
  assert.equal(jump.hidden, true, "hidden while the comments are on screen");
  observer.fire([{ isIntersecting: false, boundingClientRect: { top: -100 } }]);
  assert.equal(jump.hidden, true, "hidden after passing the comments");
  observer.fire([{ isIntersecting: false, boundingClientRect: { top: 900 } }]);
  assert.equal(jump.hidden, false);
  f.nodes[".stats-consent"].hidden = false;
  f.windowListeners.scroll();
  assert.equal(jump.hidden, true, "never covers the consent banner");
}
{
  const countsCode = fs.readFileSync("site/card-counts.js", "utf8");
  const runCounts = async (fetchImpl) => {
    const known = { dataset: { counts: "/a/" }, hidden: true, textContent: "" },
      zero = { dataset: { counts: "/b/" }, hidden: true, textContent: "" };
    vm.runInNewContext(countsCode, {
      document: { querySelectorAll: () => [known, zero] },
      fetch: fetchImpl,
      Promise,
    });
    await flush();
    return { known, zero };
  };
  const ok = await runCounts(async () => ({
    ok: true,
    json: async () => ({ "/a/": { comments: 1200, shares: 3 } }),
  }));
  assert.equal(ok.known.textContent, `댓글 ${(1200).toLocaleString()} · 공유 3`);
  assert.equal(ok.known.hidden, false);
  assert.equal(ok.zero.textContent, "댓글 0 · 공유 0");
  for (const broken of [
    async () => ({ ok: false }),
    async () => {
      throw Error("offline");
    },
  ]) {
    const down = await runCounts(broken);
    assert.equal(down.known.hidden, true);
    assert.equal(down.known.textContent, "");
  }
}
// "썸네일 저장" downloads the square Naver card without counting a share.
{
  const f = await fixture();
  const before = f.calls.length;
  await f.click("thumbnail");
  assert.deepEqual(f.calls.slice(before).map((c) => c.url), ["https://site.test/naver/test-0123456789abcdef.jpg"]);
  assert.equal(f.created.at(-1).download, "test-0123456789abcdef.jpg");
  assert.match(f.created.at(-1).href, /^blob:/);
  assert.match(f.shareStatus.textContent, /대표 이미지/);
}
console.log(
  "Reader client tests passed: share success/cancel/failure/fallback, rich digest copy with plain/URL fallbacks, thumbnail download, canonical URL, Kakao feed, outage-independent sharing, retry dedup, text-only comments and replies, jump button and moderation notice.",
);
