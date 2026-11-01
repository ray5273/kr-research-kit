/* Shared by the static builder, browser search, and fixture tests. */
(function (scope) {
  const normalize = (value) =>
    String(value || "")
      .normalize("NFKC")
      .toLocaleLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  const publishedOrder = (a, b) =>
    b.datePublished.localeCompare(a.datePublished) || a.order - b.order;
  function sameStock(a, b) {
    if (a.market !== b.market || a.market === "sector") return false;
    if (a.ticker && b.ticker)
      return normalize(a.ticker) === normalize(b.ticker);
    return Boolean(
      a.company && b.company && normalize(a.company) === normalize(b.company),
    );
  }
  function related(article, articles) {
    const seen = new Set([article.slug]);
    const rank = (a) =>
      sameStock(article, a)
        ? 0
        : (article.sectors || []).some((s) =>
              (a.sectors || []).some((v) => normalize(v) === normalize(s)),
            )
          ? 1
          : 2;
    return articles
      .filter((a) => {
        if (seen.has(a.slug)) return false;
        seen.add(a.slug);
        return true;
      })
      .sort((a, b) => rank(a) - rank(b) || publishedOrder(a, b))
      .slice(0, 4);
  }
  function neighbors(article, articles) {
    const all = [...articles].sort(publishedOrder),
      i = all.findIndex((a) => a.slug === article.slug);
    return { previous: all[i + 1] || null, next: all[i - 1] || null };
  }
  function search(articles, query) {
    const q = normalize(query),
      terms = q.split(" ").filter(Boolean);
    if (!q) return [...articles].sort(publishedOrder);
    return articles
      .map((a) => {
        const title = normalize(a.headline),
          identity = [a.company, a.ticker].map(normalize),
          labels = [...(a.sectors || []), ...(a.tags || [])]
            .map(normalize)
            .join(" "),
          summary = normalize(a.summary);
        const haystack = [title, ...identity, labels, summary].join(" ");
        if (!terms.every((t) => haystack.includes(t))) return null;
        const score = identity.includes(q)
          ? 0
          : terms.every((t) => title.includes(t))
            ? 1
            : terms.every((t) => labels.includes(t))
              ? 2
              : 3;
        return { a, score };
      })
      .filter(Boolean)
      .sort((x, y) => x.score - y.score || publishedOrder(x.a, y.a))
      .map((x) => x.a);
  }
  const api = {
    normalize,
    publishedOrder,
    sameStock,
    related,
    neighbors,
    search,
  };
  if (typeof module === "object" && module.exports) module.exports = api;
  else scope.ResearchDiscovery = api;
})(globalThis);
