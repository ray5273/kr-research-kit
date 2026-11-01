(() => {
  const targets = document.querySelectorAll("[data-counts]");
  if (!targets.length) return;
  // Counts are decoration: on any failure the cards simply show no numbers.
  fetch("/api/article-counts")
    .then((r) => (r.ok ? r.json() : Promise.reject()))
    .then((counts) => {
      targets.forEach((e) => {
        const value = counts[e.dataset.counts] || { comments: 0, shares: 0 };
        e.textContent = `댓글 ${value.comments.toLocaleString()} · 공유 ${value.shares.toLocaleString()}`;
        e.hidden = false;
      });
    })
    .catch(() => {});
})();
