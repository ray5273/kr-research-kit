(() => {
  const form = document.querySelector("#filters"),
    path = document.querySelector("#path"),
    state = document.querySelector("#state"),
    list = document.querySelector("#comments"),
    status = document.querySelector("#status"),
    more = document.querySelector("#more"),
    retry = document.querySelector("#retry");
  let cursor = null,
    known = false,
    busy = false;
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
  async function load(reset = false) {
    if (busy) return;
    busy = true;
    retry.hidden = true;
    more.disabled = true;
    form.querySelector("button").disabled = true;
    if (reset) {
      cursor = null;
      list.replaceChildren();
    }
    status.textContent = "불러오는 중입니다.";
    try {
      const data = await request(
        "/admin/api/comments?" +
          new URLSearchParams({
            path: path.value,
            status: state.value,
            ...(cursor ? { cursor } : {}),
          }),
      );
      if (!known) {
        for (const p of data.articles) {
          const option = document.createElement("option");
          option.value = p;
          option.textContent = p;
          path.append(option);
        }
        known = true;
      }
      for (const c of data.comments) {
        const row = document.createElement("section");
        row.className = "comment";
        const title = document.createElement("strong"),
          meta = document.createElement("p"),
          body = document.createElement("p");
        title.textContent = c.nickname;
        meta.className = "muted";
        meta.textContent =
          c.path + " · " + new Date(c.created).toLocaleString("ko-KR");
        body.textContent = c.body;
        row.append(title, meta, body);
        for (const action of c.status === "pending"
          ? ["approve", "delete"]
          : ["delete"]) {
          const button = document.createElement("button");
          button.textContent = action === "approve" ? "승인" : "삭제";
          button.addEventListener("click", async () => {
            button.disabled = true;
            try {
              await request(`/admin/api/comments/${c.id}/${action}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: "{}",
              });
              row.remove();
              status.textContent =
                action === "approve"
                  ? "승인하여 공개했습니다."
                  : "삭제했습니다.";
            } catch (e) {
              status.textContent = e.message;
            } finally {
              button.disabled = false;
            }
          });
          row.append(button);
        }
        list.append(row);
      }
      cursor = data.cursor;
      more.hidden = !cursor;
      status.textContent = list.children.length
        ? "댓글을 불러왔습니다."
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
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    load(true);
  });
  more.addEventListener("click", () => load());
  retry.addEventListener("click", () => load());
  load(true);
})();
