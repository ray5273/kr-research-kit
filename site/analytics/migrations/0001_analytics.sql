CREATE TABLE sessions (
 id TEXT PRIMARY KEY, browser TEXT, started INTEGER NOT NULL, last_seen INTEGER NOT NULL,
 returning_sessions INTEGER NOT NULL DEFAULT 0,
 referrer TEXT NOT NULL DEFAULT '', source TEXT NOT NULL DEFAULT '',
 medium TEXT NOT NULL DEFAULT '', campaign TEXT NOT NULL DEFAULT ''
);
CREATE INDEX sessions_browser ON sessions(browser, last_seen);
CREATE INDEX sessions_retention ON sessions(last_seen);
CREATE TABLE events (
 id TEXT PRIMARY KEY, view_id TEXT NOT NULL, session_id TEXT NOT NULL,
 kind TEXT NOT NULL, path TEXT NOT NULL, at INTEGER NOT NULL,
 depth INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 0,
 target TEXT NOT NULL DEFAULT '', referrer TEXT NOT NULL DEFAULT '',
 source TEXT NOT NULL DEFAULT '', medium TEXT NOT NULL DEFAULT '', campaign TEXT NOT NULL DEFAULT ''
);
CREATE INDEX events_time ON events(at);
CREATE INDEX events_view ON events(view_id, kind);
CREATE INDEX events_session ON events(session_id, at);
CREATE TABLE daily (
 day TEXT NOT NULL, dimension TEXT NOT NULL, key TEXT NOT NULL, path TEXT NOT NULL DEFAULT '',
 views INTEGER NOT NULL, sessions INTEGER NOT NULL, returning_sessions INTEGER NOT NULL,
 completed INTEGER NOT NULL, active INTEGER NOT NULL, clicked INTEGER NOT NULL,
 uniques INTEGER NOT NULL, depth INTEGER NOT NULL,
 PRIMARY KEY(day, dimension, key, path)
);
CREATE TABLE health (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE coverage (hour TEXT PRIMARY KEY, completed_at INTEGER NOT NULL);
CREATE VIEW view_metrics AS
 SELECT p.id, p.view_id, p.session_id, p.path, p.at, p.referrer, p.source, p.medium, p.campaign,
 MAX(COALESCE(e.depth,0)) AS depth, MAX(COALESCE(e.active,0)) AS active,
 MAX(CASE WHEN e.kind='internal_click' THEN 1 ELSE 0 END) AS clicked
 FROM events p LEFT JOIN events e ON e.view_id=p.view_id AND e.session_id=p.session_id AND e.path=p.path
 WHERE p.kind='page_view' GROUP BY p.id;
