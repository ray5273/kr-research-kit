# kr-naver-blog-publish live test notes

Date: 2026-06-21
Updated: 2026-06-22

Scope:

- Source memo: `analysis-example/kr/SOOP/memo.md`
- Generated post: `analysis-example/kr/SOOP/naver-post.md`
- Target: Naver Blog SmartEditor, blog id `workingonit`
- Public publish was not clicked.

What worked:

- The memo-to-post converter generated a mobile-friendly blog draft and manifest.
- The dedicated Chromium profile reused the user's logged-in Naver session after clearing a stale profile lock.
- SmartEditor loaded inside `#mainFrame`.
- The editor accepted a clipboard paste of the generated SOOP text after dismissing an overlay.
- The live draft was saved as a Naver temporary draft; draft count changed from 32 to 33.
- The final live editor check showed:
  - title present
  - sources present
  - investment disclaimer present
  - strong/bold emphasis present
  - section separators present

What did not work reliably:

- `browse click` on SmartEditor title/body/save controls often timed out even when selectors existed.
- Direct `document.execCommand("insertText")` did not insert text into SmartEditor.
- Clipboard insertion must be UTF-8-safe. A base64 payload decoded through `atob()` alone produced mojibake; it needs `TextDecoder`.
- HTML clipboard paste inserted readable structure, but the DOM validation counted separators/strong tags rather than proving exact visual heading size. Manual visual review is still required.
- Chart image upload is unresolved:
  - The file input could be discovered or injected.
  - `browse upload` returned without throwing after selector fixes.
  - SmartEditor still reported zero inserted image nodes.
  - Because image count validation fails, the automated `prepare` contract should not mark the draft as fully prepared.
- The repository is currently under a read-only sandbox in this session, so live fixes to `publisher.js` were not persisted during the browser run.

Implementation follow-ups:

Resolved in `scripts/publisher.js`:

1. Persisted a UTF-8-safe clipboard path that sends both `text/plain` and `text/html`, with base64 payloads decoded through `TextDecoder`.
2. Added SmartEditor-specific focus/selection before paste and DOM-click fallback for timed-out editor/save/publish button clicks.
3. Added deterministic HTML generation for large bold `##` headings, medium `###` headings, and section separators.
4. Added a start-fresh guard so repeated prepare attempts do not stack duplicate title/body content; different existing draft content now blocks prepare.
5. Kept `publish` blocked unless title, body, source, disclaimer, and exact image count all validate.

Remaining live investigation:

1. Chart image upload is still unresolved. If the toolbar-created file input is processed but SmartEditor image nodes are not inserted, `prepare` must fail with an image-count mismatch.
2. Investigate SmartEditor image insertion by watching the real toolbar-created file input, upload events, and any post-upload editor insert pipeline.
