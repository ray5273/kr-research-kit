---
status: HANDOFF_FOR_CLAUDE_REVIEW
---

# Handoff: kr-portfolio-guard Profit/Loss Loop Review

This file preserves the Codex plan for a follow-up Claude review. Claude should review the plan before implementation, challenge assumptions, and identify any missing failure modes.

## Context

The current `kr-portfolio-guard` direction is right: the memo should not just summarize a stock. It should convert research into monitored triggers, forced decisions, a decision ledger, and later scoring against benchmarks.

Codex review conclusion: the loop is close, but not complete enough to say the memo system fully helps maximize returns and reduce losses. The highest-priority gap is not memo length or prose quality. It is closing the decision and scoring loop.

## Codex Plan

### 1. Harden `ledger-append.js`

- Validate everything before writing to `decision-ledger.ndjson`.
- If `qty_change` would make position quantity negative, fail before writing any ledger row.
- By default, trade decisions must have a matching `flags-latest.json` flag and a usable `price_at_decision`.
- Add explicit escape hatch: `--allow-missing-context`.
- When the escape hatch is used, mark the entry with `context_status: "manual_unverified"` so later scoring/reporting does not treat it like a normal verified decision.

### 2. Add `score-ledger.js`

New CLI:

```bash
node skills/kr-portfolio-guard/scripts/score-ledger.js [--private-dir DIR] [--as-of YYYY-MM-DD]
```

Expected behavior:

- Read `decision-ledger.ndjson`.
- Exclude superseded decisions.
- Score active `HOLD`, `ADD`, and `SELL` decisions over configured horizons, defaulting to 1w/4w/12w.
- Use adjusted close for scoring.
- Use market-matched benchmarks: KR → `^KS11`, US → `^GSPC`.
- Score `SELL` as avoided loss by flipping the sign of excess return.
- Do not score `REVIEW` or `DEFER`; report follow-through status only.
- Include `n` in every aggregate and show the `n<30` disclaimer.

### 3. Extend guard harness

- Keep `node scripts/harness.js --mode guard` as the single offline verification path.
- Add fixture coverage for ledger scoring dry-run.
- Keep tests network-free and private-data-free.

## Claude Review Requests

Please review specifically for:

- Whether `--allow-missing-context` is the right escape hatch, or whether manual entries should use a separate command.
- Whether `context_status: "manual_unverified"` is sufficient to prevent polluted scoring.
- Whether `score-ledger.js` should write a persistent report file or only print Markdown/stdout in v1.
- Whether benchmark fetch failures should skip scoring, mark `DATA_GAP`, or fail the whole run.
- Whether non-price triggers should be promoted into PENDING flags in this same implementation or left as a follow-up.

## Acceptance Criteria

- `node scripts/harness.js --mode guard` passes.
- A negative `qty_change` never leaves a ledger row behind.
- A missing or stale `flags-latest.json` blocks normal trade-decision recording.
- Manual unverified entries are clearly marked and excluded or separately bucketed in scoring.
- Scoring output includes 1w/4w/12w results, market benchmark comparison, decision-type handling, and `n<30` warning.

## Out of Scope

- Automatic broker integration.
- Cloud scheduling.
- Web UI.
- Fully automated semantic judgment for non-price triggers.
- Publishing or committing private portfolio data.
