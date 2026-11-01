export const DAY = 86400000;
export const kstDay = (t) =>
  new Date(t + 9 * 3600000).toISOString().slice(0, 10);
export const dayStart = (day) => Date.parse(`${day}T00:00:00+09:00`);
export const uuid = (value) =>
  typeof value === "string" &&
  /^[a-f0-9-]{36}$/i.test(value) &&
  /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value);
export function insights(rows, previous, end) {
  const start = kstDay(dayStart(end) - 6 * DAY);
  return rows.map((r) => {
    const prior = previous.find((p) => p.path === r.path)?.views || 0;
    const rules = [];
    if (r.views < 30) rules.push("표본 부족");
    else {
      if (prior >= 30 && r.views >= prior * 1.5) rules.push("유입 증가");
      if (r.completed / r.views < 0.3) rules.push("읽기 개선 후보");
      if (r.clicked / r.views < 0.1) rules.push("이어서 읽기 개선 후보");
      if (r.completed / r.views >= 0.6 && r.clicked / r.views >= 0.2)
        rules.push("추천 검토 후보");
    }
    return { ...r, prior, rules, start, end };
  });
}
export function sanitizeEvent(e, paths, articles, now) {
  if (!e || !uuid(e.id) || !uuid(e.viewId) || !paths.has(e.path))
    throw Error("invalid event");
  if (!["page_view", "engagement", "internal_click"].includes(e.kind))
    throw Error("invalid kind");
  if (e.kind === "page_view" && e.id !== e.viewId) throw Error("invalid view");
  if (e.kind !== "page_view" && !articles.has(e.path))
    throw Error("not an article");
  if (!Number.isSafeInteger(e.at) || e.at > now + 60000 || e.at < now - 2 * DAY)
    throw Error("invalid time");
  if (e.kind === "internal_click" && !articles.has(e.target))
    throw Error("invalid target");
  const num = (v, max) =>
    Number.isFinite(v) ? Math.max(0, Math.min(max, Math.floor(v))) : 0;
  const token = (v) =>
    typeof v === "string" && /^[\p{L}\p{N} _./-]{0,80}$/u.test(v) ? v : "";
  let referrer = "";
  try {
    const u = new URL(e.referrer);
    if (["http:", "https:"].includes(u.protocol))
      referrer = u.hostname.slice(0, 253);
  } catch {}
  return {
    id: e.id,
    viewId: e.viewId,
    kind: e.kind,
    path: e.path,
    at: e.at,
    depth: num(e.depth, 100),
    active: num(e.active, 86400),
    target: e.kind === "internal_click" ? e.target : "",
    referrer,
    source: token(e.source),
    medium: token(e.medium),
    campaign: token(e.campaign),
  };
}
