# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.4.0] - 2026-10-11

### Commits

- feat(naver-blog): move stock sources to numbered endnotes ([cd9368f](https://github.com/ray5273/kr-research-kit/commit/cd9368feb1f05188e56116b7f5dbd8f86dde84e6))

## [0.3.0] - 2026-10-11

### Added
- `skills/kr-order-backlog-analysis/` — order-driven KRX classification, DART/KRX evidence hierarchy, normalized backlog JSON, and mandatory Korean-labelled year/maturity PNG rendering with an explicit no-quantitative-data exception.
- `manifest.json` — project-level descriptor for marketplace catalogs (KrResearchKit v0.1.0, 23 KR skills, tiered featured/standalone/bundle).
- `.claude-plugin/plugin.json` — Claude Code plugin manifest (`kr-research-kit`, MIT, keywords for discoverability).
- `.claude-plugin/marketplace.json` — self-hosted Claude Code marketplace manifest. Users can install via `/plugin marketplace add ray5273/kr-research-kit`.
- `.github/FUNDING.yml` — GitHub Sponsors (`ray5273`) + KakaoPay link.
- `docs/MARKETPLACE.md` — submission guide for Claude community marketplace, Codex catalog, and agentskills.io with per-channel checklist + listing copy.
- `skills/kr-market-leaders/` — KOSPI + KOSDAQ integrated leadership screener (SKILL.md, agents/openai.yaml, 3 scripts, 2 references). Now git-tracked.

### Changed
- `kr-stock-plan`, DART, data-pack, memo, update, harness, and plugin routing now carry order-driven companies through the backlog skill and keep backlog JSON/Markdown/PNG artifacts synchronized.
- `README-kr.md` — added "5분 온보딩 (Naver KOL용)" section, filled the 포함된 스킬 list with 9 previously omitted skills (kr-naver-*, kr-analyst-report-*, kr-market-leaders, kr-web-browse), added `kr-naver-blog-publish` usage example.

### Documented
- `NOTICE` — third-party license attribution for bundled NotoSansKR (SIL OFL) and runtime dependencies (gstack MIT, pypdf BSD-3-Clause, Pillow HPND, Bun MIT) plus data-source ToS notices.

### Deferred to a later release
- `docs/demo/` showcase assets (memo PDF, chart collage, demo recording).
- English `README.md` marketplace landing rewrite.
- `us-stock-analysis` is bundled in install scripts but excluded from the v0.1.0 marketplace plugin (see `.claude-plugin/marketplace.json`). Slated for v0.2.0.

### Commits

- Initial commit: add stock analysis skill repository ([8023815](https://github.com/ray5273/kr-research-kit/commit/802381566a704c8263d403288240e74911ed0ffc))
- Improve KR stock skill outputs and add example memo ([7d5e6db](https://github.com/ray5273/kr-research-kit/commit/7d5e6dbc4e1035a570fa1a8bfa03e164884c9eed))
- Fix GitHub Actions CODEX_HOME env ([6f21564](https://github.com/ray5273/kr-research-kit/commit/6f21564bcf9b5b9bf287de6fc97b6207629ea6fd))
- Add chart analysis to KR stock skill ([048a526](https://github.com/ray5273/kr-research-kit/commit/048a526a7a36919a5087e2981021133c71783552))
- Improve KR chart analysis and PNG output ([08fbf10](https://github.com/ray5273/kr-research-kit/commit/08fbf10e4b2e3e1c7b7f74ca527fbc9f6f12b547))
- Add Claude Code compatibility (install scripts, CI, docs) ([d5117b0](https://github.com/ray5273/kr-research-kit/commit/d5117b0525584cb8d4cab71dc7bb23725f6302ef))
- Merge pull request #1 from ray5273/add-claude-code-compatibility ([7c4f6ab](https://github.com/ray5273/kr-research-kit/commit/7c4f6abe183fce0ca064cd1c1b6b1b8316b6e26b))
- Make stock analysis skills write report files ([cb8ab93](https://github.com/ray5273/kr-research-kit/commit/cb8ab9344dda60756655208a1e51e4f2b8b99f01))
- Add LG CNS analysis example ([3508688](https://github.com/ray5273/kr-research-kit/commit/3508688c05c2ed9fc470885eff44ad8084b2d60d))
- Add Korean README and skill workflow docs ([0e88d8d](https://github.com/ray5273/kr-research-kit/commit/0e88d8d27271f9aab8924a46535733984ebcd30e))
- Merge pull request #2 from ray5273/docs/readme-kr-and-skill-flow ([69a26fd](https://github.com/ray5273/kr-research-kit/commit/69a26fd30ab1d46c6d443adbf95e8c520b945618))
- Add KR memo update skill and example ([c22093e](https://github.com/ray5273/kr-research-kit/commit/c22093efb0ab721b74d88398c5cac8d22ab87047))
- Add kr-portfolio-monitor skill and portfolio-snapshot.js fallback script ([81740e8](https://github.com/ray5273/kr-research-kit/commit/81740e827e410ca43966761a3277e6fb826b138c))
- Fix CI validation script portability ([338d615](https://github.com/ray5273/kr-research-kit/commit/338d615342fdf37147cb22577347f2c1e2bd5396))
- Add Kiwoom helpers and clarify KRX-only scope ([a0bcc24](https://github.com/ray5273/kr-research-kit/commit/a0bcc245a6002bd948169c786ab2a26824fd33dd))
- Merge pull request #3 from ray5273/feat/kr-portfolio-monitor ([b873d6d](https://github.com/ray5273/kr-research-kit/commit/b873d6d8d374d4e669ac5c46e251f2423f573832))
- Add Korean sector research skill suite ([3e18442](https://github.com/ray5273/kr-research-kit/commit/3e18442eede37fc5b7d44e5c95171df0c9455106))
- Merge origin/main and fix validation for sector skill PR ([8a90068](https://github.com/ray5273/kr-research-kit/commit/8a90068b7d69958513ee45933d8a2151610a6243))
- Refactor Korean stock skill suite ([9d110ef](https://github.com/ray5273/kr-research-kit/commit/9d110ef84f704006e1c6cd0a53c1b4e668a026af))
- Merge pull request #5 from ray5273/codex/kr-stock-skill-suite ([7ab1774](https://github.com/ray5273/kr-research-kit/commit/7ab177489d7e25cdba18e07e97131dc780fbfd64))
- Add blended-source flow to kr stock analysis (#6) ([1e3e870](https://github.com/ray5273/kr-research-kit/commit/1e3e8704a3a0f94da90cc977e7ec6eb6c829f90f))
- Split KR stock charts into main and overlay views ([5c2612d](https://github.com/ray5273/kr-research-kit/commit/5c2612db6c55597bfea9f95371301eeb5fa9c2b2))
- Polish KR chart rendering and docs ([6bce320](https://github.com/ray5273/kr-research-kit/commit/6bce320471b6cb7f2792f9f82687ef33185c84d5))
- reorganize KR examples and expand DART coverage summaries ([64b0965](https://github.com/ray5273/kr-research-kit/commit/64b0965c068de2d9c657ab5ef1d47c32ee683a2d))
- Rename KR DART skill and clarify workflow ([af32d95](https://github.com/ray5273/kr-research-kit/commit/af32d95d8d9bdf454439a74dd9e499b934c29a11))
- Update KR stock skills and refresh example reports ([c00c952](https://github.com/ray5273/kr-research-kit/commit/c00c952d8d80ab590105e5b3c6d4037ab82098fb))
- Add separate related-party note handling ([4e87a8f](https://github.com/ray5273/kr-research-kit/commit/4e87a8f3598aba016cd33a79eeaf17892f0e1362))
- Update KR stock skill workflow prompts ([015c1a6](https://github.com/ray5273/kr-research-kit/commit/015c1a6385d07773f6921dfa0a8c1d8d18dd0f82))
- add DART PDF coverage and reference cache flow ([16723f4](https://github.com/ray5273/kr-research-kit/commit/16723f489498e6ebab76ed9fdf62ab6c1f589c87))
- Add Claude.ai DART browser export workflow ([eae44d6](https://github.com/ray5273/kr-research-kit/commit/eae44d6e264882effcdd3a06c72b7f68055b0538))
- Expand KR momentum charts with ADX and improve font rendering ([e6b090d](https://github.com/ray5273/kr-research-kit/commit/e6b090d08c96521ff39ad275504d9926d24e410b))
- Add harness for pipeline automation and quality gate ([9e4c25a](https://github.com/ray5273/kr-research-kit/commit/9e4c25af0ed56000227aa6086ede0d9c6953e33b))
- Add DART Recheck section to output format and update reference caches ([9ef75f8](https://github.com/ray5273/kr-research-kit/commit/9ef75f832ad25021c4be260f8e540f8e849a0417))
- Normalize line endings to LF and add .gitattributes ([de15b73](https://github.com/ray5273/kr-research-kit/commit/de15b73905b35e957cb81682d4d0fc61a8fa1f51))
- Enforce DART-first stock workflow and add LIG Nex1 example ([5c69277](https://github.com/ray5273/kr-research-kit/commit/5c69277529184ac443a529a489b6ee03177ab8bf))
- Add valuation-chart.js for PER/PBR/EV-EBITDA time-series PNG charts ([b8ae6e5](https://github.com/ray5273/kr-research-kit/commit/b8ae6e59edafad7061b5d2cb073720655cccd1c7))
- Adjust valuation chart axis scaling ([07fc8d7](https://github.com/ray5273/kr-research-kit/commit/07fc8d7f08c8d2c9917c70a9f855f00fbddd2d3c))
- chore: add gstack skill routing rules to CLAUDE.md ([7c01de5](https://github.com/ray5273/kr-research-kit/commit/7c01de57fad6a8a213195df9dc1e5e03934d0eff))
- Add KR decision memo orchestrator contract ([27eef15](https://github.com/ray5273/kr-research-kit/commit/27eef15514b9a4e14b5a5008e63ca2e61f2dd8f6))
- Add Naver blog insight pipeline for KR memos ([316567b](https://github.com/ray5273/kr-research-kit/commit/316567b14197a3bebec36611f34974d74c2d980b))
- Add KR trend rule screening scripts ([8536099](https://github.com/ray5273/kr-research-kit/commit/85360993b5f583a4dfc8b773cd0430519cf414fa))
- Fix KR output format headers for validation ([a34be13](https://github.com/ray5273/kr-research-kit/commit/a34be1356be50a58831cef0f30121fd0c3e58017))
- Align KR memo examples with header rules ([6153fa0](https://github.com/ray5273/kr-research-kit/commit/6153fa0385166de207cde38b47f51511119d4adc))
- Integrate Naver blog pipeline into kr-stock-plan orchestration ([31ccb31](https://github.com/ray5273/kr-research-kit/commit/31ccb31b3a92e8a09361a9687d59ab66ebf91778))
- Fix Naver blog parser to use browse links command ([e28693e](https://github.com/ray5273/kr-research-kit/commit/e28693e3474befa80296177ad0c984b9af1ce805))
- Replace PostList heuristic with in-blog search for blogger discovery ([617a693](https://github.com/ray5273/kr-research-kit/commit/617a6931b35c3ea2d3ee7c543ec211f8c5534d17))
- Add dynamic query builder for Naver blogger discovery ([0d25875](https://github.com/ray5273/kr-research-kit/commit/0d25875b3ade4afb1fe7b6bd47b6da1517ff2031))
- Add autocomplete-anchored Naver blogger discovery ([028652c](https://github.com/ray5273/kr-research-kit/commit/028652cd0ce9c3218b02856548dd943442f8a024))
- Route corporate-action related queries as keyword searches ([74c458b](https://github.com/ray5273/kr-research-kit/commit/74c458b7e5ccdb650f99c125caefd658f5a52e27))
- Add deep-tech, blog-level, and staleness filters to blogger discovery ([b8c3e8f](https://github.com/ray5273/kr-research-kit/commit/b8c3e8fbd35cbe2148019e216436222d6234ed45))
- Fix Naver blog post body extraction and add --no-cache test flag ([1d718c8](https://github.com/ray5273/kr-research-kit/commit/1d718c80508ab396a889dd8ec7569f9eed668f87))
- Add non-stock-blog and content-farm filters to blogger discovery ([541e9af](https://github.com/ray5273/kr-research-kit/commit/541e9afb42102eea4de87ef7e784fb7725d0d80f))
- Strengthen AI-farm and non-stock blog filters in blogger discovery ([d114911](https://github.com/ray5273/kr-research-kit/commit/d114911734cdd7211f64ac908b4f486d3ef0f3ae))
- Add Claude Code skill installer with post-install hook support and Mac fallback for kr-naver-browse ([73b78ab](https://github.com/ray5273/kr-research-kit/commit/73b78ab33644cbb65120b46bfc46a0f8b1355770))
- Add Codex macOS fallback for Naver browse ([a955beb](https://github.com/ray5273/kr-research-kit/commit/a955beb173af9536f0dcc00f3572327c1cc2cf65))
- Add Claude Code install instructions to README and refresh analysis examples ([0539935](https://github.com/ray5273/kr-research-kit/commit/0539935a4f21a93d9292299678874f79c38a6367))
- Move Install section to top of READMEs and refresh analysis examples ([03e5f4f](https://github.com/ray5273/kr-research-kit/commit/03e5f4f2a4667a18b27a6e9fb752faaac1aa7e5a))
- Add Ligachem Bio analysis and Naver insight fixes ([87b5527](https://github.com/ray5273/kr-research-kit/commit/87b5527a5beb74108603447ed1a04bf89f72bfb8))
- Add analyst-report skill chain with regression harness mode ([56c4798](https://github.com/ray5273/kr-research-kit/commit/56c47986cf35fcb966861f4545113428745b835b))
- Discover Korean chart fonts on macOS/Linux/Windows automatically ([6a95e05](https://github.com/ray5273/kr-research-kit/commit/6a95e05aff1d40386fe0883cb31aca22ec52e255))
- Recolor overlay chart so Bollinger and Tenkan no longer collide with Ichimoku spans ([75b5731](https://github.com/ray5273/kr-research-kit/commit/75b5731cb78998e184b3259cfad268f17f3a128e))
- Fix analyst report skill YAML frontmatter ([6e7fb43](https://github.com/ray5273/kr-research-kit/commit/6e7fb439a92ad161a7c5076a4f85879b53dc249e))
- Add foreign analyst coverage skill ([05d0d05](https://github.com/ray5273/kr-research-kit/commit/05d0d053c8b8785c40eca53fd2f86fad92118346))
- Bundle Korean chart font and harden installs ([a58eb61](https://github.com/ray5273/kr-research-kit/commit/a58eb6171d40a37b15f7a1ecebefcf88a725831a))
- Add HMM Korean stock example ([c4dcb5d](https://github.com/ray5273/kr-research-kit/commit/c4dcb5dd351b3ff514f19b4baf2db94190ddc18a))
- Add OpenDART API fetcher and HD현대 holding-company example ([d778d75](https://github.com/ray5273/kr-research-kit/commit/d778d750994a5ce73b52859a120f148156a6bcbd))
- Add parallel subagent dispatch to kr-stock-analysis with GS example ([a092b5e](https://github.com/ray5273/kr-research-kit/commit/a092b5e87eab49d63407715d23f69db990ddf948))
- Add NPS holdings sweep script with 90d/1y coverage examples ([85c5a3f](https://github.com/ray5273/kr-research-kit/commit/85c5a3f042d21b55b1d1a24ecb87c2559b817c61))
- Add 롯데관광개발 Korean stock memo with full 4-channel Phase B coverage ([687e483](https://github.com/ray5273/kr-research-kit/commit/687e483e4efcff9bdadfafe3514ba7b90beee200))
- Simplify CI to Linux-only and drop memo style gate ([010c55f](https://github.com/ray5273/kr-research-kit/commit/010c55f0dc55b8baa8ba74d73f7beed0f5c35ffa))
- Add structure chart with horizontal SR zones and volume profile ([35dd22b](https://github.com/ray5273/kr-research-kit/commit/35dd22b2cfd320e63dc8ef461d66a9822dd81bf8))
- Add chart interpretation boxes ([4ac4d16](https://github.com/ray5273/kr-research-kit/commit/4ac4d16722db63b4019aed42a2a287f701a17568))
- Add moving-average labels to KRX charts ([448d4d3](https://github.com/ray5273/kr-research-kit/commit/448d4d3cac6e5c88717d8f5e25471d367967dd03))
- docs: improve README showcase ([0c702e3](https://github.com/ray5273/kr-research-kit/commit/0c702e3ff6031f0eb44a85c181cd25b7a7c85f95))
- docs: add HD현대중공업 chart assets ([c695630](https://github.com/ray5273/kr-research-kit/commit/c69563061ef00d2ae9fc6284cec9ec63cba7a94a))
- 솔루스첨단소재(336370) 전지박 수출 proxy 분기 업데이트 (2026-04 기준) (#10) ([a0e4d62](https://github.com/ray5273/kr-research-kit/commit/a0e4d629f3ae9fc6a7b40e9100ca063bb95eac2e))
- Add Naver blog publish skill ([fd32c22](https://github.com/ray5273/kr-research-kit/commit/fd32c22f726489e81cea499bdfa71f0efd5a36b9))
- Add automatic Naver highlight rendering ([2bc238c](https://github.com/ray5273/kr-research-kit/commit/2bc238c86e307cb7974eea9d51a7b379c51d537e))
- Ensure Naver representative thumbnail selection ([0876f65](https://github.com/ray5273/kr-research-kit/commit/0876f651a167ea44919c4ee8dc6c18638d3c970f))
- Prep v0.1.0 for Claude marketplace + add kr-market-leaders ([f600996](https://github.com/ray5273/kr-research-kit/commit/f60099679bba262e218b0dd2658e1be16bbb0691))
- Simplify READMEs and rename repo to kr-research-kit ([8d8be4a](https://github.com/ray5273/kr-research-kit/commit/8d8be4ae3bfa4f93851e0488c96c5dc67d82b3f7))
- Rename README title to KrResearchKit — Korean Equity Research ([8723925](https://github.com/ray5273/kr-research-kit/commit/87239256a9f9a4baeb1e0ef221cc6f674c1a4227))
- Add daily market news publishing workflow ([7cdb948](https://github.com/ray5273/kr-research-kit/commit/7cdb948fbb9316f8e28f818ea7fbe05d97d291e6))
- Improve daily market news publishing ([6895ceb](https://github.com/ray5273/kr-research-kit/commit/6895cebe71da8083489d710bad81d06b62cbc34f))
- Refine daily market news blog output ([a823c2e](https://github.com/ray5273/kr-research-kit/commit/a823c2ecac74951fb58ff27aebcfa5e7ea7a28b1))
- Improve volume bar chart readability ([2cca0b9](https://github.com/ray5273/kr-research-kit/commit/2cca0b9f8418f00b6d40c10d415eef849b94d3c7))
- Add US daily market news workflow ([7702a0f](https://github.com/ray5273/kr-research-kit/commit/7702a0fa91909f55956c7f2d6b8a05b49c9bd705))
- Add US SEC analysis skill and Tesla memo ([0d3e91d](https://github.com/ray5273/kr-research-kit/commit/0d3e91d37bd87d2deec76f87fc0222d5e0bd1bcc))
- fix: define and export newsRankScore in KR daily market news ([64904c9](https://github.com/ray5273/kr-research-kit/commit/64904c952f24033fe112299e6aeacadbbd0fdb90))
- fix: expose volume20/60Series from technical-core to chart renderer ([b7019a5](https://github.com/ray5273/kr-research-kit/commit/b7019a55a2ea8b84553ac3d0bed6963120e47edb))
- feat: fetch-kr-chart passthrough for US/index symbols, adjClose, module exports ([8081c2b](https://github.com/ray5273/kr-research-kit/commit/8081c2b00c6636d80327a6df10a3742886077880))
- feat: kr-portfolio-guard — weekly holdings guard with forced decision ledger ([76662a1](https://github.com/ray5273/kr-research-kit/commit/76662a14d6c06c85311a1ae891f1fde8b3254b05))
- docs: guard design doc, Decision Block memo standard, CLAUDE.md integration ([3db6ed6](https://github.com/ray5273/kr-research-kit/commit/3db6ed6bbc64f5fbb2700270fca1a145436530a7))
- chore: bump version and changelog (v0.2.0) ([83a458a](https://github.com/ray5273/kr-research-kit/commit/83a458af58c3178b3602824d6a85f879234124e2))
- Add Korean trade-flow analysis skill ([57ecea0](https://github.com/ray5273/kr-research-kit/commit/57ecea0219e97a117eb9686df49463acdc4cf124))
- Add source-based Korean report watch ([930ba3a](https://github.com/ray5273/kr-research-kit/commit/930ba3a13b9d4968cd89327f4b640ed5d5a62f03))
- Add Telegram report sender ([8b8c138](https://github.com/ray5273/kr-research-kit/commit/8b8c1386904c440e0c710b1736020b9204fe87dd))
- Add analyst report watch skill updates ([b12f669](https://github.com/ray5273/kr-research-kit/commit/b12f669cad0c0349c08cf99a89483b2dd59b195c))
- Add telegram report sender skill ([0d897d8](https://github.com/ray5273/kr-research-kit/commit/0d897d898baa5dd7486ee6b8a070a9fc0a101c95))
- Add mandatory price/chart freshness gate to kr-stock-update ([ec57e58](https://github.com/ray5273/kr-research-kit/commit/ec57e58671a33c282e72effe40bbb9ee337d1ab4))
- Improve US market news and Naver scheduling ([de017c4](https://github.com/ray5273/kr-research-kit/commit/de017c4420961c6b85db32a6af1ca9cc5fa1f04b))
- Handle gstack shutdown disconnects ([f105f24](https://github.com/ray5273/kr-research-kit/commit/f105f240c21534d9cf03bb2fd88992bc5b0f2d09))
- docs: add bookook securities research memo ([b1a3b4b](https://github.com/ray5273/kr-research-kit/commit/b1a3b4b6a28789be08299abbc2c197e09c6d7e7b))
- Add KRX strategy backtest matrix and reports ([c67fc02](https://github.com/ray5273/kr-research-kit/commit/c67fc02746707fb274d9daa098e3a10c1b4bedc8))
- Add KRX MDD overlay backtests ([b770758](https://github.com/ray5273/kr-research-kit/commit/b77075826dbc20e4f90350b53f5d3276b81a75d5))
- Add KOSPI ex-Samsung/Hynix reconstructed-index benchmark to 10y backtest ([c4fcc64](https://github.com/ray5273/kr-research-kit/commit/c4fcc64ec6c296e4164a73a5a6e5df8acca6c98d))
- Export yahooBars from trend-following runner for reuse ([6306a45](https://github.com/ray5273/kr-research-kit/commit/6306a451023705a6141c3e2c5fa2ccb493cb85b2))
- Add standalone ex-KOSPI index tracker for continuous monitoring ([1609232](https://github.com/ray5273/kr-research-kit/commit/16092323c9cf255efd028f2d2d5fe99893e907ac))
- Merge pull request #12 from ray5273/claude/kospi-backtest-exclude-samsung-w7o3tk ([db371ea](https://github.com/ray5273/kr-research-kit/commit/db371eab2c93673819f2a56b31be38a395dd572b))
- docs: add weekly portfolio backtest comparison ([b09d353](https://github.com/ray5273/kr-research-kit/commit/b09d353bc282bedb465c58003c8ea149543a7325))
- docs: link weekly portfolio comparison ([8405194](https://github.com/ray5273/kr-research-kit/commit/84051944b239d7b42cfd1a5e781119ada33cf2ac))
- Add validated non-momentum factor backtests to kr-strategy-backtest ([80a0c08](https://github.com/ray5273/kr-research-kit/commit/80a0c0821b913b986db8a379a203e4c009a25603))
- Correct backtest methodology (cost, benchmark, stats, survivorship) and re-test ([26b4f89](https://github.com/ray5273/kr-research-kit/commit/26b4f8917389a63e0f31f4905f590f25d41030a9))
- Add managed-momentum crash defense; document Minervini RS strategy as main ([bac189f](https://github.com/ray5273/kr-research-kit/commit/bac189ffc4061a41e4783e1f61defc4422fd4e40))
- Rebuild annual Top-300 data pipeline ([d000eb2](https://github.com/ray5273/kr-research-kit/commit/d000eb23bf310dcf179a178aae46b7b557ac6e06))
- Add strategy-review Phase A1/B/C + A3 robustness + A2 checklist ([21170b6](https://github.com/ray5273/kr-research-kit/commit/21170b6b1207f4bb5cbc4980377d409fd0c229b9))
- Concretize A2: extract 78 delisted/merged names for hybrid official cache ([3875a2f](https://github.com/ray5273/kr-research-kit/commit/3875a2f2f9a7f07b46548fe1bfefcd71be2052c7))
- Add dividend-inclusive total-return diagnostic (marcap + OpenDART dividends) ([c822065](https://github.com/ray5273/kr-research-kit/commit/c82206568877eb7c4684e0fcdaa137a90ef91295))
- A4: re-anchor representative metrics + record R1 (drop vol target) ([afe2a9b](https://github.com/ray5273/kr-research-kit/commit/afe2a9bb3699345feb1a6c9c7ca9601249785865))
- Hybrid A2: classify 78 delisted names; total-loss correction is negligible ([62aba31](https://github.com/ray5273/kr-research-kit/commit/62aba31dc84037bb3f4f87b0e5ddd723724d437c))
- Adopt R1 in the engine: default to regime-only (drop the vol target) ([83952d5](https://github.com/ray5273/kr-research-kit/commit/83952d511070975a3e77b4d9ef88471d5b803d98))
- Generate R1 representative report on dividend-inclusive total-return cache ([ba8d114](https://github.com/ray5273/kr-research-kit/commit/ba8d11472954ffe4a267754b43a881453c024ea7))
- Sync representative metrics to R1 (11.80%) + flag Deflated Sharpe not cleared ([2d89277](https://github.com/ray5273/kr-research-kit/commit/2d892772537968ceb1dbf10213b38f519e0e6895))
- Robust strategy search: no KOSPI factor clears the Deflated Sharpe hurdle ([0febd3e](https://github.com/ray5273/kr-research-kit/commit/0febd3e7876b5d05518f9ae898379bd26ce4ba83))
- Verify robust-search leads: Quality and EPS growth both rejected ([319c1b6](https://github.com/ray5273/kr-research-kit/commit/319c1b6ed2e5bf6ce3692c444badc2838af54307))
- Regime-centric low-risk portfolio design: broad EW + binary regime ([201614a](https://github.com/ray5273/kr-research-kit/commit/201614ad44484c546a708d0a3b8b17ccdd329ff7))
- Add return-seeking pure-EPS tilt variant (--eps-weight, --holdings) ([e4a5022](https://github.com/ray5273/kr-research-kit/commit/e4a5022a7d16f3c6267ae458aa61705f75fa8970))
- Add live operational model: return-seeking pure-EPS top-15 + regime (monthly) ([26ae975](https://github.com/ray5273/kr-research-kit/commit/26ae975ba01e392485e9c3b4f3d8ea2786c7bc9e))
- Measure real turnover/cost; correct live model to monthly reality (~8%) ([7322cd9](https://github.com/ray5273/kr-research-kit/commit/7322cd90a391604059ad8c72eab585645509ba50))
- Add rebalancing band + soft annual roll: cuts turnover, improves every metric ([cda9e42](https://github.com/ray5273/kr-research-kit/commit/cda9e4240acf728486457d2c19fedaf048f0a2ba))
- Improve momentum: 52-week-high proximity clears the Deflated Sharpe hurdle ([8b32022](https://github.com/ray5273/kr-research-kit/commit/8b320225781f0952224068e4a094a449a899330b))
- Compare universe size (Top 100/300/500) for 52-week-high momentum ([e4942ad](https://github.com/ray5273/kr-research-kit/commit/e4942ad1e4fb1411ffadcd6fef9cfbf69583598d))
- Make Hermes weekly-ranking scoreFormula strategy-agnostic ([bbf23bf](https://github.com/ray5273/kr-research-kit/commit/bbf23bf9202006ff5bf40af878c0c219e9601357))
- Add Hermes runtime scripts for the 52wk-high monthly strategy ([9176a3f](https://github.com/ray5273/kr-research-kit/commit/9176a3fb4a260f1a54121a3f1fbb6b1fc84464cd))
- Add 2026 monthly portfolio-change doc (52wk-high vs RS+EPS, band-applied) ([e5609a9](https://github.com/ray5273/kr-research-kit/commit/e5609a95095b10cc5a90392a30b0d3a858b63d19))
- Add session handoff doc (52wk-high strategy + Hermes deployment + TODO) ([ebb0e99](https://github.com/ray5273/kr-research-kit/commit/ebb0e9988f2f24da268d817ba3a6db739bb3cec7))
- chore: gitignore data caches, office junk, and oversized diagnostics ([a817456](https://github.com/ray5273/kr-research-kit/commit/a81745654b04805dd368bcd0fa419e1a4e9d7c23))
- feat(kr-strategy): 52w-high momentum backtest engine, scripts, and artifacts ([d72be85](https://github.com/ray5273/kr-research-kit/commit/d72be85ae23872efc86fb2f4b66a67aa0dcd866d))
- feat(us-strategy): US market-cap universe scraper, data, and backtest scripts ([c451cf4](https://github.com/ray5273/kr-research-kit/commit/c451cf4cb859fda4c64acae72ecfc2005fe94b6b))
- docs: refresh README, AGENTS, and strategy methodology notes ([1ec8076](https://github.com/ray5273/kr-research-kit/commit/1ec80761732ad3074ce25197a56f38c2d3ebb662))
- analysis(kr): refresh 대양전기공업 memo/charts, sector examples, and PDF outputs ([c4e2cf8](https://github.com/ray5273/kr-research-kit/commit/c4e2cf8718df244c9fc9faf5583970d5b8ea3797))
- add: backtest study decks and KR top-300 universe workbook ([b877b40](https://github.com/ray5273/kr-research-kit/commit/b877b4073071a182725ad77649e91fef3492b869))
- feat(kr-market-sentiment): add Korean market sentiment-bottom indicator skill ([56f5925](https://github.com/ray5273/kr-research-kit/commit/56f5925459acdfd4fbeabd48cfd91c0327ae9f25))
- analysis(kr-market-sentiment): add 2026-07-20 시장 투심 바닥 memo + Naver publish artifacts ([fc44b48](https://github.com/ray5273/kr-research-kit/commit/fc44b487bd62260153a5d932dc60719b8fe1a5b5))
- Add US ESS LFP cathode draft ([cd7592e](https://github.com/ray5273/kr-research-kit/commit/cd7592e54a6b977b50ae2d2fe4ef42a44d2209ff))
- Add conditional Naver color legend ([1b1d562](https://github.com/ray5273/kr-research-kit/commit/1b1d5625c5d72ad3a48222af3df1ee5185c92446))
- AI 인프라 빌드아웃 분기 업데이트 2026-08-05 (#13) ([ac4b96b](https://github.com/ray5273/kr-research-kit/commit/ac4b96b3db64be8f82e01d49786727560bd4a38c))
- docs: replace README link wall with a generated artifact index ([60aff3d](https://github.com/ray5273/kr-research-kit/commit/60aff3d0612002ce537e6cc5c2ef534eb5dc3c31))
- fix(validate): skip strategy memos in the single-stock section check ([f929d12](https://github.com/ray5273/kr-research-kit/commit/f929d12713d08c66d29be0b7dfbdec4a439cdb0d))
- Fix kr-foreign-analyst: missing browse fn + fabricated coverage records ([9b1afc8](https://github.com/ray5273/kr-research-kit/commit/9b1afc850fa61978f1aed426deccff8d23505c99))
- feat: 한국 수주잔고 분석 스킬과 LS일렉트릭 예제 추가 ([bc9c53c](https://github.com/ray5273/kr-research-kit/commit/bc9c53c72d66ac80f2df21de0ce79a1c1f25296a))
- fix(naver): stabilize SmartEditor body insertion ([d277caf](https://github.com/ray5273/kr-research-kit/commit/d277cafadc17be673500a3a3e60c967c8c6f326d))
- fix(strategy): harden live 52-week-high monitoring ([be29ca1](https://github.com/ray5273/kr-research-kit/commit/be29ca18f53a61a993fbf97e473d7d19647c88e0))
- fix(chart): expose volume moving-average series ([2d5ded1](https://github.com/ray5273/kr-research-kit/commit/2d5ded1d052aee56f1d88dc1d108597203f435b5))
- fix(validate): align PowerShell stock-plan checks ([948e14c](https://github.com/ray5273/kr-research-kit/commit/948e14c6085cf04c838664cc49197c4b6bc592b0))
- Add SPY ATH periodic investment backtest ([3d5050c](https://github.com/ray5273/kr-research-kit/commit/3d5050c3cc839f394856316b86001217030c0d3b))
- docs: add battery copper foil sector analysis ([e77e7c6](https://github.com/ray5273/kr-research-kit/commit/e77e7c6d804f4ef921bb3abd7d770ce179213871))
- docs: test copper foil turnaround counter-thesis ([4191501](https://github.com/ray5273/kr-research-kit/commit/4191501296d3dc8a8d329b835fcd811605a7b1a1))
- Add voice-matched copper foil blog draft ([41e761d](https://github.com/ray5273/kr-research-kit/commit/41e761dab1c1b1b7cdbdcdc874676723895e0ece))
- feat: add Korean finance slide clarity skill ([3f3eb07](https://github.com/ray5273/kr-research-kit/commit/3f3eb07f37b2c2bfcc6efab78963f3bc3afe202b))
- feat: add kr-chatgpt-review for web-ChatGPT logic review ([1f32614](https://github.com/ray5273/kr-research-kit/commit/1f326142a6b6339af94e33b9f97ebb949814aada))
- Add Trinity Airways recovery decision memo ([260c004](https://github.com/ray5273/kr-research-kit/commit/260c004acdd5889dc9b067b34e89ea4333bd657c))
- Add Jeju Air decision memo and Trinity comparison ([f848b05](https://github.com/ray5273/kr-research-kit/commit/f848b05419754010d9b336c109a31cdecf087186))
- Clarify LCC liquidity and equity funding risk ([cb36e9b](https://github.com/ray5273/kr-research-kit/commit/cb36e9b07bb31b01d1a9b63e66631ae96d38c748))
- Document Trinity Airways route profit disclosure limits ([e5d4a71](https://github.com/ray5273/kr-research-kit/commit/e5d4a718d129702766d58770c64b3745080d92ef))
- docs: review Trinity route profitability in broker research ([844c390](https://github.com/ray5273/kr-research-kit/commit/844c390e0c26d05d0756ccfa69664f4d7c091002))
- docs: analyze Everpure share-price catalysts and NAND costs ([a8f353d](https://github.com/ray5273/kr-research-kit/commit/a8f353d83c7f585578b913ed93d3cf5e9b7d6bbe))
- docs: examine Everpure cash recovery and stock compensation ([4b22dcf](https://github.com/ray5273/kr-research-kit/commit/4b22dcf4a292183dcc5b67325be1dfa2efc2967e))
- docs: prepare Everpure Naver blog draft with cash and SBC analysis ([fa83602](https://github.com/ray5273/kr-research-kit/commit/fa836028be31e707eb035af3a73379b1847f1f53))
- docs: add KR Research Kit listing copy, logo, and historical demo ([a420112](https://github.com/ray5273/kr-research-kit/commit/a42011262a3d6e6519cafa4ebf6374cab9e932fc))
- feat: automate versioning and GitHub releases on main ([a4ce556](https://github.com/ray5273/kr-research-kit/commit/a4ce556071a551fe8f805ee1af468e8212fe9f49))
- fix: install Pillow for release validation on GitHub runners ([0fc2ece](https://github.com/ray5273/kr-research-kit/commit/0fc2ecec7b20ccb861749d94b298489b9670409f))
- fix: use bundled Korean font for release validation ([5375918](https://github.com/ray5273/kr-research-kit/commit/5375918e9cea0dc63f0d493bddbf34f977e1f91d))

## [0.2.0] - 2026-07-05

### Added
- `skills/kr-portfolio-guard/` — 실보유 포트폴리오 주간 가드. 메모 트리거·가격 레벨·SMA20/60·RSI14·MACD·신규 DART 공시를 자동 감시해 한 화면 ACTION NEEDED 리포트를 만들고, 플래그마다 SELL/HOLD/ADD/REVIEW/DEFER 결정을 로컬 결정 장부(ndjson)에 강제 기록한다. 이후 KOSPI/S&P500 대비 채점을 위한 에피소드 채점·포지션 사이징 가이드 산식 포함(테스트 39종).
- 가드 2단 아키텍처: 로컬 스케줄(주간)이 수집·플래그 산출까지, Claude 세션이 토론·결정 마감을 담당. 실보유 데이터는 리포 밖 private 디렉토리 전용(`KR_PORTFOLIO_GUARD_HOME`).
- `scripts/harness.js --mode guard` — 가드 픽스처 테스트 + 오프라인 드라이런 E2E.
- `kr-stock-analysis` 메모 출력 스펙에 기계판독 Decision Block(guard-decision 펜스) 표준 추가 — 신규 메모는 가드가 파싱 없이 트리거를 읽는다.
- `docs/designs/kr-portfolio-guard.md` — CEO/Eng 리뷰를 통과한 설계 문서.

### Changed
- `fetch-kr-chart.js` — 미국 티커(GOOG 등)·지수 심볼(^KS11, ^GSPC) 패스스루 지원(숫자 KRX 코드만 .KS/.KQ 자동 접미), 배당·분할 조정 종가(adjClose) 필드 추가, 30초 타임아웃·리다이렉트 상한, 모듈 export.
- `portfolio-snapshot.js` — SMA/RSI 계산 함수 export (가드가 재사용).

### Fixed
- KR 데일리 뉴스 렌더가 `newsRankScore` 미정의로 항상 실패하던 문제 — KR 스코어링 의미론(중요도 점수 단일 축)에 맞게 구현·export.
- 차트 생성이 `volume20Series`/`volume60Series` 미노출로 전면 실패하던 회귀(거래량 이동평균 오버레이 도입 시 소비 코드만 추가됨) — technical-core에서 시리즈 노출.

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
