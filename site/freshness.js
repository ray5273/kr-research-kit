(() => {
  const items = document.querySelectorAll("[data-asof]");
  if (!items.length) return;
  // Korean calendar day, so badges flip at KST midnight wherever the reader is.
  const today = Date.parse(new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10));
  const recent = (day) => day && today - Date.parse(day) <= 7 * 864e5;
  items.forEach((item) => {
    const { asof, research } = item.dataset;
    const slot = item.querySelector(".row-tags, .chips");
    if (!slot) return;
    const badge = document.createElement("span");
    if (recent(asof)) {
      badge.className = "fresh new";
      badge.textContent = "NEW";
    } else if (research !== asof && recent(research)) {
      badge.className = "fresh upd";
      badge.textContent = `업데이트 ${research.slice(5).replace("-", "/")}`;
    } else return;
    slot.prepend(badge);
  });
})();
