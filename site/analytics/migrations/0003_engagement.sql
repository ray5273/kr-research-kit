CREATE TABLE article_shares (path TEXT PRIMARY KEY, total INTEGER NOT NULL DEFAULT 0);
CREATE TABLE share_requests (id TEXT PRIMARY KEY, path TEXT NOT NULL, channel TEXT NOT NULL CHECK(channel IN ('kakao','native','copy')), created INTEGER NOT NULL);
CREATE TRIGGER count_share AFTER INSERT ON share_requests BEGIN
 INSERT INTO article_shares(path,total) VALUES(NEW.path,1) ON CONFLICT(path) DO UPDATE SET total=total+1;
END;
CREATE TABLE comments (seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, path TEXT NOT NULL, nickname TEXT NOT NULL, body TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','deleted')), created INTEGER NOT NULL);
CREATE INDEX comments_public ON comments(path,status,seq);
CREATE INDEX comments_queue ON comments(status,seq);
CREATE TABLE engagement_limits (subject TEXT NOT NULL, kind TEXT NOT NULL, slot INTEGER NOT NULL, attempts INTEGER NOT NULL, expires INTEGER NOT NULL, PRIMARY KEY(subject,kind,slot));
CREATE INDEX engagement_limit_expiry ON engagement_limits(expires);
CREATE INDEX comments_pending_expiry ON comments(status,created);
