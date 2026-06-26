# Marketplace Submission Guide

This document tracks how `kr-research-kit` (a.k.a. KrResearchKit, repo
`ray5273/stock-analysis-skill`) gets onto the public AI agent skill catalogs.
It captures the official spec as of June 2026 plus the in-repo files that
back each channel. Re-verify spec links before each submission — the docs are
moving targets.

## Channels at a glance

| Channel | Status (Jun 2026) | Submission path | Time-to-live |
| --- | --- | --- | --- |
| **Self-hosted Claude marketplace** | Live the moment a user runs `/plugin marketplace add ray5273/stock-analysis-skill` | None — already wired via `.claude-plugin/marketplace.json` | Immediate |
| **Anthropic community marketplace** (`@claude-community`) | Form-based, manual review + automated safety screen | claude.ai or platform.claude.com form (see below) | Days to a couple of weeks |
| **Anthropic official marketplace** (`claude-plugins-official`) | Curated by Anthropic, no application process | Anthropic invites at its discretion | N/A — passive |
| **OpenAI Codex public catalog** (`openai/skills`) | Self-publishing "coming soon" per Codex plugin docs | For now, file a PR against `github.com/openai/skills` or wait | Weeks |
| **agentskills.io** | Open standard catalog (Dec 2025) | Listed once skills follow the open spec — verify before submit | Days |

## 1. Self-hosted Claude marketplace (no submission)

Already live. Users in Claude Code:

```text
/plugin marketplace add ray5273/stock-analysis-skill
/plugin install kr-research-kit@kr-research-kit-marketplace
```

Backing files in this repo:

- `.claude-plugin/plugin.json` — plugin manifest (name `kr-research-kit`,
  version `0.1.0`, MIT, keywords for discoverability).
- `.claude-plugin/marketplace.json` — marketplace manifest. `plugins[]`
  enumerates 23 KR skill paths under `skills/` and points `source: "."` so the
  repo serves as both plugin and marketplace.
- `manifest.json` (repo root) — _informational_ project descriptor. Not read
  by Claude Code; lives next to README for human/marketplace-card consumption.
- `NOTICE` — third-party attribution (NotoSansKR SIL OFL, gstack MIT,
  pypdf BSD-3, Pillow HPND, Bun MIT). Required for clean redistribution.

Validate locally before publishing changes:

```bash
# When Claude Code CLI is installed:
claude plugin validate

# Always:
bash ./scripts/validate-skills.sh
```

## 2. Anthropic community marketplace (`@claude-community`)

This is the primary distribution channel for v0.1.0. Submission is **form-based**, not a PR.

### Submission form

| Account type | Form |
| --- | --- |
| Team / Enterprise organization (directory management access) | https://claude.ai/admin-settings/directory/submissions/plugins/new |
| Individual author | https://platform.claude.com/plugins/submit |

The form asks for the repo URL (`https://github.com/ray5273/stock-analysis-skill`) and the plugin name (`kr-research-kit`). The review pipeline pulls `.claude-plugin/plugin.json` from a specific commit SHA and runs `claude plugin validate` plus automated safety screening.

Approved plugins land in `anthropics/claude-plugins-community/.claude-plugin/marketplace.json` pinned to a commit SHA. CI auto-bumps the pin as new commits land on this repo. Public catalog sync runs nightly — there is a delay between approval and the plugin appearing as installable.

### Pre-submission checklist

- [ ] `claude plugin validate` passes locally (run it once Claude Code CLI ≥ v2.1 is installed).
- [ ] `bash ./scripts/validate-skills.sh` green.
- [ ] CI badge green in README.
- [ ] `.claude-plugin/plugin.json` `version` matches the latest git tag.
- [ ] `NOTICE` lists every redistributed third-party asset.
- [ ] No secrets in tracked files (`.env` is gitignored — confirm `git ls-files | grep .env` is empty).
- [ ] README has a "Sponsor" section + FUNDING.yml configured (`github: ray5273` + KakaoPay link).
- [ ] At least one runnable demo: `node scripts/harness.js --mode all --ticker 066970 --company "엘앤에프" --with-blog --with-analyst` works on a fresh clone.
- [ ] Naver SmartEditor automation (`kr-naver-blog-publish`) explicitly gated on user approval (already enforced by SKILL.md — confirm before submit so reviewers don't flag spam risk).

### Listing card copy (paste into submission form)

- **Plugin name:** `kr-research-kit`
- **Display name:** KrResearchKit — Korean Equity Research
- **Short tagline (≤80 chars):** Korean stock research memos — DART, consensus, foreign-IB, charts, Naver-blog publish.
- **Category:** `finance`
- **Tags:** `korean-market`, `equity-research`, `krx`, `dart`, `naver-blog`
- **Long description (≤500 words):**

  > AI-native Korean equity research in one skill pack. Routes a single ticker question through filing precision (OpenDART API + Chrome-extension fallback), KRX chart artifacts (5-panel PNG: trend, overlay, momentum, structure, pattern), sell-side consensus (Hankyung Consensus primary + Naver Pay Research fallback), foreign-IB coverage extracted from Korean news (Morgan Stanley, Goldman, JPMorgan, Nomura, CLSA, etc.), Naver blogger insights, and a final decision memo with explicit `Decision Frame`, `DART Recheck`, `Street / Alternative Views`, `Valuation Snapshot`, and `Structured Stance` sections. Memos can be auto-published to Naver Blog via SmartEditor automation with a mandatory user-approval gate (no auto-spam).
  >
  > Skills: `kr-stock-plan` (entry-point orchestrator), `kr-stock-analysis`, `kr-stock-chart`, `kr-stock-dart-analysis`, `kr-stock-data-pack`, `kr-stock-update`, `kr-market-leaders`, `kr-sector-plan`/`-analysis`/`-data-pack`/`-compare`/`-audit`/`-update`, `kr-analyst-report-discover`/`-fetch`/`-insight`, `kr-foreign-analyst`, `kr-naver-browse`/`-blogger`/`-insight`/`-blog-publish`, `kr-web-browse`, `kr-portfolio-monitor`. 23 skills total.
  >
  > Native to both Claude Code and OpenAI Codex CLI. No npm dependencies (Node stdlib only). Optional Python (pypdf, Pillow) for PDF extraction and chart text rendering on macOS/Linux. Optional Bun for Naver browser automation skills.
  >
  > Required environment variables: `OPENDART_API_KEY` (free, register at opendart.fss.or.kr).
  >
  > Browser automation: `kr-naver-blog-publish` uses gstack `browse` (vendored) to drive Naver SmartEditor. Publish step requires explicit user approval via screenshot preview — never auto-publishes.
  >
  > License: MIT. Third-party attributions in `NOTICE`.

- **Homepage:** https://github.com/ray5273/stock-analysis-skill
- **Sponsor:** GitHub Sponsors `ray5273` + KakaoPay (linked via `.github/FUNDING.yml`)

## 3. OpenAI Codex catalog (`openai/skills`)

Per Codex docs (developers.openai.com/codex/skills, June 2026), self-publishing
to the public directory is **"coming soon"**. Current options:

- **PR to `github.com/openai/skills`**: 38 curated skills as of mid-2026.
  PR adds a skill subdirectory under the catalog repo. Each KR skill in this
  repo already follows the OpenAI format (`SKILL.md` + `scripts/` +
  `references/` + `agents/openai.yaml`), so PRs are technically ready — but
  the catalog appears to be Anthropic-style curated and may decline scope
  outside generic developer workflows.
- **Wait for self-publish**: monitor https://developers.openai.com/codex/changelog
  for the self-publish endpoint. Until then, primary Codex distribution is
  the same direct-install path users already use:

  ```bash
  bash ./scripts/install-all-skills.sh
  ```

## 4. agentskills.io (open standard)

Per Anthropic engineering blog, the Agent Skills format is an open standard
adopted by ~40 clients (GitHub Copilot, VS Code, Cursor, OpenAI Codex, Gemini
CLI) as of June 2026. Listing on agentskills.io exposes the pack to all of
them. Verify the current submission flow at https://agentskills.io before
submit — the showcase list and submission process were not fully documented
when this guide was written.

## Open items needing verification before submit

- [ ] Confirm exact submission URL is still live (the form URLs above were
  captured June 2026 via the docs page at code.claude.com/docs/en/plugins).
- [ ] Run `claude plugin validate` once Claude Code CLI is available locally.
- [ ] Confirm the Anthropic community catalog accepts the `skills[]` field
  inside a marketplace plugin entry as a scoping mechanism (used here to
  exclude `us-stock-analysis` from v0.1.0 — see `.claude-plugin/marketplace.json`).
- [ ] Decide whether to file a PR to `openai/skills` or hold for self-publish.

## References

- Claude Code plugin marketplaces — https://code.claude.com/docs/en/plugin-marketplaces
- Claude Code plugins — https://code.claude.com/docs/en/plugins
- Claude community submission form (claude.ai) — https://claude.ai/admin-settings/directory/submissions/plugins/new
- Claude community submission form (Console) — https://platform.claude.com/plugins/submit
- Official marketplace repo — https://github.com/anthropics/claude-plugins-official
- Community marketplace catalog — https://github.com/anthropics/claude-plugins-community/blob/main/.claude-plugin/marketplace.json
- OpenAI Codex skills — https://developers.openai.com/codex/skills
- OpenAI skills catalog — https://github.com/openai/skills
- Agent Skills standard — https://agentskills.io
