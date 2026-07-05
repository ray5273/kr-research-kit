# Output Format

Write `analysis-example/kr/<company>/trade-flow-analysis.md` in this shape unless the user asked for a narrower artifact.

```md
# <회사명> Trade Flow Analysis

기준일: <YYYY-MM-DD>
Data refresh:
- Trade data: <source/date/window>
- Company filings / IR: <source/date/window>
- Peer results: <source/date/window>

## Question
- Target claim:
- Decision relevance:

## Evidence Classification
| Claim | Grade | What is confirmed | What is inferred | Source role | Source/date |
| --- | --- | --- | --- | --- | --- |

## Trade Lane Definition
| Field | Value | Notes |
| --- | --- | --- |
| HS code(s) |  | contamination risk |
| Reporter / partner |  |  |
| Direction | export/import |  |
| Period |  |  |
| Unit | value / quantity / weight |  |

## Normalized Trade Flow
| Period | HS code | Partner | Direction | Value USD | Quantity | Unit | YoY / QoQ |
| --- | --- | --- | --- | ---: | ---: | --- | ---: |

## Triangulation
- `confirmed disclosure`: <DART/IR facts only>
- `Trade Flow Inference`: <company-specific inference and confidence label>
- Peer divergence:
- Contract-scale fit:
- Timing fit:
- Contradictions checked:

## Confidence Score
- Grade:
- Score:
- Supporting factors:
- Contradictions:
- Why this is not a confirmed disclosure:

## Thesis Notes
- Base read:
- Strong assumption allowed:
- What would upgrade confidence:
- What would downgrade or contradict it:

## Unresolved Checks
- ...

## Sources
- <label>, <date>, <URL or file path>, source role
```

For downstream stock memos, paste only the `Trade Flow Inference`, `Confidence Score`, and source rows needed for the decision. Keep raw tables in this standalone artifact.
