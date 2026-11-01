export const COOKIE = "__Host-research_admin";
export const SESSION_SECONDS = 8 * 3600;
export const configured = (env) =>
  typeof env.ADMIN_PASSWORD === "string" &&
  env.ADMIN_PASSWORD.length >= 12 &&
  env.ADMIN_PASSWORD.length <= 256 &&
  typeof env.ANALYTICS_HMAC_SECRET === "string" &&
  env.ANALYTICS_HMAC_SECRET.length >= 32;
const bytes = (s) => new TextEncoder().encode(s);
const hex = (buffer) =>
  Array.from(new Uint8Array(buffer), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
async function key(env) {
  return crypto.subtle.importKey(
    "raw",
    bytes(
      `admin-signing-v1:${env.ANALYTICS_HMAC_SECRET}:${env.ADMIN_PASSWORD}`,
    ),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}
async function signature(payload, env) {
  return hex(await crypto.subtle.sign("HMAC", await key(env), bytes(payload)));
}
export async function issueSession(env, origin, now = Date.now()) {
  const payload = `${Math.floor(now / 1000) + SESSION_SECONDS}.${crypto.randomUUID()}`;
  return `${payload}.${await signature(`admin-v1:${origin}:${payload}`, env)}`;
}
export function sessionCookie(token, maxAge = SESSION_SECONDS) {
  return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}
export async function authorize(request, env, now = Date.now()) {
  if (!configured(env)) return false;
  try {
    const cookies = (request.headers.get("Cookie") || "")
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s.startsWith(`${COOKIE}=`));
    if (cookies.length !== 1) return false;
    const token = cookies[0].slice(COOKIE.length + 1);
    const match = /^(\d{10})\.([a-f0-9-]{36})\.([a-f0-9]{64})$/.exec(token);
    if (!match) return false;
    const expires = Number(match[1]),
      seconds = Math.floor(now / 1000);
    if (expires <= seconds || expires > seconds + SESSION_SECONDS) return false;
    const sig = Uint8Array.from(match[3].match(/../g), (b) => parseInt(b, 16));
    return await crypto.subtle.verify(
      "HMAC",
      await key(env),
      sig,
      bytes(`admin-v1:${new URL(request.url).origin}:${match[1]}.${match[2]}`),
    );
  } catch {
    return false;
  }
}
export async function checkPassword(candidate, env) {
  if (
    !configured(env) ||
    typeof candidate !== "string" ||
    candidate.length > 256
  )
    return false;
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", bytes(candidate)),
    crypto.subtle.digest("SHA-256", bytes(env.ADMIN_PASSWORD)),
  ]);
  const left = new Uint8Array(a),
    right = new Uint8Array(b);
  let difference = 0;
  for (let i = 0; i < left.length; i++) difference |= left[i] ^ right[i];
  return difference === 0;
}
export const sameOrigin = (request) =>
  request.headers.get("Origin") === new URL(request.url).origin &&
  request.headers.get("Sec-Fetch-Site") !== "cross-site";
export async function consumeAttempt(db, now = Date.now()) {
  const slot = Math.floor(now / 900000);
  const results = await db.batch([
    db.prepare("DELETE FROM admin_login_attempts WHERE slot<?").bind(slot - 1),
    db
      .prepare(
        `INSERT INTO admin_login_attempts(slot,attempts) VALUES(?,1)
   ON CONFLICT(slot) DO UPDATE SET attempts=attempts+1 WHERE attempts<20 RETURNING attempts`,
      )
      .bind(slot),
  ]);
  return results[1].results.length > 0;
}
