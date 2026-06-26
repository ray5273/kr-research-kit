# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- `manifest.json` — project-level descriptor for marketplace catalogs (KrResearchKit v0.1.0, 23 KR skills, tiered featured/standalone/bundle).
- `.claude-plugin/plugin.json` — Claude Code plugin manifest (`kr-research-kit`, MIT, keywords for discoverability).
- `.claude-plugin/marketplace.json` — self-hosted Claude Code marketplace manifest. Users can install via `/plugin marketplace add ray5273/stock-analysis-skill`.
- `.github/FUNDING.yml` — GitHub Sponsors (`ray5273`) + KakaoPay link.
- `docs/MARKETPLACE.md` — submission guide for Claude community marketplace, Codex catalog, and agentskills.io with per-channel checklist + listing copy.
- `skills/kr-market-leaders/` — KOSPI + KOSDAQ integrated leadership screener (SKILL.md, agents/openai.yaml, 3 scripts, 2 references). Now git-tracked.

### Changed
- `README-kr.md` — added "5분 온보딩 (Naver KOL용)" section, filled the 포함된 스킬 list with 9 previously omitted skills (kr-naver-*, kr-analyst-report-*, kr-market-leaders, kr-web-browse), added `kr-naver-blog-publish` usage example.

### Documented
- `NOTICE` — third-party license attribution for bundled NotoSansKR (SIL OFL) and runtime dependencies (gstack MIT, pypdf BSD-3-Clause, Pillow HPND, Bun MIT) plus data-source ToS notices.

### Deferred to a later release
- `docs/demo/` showcase assets (memo PDF, chart collage, demo recording).
- English `README.md` marketplace landing rewrite.
- `us-stock-analysis` is bundled in install scripts but excluded from the v0.1.0 marketplace plugin (see `.claude-plugin/marketplace.json`). Slated for v0.2.0.

## [0.1.0] — TBD (first marketplace listing)

First public release packaged for Anthropic Skills + Claude Plugin Marketplace
and OpenAI/Codex Skills catalogs. Includes the 24 skills under `skills/`:

- KR stock: `kr-stock-plan`, `kr-stock-analysis`, `kr-stock-chart`, `kr-stock-data-pack`,
  `kr-stock-dart-analysis`, `kr-stock-update`, `kr-market-leaders`
- KR sector: `kr-sector-plan`, `kr-sector-data-pack`, `kr-sector-analysis`,
  `kr-sector-compare`, `kr-sector-audit`, `kr-sector-update`
- KR analyst coverage: `kr-analyst-report-discover`, `kr-analyst-report-fetch`,
  `kr-analyst-report-insight`, `kr-foreign-analyst`
- KR Naver pipeline: `kr-naver-browse`, `kr-naver-blogger`, `kr-naver-insight`,
  `kr-naver-blog-publish`, `kr-web-browse`
- KR portfolio: `kr-portfolio-monitor`
- US: `us-stock-analysis`

Runtimes: Codex CLI and Claude Code, via `scripts/install-all-skills.sh` and
`scripts/install-all-claude-skills.sh` respectively.
