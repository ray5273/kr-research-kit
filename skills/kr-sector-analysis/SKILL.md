---
name: kr-sector-analysis
description: Write Korea-focused sector and industry research in Korean. Use when the user wants a Korea sector quick brief or a full sectioned report covering market definition, market landscape, drivers, constraints, value chain, regulation, technology shifts, public-company mapping, opportunities, and risks. Use this after scoping or data-pack work when possible.
---

# Korean Sector Analysis

Use this skill to write the final Korea sector brief or report.

## Quick Start

- Treat market metrics, policy changes, regulations, company exposure, and industry news as time-sensitive.
- Prefer using a scoped brief from `kr-sector-plan` and a fact pack from `kr-sector-data-pack` before drafting.
- Route the output mode early.
  - `quick brief` for compact decision support
  - `full report` for longer sectioned research
- If the workspace is writable, create or update `analysis-example/kr-sector/<sector>.md`.
- State an explicit `기준일` in the memo and keep each metric block honest about its source date.

## Workflow

1. Lock the mode.
   `quick`, `brief`, `한페이지`, and `요약` requests map to `quick brief`. Broader market-structure requests map to `full report`.
2. Load prior work.
   Reuse the planning brief and data pack when available instead of re-scoping from scratch.
3. Refresh material facts.
   Verify the latest policy, market, and company facts that matter for the conclusion.
4. Build the report.
   Separate verified facts from inference and keep section boundaries clean.
5. Write the file deliverable.
   Keep the markdown report synchronized with the final answer.

Read [references/workflow.md](references/workflow.md) for the analysis checklist.
Read [references/output-format.md](references/output-format.md) for the default report shapes.

## Operating Rules

- Open every brief and report with a `한줄요약` line directly under the title: one sentence of at most 50 characters that states the conclusion. See `references/output-format.md`.
- Prefer official Korea sources first.
- State when the sector has no clean Korea-only market-size figure in the current source set.
- Distinguish direct exposure from thematic or second-order exposure when mapping listed companies.
- Do not force Mordor-style subsections when the source set cannot support them.
