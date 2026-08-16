---
name: kr-stock-plan
description: Scope Korean stock research before drafting. Use when the user needs to pin the exact KRX-listed company, share class, time horizon, comparison set, event frame, user question priority, or output mode before routing into a Korean stock decision memo, quick view, pre-earnings note, post-earnings note, or pair compare. Do not use for the final memo itself.
---

# Korean Stock Plan

Use this skill to turn a vague Korean stock request into an execution-ready brief and, unless the user explicitly wants planning only, orchestrate the downstream Korean stock workflow in the same turn.

For Korean single-name work, this is the default entry point. It should decide whether the request is:

- a new decision memo
- a follow-up question against an existing memo
- a dated update that needs new post-memo disclosures, IR material, or news

## Quick Start

- Define the exact security first: ticker, market, ordinary versus preferred line, and whether the listing is an operating company or holding company.
- Lock the output mode early: `quick view`, `full memo`, `pre-earnings note`, `post-earnings note`, or `pair compare`.
- Ask what the user actually needs before locking the brief. At minimum confirm decision goal, horizon, output depth, the user's priority question, and whether filing precision, valuation, chart, peer compare, contract-detail, or order-backlog work is required.
- Apply the order-driven-company gate for every operating company. If the result is `yes`, route through `kr-stock-dart-analysis` and `kr-order-backlog-analysis`; a quantitative DART/KRX amount makes the backlog PNG mandatory.
- Keep the deliverable to planning. Do not drift into unsupported numbers or a full thesis write-up.
- If the user invoked `kr-stock-plan` as the entry point for a real stock task, do not stop after the brief. Use the brief to route automatically into `kr-stock-dart-analysis`, `kr-stock-data-pack`, and `kr-stock-analysis` as needed unless the user explicitly asked to stop at the brief.
- Treat `analysis-example/kr/<company>/memo.md` as the canonical reusable artifact for non-planning work.
- Only write `analysis-example/kr/<company>/리서치브리프.md` when the user explicitly asked for planning only or asked to keep the brief itself as a reusable artifact.
- For a follow-up request, resolve the existing memo first and classify the work as `answer-now`, `refresh-now`, `wait-for-event`, or `ask-user` before routing further. Compatibility aliases: `memo-only` maps to `answer-now`; `refresh-needed` maps to `refresh-now`.

## Workflow

1. Normalize the security target.
   Resolve the exact listing, share class, and structure another agent should analyze.
2. Confirm user needs.
   Ask the shortest clarifying set needed to lock the user goal, decision frame, deliverable depth, user-priority question, and must-answer questions.
3. Decide the entry state.
   Classify the task as `planning only`, `fresh memo`, `follow-up on existing memo`, or `dated update`.
4. Define the research boundary.
   Pin the horizon, comparison set, catalysts, and whether chart or valuation work is required.
5. Route the output mode.
   Choose `quick view`, `full memo`, `pre-earnings note`, `post-earnings note`, or `pair compare`.
6. State the key questions.
   List what the downstream analysis must answer and what can stay out of scope.
7. Decide outside-views routing.
   Apply the outside-views decision gate from `references/workflow.md` to decide whether a Naver blog pass should run before `kr-stock-data-pack`. Record the decision in the brief as `Naver blog pass: yes / no / deferred` with a one-line reason.
7b. Decide analyst-report routing.
   Apply the analyst-report decision gate from `references/workflow.md` to decide whether a sell-side pass (`kr-analyst-report-discover` → `kr-analyst-report-fetch` → `kr-analyst-report-insight`) should run before `kr-stock-data-pack`. Record the decision in the brief as `Analyst report pass: yes / no / deferred` with a one-line reason.
7c. Decide order-backlog routing.
   Apply the order-driven gate from `references/workflow.md`. Record `Order-driven company: yes / no / deferred` and `Order-backlog route: yes / no / deferred`. When both the route and a quantitative DART/KRX amount are available, require `order-backlog-data.json`, `order-backlog-analysis.md`, and `assets/<company>-order-backlog.png`.
8. Hand off cleanly.
   Produce a short research brief that routes the work across `kr-stock-dart-analysis`, `kr-order-backlog-analysis`, `kr-analyst-report-*`, `kr-naver-*`, `kr-stock-data-pack`, and `kr-stock-analysis` as needed.
9. Continue automatically when appropriate.
   If the user asked for analysis rather than planning-only, execute the routed downstream skills immediately in the same turn instead of requiring the user to invoke each one manually. Include the analyst-report chain in the routed execution when the gate recommends it.

Read [references/workflow.md](references/workflow.md) for planning rules.
Read [references/output-format.md](references/output-format.md) for the required brief shape.

## Operating Rules

- Prefer narrowing the target over pretending the listing structure is obvious.
- Separate user intent from your assumptions.
- Ask clarifying questions before drafting the brief whenever the user goal, deliverable shape, or must-answer questions are still unclear.
- Flag where ordinary shares, preferred shares, holding companies, or operating subsidiaries could change the interpretation.
- Avoid numeric estimates at this stage unless the user explicitly asked for a scoping estimate and provided a source.
- When latest filing precision is likely to be thesis-critical, explicitly route the downstream workflow through `kr-stock-dart-analysis` before `kr-stock-data-pack` or `kr-stock-analysis`.
- Do not classify a company as order-driven from sector membership alone. Require a contract/milestone revenue model plus an auditable backlog, contract-balance, remaining-performance, project-order, or material-contract disclosure path. Use `deferred` when DART coverage is incomplete.
- For `Order-driven company: yes`, route `kr-stock-dart-analysis -> kr-order-backlog-analysis` before `kr-stock-data-pack`. If a quantitative amount exists, the backlog chart is required even when only an `연도 미공시` official-total bar can be drawn; never invent yearly allocations.
- When independent Naver blog voices are likely to sharpen the memo, route the Naver pipeline (`kr-naver-blogger` → `kr-naver-insight`) before `kr-stock-data-pack` so the digest is ready for ingestion. See the outside-views decision gate in `references/workflow.md`.
- When sell-side consensus (target price, rating distribution, broker coverage) is likely to sharpen the memo, or the user explicitly asks about 컨센서스 / 증권사 리포트 / 애널리스트 TP, route the analyst-report pipeline (`kr-analyst-report-discover` → `kr-analyst-report-fetch` → `kr-analyst-report-insight`) before `kr-stock-data-pack` so the digest is ready for ingestion. See the analyst-report decision gate in `references/workflow.md`. The analyst-report pass and the Naver pass are independent — run both when both gates say yes; they feed different memo sections.
- Treat `kr-stock-plan` as the default orchestrator for Korean single-stock work. Unless the user explicitly requests planning only, carry the work forward yourself after the brief is locked.
- Resolve follow-up requests against `analysis-example/kr/<company>/memo.md` first. Only ask the user to restate the ticker or company when the target memo is missing or ambiguous.
- Keep the user question as a priority lens. If the user supplied a specific concern, the downstream memo should reorder emphasis around that concern instead of treating it as an appendix.
- Route `answer-now` (`memo-only`) follow-ups back into `kr-stock-analysis` with the existing memo as context. Route `refresh-now` (`refresh-needed`) follow-ups into `kr-stock-update` and only pull `kr-stock-dart-analysis` or `kr-stock-data-pack` again when new verification is needed. Route `wait-for-event` into a short trigger note and route `ask-user` into a clarifying question.
