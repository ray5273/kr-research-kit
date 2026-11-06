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
  const jump = document.querySelector("#comment-jump");
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
      if (jump) jump.textContent = `댓글 ${value.comments.toLocaleString()}`;
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
  // Article pages carry a build-time digest (answer + key table + link) so a
  // paste into the Naver blog editor keeps formatting; other pages copy the URL.
  let digest = null;
  try {
    digest = JSON.parse(document.querySelector("#share-digest")?.textContent || "null");
  } catch {}
  const copied = digest
    ? "요약과 링크를 복사했습니다. 네이버 블로그에 붙여넣어 보세요."
    : "링크를 복사했습니다.";
  async function copy() {
    const text = digest?.text || data.url;
    if (digest && navigator.clipboard?.write && window.ClipboardItem) {
      const blob = (value, type) => new Blob([value], { type });
      try {
        await navigator.clipboard.write([
          new window.ClipboardItem({
            "text/html": blob(digest.html, "text/html"),
            "text/plain": blob(digest.text, "text/plain"),
          }),
        ]);
        return;
      } catch (error) {
        // Some browsers refuse text/html; the plain digest still works.
        if (!navigator.clipboard.writeText) throw error;
      }
    }
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
    const previous = document.activeElement,
      field = document.createElement("textarea");
    field.value = text;
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
    if (!ok) throw Error("복사에 실패했습니다. 주소창에서 링크를 복사해 주세요.");
  }
  // Same-origin fetch + blob link: a plain <a download> to the absolute URL is
  // ignored when the page is served from another host (preview, custom domain).
  async function saveThumbnail() {
    const r = await fetch(data.naverImage);
    if (!r.ok) throw Error("썸네일을 불러오지 못했습니다. 다시 시도해 주세요.");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(await r.blob());
    link.download = new URL(data.naverImage).pathname.split("/").pop();
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
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
        if (channel === "thumbnail") {
          await saveThumbnail();
          status.textContent =
            "썸네일을 저장했습니다. 블로그 에디터에 올리고 대표 이미지로 지정해 주세요.";
        } else if (channel === "copy") {
          await copy();
          void count("copy");
          status.textContent = copied;
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
            status.textContent = digest
              ? copied
              : "링크를 복사했습니다. 원하는 곳에 붙여넣어 주세요.";
          }
        } else {
          if (!data.kakaoKey || !window.Kakao?.init)
            throw Error(
              "카카오톡 공유를 준비하지 못했습니다. 요약+링크 복사를 이용해 주세요.",
            );
          // SDK 2.x exposes Share only after init().
          if (!Kakao.isInitialized()) Kakao.init(data.kakaoKey);
          if (!Kakao.Share?.sendDefault)
            throw Error(
              "카카오톡 공유 기능을 불러오지 못했습니다. 다시 시도해 주세요.",
            );
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
              "공유하지 못했습니다. 요약+링크 복사를 이용해 주세요.";
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
        if (c.reply) {
          const reply = document.createElement("div"),
            badge = document.createElement("strong"),
            when = document.createElement("time"),
            text = document.createElement("p");
          reply.className = "comment-reply";
          badge.textContent = "KR Research 운영자";
          when.dateTime = new Date(c.replied_at).toISOString();
          when.textContent = new Date(c.replied_at).toLocaleDateString("ko-KR", {
            timeZone: "Asia/Seoul",
          });
          text.textContent = c.reply;
          reply.append(badge, " · ", when, text);
          item.append(reply);
        }
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
  // Without these APIs the button stays hidden and the byline link still works.
  if (jump && window.IntersectionObserver) {
    const section = document.querySelector("#comments");
    let reached = false;
    const update = () => {
      // The tracker adds the consent banner after this script runs.
      const consent = document.querySelector(".stats-consent");
      jump.hidden =
        reached || window.scrollY < 400 || Boolean(consent && !consent.hidden);
    };
    new window.IntersectionObserver(([entry]) => {
      reached = entry.isIntersecting || entry.boundingClientRect.top < 0;
      update();
    }).observe(section);
    window.addEventListener("scroll", update, { passive: true });
    update();
  }
  meta();
  load();
})();
