# Memo Transformation Rules

## Section policy

- Preserve the investment thesis, disclosed figures, contrary views, valuation, catalysts, risks, chart references, and sources.
- Exclude `Research Brief`, `Update Log`, `Follow-up Research Prompts`, and internal file links.
- Keep DART findings inside the narrative section where they support a claim.
- Preserve dates, signs, units, ratios, ticker symbols, and source URLs verbatim.
- Preserve Markdown tables when the row/column structure carries scenario, comparison, valuation, checklist, or source-mapping meaning.

## SmartEditor color emphasis

- Preserve Markdown tables as tables for scenario, comparison, valuation, and checklist content. Do not flatten them into bullets when the row/column structure carries the meaning.
- Use bold emphasis for investment-significant phrases that should be colored in SmartEditor.
- Positive or thesis-improving phrases should render as red bold. Examples: 긍정, 저평가, 순현금, 배당, 리레이팅, 부가가치, 의미가 커진다, 반복 판매, 손익계산서에 보일 수 있는 규모.
- Negative or thesis-weakening phrases should render as blue bold. Examples: 제한적, 리스크, 하락, 악화, 과소추정, 잘못 본다, 그칠 것, 낮은 수수료, 확산이 없다면.
- Neutral stance phrases should render as brown bold. Examples: 중립적 관찰, 스탠스, 판단, 검토.

## Blog shape

- Use a personal investment-research voice, not promotional copy.
- Build the title as `회사명 | 핵심 투자 쟁점 | 기준일`.
- Add company, ticker, `주식분석`, and deduplicated thesis keywords as tags.
- Keep linked PNG charts in memo order and fail if a relative path does not resolve to a real file.
- End with the exact basis date, source section, and a statement that the post is not a recommendation to buy or sell.

The deterministic converter applies the structural rules. Review `naver-post.md` before preparing when tone or section transitions need editorial changes; rerun the converter after any source memo change so hashes stay aligned.
