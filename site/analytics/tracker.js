/* First-party consent analytics. No analytics identifier or event before opt-in. */
(() => {
  "use strict";
  const CONSENT = "research.stats.consent",
    ID = "research.stats.browser";
  const DAY = 86400000;
  let allowed = false,
    storage = true,
    browser = null,
    manifest = null,
    view = null,
    queue = [],
    controller = null;
  let depth = 0,
    active = 0,
    lastTick = performance.now(),
    lastActivity = performance.now(),
    visible = !document.hidden,
    busy = false;
  let lastInteraction = Date.now(),
    lastSnapshot = "",
    idExpires = 0;
  const get = (k) => {
    try {
      return localStorage.getItem(k);
    } catch {
      storage = false;
      return null;
    }
  };
  const set = (k, v) => {
    try {
      localStorage.setItem(k, v);
      return true;
    } catch {
      storage = false;
      return false;
    }
  };
  const remove = (k) => {
    try {
      localStorage.removeItem(k);
    } catch {
      storage = false;
    }
  };
  function savedConsent() {
    try {
      return JSON.parse(get(CONSENT) || "null");
    } catch {
      return null;
    }
  }
  function tick() {
    const now = performance.now();
    if (allowed && view && visible)
      active +=
        Math.max(0, Math.min(now, lastActivity + 30000) - lastTick) / 1000;
    lastTick = now;
    if (
      allowed &&
      visible &&
      manifest?.articles.some((a) => a.path === location.pathname)
    ) {
      const body = document.querySelector("article .body");
      if (body) {
        const rect = body.getBoundingClientRect();
        depth = Math.max(
          depth,
          Math.min(
            100,
            Math.max(
              0,
              ((innerHeight - rect.top) / Math.max(1, rect.height)) * 100,
            ),
          ),
        );
      }
    }
  }
  function event(kind, extra = {}) {
    return {
      id: crypto.randomUUID(),
      viewId: view.id,
      kind,
      path: location.pathname,
      at: Date.now(),
      ...extra,
    };
  }
  function snapshot() {
    if (view && manifest?.articles.some((a) => a.path === location.pathname)) {
      tick();
      const value = `${Math.floor(depth)}:${Math.floor(active)}`;
      if (value !== lastSnapshot) {
        queue.push(
          event("engagement", {
            depth: Math.floor(depth),
            active: Math.floor(active),
          }),
        );
        lastSnapshot = value;
      }
    }
  }
  async function flush() {
    if (!allowed || !view || busy) return;
    if (browser && Date.now() >= idExpires) {
      stop();
      show();
      return;
    }
    busy = true;
    const batchView = view,
      sent = queue.splice(0, 28);
    controller = new AbortController();
    try {
      const response = await fetch("/api/analytics/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "omit",
        keepalive: true,
        signal: controller.signal,
        body: JSON.stringify({
          consent: true,
          browser,
          activityAt: lastInteraction,
          events: [batchView, ...sent],
        }),
      });
      if (
        !response.ok &&
        response.status >= 500 &&
        allowed &&
        view === batchView
      )
        queue.unshift(...sent);
    } catch {
      if (allowed && view === batchView) queue.unshift(...sent);
    } finally {
      busy = false;
      queue = queue.slice(-28);
    }
  }
  async function start() {
    if (allowed) return;
    allowed = true;
    try {
      manifest =
        manifest ||
        (await (
          await fetch("/analytics-manifest.json", { credentials: "omit" })
        ).json());
      if (!allowed || !manifest.paths.includes(location.pathname)) return;
      if (storage) {
        let stored;
        try {
          stored = JSON.parse(get(ID) || "null");
        } catch {}
        if (!stored || stored.expires <= Date.now()) {
          stored = { id: crypto.randomUUID(), expires: Date.now() + 90 * DAY };
          if (!set(ID, JSON.stringify(stored))) stored = null;
        }
        browser = storage ? stored?.id || null : null;
        idExpires = stored?.expires || 0;
      }
      depth = active = 0;
      lastSnapshot = "";
      lastInteraction = Date.now();
      lastTick = lastActivity = performance.now();
      visible = !document.hidden;
      const url = new URL(location.href);
      let referrer = "";
      try {
        const r = new URL(document.referrer);
        if (r.origin !== url.origin) referrer = r.origin;
      } catch {}
      const id = crypto.randomUUID();
      view = {
        id,
        viewId: id,
        kind: "page_view",
        path: location.pathname,
        at: Date.now(),
        referrer,
        source: url.searchParams.get("utm_source") || "",
        medium: url.searchParams.get("utm_medium") || "",
        campaign: url.searchParams.get("utm_campaign") || "",
      };
      await flush();
    } catch {
      /* Collection never blocks the public page. */
    }
  }
  function stop() {
    allowed = false;
    controller?.abort();
    queue = [];
    view = null;
    browser = null;
    remove(ID);
  }
  const panel = document.createElement("section");
  panel.className = "stats-consent";
  panel.setAttribute("aria-label", "방문 통계 설정");
  panel.innerHTML =
    '<div><strong>방문 통계 설정</strong><p>동의하면 익명 브라우저 식별자와 유입·읽기 기록을 수집합니다. 상세 90일, 식별자 없는 일별 통계 365일 보관. <a href="/privacy/">개인정보 안내</a></p></div><div class="stats-actions"><button type="button" data-choice="allow">통계 허용</button><button type="button" data-choice="deny">거절</button><button type="button" data-close hidden>닫기</button></div>';
  document.body.append(panel);
  function show() {
    panel.hidden = false;
    panel.querySelector("[data-close]").hidden = !savedConsent() && !allowed;
  }
  panel.addEventListener("click", (e) => {
    const choice = e.target.dataset.choice;
    if (choice) {
      set(CONSENT, JSON.stringify({ value: choice, at: Date.now() }));
      if (choice === "allow") start();
      else stop();
      panel.hidden = true;
    }
    if (e.target.hasAttribute("data-close")) panel.hidden = true;
  });
  const button = document.querySelector("[data-stats-settings]");
  button?.addEventListener("click", show);
  const saved = savedConsent();
  if (saved?.value === "allow" && Date.now() - saved.at < 90 * DAY) {
    panel.hidden = true;
    start();
  } else if (saved?.value === "deny") {
    panel.hidden = true;
    remove(ID);
  } else {
    remove(ID);
    show();
  }
  for (const name of ["pointerdown", "keydown", "scroll", "touchstart"])
    addEventListener(
      name,
      () => {
        tick();
        if (allowed && view && Date.now() - lastInteraction >= 1800000) {
          flush();
          const id = crypto.randomUUID();
          view = {
            ...view,
            id,
            viewId: id,
            at: Date.now(),
            referrer: "",
            source: "",
            medium: "",
            campaign: "",
          };
          depth = active = 0;
          lastSnapshot = "";
          queue = [];
        }
        lastInteraction = Date.now();
        lastActivity = performance.now();
      },
      { passive: true },
    );
  document.addEventListener("visibilitychange", () => {
    tick();
    visible = !document.hidden;
    if (!visible) {
      snapshot();
      flush();
    }
  });
  addEventListener("pagehide", () => {
    snapshot();
    flush();
  });
  setInterval(() => {
    if (allowed && performance.now() - lastActivity < 45000) {
      snapshot();
      flush();
    }
  }, 15000);
  document.addEventListener("click", (e) => {
    if (
      !allowed ||
      !view ||
      !manifest?.articles.some((a) => a.path === location.pathname)
    )
      return;
    const a = e.target.closest("a[href]");
    if (!a) return;
    const target = new URL(a.href, location.href);
    if (
      target.origin === location.origin &&
      manifest.articles.some((a) => a.path === target.pathname)
    ) {
      snapshot();
      queue.push(event("internal_click", { target: target.pathname }));
      flush();
    }
  });
  addEventListener("storage", (e) => {
    if (e.key === CONSENT) {
      const s = savedConsent();
      if (s?.value === "allow") start();
      else stop();
    }
  });
})();
