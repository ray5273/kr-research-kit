# Memo Transformation Rules

## Section policy

- Preserve the investment thesis, disclosed figures, contrary views, valuation, catalysts, risks, chart references, and sources.
- Exclude `Research Brief`, `Update Log`, `Follow-up Research Prompts`, and internal file links.
- Keep DART findings inside the narrative section where they support a claim.
- Preserve dates, signs, units, ratios, ticker symbols, and source URLs verbatim.
- Preserve Markdown tables when the row/column structure carries scenario, comparison, valuation, checklist, or source-mapping meaning.
- Drop fenced code blocks. SmartEditor collapses every run of spaces inside a text component, so preformatted content such as an ASCII chart arrives as one ragged line. The source memo keeps the block; confirm its figures also appear in surrounding prose or a table.

## SmartEditor color emphasis

- Preserve Markdown tables as tables for scenario, comparison, valuation, and checklist content. Do not flatten them into bullets when the row/column structure carries the meaning.
- Wrap **the entire sentence** (not a single keyword) with a color marker when the sentence carries investment-significant tone. The publisher converts the marker into a colored SmartEditor span verbatim — there is no keyword auto-detection.
- `[red: ...]` for thesis-improving / positive sentences. 예) `[red: 자사주 소각으로 하방이 보강됐다.]`
- `[blue: ...]` for thesis-weakening / negative / risk sentences. 예) `[blue: 환율 변동성이 마진을 압박할 수 있다.]`
- `[brown: ...]` for speculative or inferential opinions. 예) `[brown: 수주 공백은 고객사의 투자 일정 조정 영향으로 추정된다.]`
- Use `**bold**` only for plain (uncolored) emphasis. It no longer triggers any color.
- If a sentence mixes positive and negative tone, split it into two clauses and wrap each in the matching marker, or leave the sentence plain. Do not wrap a single ambiguous sentence in one color.
- The marker body cannot contain `]`. If a sentence needs `]`, rewrite the sentence.
- When at least one `[red:]`, `[blue:]`, or `[brown:]` marker is present, the publisher adds this color-key line once as the first body block immediately after the title: `색상 안내 — 빨간색: 좋은 것 · 파란색: 안 좋은 의견 · 갈색: 추측성 의견`. Each labeled phrase uses its matching red, blue, or brown palette color. Posts without color markers are unchanged, and an existing identical legend is not duplicated.

## Blog shape

- Use a personal investment-research voice, not promotional copy.
- Build the title as `회사명 | 핵심 투자 쟁점 | 기준일`.
- Add company, ticker, `주식분석`, and deduplicated thesis keywords as tags.
- Keep linked PNG charts in memo order and fail if a relative path does not resolve to a real file.
- End with the exact basis date, source section, and a statement that the post is not a recommendation to buy or sell.

The deterministic converter applies the structural rules. Review `naver-post.md` before preparing when tone or section transitions need editorial changes; rerun the converter after any source memo change so hashes stay aligned.
