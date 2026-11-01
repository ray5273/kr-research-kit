(() => {
  const $ = (s) => document.querySelector(s),
    esc = (v) =>
      String(v ?? "").replace(
        /[&<>"']/g,
        (c) =>
          ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;",
          })[c],
      );
  const n = (v) => Number(v || 0).toLocaleString("ko-KR"),
    pct = (v, d) => (d ? `${((v / d) * 100).toFixed(1)}%` : "—");
  const time = (v) =>
    v
      ? new Date(Number(v)).toLocaleString("ko-KR", {
          timeZone: "Asia/Seoul",
          hour12: false,
        })
      : "없음";
  let days = 7,
    screen = "overview",
    data = null,
    search = "",
    market = "",
    sort = "views",
    sequence = 0;
  const articles = () => data.articles,
    title = (path) => articles().find((a) => a.path === path)?.title || path;
  const rows = (dim) => data.rows.filter((r) => r.dimension === dim);
  const sum = (list) =>
    list.reduce((a, r) => {
      for (const k of [
        "views",
        "sessions",
        "returning_sessions",
        "completed",
        "active",
        "clicked",
        "depth",
      ])
        a[k] = (a[k] || 0) + r[k];
      return a;
    }, {});
  const metric = (label, value, note = "") =>
    `<div class="metric"><span>${esc(label)}</span><b>${esc(value)}</b><span>${esc(note)}</span></div>`;
  const empty = (message) => `<p class="empty">${esc(message)}</p>`;
  const table = (heads, body) =>
    `<div class="table-wrap"><table><thead><tr>${heads.map((h) => `<th scope="col">${esc(h)}</th>`).join("")}</tr></thead><tbody>${body.join("")}</tbody></table></div>`;
  function chart() {
    const list = data.trend;
    if (!list.length) return empty("집계된 일별 데이터가 없습니다.");
    const max = Math.max(1, ...list.map((r) => r.views)),
      start = Date.parse(data.start),
      step = 900 / Math.max(1, days - 1);
    const bars = list
      .map((r) => {
        const x = 15 + ((Date.parse(r.day) - start) / 86400000) * step,
          h = (r.views / max) * 135;
        return `<rect x="${x}" y="${150 - h}" width="${Math.max(1, Math.min(30, step * 0.6))}" height="${h}" fill="currentColor"><title>${esc(r.day)}${r.day === data.today ? " 잠정치" : ""}: ${n(r.views)}회</title></rect>`;
      })
      .join("");
    return `<svg class="chart" viewBox="0 0 960 170" role="img" aria-label="${esc(data.start)}부터 일별 조회수. 상세 수치는 아래 표에 표시.">${bars}</svg><div class="chart-labels"><span>${data.start}</span><span>${data.today} · 잠정치</span></div><details><summary>일별 수치와 고유 브라우저</summary>${table(
      ["날짜(KST)", "조회", "고유 브라우저(일별)"],
      list.map(
        (r) =>
          `<tr><td>${r.day}${r.day === data.today ? " · 잠정치" : ""}</td><td>${n(r.views)}</td><td>${n(r.uniques)}</td></tr>`,
      ),
    )}</details>`;
  }
  function sourceTables() {
    function grouped(dim) {
      const map = new Map();
      for (const r of rows(dim)) {
        const old = map.get(r.key);
        map.set(r.key, { ...r, ...sum(old ? [old, r] : [r]) });
      }
      return [...map.values()].sort((a, b) => b.views - a.views);
    }
    const block = (heading, dim, label) =>
      `<section class="panel"><h2>${heading}</h2>${
        rows(dim).length
          ? table(
              [
                label,
                "조회",
                "완독 추정률",
                "평균 활성 시간",
                "다음 글 클릭률",
              ],
              grouped(dim).map(
                (r) =>
                  `<tr><td>${esc(
                    dim === "utm"
                      ? JSON.parse(r.key)
                          .map((v) => v || "없음")
                          .join(" / ")
                      : dim === "entry"
                        ? title(r.key)
                        : r.key || "직접·알 수 없음",
                  )}</td><td>${n(r.views)}</td><td>${pct(r.completed, r.views)}</td><td>${r.views ? Math.round(r.active / r.views) : 0}초</td><td>${pct(r.clicked, r.views)}</td></tr>`,
              ),
            )
          : empty("관측된 유입이 없습니다.")
      }</section>`;
    return (
      block("유입 도메인", "referrer", "도메인") +
      block("캠페인", "utm", "source / medium / campaign") +
      block("첫 진입 페이지", "entry", "페이지") +
      `<section class="panel"><h2>실제 글 사이 이동</h2><p class="muted">동일 세션에서 관측된 연속 페이지 조회입니다. 링크 클릭 수와 별도로 집계합니다.</p>${table(
        ["이전 페이지 → 다음 페이지", "실제 조회"],
        rows("transition")
          .filter(
            (r) =>
              articles().some((a) => a.path === r.key) &&
              articles().some((a) => a.path === r.path),
          )
          .map(
            (r) =>
              `<tr><td>${esc(title(r.key))} → ${esc(title(r.path))}</td><td>${n(r.views)}</td></tr>`,
          ),
      )}</section>`
    );
  }
  function articleTable() {
    const list = articles()
      .map((a) => ({
        ...a,
        ...(rows("article").find((r) => r.path === a.path) || {}),
        entries: rows("entry").find((r) => r.path === a.path)?.views || 0,
      }))
      .filter(
        (a) =>
          (!$("#article").value || a.path === $("#article").value) &&
          (!market || a.market === market) &&
          `${a.title} ${a.tags.join(" ")}`
            .toLowerCase()
            .includes(search.toLowerCase()),
      );
    const rank = (r) =>
      sort === "completion"
        ? (r.completed || 0) / (r.views || 1)
        : sort === "reading"
          ? (r.active || 0) / (r.views || 1)
          : sort === "clicks"
            ? (r.clicked || 0) / (r.views || 1)
            : r[sort] || 0;
    list.sort((a, b) => rank(b) - rank(a));
    return list.length
      ? table(
          [
            "글 / 시장",
            "조회",
            "첫 진입",
            "완독 추정률",
            "평균 활성 시간",
            "다음 글 클릭률",
          ],
          list.map(
            (r) =>
              `<tr><td><button data-path="${esc(r.path)}">${esc(r.title)}</button><br><small class="muted">${esc(r.market.toUpperCase())}</small></td><td>${r.views === undefined ? "미확인" : n(r.views)}</td><td>${r.views === undefined ? "—" : n(r.entries)}</td><td>${pct(r.completed || 0, r.views)}</td><td>${r.views ? Math.round(r.active / r.views) + "초" : "—"}</td><td>${pct(r.clicked || 0, r.views)}</td></tr>`,
          ),
        )
      : empty("조건에 맞는 글이 없습니다.");
  }
  function render() {
    if (!data) return;
    const selected = $("#article").value,
      overall = selected ? sum(rows("article")) : sum(rows("overview"));
    if (screen === "overview") {
      $("#content").innerHTML =
        `<div class="metrics">${metric("관측 조회수", data.trend.length ? n(overall.views) : "—")}${metric(selected ? "이 글에서 시작한 세션" : "세션 수", data.trend.length ? n(overall.sessions) : "—")}${metric("재방문 세션 비율", pct(overall.returning_sessions, overall.sessions), "이전 세션 이력 기준")}${metric("완독 추정률", pct(selected ? overall.completed : sum(rows("article").filter((r) => articles().some((a) => a.path === r.path))).completed, selected ? overall.views : sum(rows("article").filter((r) => articles().some((a) => a.path === r.path))).views), "공개 글 조회 기준")}</div><p class="muted">${data.uniqueBrowsers === null ? "일별 고유 수는 아래 일별 표에서 확인" : `고유 브라우저 ${n(data.uniqueBrowsers)}개`} · ${esc(data.uniqueMode)}</p><section class="panel"><h2>${selected ? esc(title(selected)) : "전체 공개 페이지"} · 일별 조회</h2>${chart()}</section>${selected ? `<section class="panel"><h2>읽기 행동</h2><div class="reading"><span>평균 깊이 ${overall.views ? Math.round(overall.depth / overall.views) : "—"}%</span><span>평균 활성 시간 ${overall.views ? Math.round(overall.active / overall.views) : "—"}초</span><span>내부 글 클릭률 ${pct(overall.clicked, overall.views)}</span><a href="${esc(selected)}">글 열기 ↗</a></div></section>${sourceTables()}` : ""}`;
    } else if (screen === "articles") {
      $("#content").innerHTML =
        `<div class="toolbar"><label>검색 <input id="search" placeholder="제목 또는 태그" value="${esc(search)}"></label><label>시장 <select id="market"><option value="">전체</option>${[...new Set(articles().map((a) => a.market))].map((m) => `<option ${m === market ? "selected" : ""} value="${esc(m)}">${esc(m.toUpperCase())}</option>`).join("")}</select></label><label>정렬 <select id="sort">${[
          ["views", "조회"],
          ["entries", "첫 진입"],
          ["completion", "완독률"],
          ["reading", "읽기 시간"],
          ["clicks", "다음 글 클릭률"],
        ]
          .map(
            ([v, l]) =>
              `<option value="${v}" ${v === sort ? "selected" : ""}>${l}</option>`,
          )
          .join(
            "",
          )}</select></label></div><div id="article-table">${articleTable()}</div>`;
      $("#search").addEventListener("input", (e) => {
        search = e.target.value;
        $("#article-table").innerHTML = articleTable();
      });
      $("#market").onchange = (e) => {
        market = e.target.value;
        render();
      };
      $("#sort").onchange = (e) => {
        sort = e.target.value;
        render();
      };
    } else if (screen === "sources") $("#content").innerHTML = sourceTables();
    else {
      const list = data.insights.filter(
        (r) =>
          articles().some((a) => a.path === r.path) &&
          (!selected || r.path === selected),
      );
      const missing = articles().filter(
        (a) =>
          (!selected || a.path === selected) &&
          !list.some((r) => r.path === a.path),
      );
      $("#content").innerHTML =
        '<h2>최근 완료된 7일의 개선 제안</h2><p class="muted">조회 30회 이상에서만 판정합니다. 수치에 근거한 규칙이며 원인을 확정하지 않습니다. 선택한 조회 기간과 별도로 최근 완료된 7일을 사용합니다.</p>' +
        list
          .map(
            (r) =>
              `<article class="insight"><h3><a href="${esc(r.path)}">${esc(title(r.path))} ↗</a></h3><p>${r.rules.length ? r.rules.map((x) => `<span class="tag">${esc(x)}</span>`).join("") : "해당 규칙 없음"}</p><p>${r.start} ~ ${r.end} · 표본 ${n(r.views)}회 · 직전 7일 ${n(r.prior)}회${r.prior ? ` · 조회 증감 ${((r.views / r.prior - 1) * 100).toFixed(1)}%` : ""}<br>완독 ${n(r.completed)} / ${n(r.views)} = ${pct(r.completed, r.views)} · 내부 글 클릭 ${n(r.clicked)} / ${n(r.views)} = ${pct(r.clicked, r.views)}</p></article>`,
          )
          .join("") +
        missing
          .map(
            (a) =>
              `<article class="insight"><h3>${esc(a.title)}</h3><span class="tag">표본 부족</span> 관측 데이터 없음 · <a href="${esc(a.path)}">글 열기</a></article>`,
          )
          .join("") +
        '<p class="muted">유입 증가: 직전도 30회 이상·50% 증가 / 읽기: 완독률 30% 미만 / 이어 읽기: 클릭률 10% 미만 / 추천 검토: 완독률 60% 이상·클릭률 20% 이상</p>';
    }
  }
  async function load() {
    const current = ++sequence;
    $("#content").setAttribute("aria-busy", "true");
    $("#status").textContent = "통계를 불러오는 중입니다.";
    try {
      const response = await fetch(
        `/admin/api/analytics?days=${days}&path=${encodeURIComponent($("#article").value)}`,
        { cache: "no-store" },
      );
      if (!response.ok)
        throw Error(
          [401, 403].includes(response.status)
            ? "관리자 로그인이 필요합니다. /admin/login에서 다시 로그인하세요."
            : "통계 DB 오류 또는 한도 초과입니다. 잠시 후 새로고침하세요.",
        );
      const result = await response.json();
      if (current !== sequence) return;
      data = result;
      const selected = $("#article").value;
      $("#article").innerHTML =
        '<option value="">전체 공개 페이지</option>' +
        articles()
          .map((a) => `<option value="${esc(a.path)}">${esc(a.title)}</option>`)
          .join("");
      $("#article").value = selected;
      const h = data.health;
      $("#status").dataset.error = h.state === "delayed";
      $("#status").textContent =
        `${h.state === "empty" ? "수집 기록 없음 · 동의한 첫 방문부터 통계가 쌓입니다." : h.state === "delayed" ? "집계 지연 · 아래 수치는 마지막 집계 기준입니다." : "시간별 집계"} | 수집 시작 ${time(h.startedAt)} | 마지막 수신 ${time(h.lastCollectedAt)} | 집계 ${time(h.aggregatedAt)} · ${data.start} ~ ${data.today} KST`;
      render();
    } catch (e) {
      if (current !== sequence) return;
      $("#status").dataset.error = "true";
      $("#status").textContent = e.message;
      $("#content").innerHTML = empty(
        "통계를 확인할 수 없습니다. 미수집 기간을 조회수 0으로 표시하지 않습니다.",
      );
    } finally {
      if (current === sequence)
        $("#content").setAttribute("aria-busy", "false");
    }
  }
  $("#periods").addEventListener("click", (e) => {
    if (e.target.dataset.days) {
      days = Number(e.target.dataset.days);
      for (const b of $("#periods").children)
        b.setAttribute("aria-pressed", String(Number(b.dataset.days) === days));
      load();
    }
  });
  document.querySelector("nav").addEventListener("click", (e) => {
    if (e.target.dataset.screen) {
      screen = e.target.dataset.screen;
      for (const b of document.querySelectorAll("nav button"))
        b.removeAttribute("aria-current");
      e.target.setAttribute("aria-current", "page");
      render();
    }
  });
  $("#article").onchange = load;
  $("#refresh").onclick = load;
  $("#content").addEventListener("click", (e) => {
    const path = e.target.dataset.path;
    if (path) {
      $("#article").value = path;
      screen = "overview";
      for (const b of document.querySelectorAll("nav button")) {
        b.removeAttribute("aria-current");
        if (b.dataset.screen === screen) b.setAttribute("aria-current", "page");
      }
      load();
    }
  });
  load();
})();
