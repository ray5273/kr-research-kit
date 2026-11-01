-- A global 15-minute login budget, with no IP or browser identifiers.
CREATE TABLE admin_login_attempts (slot INTEGER PRIMARY KEY, attempts INTEGER NOT NULL);
