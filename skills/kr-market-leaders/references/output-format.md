# Output Format

Markdown report sections:

1. `# KRX Market Leaders - <YYYY-MM-DD>`
2. Metadata table: 기준일, 생성시각, universe size, eligible count, failed fetch count, cache path.
3. Market backdrop: KOSPI/KOSDAQ 1D/7D/30D/60D returns where available.
4. `## 1D/7D 단기 주도주`
5. `## 30D/60D 중기 주도주`
6. `## 120D/252D 구조적 주도주`
7. `## Composite Leaders`
8. `## Interpretation`
9. `## Limitations`

Each leader table should include:

- rank
- ticker
- name
- market
- 1D, 7D, 30D, 60D, 120D, 252D return
- RS percentile
- volume ratio
- 52-week high proximity
- leadership label
- data-quality note

JSON output should include:

- `date`
- `generatedAt`
- `sourceCachePath`
- `universe`
- `marketBackdrop`
- `rankings.shortTerm`
- `rankings.intermediate`
- `rankings.structural`
- `rankings.composite`
- `entries`
