(() => {
  const input = document.querySelector("#search-q"),
    form = document.querySelector("#search-form"),
    status = document.querySelector("#search-status"),
    results = document.querySelector("#search-results"),
    retry = document.querySelector("#search-retry");
  const MARKETS = { kr: "한국", us: "미국", sector: "섹터", global: "해외", cn: "중국" };
  let index = null;
  function render() {
    input.value = new URL(location.href).searchParams.get("q") || "";
    if (!index) return;
    const matches = ResearchDiscovery.search(index, input.value);
    results.replaceChildren();
    status.textContent = `${matches.length}개의 글${input.value.trim() ? ` · “${input.value.trim()}”` : ""}`;
    for (const a of matches) {
      const link = document.createElement("a");
      link.className = "row";
      link.href = `/${a.slug}/`;
      const part = (tag, className, text) => {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
      };
      const id = part("div", "row-id"),
        tags = part("span", "row-tags"),
        main = part("div", "row-main"),
        meta = part("div", "row-meta");
      id.append(part("span", "co", a.company));
      if (a.ticker) id.append(part("span", "tk", a.ticker));
      tags.append(part("span", "mk", MARKETS[a.market] || a.market));
      const type = { "portfolio-strategy": "포트폴리오 전략", "earnings-review": "실적 리뷰" }[a.articleType];
      if (type) tags.append(part("span", "type-chip", type));
      for (const sector of a.sectors.slice(0, 1))
        tags.append(part("span", "", sector));
      if (a.archive) tags.append(part("span", "", "기록 글"));
      id.append(tags);
      main.append(part("h3", "", a.headline), part("p", "", a.summary));
      const asOf = part("span"),
        date = part("b", "", `기준일 ${a.asOfDate}`);
      asOf.append(date);
      meta.append(asOf);
      if (a.researchDate !== a.asOfDate)
        meta.append(part("span", "", `자료 업데이트 ${a.researchDate}`));
      meta.append(part("span", "", `${a.readMinutes}분`));
      const image = part("img");
      image.src = a.image;
      image.alt = "";
      image.loading = "lazy";
      link.append(id, main, meta, image);
      results.append(link);
    }
    if (!matches.length) {
      const p = document.createElement("p");
      p.className = "empty";
      p.textContent =
        "검색 결과가 없습니다. 다른 종목명이나 섹터를 입력해 보세요.";
      results.append(p);
    }
  }
  async function load() {
    status.textContent = "검색 색인을 불러오는 중입니다.";
    retry.hidden = true;
    try {
      const response = await fetch("/search-index.json");
      if (!response.ok) throw Error();
      const value = await response.json();
      if (!Array.isArray(value)) throw Error();
      index = value;
      render();
    } catch {
      status.textContent = "검색 색인을 불러오지 못했습니다.";
      retry.hidden = false;
    }
  }
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const url = new URL("/search/", location.origin);
    if (input.value.trim()) url.searchParams.set("q", input.value.trim());
    history.pushState(null, "", url);
    render();
  });
  document.querySelector("#search-reset").addEventListener("click", (event) => {
    event.preventDefault();
    history.pushState(null, "", "/search/");
    render();
    input.focus();
  });
  document.querySelector("#search-back").addEventListener("click", (event) => {
    if (history.length > 1) {
      event.preventDefault();
      history.back();
    }
  });
  window.addEventListener("popstate", render);
  retry.addEventListener("click", load);
  render();
  load();
})();
