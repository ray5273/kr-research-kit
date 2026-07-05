# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- `manifest.json` — project-level descriptor for marketplace catalogs (KrResearchKit v0.1.0, 23 KR skills, tiered featured/standalone/bundle).
- `.claude-plugin/plugin.json` — Claude Code plugin manifest (`kr-research-kit`, MIT, keywords for discoverability).
- `.claude-plugin/marketplace.json` — self-hosted Claude Code marketplace manifest. Users can install via `/plugin marketplace add ray5273/kr-research-kit`.
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
