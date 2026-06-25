---
name: kr-naver-blog-publish
description: Convert an `analysis-example/kr/{company}/memo.md` file into a complete personal-investment-research Naver Blog post, prepare it in Naver SmartEditor with charts, tags, draft saving, validation, and a preview screenshot, then publish only after explicit user approval. Use after `kr-stock-analysis` when the user asks to post or upload a Korean stock analysis to Naver Blog, including requests such as “SOOP 분석하고 네이버에 올려줘.”
---

# Korean Naver Blog Publish

Convert an existing Korean stock memo into a blog-ready artifact and drive Naver SmartEditor through a two-step safety gate. Never combine preparation and public publishing into one unattended action.

## Workflow

1. Locate the source memo at `analysis-example/kr/<company>/memo.md`.
   If it does not exist or is stale, run the Korean stock-analysis chain first and write or refresh the memo under that path.
2. Read [references/transformation-rules.md](references/transformation-rules.md).
3. Convert the memo:

   ```bash
   node skills/kr-naver-blog-publish/scripts/memo-to-post.js \
     --memo analysis-example/kr/<company>/memo.md
   ```

   This writes `naver-post.md` and `naver-publish.json` beside the memo. Review the generated post and manifest. Rerun conversion after editing the source memo.
4. Read [references/editor-contract.md](references/editor-contract.md), then prepare the draft:

   ```bash
   node skills/kr-naver-blog-publish/scripts/publisher.js prepare \
     --manifest analysis-example/kr/<company>/naver-publish.json
   ```

5. If login, MFA, or CAPTCHA is required, stop. Ask the user to complete it in the visible dedicated browser profile, then rerun `prepare`. Do not accept credentials in chat or save them in the repository.
6. Show the generated preview screenshot and summarize the title, tags, image count, and validation result. Ask for explicit approval to publish. Do not proceed in the same turn without that approval.
7. After approval, use the latest unexpired token returned by `prepare`:

   ```bash
   node skills/kr-naver-blog-publish/scripts/publisher.js publish \
     --manifest analysis-example/kr/<company>/naver-publish.json \
     --token '<one-time-token>' \
     --confirm-public yes
   ```

8. Report the public URL and publication timestamp. Open the published URL and recheck title, body, images, sources, and disclaimer when browser access is available.

## Output Contract

- Keep `naver-post.md`, `naver-publish.json`, and `naver-preview.png` under `analysis-example/kr/<company>/`.
- Preserve core figures, reasoning, contrary views, valuation, catalysts, risks, source URLs, and chart order.
- Keep the current Naver category when the user did not specify one.
- Treat the manifest as the authoritative state record: `converted` → `prepared` → `published`.
- Never reuse a published manifest or a token from an older preparation.
- Never publish after any hash, selector, image-count, title, body, source, disclaimer, login, CAPTCHA, or token check fails.

## Validation

Run before considering changes complete:

```bash
node skills/kr-naver-blog-publish/scripts/test-memo-to-post.js
node skills/kr-naver-blog-publish/scripts/test-publisher.js
node --check skills/kr-naver-blog-publish/scripts/memo-to-post.js
node --check skills/kr-naver-blog-publish/scripts/publisher.js
```

Use `--fixture <fixture.json>` only for deterministic tests. Never use fixture mode for a real publication.
