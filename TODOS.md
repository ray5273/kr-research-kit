# TODOS

## Portfolio Guard (kr-portfolio-guard)

### E4: 일간 미니 가드

**What:** 가격 트리거·신규 공시만 점검하는 일간 경량 스케줄 실행 (주간 가드의 축소판).

**Why:** 주간 주기가 놓치는 급락·공시 이벤트를 보완. 트리거 발동 감지 지연을 최대 1일로 단축.

**Context:** 2026-07-04 CEO 리뷰 체리픽에서 연기(D15.4). guard-sweep.js를 그대로 재사용하고 점검 범위만 축소(가격 트리거 + NEW_FILING). day 1 주간 스케줄(OV10)이 확정되어 스케줄 인프라는 이미 존재 — 주기만 추가하면 됨.

**Effort:** S
**Priority:** P2
**Depends on:** 주간 가드 2주 안정화

### 크로스-프로세스 파일 락

**What:** decision-ledger/state.json/portfolio.json 갱신에 단순 lockfile(또는 ndjson O_APPEND) 도입.

**Why:** 두 세션(또는 세션+스케줄 스윕)이 동시에 쓰면 read-modify-write 경합으로 한쪽 기록이 조용히 유실될 수 있음. 적대적 리뷰(2026-07-05) INVESTIGATE 판정.

**Context:** 싱글 유저 주간 케이던스라 실발생 확률은 낮고, 장부 유실 외 항목은 다음 스윕에서 자가 치유. SKILL.md에 운영 회피 노트 있음.

**Effort:** S
**Priority:** P2
**Depends on:** 가드 v1 운영 경험

### 분할·배당 시 지표 오염 방어

**What:** CORP_ACTION_CHECK를 since-last-run 윈도우가 아닌 지표 룩백 전 구간으로 확장하거나, SMA/RSI/MACD 계산을 adjClose 기반으로 전환(트리거 대조는 원가 유지).

**Why:** 마지막 실행 윈도우 밖에서 발생한 분할이 SMA60/RSI에 불연속을 남겨 허위 SMA_DEV/RSI 플래그 또는 억제를 유발. 적대적 리뷰(2026-07-05) INVESTIGATE 판정.

**Effort:** M
**Priority:** P2
**Depends on:** 실데이터에서 오탐 사례 확보

### E5: NO_MEMO 보유종목 quick-memo 자동 제안

**What:** 가드가 NO_MEMO 플래그 보유종목에 대해 kr-stock-analysis 퀵뷰 생성을 제안(또는 실행)해 트리거·스탠스를 만들어줌.

**Why:** 가드 커버리지 100% 달성. 현재 확인된 실보유(솔루스첨단소재)가 memo.md 없이 proxy 루틴 산출물만 있는 정확히 이 케이스.

**Context:** 2026-07-04 CEO 리뷰 체리픽에서 연기(D15.5). v1은 NO_MEMO를 커버리지형 플래그(1회 ack)로 상기만 시킴. 퀵뷰 생성은 기존 kr-stock-analysis 수동 호출로 가능 — 자동화만 미룸.

**Effort:** M (CC 기준 S)
**Priority:** P2
**Depends on:** 가드 v1 + NO_MEMO ack 운영 경험

## Korean Stock Orchestrator

### Auto-suggest comparison candidates when thesis is ambiguous

**What:** Add a rule that lets the KR orchestrator suggest up to two comparison names when single-name analysis alone is not enough.

**Why:** Some investment decisions stay fuzzy until the user sees the company against the most relevant alternative, even when the user did not explicitly ask for a compare.

**Context:** The first KR orchestrator version keeps comparison opt-in by default. A later iteration should add a narrow trigger for "comparison recommended" without turning the workflow into a wide screener. The trigger should stay conservative, cap the peer count at two, and only fire when the memo still has unresolved decision-changing ambiguity after the single-name pass.

**Effort:** M
**Priority:** P2
**Depends on:** KR orchestrator v1 with memo-canonical follow-up flow

---

## Naver Blog Pipeline

### Quality gate: enforce blog citation for Naver-pass memos

**What:** When the quality gate runs on a memo whose brief had `Naver blog pass: yes`, check that at least one Naver blog post URL appears in the memo body.

**Why:** Without enforcement, the planner can route a Naver pass that produces artifacts but the memo writer silently ignores them. The gate should catch this.

**Context:** Deferred until real end-to-end runs confirm the pipeline works reliably. Premature enforcement risks false negatives on memos where Naver posts were reviewed but legitimately excluded.

**Effort:** S
**Priority:** P1
**Depends on:** Naver orchestration integration landed

### Validate naver-insights.md row format before data-pack ingestion

**What:** Add a lightweight format check in the data-pack ingestion path to verify that naver-insights.md entries have the expected structure (date, snippet, URL) before adding rows to the External Views table.

**Why:** If the summarize-insights script produces malformed output, the data-pack silently ingests garbage rows. A format check catches this early.

**Effort:** S
**Priority:** P2
**Depends on:** Naver orchestration integration landed

### Freshness-weighted blogger ranking

**What:** Extract post dates from `PostSearchList.naver` snippets and apply a freshness decay to `relevantPostCount` during ranking (within 30d → 1.0, 30–90d → 0.7, 90–180d → 0.4, >180d → 0.1).

**Why:** Current B1 ranking treats a blogger who posted 10 times two years ago the same as one posting 6 times this month. For memos driven by current sentiment, freshness should dominate.

**Context:** Deferred from the B1-first plan after in-blog search replaced the PostList heuristic. Only worth doing once we see real ranking errors caused by stale coverage.

**Effort:** M
**Priority:** P2
**Depends on:** Reliable date extraction from PostSearchList snippets

### Dead-blog filter for blogger discovery

**What:** Drop candidates whose most recent post is older than 180 days before the per-blog search loop runs.

**Why:** Cheap gate, no extra fetches. Keeps the candidate pool focused on active coverers.

**Effort:** S
**Priority:** P2
**Depends on:** Freshness-weighted ranking (shares the date extraction)

### Blog profile metadata scrape

**What:** Visit `https://blog.naver.com/<blogId>` for each qualified blogger and extract display name, blog title, subscriber count, and category list. Populate the currently-null fields in the output JSON.

**Why:** Reporting improvement, not a ranking fix. Reviewers currently see bare blog IDs with no context about who the blogger is or how big their audience is.

**Effort:** M
**Priority:** P2
**Depends on:** None

### Automated test for --with-blog harness composition

**What:** Add a dry-run test case that verifies `--mode all --with-blog` composes chart + blog + gate in the correct order and skips blog gracefully when `--ticker` is missing.

**Why:** The harness has no formal test infra yet. When it gets one, this composition path should be covered.

**Effort:** S
**Priority:** P2
**Depends on:** Harness test infrastructure

## Completed
