// Telegram delivery is optional and best effort. Plain text keeps reader input
// from being interpreted as formatting. The token only ever appears in the URL.
const DAY = 86400000;
const clip = (text, length) => {
  const chars = [...text];
  return chars.length > length ? chars.slice(0, length).join("") + "…" : text;
};
export const telegramReady = (env) =>
  Boolean(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID);
const link = (baseUrl, id) => `${baseUrl}/admin/comments/?comment=${id}`;
async function send(env, text) {
  const response = await fetch(
    `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: env.TELEGRAM_CHAT_ID,
        text,
        link_preview_options: { is_disabled: true },
      }),
      signal: AbortSignal.timeout(10000),
    },
  );
  await response.body?.cancel();
  if (!response.ok) throw Error("telegram rejected");
}
export async function notifyComment(env, comment, title, baseUrl, now = Date.now()) {
  if (!telegramReady(env)) return false;
  try {
    await send(
      env,
      `새 댓글 · 승인 대기\n닉네임: ${comment.nickname}\n글: ${title}\n\n${clip(comment.body, 200)}\n\n${link(baseUrl, comment.id)}`,
    );
    await env.DB.prepare("UPDATE comments SET notified_at=? WHERE id=?")
      .bind(now, comment.id)
      .run();
    return true;
  } catch {
    // The hourly retry picks up anything left without notified_at.
    return false;
  }
}
export async function notifyScheduled(env, titles, baseUrl, now = Date.now()) {
  if (!telegramReady(env)) return;
  try {
    // The grace period keeps this from racing a send still in flight.
    const { results } = await env.DB.prepare(
      "SELECT id,path,nickname,body FROM comments WHERE status='pending' AND notified_at IS NULL AND created>=? AND created<? ORDER BY seq LIMIT 10",
    )
      .bind(now - 30 * DAY, now - 300000)
      .all();
    if (results.length) {
      await send(
        env,
        `알림이 누락된 대기 댓글 ${results.length}건\n\n` +
          results
            .map(
              (c) =>
                `${c.nickname} · ${clip(titles.get(c.path) || c.path, 60)}\n${clip(c.body, 120)}\n${link(baseUrl, c.id)}`,
            )
            .join("\n\n"),
      );
      await env.DB.batch(
        results.map((c) =>
          env.DB.prepare("UPDATE comments SET notified_at=? WHERE id=?").bind(now, c.id),
        ),
      );
    }
    // The hourly cron runs at minute 5, so 00:05 UTC is 09:05 KST.
    if (new Date(now).getUTCHours() !== 0) return;
    const expiring = await env.DB.prepare(
      "SELECT COUNT(*) n FROM comments WHERE status='pending' AND created>=? AND created<?",
    )
      .bind(now - 30 * DAY, now - 23 * DAY)
      .first();
    if (expiring.n)
      await send(
        env,
        `대기 댓글 ${expiring.n}건이 7일 안에 만료됩니다.\n${baseUrl}/admin/comments/`,
      );
  } catch {
    // Alerts must never fail the cron that also runs retention cleanup.
  }
}
