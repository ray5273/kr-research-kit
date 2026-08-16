# Script Inputs

## `scripts/render-order-backlog.js`

Run:

```text
node skills/kr-order-backlog-analysis/scripts/render-order-backlog.js \
  --input analysis-example/kr/<company>/order-backlog-data.json \
  --png-out analysis-example/kr/<company>/assets/<company>-order-backlog.png \
  --summary-out analysis-example/kr/<company>/order-backlog-chart-summary.json
```

The PNG renderer uses Pillow and a Korean system font. Install Pillow when needed:

```text
python -m pip install pillow
```

The chart's explanatory title text, legend, axes, date labels, capacity note, and footnote are rendered in Korean. Official company names, brands, product names, and unavoidable abbreviations retain their published spelling. Set `KR_BACKLOG_FONT` to a Korean TTF/TTC path when the renderer cannot find Apple SD Gothic Neo, Noto Sans CJK, Nanum Gothic, or Malgun Gothic.

Required JSON shape:

```json
{
  "schemaVersion": 1,
  "company": "샘플중공업",
  "chartCompany": "샘플중공업",
  "ticker": "000000",
  "asOf": "2026-03-31",
  "unit": "억원",
  "basis": "official-revenue-schedule",
  "scope": "연결 기준 공식 수주잔고",
  "sources": [
    {
      "title": "사업보고서 (2025.12)",
      "filingDate": "2026-03-20",
      "section": "매출 및 수주상황",
      "url": "https://dart.fss.or.kr/..."
    }
  ],
  "officialBacklog": 8500,
  "annualRevenue": 3000,
  "capacity": {
    "asOf": "2026-03-31",
    "display": "2026년 1분기 전력 생산능력 2,000억원 · 가동률 75.0%",
    "note": "금액 기준 생산능력이며 수주잔고와 직접 비교할 수 없음",
    "scope": "별도 전력부문, 공시상 금액 기준 생산능력",
    "sourceTitle": "분기보고서 > 생산능력 및 가동률",
    "sourceUrl": "https://dart.fss.or.kr/..."
  },
  "chartFootnote": "장기 운영계약은 설비 납기와 구분합니다.",
  "undisclosedAmountContracts": 0,
  "buckets": [
    { "label": "2026", "amount": 1800, "contractCount": 3, "status": "dated" },
    { "label": "2027", "amount": 2700, "contractCount": 4, "status": "dated" },
    { "label": "2044", "amount": 2100, "contractCount": 2, "status": "dated", "category": "long-term-service" },
    { "label": "연도 미공시", "amount": 1900, "contractCount": 1, "status": "undated" }
  ],
  "notes": ["연도 미공시 금액은 누적선에서 제외"]
}
```

Allowed `basis` values:

- `official-revenue-schedule`
- `official-contract-end-year`
- `contract-disclosure-maturity-proxy`
- `official-total-only`

Validation rules:

- `asOf` and every `filingDate` must use `YYYY-MM-DD`.
- `sources` must contain at least one DART/KRX source with title, filing date, and URL.
- `amount`, `officialBacklog`, and `annualRevenue` must be non-negative finite numbers when present.
- A dated bucket label must contain one four-digit year.
- An undated bucket must use `status: "undated"`.
- `category` is optional. Use `long-term-service` for long-duration operations or maintenance and `project` for ordinary equipment, EPC, and project-delivery amounts.
- `capacity` is optional, but when present it must contain a primary-source-backed Korean `display` string; keep `asOf`, scope, and source URL visible in the data.
- Use `chartCompany` only when the chart needs a source-backed public-facing label different from `company`. Preserve official Latin characters; do not use this field solely to transliterate them into Hangul.
- `official-total-only` must contain exactly one undated bucket; the renderer rejects synthetic year splits.
- `contract-disclosure-maturity-proxy` must include `disclosureWindow` with `from` and `to` dates.
- Keep raw amounts in one declared unit. Do not mix 원, 백만원, 억원, and 조원 in the same JSON.

The renderer writes a Korean-labelled PNG through Pillow. Its JSON summary reports the bucket sum, dated/undated split, final disclosed year, total dated amount, project-only cumulative amount, coverage ratio when comparable, and any reconciliation gap versus `officialBacklog`.
