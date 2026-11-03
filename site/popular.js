(() => {
  const box = document.getElementById("hot");
  const items = document.querySelectorAll("[data-asof]");
  if (!box && !items.length) return;
  const MIN = 3;
  // Rankings are decoration: on any failure the box stays hidden and rows get no rank badge.
  fetch("/api/popular")
    .then((r) => (r.ok ? r.json() : Promise.reject()))
    .then(({ week = [], all = [] }) => {
      if (week.length >= MIN)
        week.slice(0, 3).forEach(({ path }, i) =>
          items.forEach((item) => {
            if (item.getAttribute("href") !== path) return;
            const badge = document.createElement("span");
            badge.className = "fresh hot-rank";
            badge.textContent = `주간 ${i + 1}위`;
            item.querySelector(".row-tags, .chips")?.prepend(badge);
          }),
        );
      if (!box) return;
      const lists = { week, all };
      const meta = JSON.parse(document.getElementById("hot-data").textContent);
      const ol = box.querySelector(".hot-list");
      const buttons = box.querySelectorAll("[data-hot]");
      const show = (key) => {
        ol.replaceChildren(
          ...lists[key]
            .filter(({ path }) => meta[path])
            .map(({ path }, i) => {
              const li = document.createElement("li"),
                a = document.createElement("a");
              a.href = path;
              for (const [cls, text] of [["rank", i + 1], ["co", meta[path].c], ["hl", meta[path].h]]) {
                const span = document.createElement("span");
                span.className = cls;
                span.textContent = text;
                a.append(span);
              }
              li.append(a);
              return li;
            }),
        );
        buttons.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.hot === key)));
      };
      buttons.forEach((b) => {
        b.disabled = lists[b.dataset.hot].length < MIN;
        b.addEventListener("click", () => show(b.dataset.hot));
      });
      const first = week.length >= MIN ? "week" : all.length >= MIN ? "all" : null;
      if (!first) return;
      show(first);
      box.hidden = false;
    })
    .catch(() => {});
})();
