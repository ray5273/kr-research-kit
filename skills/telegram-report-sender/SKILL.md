---
name: telegram-report-sender
description: Send generated research artifacts to Telegram as an explicit post-processing step, using credentials from the sender skill folder or CLI flags.
---

# Telegram Report Sender

Use this skill only when the user explicitly asks to send a generated report or preview a Telegram send plan.

## Workflow

1. Confirm the report artifact path exists. Supported inputs include Markdown and JSON artifacts from:
   - `kr-market-leaders`
   - `kr-analyst-report-watch`
   - `kr-daily-market-news`
   - `us-daily-market-news`
   - generic JSON or Markdown research artifacts
2. Read Telegram credentials from this sender skill folder's gitignored `.env`, or accept `--token` and `--chat-id` flags:

   ```text
   TELEGRAM_BOT_TOKEN=123456789:replace_with_your_bot_token
   TELEGRAM_CHAT_ID=123456789
   ```

3. Preview first unless the user already approved sending:

   ```bash
   node skills/telegram-report-sender/scripts/send-telegram.js --input <artifact> --dry-run
   ```

4. Remove `--dry-run` only after explicit user approval. The sender posts a short summary and, unless `--summary-only` is used, attaches the matching Markdown file when the input is JSON and a same-basename `.md` exists.

## Options

- `--summary-only`: send only the summary text.
- `--document-only`: send only the attachment.
- `--attach <path>`: attach a specific file instead of the auto-detected artifact.
- `--token <token>` and `--chat-id <id>`: override `.env`.
- `TELEGRAM_API_BASE`: optional Bot API-compatible gateway.

## Safety

- Never auto-send as part of collection, Naver publishing, scheduled report generation, or validation.
- Redact bot tokens in errors and chat output.
- Do not assume the user is working from the source repository. Locate this sender skill folder and run the script from there or by absolute path.
