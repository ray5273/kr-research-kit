# Naver SmartEditor Contract

## Browser state

- Reuse the gstack Chromium installed by `kr-naver-browse`.
- Run headed and set `CHROMIUM_PROFILE` to `${NAVER_PUBLISH_PROFILE:-~/.gstack/kr-naver-blog-publish/chromium-profile}`.
- Never write passwords, cookies, approval tokens, or browser profile data to the repository.
- On the first run, let the user complete login, MFA, or CAPTCHA in the visible browser, then run `prepare` again.

## Safety gates

`prepare` must verify the memo SHA-256, generated post SHA-256, every PNG SHA-256, login state, required editor selectors, title, body, uploaded image count, sources, and disclaimer. It then saves a draft, captures a screenshot, and emits a token valid for 30 minutes. Only the token hash is stored.

`publish` must require both the one-time token and `--confirm-public yes`, then recheck all source artifacts and the editor fingerprint before opening the publish layer. Clear the stored token hash after success. Block a manifest whose status is already `published`.

Do not click the public confirmation button after login expiry, CAPTCHA, missing selector, upload failure, content mismatch, changed memo, expired token, or token mismatch.

## Selector maintenance

Selectors are candidate lists in `scripts/publisher.js`. Treat the absence of every candidate as an editor-contract failure. Update candidates and fixture tests together when Naver changes SmartEditor markup. Do not weaken validation to work around a selector change.
