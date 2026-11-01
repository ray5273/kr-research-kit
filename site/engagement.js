(() => {
  const groups = [...document.querySelectorAll(".sharing")];
  if (!groups.length) return;
  const data = groups[0].dataset,
    path = new URL(data.url).pathname;
  async function api(url, options) {
    const r = await fetch(url, options);
    const value = await r.json();
    if (!r.ok) throw Error(value.error || "다시 시도해 주세요.");
    return value;
  }
  const post = (url, value) =>
    api(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(value),
    });
  async function meta() {
    try {
      const value = await api(
        "/api/article-meta?path=" + encodeURIComponent(path),
      );
      document
        .querySelectorAll("[data-share-count]")
        .forEach(
          (e) => (e.textContent = `공유 ${value.shares.toLocaleString()}회`),
        );
      document
        .querySelectorAll("[data-comment-count]")
        .forEach(
          (e) => (e.textContent = `댓글 ${value.comments.toLocaleString()}개`),
        );
    } catch {
      document
        .querySelectorAll("[data-share-count]")
        .forEach((e) => (e.textContent = "공유 —"));
      document
        .querySelectorAll("[data-comment-count]")
        .forEach((e) => (e.textContent = "댓글 —"));
    }
  }
  async function count(channel) {
    const payload = { path, channel, requestId: crypto.randomUUID() };
    // Retry a transient failure once with the same ID. Never block the share UI.
    for (let i = 0; i < 2; i++) {
      try {
        await post("/api/shares", payload);
        await meta();
        return;
      } catch {}
    }
  }
  async function copy() {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(data.url);
      return;
    }
    const previous = document.activeElement,
      field = document.createElement("textarea");
    field.value = data.url;
    field.style.cssText = "position:fixed;left:0;top:0;opacity:0";
    document.body.append(field);
    field.focus();
    field.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } finally {
      field.remove();
      previous?.focus();
    }
    if (!ok) throw Error("링크 복사에 실패했습니다. 주소창에서 복사해 주세요.");
  }
  for (const group of groups) {
    group.addEventListener("click", async (event) => {
      const button = event.target.closest("[data-share]");
      if (!button || button.disabled) return;
      const status = group.querySelector("[role=status]");
      status.textContent = "";
      button.disabled = true;
      try {
        const channel = button.dataset.share;
        if (channel === "copy") {
          await copy();
          void count("copy");
          status.textContent = "링크를 복사했습니다.";
        } else if (channel === "native") {
          if (navigator.share) {
            await navigator.share({
              title: data.title,
              text: data.summary,
              url: data.url,
            });
            void count("native");
            status.textContent = "공유를 완료했습니다.";
          } else {
            await copy();
            void count("copy");
            status.textContent =
              "링크를 복사했습니다. 원하는 곳에 붙여넣어 주세요.";
          }
        } else {
          if (!data.kakaoKey || !window.Kakao?.Share)
            throw Error(
              "카카오톡 공유를 준비하지 못했습니다. 링크 복사를 이용해 주세요.",
            );
          if (!Kakao.isInitialized()) Kakao.init(data.kakaoKey);
          await Kakao.Share.sendDefault({
            objectType: "feed",
            content: {
              title: data.title,
              description: data.summary,
              imageUrl: data.image,
              imageWidth: 1200,
              imageHeight: 630,
              link: { mobileWebUrl: data.url, webUrl: data.url },
            },
            buttons: [
              {
                title: "원문 읽기",
                link: { mobileWebUrl: data.url, webUrl: data.url },
              },
            ],
          });
          void count("kakao");
          status.textContent = "카카오톡 공유를 요청했습니다.";
        }
      } catch (error) {
        status.textContent =
          error.name === "AbortError"
            ? "공유를 취소했습니다."
            : error.message ||
              "공유하지 못했습니다. 링크 복사를 이용해 주세요.";
      } finally {
        button.disabled = false;
      }
    });
  }
  const list = document.querySelector("#comment-list"),
    status = document.querySelector("#comments-status"),
    more = document.querySelector("#comments-more"),
    retry = document.querySelector("#comments-retry");
  let cursor = null,
    loading = false;
  async function load() {
    if (loading) return;
    loading = true;
    more.disabled = true;
    retry.hidden = true;
    status.textContent = "댓글을 불러오는 중입니다.";
    try {
      const value = await api(
        "/api/comments?path=" +
          encodeURIComponent(path) +
          (cursor ? "&cursor=" + cursor : ""),
      );
      for (const c of value.comments) {
        const item = document.createElement("li"),
          name = document.createElement("strong"),
          time = document.createElement("time"),
          body = document.createElement("p");
        name.textContent = c.nickname;
        time.dateTime = new Date(c.created).toISOString();
        time.textContent = new Date(c.created).toLocaleDateString("ko-KR", {
          timeZone: "Asia/Seoul",
        });
        body.textContent = c.body;
        item.append(name, " · ", time, body);
        list.append(item);
      }
      cursor = value.cursor;
      more.hidden = !cursor;
      status.textContent = list.children.length
        ? ""
        : "아직 공개된 댓글이 없습니다.";
    } catch {
      status.textContent = "댓글을 불러오지 못했습니다.";
      retry.hidden = false;
    } finally {
      loading = false;
      more.disabled = false;
    }
  }
  more.addEventListener("click", load);
  retry.addEventListener("click", load);
  const form = document.querySelector("#comment-form"),
    submitStatus = document.querySelector("#comment-status");
  let pending = null;
  form.addEventListener("input", () => {
    pending = null;
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = form.querySelector("button");
    if (button.disabled) return;
    button.disabled = true;
    try {
      if (!pending)
        pending = {
          path,
          requestId: crypto.randomUUID(),
          nickname: form.elements.nickname.value,
          body: form.elements.body.value,
          website: form.elements.website.value,
        };
      await post("/api/comments", pending);
      form.reset();
      pending = null;
      submitStatus.textContent = "등록했습니다. 관리자 승인 후 공개됩니다.";
    } catch (error) {
      submitStatus.textContent =
        error.message || "등록하지 못했습니다. 다시 시도해 주세요.";
    } finally {
      button.disabled = false;
    }
  });
  meta();
  load();
})();
