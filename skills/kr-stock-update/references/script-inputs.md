# Script Inputs

## `scripts/extract-report-baseline.js`

Run:

```text
node scripts/extract-report-baseline.js --input "analysis-example/kr/LG CNS/memo.md"
```

This script reads an existing markdown memo and emits a JSON baseline with:

- title
- company name
- memo date from `기준일`
- recent update date from `최근 업데이트일` when present
- existing update dates and parsed update blocks, including old-style headings
- existing source URLs
- existing event keys
- fixed section snapshots for `Decision Frame`, `Summary`, `DART Recheck`, `Street / Alternative Views`, `Decision-Changing Issues`, `Structured Stance`, `Follow-up Research Prompts`, and `Update Log`
- parsed DART recheck table rows when present
- parsed `guard-decision` / `Decision Block` trigger and review date when present
- stale-section audit hints
- linked chart/valuation assets
- sibling artifacts in the company folder
- a short summary excerpt
- an inferred ticker when it can be discovered from source links

## `scripts/normalize-update-log.js`

Run:

```text
node scripts/normalize-update-log.js --input update.json
node scripts/normalize-update-log.js --input update.json --report "analysis-example/kr/LG CNS/memo.md"
```

Legacy v1 JSON is still accepted:

```json
{
  "date": "2026-03-27",
  "whatHappened": [
    "The company reported a new shareholder return policy."
  ],
  "whyItMatters": [
    "This improves capital allocation credibility."
  ],
  "whatChangedInThesis": [
    "The downside from treasury-share overhang is lower than before."
  ],
  "whatDidNotChange": [
    "End-market demand uncertainty remains the bigger driver."
  ],
  "signalsToWatchNext": [
    "Whether the cancellation is executed rather than only announced."
  ],
  "sources": [
    {
      "label": "DART treasury-share cancellation filing",
      "url": "https://example.com/filing",
      "date": "2026-03-27"
    }
  ]
}
```

Preferred v2 JSON:

```json
{
  "date": "2026-03-27",
  "mode": "hybrid",
  "classification": "refresh-now",
  "thesisDelta": "weaker",
  "events": [
    {
      "key": "earnings-2026q1",
      "label": "1Q26 earnings miss",
      "date": "2026-03-27",
      "materiality": "high"
    }
  ],
  "whatHappened": [
    "The company reported weaker-than-expected 1Q26 margins."
  ],
  "whyItMatters": [
    "The update directly tests the memo's margin normalization claim."
  ],
  "whatChangedInThesis": [
    "Margin recovery is less certain until mix and utilization improve."
  ],
  "whatDidNotChange": [
    "The balance-sheet risk framing remains unchanged."
  ],
  "followUpResolutions": [
    {
      "question": "Can margins normalize in the next two quarters?",
      "status": "partially resolved",
      "evidence": "The new filing identifies mix pressure but not customer concentration."
    }
  ],
  "dartRecheck": [
    {
      "claim": "Margin recovery is underway",
      "status": "partially supported",
      "note": "Revenue improved, but operating margin did not."
    }
  ],
  "signalsToWatchNext": [
    "Whether the next filing confirms utilization recovery."
  ],
  "sources": [
    {
      "label": "DART quarterly report",
      "url": "https://example.com/filing",
      "date": "2026-03-27",
      "role": "primary filing"
    }
  ]
}
```

Behavior:

- Without `--report`, the script prints a normalized markdown block.
- With `--report`, the script updates the target memo in place:
  - refreshes or inserts `최근 업데이트일`
  - creates `## Update Log` if missing
  - replaces the same-date update block if it already exists, including old-style headings such as `### YYYY-MM-DD`
  - otherwise appends a new dated block

## `scripts/apply-memo-section-updates.js`

Run:

```text
node scripts/apply-memo-section-updates.js --report "analysis-example/kr/LG CNS/memo.md" --input section-updates.json
node scripts/apply-memo-section-updates.js --report "analysis-example/kr/LG CNS/memo.md" --input section-updates.json --allow-insert
```

Expected JSON:

```json
{
  "sections": {
    "Summary": "Updated Summary section body only.",
    "Structured Stance": "Updated Structured Stance section body only.",
    "Follow-up Research Prompts": "Updated prompt list."
  }
}
```

Behavior:

- Replaces only allowed gated sections: `Summary`, `Structured Stance`, `Decision-Changing Issues`, `Follow-up Research Prompts`, `DART Recheck`, `Decision Frame`, `guard-decision`, and `Decision Block`.
- Refuses `Sources`, `Update Log`, unknown headings, and missing sections unless `--allow-insert` is set.
- Preserves the original `기준일`.
- Does not update `최근 업데이트일`; use `normalize-update-log.js` for that.
