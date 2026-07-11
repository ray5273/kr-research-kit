# Naver SmartEditor Contract

## Browser state

- Reuse the gstack Chromium installed by `kr-naver-browse`.
- Run headed and set `CHROMIUM_PROFILE` to `${NAVER_PUBLISH_PROFILE:-~/.gstack/kr-naver-blog-publish/chromium-profile}`.
- Set `BROWSE_STATE_FILE` to `${NAVER_PUBLISH_STATE_FILE:-~/.gstack/kr-naver-blog-publish/browse.json}` and serialize publisher commands with the adjacent publisher lock. Do not reuse a repo-local gstack state file for this profile.
- If the browser server has no page, create one blank tab before selecting the main frame or navigating.
- Before browser startup, detect gstack daemons that reference the same profile through a different state file. Block normal publishing until they are gone. The guarded `cleanup-browser --confirm-stale-profile yes` action may stop only parentless legacy daemons after the operator confirms no other publishing task is active.
- If gstack still cannot start after its retries, tell the operator to verify that no other Naver publisher is active, then run `publisher.js cleanup-browser --confirm-stale-profile yes --force-dedicated-session yes`. This explicitly closes the stale dedicated session and any open draft tabs; it must never run automatically or while another task owns the profile.
- Never write passwords, cookies, approval tokens, or browser profile data to the repository.
- On the first run, let the user complete login, MFA, or CAPTCHA in the visible browser, then run `prepare` again.

## Safety gates

`prepare` must verify the memo SHA-256, generated post SHA-256, every PNG SHA-256, login state, required editor selectors, title, body, uploaded image count, sources, and disclaimer. It then saves a draft, captures a screenshot, and emits a token valid for 30 minutes. Only the token hash is stored.

`publish` must require both the one-time token and `--confirm-public yes`, then recheck all source artifacts and the editor fingerprint before opening the publish layer. Clear the stored token hash after success. Block a manifest whose status is already `published`.

For immediate publishing, the final public confirmation is a one-shot DOM click followed by URL verification for up to 120 seconds. For scheduled daily-market publication, first select reservation mode, the manifest’s `Asia/Seoul` date/time (default next weekday 08:00), and public visibility; read those values back before the one-shot reservation confirmation. A successful reservation is recorded as `scheduled` and must not be clicked again. A click whose outcome cannot be verified becomes `publication-unverified`.

Reconciliation is the only recovery path from `publishing` or `publication-unverified`. A supplied public URL must be opened read-only and must contain the manifest title, basis date, Sources section, and investment disclaimer. A reset to `converted` requires both `--not-published yes` and `--confirm-no-public-post yes`; it is a human assertion made only after checking the public blog.

Do not click the public confirmation button after login expiry, CAPTCHA, missing selector, upload failure, content mismatch, changed memo, expired token, or token mismatch.

## Selector maintenance

Selectors are candidate lists in `scripts/publisher.js`. Treat the absence of every candidate as an editor-contract failure. Update candidates and fixture tests together when Naver changes SmartEditor markup. Do not weaken validation to work around a selector change.
