(() => {
  const input = document.querySelector("#search-q"),
    form = document.querySelector("#search-form"),
    status = document.querySelector("#search-status"),
    results = document.querySelector("#search-results"),
    retry = document.querySelector("#search-retry");
  let index = null;
  function render() {
    input.value = new URL(location.href).searchParams.get("q") || "";
    if (!index) return;
    const matches = ResearchDiscovery.search(index, input.value);
    results.replaceChildren();
    status.textContent = `${matches.length}개의 글${input.value.trim() ? ` · “${input.value.trim()}”` : ""}`;
    for (const a of matches) {
      const link = document.createElement("a");
      link.className = "row search-result";
      link.href = `/${a.slug}/`;
      const box = document.createElement("div"),
        h = document.createElement("h3"),
        p = document.createElement("p"),
        meta = document.createElement("span");
      h.textContent = a.headline;
      p.textContent = a.summary;
      meta.className = "sub";
      meta.textContent = [a.company, a.ticker, ...a.sectors]
        .filter(Boolean)
        .join(" · ");
      box.append(meta, h, p);
      link.append(box);
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
