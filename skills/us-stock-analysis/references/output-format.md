# Output Formats

## 한줄요약 (Required In Every Memo)

Every memo, whatever its shape, opens with one summary line directly under the `#` title, before the date line and before the first `##` section:

```md
# <company> memo

- 한줄요약: 순현금이 하방을 받치지만 트래픽 회복 전까지는 관망한다.
- 기준일: YYYY-MM-DD
```

- One sentence of at most 50 characters. State the conclusion, not the topic, and do not restate the title.
- Use only facts and judgments the memo itself supports. No buy/sell wording.
- The site uses this line as the list card and search summary and as the meta description, so it must read on its own, without a leading "그러나" or an unexplained number.
- When a later update changes the conclusion, rewrite this line too.

## Default Single-Stock Memo

Use this shape unless the user asks for something else:

If the workspace is writable, write this memo to `analysis-example/us/<company>/memo.md` and keep the file in sync with the final answer.

1. Summary
   Give the conclusion in 2-4 sentences and state the "as of" date.
2. Business and Thesis
   Explain what the company does, what drives value, and the core thesis.
3. What The Latest Results Say
   Pull the most relevant facts from the latest filing or earnings package.
4. Valuation
   Use one or two sensible valuation lenses and say what they imply.
5. Catalysts
   List the next few events or conditions that could change the market view.
6. Risks
   List the main downside cases and what evidence would support them.
7. What Would Change My Mind
   State concrete conditions that would flip the view.

For U.S. growth or value stocks, add a short "Style-Specific Checks" subsection before catalysts.
For ETFs, add a short "Fund Construction and Exposure" subsection before catalysts.

## Quick Compare

Use a short table or bullet set with:

- Business quality
- Growth quality
- Balance sheet
- Valuation
- Catalysts
- Risks
- Bottom-line ranking

## Pre-Earnings Note

Keep it compact:

1. Event setup and exact date
2. Numbers or comments that matter most
3. Expectations versus prior guidance
4. Bull and bear read-through
5. Post-print watch items

## Post-Earnings Note

Use:

1. What happened
2. What surprised positively or negatively
3. Whether the stock move looks justified
4. What changed in the thesis
5. What to watch next

## Tone

- Be direct and analytical.
- Distinguish facts from inference.
- Avoid hype language.
- Avoid personalized financial advice unless the user explicitly asks for it and provides the needed constraints.
