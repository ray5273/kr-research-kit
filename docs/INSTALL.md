# Installation Guide

`kr-research-kit` (a.k.a. KrResearchKit) installs into either Codex (`$CODEX_HOME/skills/`, default `~/.codex/skills/`) or Claude Code (`$CLAUDE_HOME/skills/`, default `~/.claude/skills/`).

## 1. Plugin install (recommended, Claude Code)

This repo ships a self-hosted plugin marketplace via `.claude-plugin/marketplace.json`. In Claude Code:

```text
/plugin marketplace add ray5273/kr-research-kit
/plugin install kr-research-kit@kr-research-kit-marketplace
```

Submission to the Anthropic community marketplace (`@claude-community`) is in review. Once approved, the same plugin will be discoverable from the official catalog without the `marketplace add` step. See [MARKETPLACE.md](MARKETPLACE.md) for the full submission tracker.

## 2. Codex — script install

Install target: `$CODEX_HOME/skills/<skill-name>` (default `~/.codex/skills/`).

Paste this into Codex (it does the rest):

> Install the Codex skills from `https://github.com/ray5273/kr-research-kit`. Use the local repo path `~/.codex/src/kr-research-kit`. If `~/.codex/src/kr-research-kit/.git` does not exist, create `~/.codex/src` and clone the repository there. If the repo already exists, update it with `git -C ~/.codex/src/kr-research-kit pull --ff-only`. Then run `cd ~/.codex/src/kr-research-kit && bash ./scripts/install-all-skills.sh`. If this is macOS and the Naver stack needs the Codex-specific fallback path, run `cd ~/.codex/src/kr-research-kit && bash ./scripts/install-codex-mac-naver.sh` instead. After install, confirm the skills were copied under `${CODEX_HOME:-~/.codex}/skills/` and continue using the installed skills.

Or run it directly:

```bash
mkdir -p ~/.codex/src
if [ -d ~/.codex/src/kr-research-kit/.git ]; then
  git -C ~/.codex/src/kr-research-kit pull --ff-only
else
  git clone --single-branch --depth 1 https://github.com/ray5273/kr-research-kit ~/.codex/src/kr-research-kit
fi
cd ~/.codex/src/kr-research-kit
bash ./scripts/install-all-skills.sh
```

macOS Naver-only recovery path:

```bash
cd ~/.codex/src/kr-research-kit
bash ./scripts/install-codex-mac-naver.sh
```

Custom target:

```bash
CODEX_HOME=/tmp/codex-home bash ./scripts/install-all-skills.sh
```

Single-skill install:

```bash
bash ./scripts/install-skill.sh kr-stock-analysis
```

## 3. Claude Code — script install

Install target: `$CLAUDE_HOME/skills/<skill-name>` (default `~/.claude/skills/`).

Paste this into Claude Code:

> Install the Claude Code skills from `https://github.com/ray5273/kr-research-kit`. Use the local repo path `~/.claude/src/kr-research-kit`. If `~/.claude/src/kr-research-kit/.git` does not exist, create `~/.claude/src` and clone the repository there. If the repo already exists, update it with `git -C ~/.claude/src/kr-research-kit pull --ff-only`. Then run `cd ~/.claude/src/kr-research-kit && bash ./scripts/install-all-claude-skills.sh`. After install, confirm the skills were copied under `${CLAUDE_HOME:-~/.claude}/skills/` and continue using the installed skills.

Or run it directly:

```bash
mkdir -p ~/.claude/src
if [ -d ~/.claude/src/kr-research-kit/.git ]; then
  git -C ~/.claude/src/kr-research-kit pull --ff-only
else
  git clone --single-branch --depth 1 https://github.com/ray5273/kr-research-kit ~/.claude/src/kr-research-kit
fi
cd ~/.claude/src/kr-research-kit
bash ./scripts/install-all-claude-skills.sh
```

Custom target:

```bash
CLAUDE_HOME=/tmp/claude-home bash ./scripts/install-all-claude-skills.sh
```

Single-skill install:

```bash
bash ./scripts/install-claude-skill.sh kr-stock-analysis
```

## 4. SEC EDGAR User-Agent

`us-sec-analysis` uses official SEC EDGAR JSON APIs and archive documents. SEC does not require an API key for `data.sec.gov`, but automated requests must declare a `User-Agent` with an app/company name and contact email and stay within fair-access request limits.

Recommended:

```bash
export SEC_USER_AGENT="KrResearchKit your-email@example.com"
```

Manual one-off run:

```bash
node skills/us-sec-analysis/scripts/fetch-sec-edgar.js --ticker AAPL --output analysis-example/us/Apple --user-agent "KrResearchKit your-email@example.com"
```

Validation can run offline from fixtures:

```bash
node skills/us-sec-analysis/scripts/fetch-sec-edgar.js --ticker AAPL --output .tmp/sec-test --fixture-dir examples/us-sec-analysis --user-agent "KrResearchKit validation@example.com"
```

## 5. OpenDART API key

Most of the `kr-stock-dart-analysis` workflows expect an OpenDART key.

1. Register at [opendart.fss.or.kr](https://opendart.fss.or.kr/) (free, instant).
2. Drop the key into a gitignored `.env` at the repo root:

```text
OPENDART_API_KEY=YOUR_KEY_HERE
```

Without the key, `kr-stock-dart-analysis` falls back to the Chrome extension flow (see § 5).

## 6. Claude.ai DART browser workflow (no API key)

When Codex / Claude Code cannot drive the DART viewer directly, use the bundled Chrome extension under [`integrations/claude-dart-extension/`](../integrations/claude-dart-extension/README.md).

1. Open `https://dart.fss.or.kr/dsaf001/main.do*`.
2. Wait for the extension to auto-extract the page.
3. Click `Save Export` once the popup shows `Export ready`.
4. Normalize the saved file:

```bash
node skills/kr-stock-dart-analysis/scripts/normalize-browser-dart-export.js --input dart-browser-export.json --output dart-text.txt
node skills/kr-stock-dart-analysis/scripts/extract-dart-sections.js --input dart-text.txt --output sections.json
node skills/kr-stock-dart-analysis/scripts/verify-dart-coverage.js --input sections.json --output coverage.json
```

Reference files:

- [Claude DART Extractor README](../integrations/claude-dart-extension/README.md)
- [Sample browser export JSON](../examples/kr-stock-dart-analysis/dart-browser-export-sample.json)

## 7. OpenDART API workflow (preferred over the extension)

When `OPENDART_API_KEY` is set, `fetch-opendart.js` emits the same `dart-browser-export.json` schema so the rest of the pipeline (`normalize → extract → verify → build-reference`) runs unchanged.

```bash
export OPENDART_API_KEY=<your_key>
node skills/kr-stock-dart-analysis/scripts/fetch-opendart.js --ticker 267250 --year 2025 --report-code 11011 --output analysis-example/kr/HD현대/
node skills/kr-stock-dart-analysis/scripts/normalize-browser-dart-export.js --input analysis-example/kr/HD현대/dart-browser-export.json --output analysis-example/kr/HD현대/dart-text.txt
node skills/kr-stock-dart-analysis/scripts/extract-dart-sections.js --input analysis-example/kr/HD현대/dart-text.txt --output analysis-example/kr/HD현대/dart-sections.json
node skills/kr-stock-dart-analysis/scripts/verify-dart-coverage.js --input analysis-example/kr/HD현대/dart-sections.json --output analysis-example/kr/HD현대/dart-coverage.json
node skills/kr-stock-dart-analysis/scripts/build-dart-reference.js --sections analysis-example/kr/HD현대/dart-sections.json --coverage analysis-example/kr/HD현대/dart-coverage.json --output analysis-example/kr/HD현대/dart-reference.md --company "HD현대" --ticker 267250 --filing-title "사업보고서 (2025.12)" --filing-date 2026-03-20 --as-of 2026-05-10
```

`--report-code` is `11011` (사업보고서), `11012` (반기보고서), `11013` (분기보고서 Q1), `11014` (분기보고서 Q3). Cache lives in `.tmp/opendart-cache/` (gitignored). The script never logs the API key.

## 8. PDF extraction (analyst reports + DART)

Both `kr-stock-dart-analysis` and `kr-analyst-report-fetch` call `skills/kr-stock-dart-analysis/scripts/extract-pdf-text.py` via `child_process`, which requires:

```bash
python3 -m pip install pypdf
```

## 9. Korean chart fonts

PNG charts auto-discover a Korean font:

- macOS — AppleSDGothicNeo by default
- Linux — Noto CJK / Nanum via standard paths or `fc-match :lang=ko`
- Windows — Malgun / Nanum / Noto KR via `C:\Windows\Fonts` and `%LOCALAPPDATA%\Microsoft\Windows\Fonts`

Mac/Linux also need Pillow:

```bash
python3 -m pip install pillow
```

When no Korean font is found (or Pillow is missing), charts fall back to a 47-jamo bitmap with incomplete Hangul coverage. Recommended:

- Linux: `apt install fonts-noto-cjk` or `dnf install google-noto-cjk-fonts`
- English-locale Windows: install Noto Sans KR or Malgun Gothic

Override anywhere with `KR_STOCK_CHART_FONT=/path/to/font.ttf`.

## 10. Known issue — Naver browse in sandbox

`kr-naver-browse`, `kr-naver-blogger`, and `kr-naver-insight` depend on a local gstack `browse` server that binds to `127.0.0.1`.

- In some Codex sandbox environments, local listen is blocked with `EPERM`. When that happens, Naver workflows can fail with messages like `No available port after 5 attempts` or `listen EPERM: operation not permitted 127.0.0.1:<port>`.
- Rerun the Naver fetch step outside the sandbox or with elevated execution. Do not assume `0 posts` means the bloggers or posts do not exist until the runtime issue is excluded.
- On Linux/WSL installs, the `kr-naver-browse` post-install hook tries `bunx playwright install-deps chromium` before installing Chromium. Set `SKILL_INSTALL_SKIP_LINUX_DEPS=1` to skip automatic system dependency installation.

## 11. Validation

Windows:

```powershell
.\scripts\validate-skills.ps1
```

Linux or macOS:

```bash
bash ./scripts/validate-skills.sh
```

Validation covers skill spec checks, strict YAML frontmatter parsing, output-path contracts, README local-link verification, and golden example audits using [docs/quality-rubrics.md](quality-rubrics.md).
