(() => {
  const $ = (s) => document.querySelector(s),
    form = $("#filters"),
    path = $("#path"),
    q = $("#q"),
    sort = $("#sort"),
    list = $("#comments"),
    status = $("#status"),
    more = $("#more"),
    retry = $("#retry"),
    tabs = [...document.querySelectorAll("#tabs button")],
    bulk = $("#bulk"),
    selectAll = $("#select-all"),
    selected = $("#selected"),
    bulkActions = $("#bulk-actions");
  const NAMES = {
    pending: "대기",
    approved: "공개",
    hidden: "숨김",
    spam: "스팸",
    trash: "휴지통",
  };
  const COUNTED = ["pending", "spam"];
  const ACTIONS = {
    pending: { approve: "승인", spam: "스팸", trash: "휴지통" },
    approved: { hide: "숨김", trash: "휴지통" },
    hidden: { approve: "공개", trash: "휴지통" },
    spam: { approve: "승인", trash: "휴지통" },
    trash: { restore: "복원", delete: "영구 삭제" },
  };
  const DONE = {
    approve: "공개했습니다.",
    hide: "숨겼습니다.",
    spam: "스팸으로 옮겼습니다.",
    trash: "휴지통으로 옮겼습니다.",
    restore: "복원했습니다.",
    delete: "영구 삭제했습니다.",
  };
  const focusId = /^[a-f0-9-]{36}$/.test(
    new URLSearchParams(location.search).get("comment") || "",
  )
    ? new URLSearchParams(location.search).get("comment")
    : "";
  let tab = "pending",
    cursor = null,
    titles = null,
    busy = false,
    counts = {};
  const el = (tag, text, className) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  };
  async function request(url, init) {
    const response = await fetch(url, init);
    if (response.status === 401) {
      location.assign("/admin/login");
      throw Error("로그인이 필요합니다.");
    }
    const data = await response.json();
    if (!response.ok) throw Error(data.error);
    return data;
  }
  const post = (url, data = {}) =>
    request(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  function paintTabs() {
    for (const button of tabs) {
      const name = button.dataset.status,
        n = counts[name] || 0;
      button.textContent =
        NAMES[name] + (COUNTED.includes(name) && n ? ` ${n}` : "");
      button.setAttribute("aria-pressed", String(!focusId && name === tab));
    }
    $("#comment-badge").textContent = counts.pending
      ? ` (대기 ${counts.pending})`
      : "";
  }
  const query = () =>
    new URLSearchParams({
      path: path.value,
      status: tab,
      sort: sort.value,
      q: q.value,
      ...(cursor ? { cursor } : {}),
      ...(focusId ? { id: focusId } : {}),
    });
  async function refreshCounts() {
    const data = await request(
      "/admin/api/comments?" +
        new URLSearchParams({ path: path.value, status: tab }),
    );
    counts = data.counts;
    paintTabs();
  }
  function paintBulk() {
    const boxes = [...list.querySelectorAll("input[type=checkbox]")],
      checked = boxes.filter((b) => b.checked);
    bulk.hidden = focusId || !boxes.length;
    selectAll.checked = boxes.length > 0 && checked.length === boxes.length;
    selected.textContent = checked.length ? `${checked.length}건 선택` : "";
    // Stay one row tall until there is something to act on, since this bar is sticky.
    bulkActions.hidden = !checked.length;
    for (const button of bulkActions.children) button.disabled = false;
  }
  function paintBulkActions() {
    bulkActions.replaceChildren(
      ...Object.entries(ACTIONS[tab]).map(([action, label]) => {
        const button = el("button", label);
        button.type = "button";
        button.addEventListener("click", () => runBulk(action, label));
        return button;
      }),
    );
  }
  const permanent = (action, n) =>
    action !== "delete" ||
    confirm(`${n}건을 영구 삭제합니다. 되돌릴 수 없습니다.`);
  async function runBulk(action, label) {
    const rows = [...list.querySelectorAll(".comment")].filter(
      (row) => row.querySelector("input[type=checkbox]").checked,
    );
    if (!rows.length || !permanent(action, rows.length)) return;
    for (const button of bulkActions.children) button.disabled = true;
    let processed = 0,
      skipped = 0;
    try {
      // The API takes 20 at a time, and "select all" can span several pages.
      for (let i = 0; i < rows.length; i += 20) {
        const result = await post("/admin/api/comments/bulk", {
          ids: rows.slice(i, i + 20).map((row) => row.dataset.id),
          action,
        });
        processed += result.processed;
        skipped += result.skipped;
      }
      status.textContent =
        `${label}: ${processed}건 처리` +
        (skipped ? `, ${skipped}건은 처리할 수 없어 건너뜀` : "");
    } catch (e) {
      status.textContent = `${processed}건 처리 후 중단: ${e.message}`;
    }
    const message = status.textContent;
    await load(true);
    status.textContent = message;
  }
  async function act(button, row, url, data, message, keep = false) {
    button.disabled = true;
    try {
      await post(url, data);
      if (keep || focusId) {
        await load(true);
      } else {
        row.remove();
        paintBulk();
        await refreshCounts();
      }
      status.textContent = message;
    } catch (e) {
      status.textContent = e.message;
      button.disabled = false;
    }
  }
  function render(c) {
    const row = el("section", undefined, "comment");
    row.dataset.id = c.id;
    const head = el("div", undefined, "comment-head"),
      check = el("input");
    check.type = "checkbox";
    check.setAttribute("aria-label", `${c.nickname} 댓글 선택`);
    check.addEventListener("change", paintBulk);
    if (!focusId) head.append(check);
    head.append(el("strong", c.nickname));
    if (focusId) head.append(el("span", NAMES[c.status], "muted"));
    row.append(head);
    const meta = el("p", undefined, "muted"),
      title = el("a", titles.get(c.path) || c.path);
    title.href = c.path;
    meta.append(title, " · " + new Date(c.created).toLocaleString("ko-KR"));
    row.append(meta);
    if (c.status === "spam")
      row.append(
        el(
          "p",
          c.spam_reason === "link"
            ? "분류 사유: 링크 포함"
            : c.spam_reason?.startsWith("word:")
              ? `분류 사유: 금칙어 '${c.spam_reason.slice(5)}'`
              : "분류 사유: 운영자 지정",
          "muted",
        ),
      );
    if (c.expires) {
      const left = Math.ceil((c.expires - Date.now()) / 86400000);
      if (c.status === "pending" && left <= 7)
        row.append(el("p", `만료까지 D-${Math.max(left, 0)}`, "warn"));
      else if (c.status === "trash")
        row.append(el("p", `${Math.max(left, 0)}일 후 영구 삭제`, "muted"));
    }
    row.append(el("p", c.body));
    if (c.reply) {
      const reply = el("div", undefined, "operator-reply");
      reply.append(
        el("strong", "운영자 답글"),
        el("p", c.reply),
      );
      row.append(reply);
    }
    if (["pending", "approved", "hidden"].includes(c.status)) {
      const box = el("details"),
        summary = el("summary", c.reply ? "답글 수정" : "답글 작성"),
        area = el("textarea"),
        save = el("button", "답글 저장");
      area.maxLength = 2000;
      area.value = c.reply || "";
      area.setAttribute("aria-label", `${c.nickname} 댓글에 대한 답글`);
      save.type = "button";
      save.addEventListener("click", () =>
        act(
          save,
          row,
          `/admin/api/comments/${c.id}/reply`,
          { reply: area.value },
          area.value.trim()
            ? c.status === "approved"
              ? "답글을 공개했습니다."
              : "답글을 저장했습니다. 댓글이 공개되면 함께 표시됩니다."
            : "답글을 삭제했습니다.",
          true,
        ),
      );
      box.append(summary, area, save);
      row.append(box);
    }
    const actions = el("div", undefined, "actions");
    for (const [action, label] of Object.entries(ACTIONS[c.status])) {
      const button = el("button", label);
      button.type = "button";
      button.addEventListener("click", () => {
        if (permanent(action, 1))
          act(button, row, `/admin/api/comments/${c.id}/${action}`, {}, DONE[action]);
      });
      actions.append(button);
    }
    if (c.blockable) {
      const button = el("button", c.blocked ? "작성자 차단 해제" : "작성자 차단");
      button.type = "button";
      button.addEventListener("click", async () => {
        await act(
          button,
          row,
          `/admin/api/comments/${c.id}/${c.blocked ? "unblock" : "block"}`,
          {},
          c.blocked
            ? "작성자 차단을 해제했습니다."
            : "작성자를 차단했습니다. 90일 후 자동으로 풀립니다.",
          true,
        );
        loadGuard();
      });
      actions.append(button);
    }
    row.append(actions);
    return row;
  }
  async function load(reset = false) {
    if (busy) return;
    busy = true;
    retry.hidden = true;
    more.disabled = true;
    form.querySelector("button").disabled = true;
    if (reset) {
      cursor = null;
      list.replaceChildren();
      paintBulkActions();
    }
    status.textContent = "불러오는 중입니다.";
    try {
      const data = await request("/admin/api/comments?" + query());
      if (!titles) {
        titles = new Map(data.articles.map((a) => [a.path, a.title]));
        for (const a of data.articles) {
          const option = el("option", a.title);
          option.value = a.path;
          path.append(option);
        }
      }
      counts = data.counts;
      paintTabs();
      for (const c of data.comments) list.append(render(c));
      cursor = data.cursor;
      more.hidden = !cursor;
      paintBulk();
      status.textContent = list.children.length
        ? "댓글을 불러왔습니다."
        : focusId
          ? "이 댓글은 이미 삭제되었거나 만료되었습니다."
          : "해당 댓글이 없습니다.";
    } catch (e) {
      status.textContent = e.message || "불러오지 못했습니다.";
      retry.hidden = false;
    } finally {
      busy = false;
      more.disabled = false;
      form.querySelector("button").disabled = false;
    }
  }
  async function loadGuard() {
    try {
      const [blocks, words] = await Promise.all([
        request("/admin/api/comments/blocks"),
        request("/admin/api/comments/words"),
      ]);
      $("#block-count").textContent = blocks.count;
      $("#clear-blocks").disabled = !blocks.count;
      $("#words").replaceChildren(
        ...words.words.map((word) => {
          const button = el("button", word + " ×");
          button.type = "button";
          button.setAttribute("aria-label", `금칙어 ${word} 삭제`);
          button.addEventListener("click", async () => {
            try {
              await post("/admin/api/comments/words/delete", { word });
              status.textContent = `금칙어 '${word}'를 삭제했습니다.`;
              loadGuard();
            } catch (e) {
              status.textContent = e.message;
            }
          });
          return button;
        }),
      );
    } catch (e) {
      $("#block-count").textContent = "—";
    }
  }
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    load(true);
  });
  path.addEventListener("change", () => load(true));
  sort.addEventListener("change", () => load(true));
  for (const button of tabs)
    button.addEventListener("click", () => {
      if (focusId) {
        location.assign("/admin/comments/");
        return;
      }
      tab = button.dataset.status;
      load(true);
    });
  selectAll.addEventListener("change", () => {
    for (const box of list.querySelectorAll("input[type=checkbox]"))
      box.checked = selectAll.checked;
    paintBulk();
  });
  $("#clear-blocks").addEventListener("click", async () => {
    if (!confirm("차단한 작성자를 모두 해제합니다.")) return;
    try {
      await post("/admin/api/comments/blocks/clear");
      status.textContent = "차단을 모두 해제했습니다.";
      await load(true);
      loadGuard();
    } catch (e) {
      status.textContent = e.message;
    }
  });
  $("#word-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const { word } = await post("/admin/api/comments/words", {
        word: $("#word").value,
      });
      $("#word").value = "";
      status.textContent = `금칙어 '${word}'를 추가했습니다.`;
      loadGuard();
    } catch (error) {
      status.textContent = error.message;
    }
  });
  $("#focus").hidden = !focusId;
  form.hidden = Boolean(focusId);
  more.addEventListener("click", () => load());
  retry.addEventListener("click", () => load());
  paintTabs();
  load(true);
  loadGuard();
})();
