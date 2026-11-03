import { DAY, kstDay, dayStart, insights } from "./core.mjs";
const all = async (db, sql, ...params) =>
  (
    await db
      .prepare(sql)
      .bind(...params)
      .all()
  ).results;
export async function aggregate(db, now = Date.now()) {
  const start = kstDay(now - 2 * DAY),
    end = kstDay(now);
  // Rebuild recent days in one transaction. Historical rows remain after raw retention.
  const metrics = `WITH ordered AS (
 SELECT v.*, s.browser, s.returning_sessions,
 ROW_NUMBER() OVER (PARTITION BY v.session_id ORDER BY v.at,v.id) AS entry,
 LAG(v.path) OVER (PARTITION BY v.session_id ORDER BY v.at,v.id) AS previous
 FROM view_metrics v JOIN sessions s ON s.id=v.session_id
 ), recent AS (SELECT *, date(at/1000,'unixepoch','+9 hours') AS day FROM ordered WHERE at>=? AND at<?),
 dimension_names(name) AS (VALUES ('overview'),('article'),('referrer'),('utm'),('entry'),('transition')),
 dimensions AS (
 SELECT recent.*, name AS dimension,
 CASE name WHEN 'overview' THEN '' WHEN 'referrer' THEN referrer WHEN 'utm' THEN json_array(source,medium,campaign) WHEN 'transition' THEN previous ELSE path END AS key,
 CASE name WHEN 'overview' THEN '' ELSE path END AS group_path
 FROM recent CROSS JOIN dimension_names
 WHERE (name!='entry' OR entry=1) AND (name!='transition' OR previous IS NOT NULL)
 ) INSERT INTO daily
 SELECT day, dimension, key, group_path, COUNT(*), SUM(entry=1), SUM(entry=1 AND returning_sessions=1),
 SUM(depth>=90 AND active>=30), SUM(active), SUM(clicked), COUNT(DISTINCT browser), SUM(depth)
 FROM dimensions GROUP BY day,dimension,key,group_path`;
  const statements = [
    db.prepare("DELETE FROM daily WHERE day>=?").bind(start),
    db.prepare(metrics).bind(dayStart(start), dayStart(end) + DAY),
    db
      .prepare(
        "INSERT INTO health VALUES('aggregated_at',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      )
      .bind(String(now)),
    db
      .prepare("INSERT OR REPLACE INTO coverage VALUES(?,?)")
      .bind(new Date(now).toISOString().slice(0, 13), now),
    db.prepare("DELETE FROM events WHERE at<?").bind(now - 90 * DAY),
    db.prepare("DELETE FROM sessions WHERE last_seen<?").bind(now - 90 * DAY),
    db.prepare("DELETE FROM daily WHERE day<?").bind(kstDay(now - 364 * DAY)),
    db
      .prepare("DELETE FROM coverage WHERE completed_at<?")
      .bind(now - 365 * DAY),
  ];
  await db.batch(statements);
}
// Public ranking from consented views: last 7 KST days and all retained days (≤1 year).
// A post needs `min` views to rank, so a handful of visits never produces a leaderboard.
export async function popular(db, articles, now = Date.now(), min = 10, limit = 5) {
  const today = kstDay(now);
  const sql =
    "SELECT path,SUM(views) views FROM daily WHERE dimension='article' AND day>=? AND day<=? GROUP BY path ORDER BY views DESC,path";
  const rank = (rows) =>
    rows
      .filter((row) => articles.has(row.path) && row.views >= min)
      .slice(0, limit)
      .map(({ path }) => ({ path }));
  const [week, all_] = await Promise.all([
    all(db, sql, kstDay(now - 6 * DAY), today),
    all(db, sql, "0000-00-00", today),
  ]);
  return { week: rank(week), all: rank(all_) };
}
export async function report(db, manifest, days, path, now = Date.now()) {
  const today = kstDay(now),
    start = kstDay(now - (days - 1) * DAY);
  const health = Object.fromEntries(
    (await all(db, "SELECT * FROM health")).map((x) => [x.key, x.value]),
  );
  const filter = path ? " AND path=?" : "";
  const args = path ? [start, today, path] : [start, today];
  const rows = await all(
    db,
    `SELECT dimension,key,path,SUM(views) views,SUM(sessions) sessions,SUM(returning_sessions) returning_sessions,
 SUM(completed) completed,SUM(active) active,SUM(clicked) clicked,SUM(depth) depth
 FROM daily WHERE day>=? AND day<=?${filter} GROUP BY dimension,key,path`,
    ...args,
  );
  const trend = await all(
    db,
    `SELECT day, views,sessions,returning_sessions,completed,active,clicked,uniques FROM daily
 WHERE day>=? AND day<=? AND dimension=? AND key=? ORDER BY day`,
    start,
    today,
    path ? "article" : "overview",
    path || "",
  );
  // A missing aggregate is unknown; never manufacture zero rows for missing days.
  const recent = await all(
    db,
    "SELECT path,SUM(views) views,SUM(completed) completed,SUM(clicked) clicked FROM daily WHERE dimension='article' AND day>=? AND day<? GROUP BY path",
    kstDay(now - 7 * DAY),
    today,
  );
  const previous = await all(
    db,
    "SELECT path,SUM(views) views FROM daily WHERE dimension='article' AND day>=? AND day<? GROUP BY path",
    kstDay(now - 14 * DAY),
    kstDay(now - 7 * DAY),
  );
  let uniqueBrowsers = null;
  if (days <= 90)
    uniqueBrowsers = (
      await all(
        db,
        `SELECT COUNT(DISTINCT s.browser) n FROM events v JOIN sessions s ON s.id=v.session_id WHERE v.kind='page_view' AND v.at>=?${path ? " AND v.path=?" : ""}`,
        dayStart(start),
        ...(path ? [path] : []),
      )
    )[0].n;
  const coverage = await all(
    db,
    "SELECT hour FROM coverage WHERE completed_at>=? ORDER BY hour",
    dayStart(start),
  );
  return {
    days,
    start,
    today,
    provisional: today,
    articles: manifest.articles,
    rows,
    trend,
    uniqueBrowsers,
    uniqueMode:
      days <= 90
        ? "기간 중복 제거 · 저장소 사용 브라우저"
        : "일별 고유 수 · 기간 합산 금지",
    insights: insights(recent, previous, kstDay(now - DAY)),
    health: {
      startedAt: health.started_at || null,
      lastCollectedAt: health.last_collected_at || null,
      aggregatedAt: health.aggregated_at || null,
      state: !health.started_at
        ? "empty"
        : !health.aggregated_at ||
            now - Number(health.aggregated_at) > 2 * 3600000
          ? "delayed"
          : "ok",
      coverageHours: coverage.map((x) => x.hour),
    },
  };
}
