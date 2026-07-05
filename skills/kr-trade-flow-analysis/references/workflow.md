# Workflow Reference

## Proxy Definition

Define the exact trade lane before reading it as company evidence:

- Product: material, component, finished good, or input.
- HS code: include code length and known contamination risk.
- Direction: export or import.
- Reporter and partner: country, destination, or origin.
- Region or port: only use when the source exposes it and the company has a plausible plant/logistics link.
- Period: monthly is preferred for event matching; quarterly is acceptable for earnings triangulation.
- Attribution hypothesis: why this lane could belong to the company rather than the whole sector.

## Source Priority

1. DART, KRX, official company IR, and audited financial statements for confirmed company facts.
2. Official trade statistics: 관세청 수출입무역통계, KITA Stat, UN Comtrade, overseas customs or trade-stat agencies.
3. Peer filings and earnings releases for divergence checks.
4. Disclosed supply contracts and amendments for scale checks.
5. Specialist media only for context, never as the sole proof of a trade-flow claim.

## Normalization

Run the normalizer once per source file:

```bash
node skills/kr-trade-flow-analysis/scripts/normalize-trade-flow.js \
  --source customs \
  --input raw-trade.csv \
  --output analysis-example/kr/<company>/trade-flow-data.json \
  --source-label "관세청 수출입무역통계" \
  --source-url "https://tradedata.go.kr/..."
```

Supported source modes:

- `customs`: Korean customs/KITA-style monthly HS, country, value, weight rows.
- `kita`: alias of the Korean customs layout with KITA-friendly header variants.
- `un-comtrade`: reporter, partner, HS, trade flow, value, quantity rows.
- `manual`: a minimal CSV with period, hs_code, partner, value_usd, quantity, and notes.

## Triangulation Checklist

Use the normalized rows to answer these checks in order:

1. Trade direction: Did value and physical quantity move in the same direction?
2. Timing: Did the move start before or during the revenue/margin change being explained?
3. Product fit: Does the HS code isolate the target product, or does it include unrelated products?
4. Destination fit: Does the partner country match the alleged customer/end-market route?
5. Company fit: Does the company have the relevant product capacity, plant location, or contract history?
6. Peer divergence: Did comparable Korean peers fail to show the same revenue or shipment acceleration?
7. Contract scale: Does disclosed contract value or capacity make the inferred trade value plausible?
8. Contradiction scan: Do filings, IR, or results explicitly reject the implied product/customer mix?

## Confidence Rules

- Assign `confirmed disclosure` only to facts explicitly found in DART/KRX/company material.
- Assign `high-confidence inference` when trade movement, company results, peer divergence, and contract-scale fit all support the same company-specific thesis.
- Assign `medium-confidence proxy` when trade movement and one supporting check align but attribution is incomplete.
- Assign `weak proxy` when only a broad sector or country export signal exists.
- Assign `contradicted` when the trade signal conflicts with company results, disclosed product mix, or explicit management commentary.

## Integration Notes

- `kr-stock-data-pack`: ingest `trade-flow-analysis.md` into `External Evidence` or `Revenue Mix Proxy`. Facts and inferences must remain separate rows.
- `kr-stock-update`: when an existing memo has unresolved customer/geography/product mix gaps, append the trade-flow result under `## Update Log` with its confidence label and source dates.
- `kr-stock-analysis`: use a standalone `Trade Flow Inference` subsection. Do not merge trade-flow claims into `DART Recheck` unless a filing explicitly confirms them.
