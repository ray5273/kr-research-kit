CREATE TABLE comments_new (seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, path TEXT NOT NULL, nickname TEXT NOT NULL, body TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','hidden','spam','trash','deleted')), created INTEGER NOT NULL, reply TEXT, replied_at INTEGER, prior_status TEXT CHECK(prior_status IS NULL OR prior_status IN ('pending','approved','hidden','spam')), trashed_at INTEGER, spam_reason TEXT, ip_hash TEXT, notified_at INTEGER);
-- Comments already waiting are marked as notified so the first deploy sends no backlog.
INSERT INTO comments_new(seq,id,path,nickname,body,status,created,notified_at) SELECT seq,id,path,nickname,body,status,created,CASE WHEN status='pending' THEN CAST(strftime('%s','now') AS INTEGER)*1000 END FROM comments;
DROP TABLE comments;
ALTER TABLE comments_new RENAME TO comments;
CREATE INDEX comments_public ON comments(path,status,seq);
CREATE INDEX comments_queue ON comments(status,seq);
CREATE INDEX comments_pending_expiry ON comments(status,created);
CREATE INDEX comments_trash_expiry ON comments(status,trashed_at);
CREATE INDEX comments_author_expiry ON comments(created) WHERE ip_hash IS NOT NULL;
CREATE TABLE comment_blocks (ip_hash TEXT PRIMARY KEY, created INTEGER NOT NULL, expires INTEGER NOT NULL);
CREATE INDEX comment_blocks_expiry ON comment_blocks(expires);
CREATE TABLE comment_banned_words (word TEXT PRIMARY KEY, created INTEGER NOT NULL);
INSERT INTO comment_banned_words(word,created) SELECT value,CAST(strftime('%s','now') AS INTEGER)*1000 FROM json_each('["리딩방","급등주","수익보장","원금보장","무료추천","오픈채팅","카톡방","텔레그램방"]');
