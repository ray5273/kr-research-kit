const assert = require("node:assert/strict");
const { related, neighbors, search, sameStock } = require("./discovery");
const a = (slug, extra = {}) => ({
  slug,
  headline: "테스트",
  company: slug,
  ticker: "",
  market: "kr",
  sectors: [],
  tags: [],
  summary: "공개 요약",
  datePublished: "2026-11-01",
  order: 0,
  ...extra,
});
const current = a("current", {
  ticker: "P",
  market: "us",
  company: "Everpure",
  sectors: ["스토리지"],
});
const otherMarket = a("other-market", { ticker: "P", market: "kr", order: 0 });
const sector = a("sector", {
  market: "sector",
  sectors: ["스토리지"],
  order: 4,
});
const stock = a("stock", {
  ticker: "p",
  market: "us",
  order: 8,
  datePublished: "2025-01-01",
});
const fallback = a("fallback", { order: 2 });
assert.equal(sameStock(current, otherMarket), false);
assert.equal(
  sameStock(current, a("name", { market: "us", company: "EVERPURE" })),
  true,
);
assert.equal(
  sameStock(
    current,
    a("different-ticker", { market: "us", company: "Everpure", ticker: "XYZ" }),
  ),
  false,
);
assert.deepEqual(
  related(current, [fallback, current, otherMarket, sector, stock, stock]).map(
    (x) => x.slug,
  ),
  ["stock", "sector", "other-market", "fallback"],
);
assert.deepEqual(related(current, [current]), []);
const articles = [
  a("a", { order: 0 }),
  a("b", { order: 1 }),
  a("c", { order: 2, datePublished: "2026-10-30" }),
];
assert.equal(neighbors(articles[0], articles).next, null);
assert.equal(neighbors(articles[0], articles).previous.slug, "b");
assert.equal(neighbors(articles[2], articles).previous, null);
articles[2].dateModified = "2030-01-01";
assert.equal(neighbors(articles[1], articles).previous.slug, "c");
const index = [
  a("summary", { summary: "NAVER 클라우드", order: 0 }),
  a("tags", { tags: ["NAVER", "클라우드"], order: 1 }),
  a("title", { headline: "NAVER 클라우드", order: 2 }),
  a("exact", {
    company: "NAVER",
    ticker: "035420",
    sectors: ["클라우드"],
    order: 3,
  }),
  a("korean", {
    headline: "네이버, AI 팩토리",
    sectors: ["인터넷 플랫폼"],
    order: 4,
  }),
];
assert.deepEqual(
  search(index, "naver").map((a) => a.slug),
  ["exact", "title", "tags", "summary"],
);
assert.equal(search(index, "０３５４２０")[0].slug, "exact");
assert.equal(search(index, "네이버".normalize("NFD"))[0].slug, "korean");
assert.equal(search(index, "네이버 팩토리")[0].slug, "korean");
assert.equal(search(index, "네이버 없는말").length, 0);
assert.deepEqual(
  search(index, "  ").map((a) => a.slug),
  index.map((a) => a.slug),
);
assert.deepEqual(
  search([a("private", { body: "secret query" })], "secret"),
  [],
);
console.log(
  "Discovery tests passed: stock/market/sector priority, dedup, publication neighbors, Unicode, AND, ranking, no body search.",
);
