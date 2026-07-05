---
name: kr-trade-flow-analysis
description: Normalize Korean and global trade-flow CSV data and use it with DART disclosures, peer results, and disclosed contracts to infer export-driven revenue or shipment changes for KRX-listed companies when customer, geography, or product mix is not separately disclosed. Use for Korean stock work where HS code, destination country, port/region, plant cluster, or customs data may proxy undisclosed end demand. Always separate confirmed disclosures from Trade Flow Inference.
---

# Korean Trade Flow Analysis

Use this skill to build a source-dated proxy analysis for Korean companies whose customers, destination mix, or product mix are not fully disclosed. The skill is evidence support, not a replacement for DART or company filings.

## Quick Start

- Start with user-provided or downloaded CSVs from 관세청 수출입무역통계, KITA, UN Comtrade, overseas official customs data, or a manual CSV.
- Normalize CSVs with `scripts/normalize-trade-flow.js` before interpreting them.
- Score the thesis with `scripts/score-trade-inference.js` when the user provides trade movement plus DART, peer, results, or contract evidence.
- If the workspace is writable, write company artifacts to:
  - `analysis-example/kr/<company>/trade-flow-data.json`
  - `analysis-example/kr/<company>/trade-flow-analysis.md`
- If the downstream memo uses the result, keep it in a `Trade Flow Inference` block. Do not write it as a DART-confirmed fact.

## Workflow

1. Define the proxy.
   Lock the company, product, HS code(s), destination country, shipment direction, and why that trade lane could map to the company.
2. Normalize the data.
   Run `normalize-trade-flow.js` on each CSV and preserve source type, source URL/file, period, HS code, partner, value, quantity, and unit.
3. Triangulate company attribution.
   Compare trade changes with DART/IR facts, peer results, plant or region constraints, disclosed supply contracts, and product-specific demand events.
4. Score confidence.
   Use the evidence ladder below. A strong investment assumption is allowed only when it is labeled as inference and supported by multiple independent checks.
5. Write the report.
   Use the standard output format, keep source dates visible, and list unresolved checks.
6. Hand off to stock skills.
   Feed the artifact into `kr-stock-data-pack` as `External Evidence` or `Revenue Mix Proxy`, and into `kr-stock-update` only as a dated `high-confidence inference` when it resolves a tracked mix/customer gap.

Read [references/workflow.md](references/workflow.md) for the detailed trade-lane mapping process.
Read [references/output-format.md](references/output-format.md) for the report shape.

## Evidence Grades

- `confirmed disclosure`: DART, KRX, official IR, or audited financial statements explicitly say it.
- `high-confidence inference`: trade-flow increase, peer divergence, company result change, and disclosed contract/economic scale all point the same way.
- `medium-confidence proxy`: direction is plausible, but value, volume, or company attribution remains loose.
- `weak proxy`: sector-wide or country-wide signal with no reliable company attribution.
- `contradicted`: trade-flow signal conflicts with filings, company results, or known customer/product facts.

## Bundled Scripts

- `scripts/normalize-trade-flow.js` converts 관세청/KITA-style, UN Comtrade-style, or manual CSV files into a shared JSON row schema.
- `scripts/score-trade-inference.js` scores a structured thesis packet and emits confidence, supporting factors, contradictions, and required labels.
- Run all bundled scripts with `node`.

## Operating Rules

- Prefer primary sources for official facts: DART, KRX disclosures, company IR, official trade-stat providers, and official overseas customs data.
- Keep trade-stat source dates separate from filing dates and market data dates.
- State when a product, customer, destination, plant, or HS-code mapping is not separately disclosed.
- Do not infer revenue mix from a broad HS code without explaining contamination risk.
- Do not treat export value as company revenue unless the company, product, destination, and timing are independently tied.
- For battery-material work on 엘앤에프, exclude Tesla EV LFP from the L&F thesis unless separately evidenced. Track Samsung SDI / U.S.-bound ESS LFP as a separate thesis. For China NCM, a 1Q26 revenue increase plus peer non-increase plus disclosed contract-scale fit can support `high-confidence inference`, not `confirmed disclosure`.
