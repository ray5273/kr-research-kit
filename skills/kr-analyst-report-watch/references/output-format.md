# Output Format

## Markdown

Write Markdown to `analysis-example/kr-reports/report-watch-<mode>-YYYY-MM-DD.md` with these sections:

1. `# Korean Analyst Report Watch - <mode> - YYYY-MM-DD`
2. `## 기준일 / 모드 / 수집 범위`
3. `## Executive Brief`
4. `## Top Narrative Changes`
5. `## Report Digest`
6. `## Topic-by-Topic Changes`
7. `## Source Quality / Gaps`
8. `## Sources`

Rules:

- Keep report summaries paraphrased.
- Show broker, date, title, source site, topic key, and narrative delta label for each digest item.
- Use source URLs in the Sources section, not embedded long URLs throughout the digest.
- Include a note when no prior same-topic artifact exists.

## JSON

Write JSON to `analysis-example/kr-reports/report-watch-<mode>-YYYY-MM-DD.json` with this shape:

```json
{
  "schemaVersion": 1,
  "skill": "kr-analyst-report-watch",
  "mode": "daily",
  "asOfDate": "YYYY-MM-DD",
  "generatedAt": "ISO-8601",
  "sourceScope": "Korean securities reports",
  "collection": {
    "lookbackDays": 1,
    "maxReports": 10,
    "sources": ["hankyung", "naver"],
    "rawReportCount": 0,
    "dedupedReportCount": 0
  },
  "reports": [],
  "topicChanges": [],
  "sourceQuality": {
    "accessiblePdfCount": 0,
    "loginGatedCount": 0,
    "extractedTextCount": 0,
    "warnings": []
  }
}
```

Each `reports[]` item must include report metadata, `topicKey`, `summary`, `narrative`, `priorComparison`, `narrativeDeltaLabels`, and source URLs. `topicChanges[]` groups the same deltas by topic.
