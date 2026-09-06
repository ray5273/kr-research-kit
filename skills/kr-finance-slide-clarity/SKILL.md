---
name: kr-finance-slide-clarity
description: Use with the presentations skill when creating, editing, or reviewing Korean-language finance, stock, investment-strategy, or portfolio PowerPoint/PPT decks for non-expert or mixed audiences. Do not use for general finance memos, blog posts, non-finance presentations, or decks explicitly designated for expert-only audiences.
---

# Korean Finance Slide Clarity

Make Korean financial slides understandable without changing their facts, calculations, or conclusions. Apply these instructions alongside the `presentations` skill and its normal render-and-verify workflow.

For review-only requests, report concrete wording suggestions without editing or exporting the deck. For edits, inspect existing explanations before adding new ones and preserve unrelated speaker notes and slide design.

## Audience

- Unless the user says otherwise, assume a non-expert or mixed audience.
- Do not automatically apply this skill when the user explicitly requests an expert-only deck. If the user explicitly invokes this skill for an expert audience, retain standard financial terminology and explain only ambiguous acronyms on first use.

## Rewrite terminology

Inspect titles, body text, tables, charts, legends, annotations, and footnotes for unexplained financial acronyms and specialist terms.

- Prefer an ordinary Korean expression that conveys the intended meaning.
- Resolve a term from the source definition, formula, and surrounding context before rewriting it. Never infer an acronym's expansion from its letters alone. If the meaning remains ambiguous, retain the original term and flag it for clarification; continue with unambiguous terms.
- If an acronym is not needed again, remove it from visible slide text.
- If an acronym must recur, introduce it once at its first visible use in the deck as `쉬운 표현(약어)`, then use the acronym consistently afterward.
- Repetition alone does not require an acronym: continue using a short Korean label when it fits. On partial-deck edits, check earlier slides for an existing introduction; if unavailable, state that first-use coverage could not be verified.
- Do not change numbers, units, dates, formulas, source attributions, thresholds, comparison bases, or investment judgments. Do not simplify wording in a way that changes the technical meaning.
- When an exact source-language term or definition is useful but would clutter the slide, preserve it in the slide's speaker notes under a `[Terminology]` block, with one term and its source-faithful definition per line. Do not add the block when it provides no useful information.

Use these mappings as preferred visible wording when they match the source meaning:

| Source term / context | Short visible label | Meaning to preserve in nearby copy or notes |
| --- | --- | --- |
| OOS / out-of-sample validation | 미사용 데이터 검증 | 전략 개발·선택·조정에 쓰지 않은 데이터에서 검증. 시간 구간 분할이면 “만들 때 쓰지 않은 기간에서 재검증”. 검증 성공이나 미래 성과를 뜻하지 않음. |
| DSR / Deflated Sharpe Ratio | 과대평가 보정 신뢰도 | 여러 후보 중 선택한 효과와 수익률 분포의 비정규성 등을 보정한 샤프지수의 통계적 유의성. 원문의 검정 기준을 보존하고 미래 성공 확률로 표현하지 않음. |
| DSR / debt service ratio | 소득 대비 원리금 상환 비율 | 연간 소득 대비 연간 대출 원금·이자 상환액의 비율. 백테스트의 DSR과 구분. |
| CAGR | 연평균 복리수익률 | 매년 같은 수익률로 복리 성장했다고 환산한 값. 연간 수익률의 단순 평균이 아님. |
| Sharpe | 변동성 대비 초과수익 | 무위험수익률을 뺀 수익과 수익률 변동성의 관계. 가격 수준의 변동이나 단순 수익률로 바꾸지 않음. 원문의 산식·무위험수익률 가정 유지. |
| MDD | 고점 대비 최대 하락률 | 해당 측정 기간의 고점에서 이후 저점까지 가장 크게 하락한 비율. 손실액이나 최대 하루 하락률과 구분하고 원문의 부호 유지. |
| Turnover / portfolio trading | 매매 회전율 | 원문의 측정 기간·분모·매수/매도 집계 방식을 유지. 연간 지표일 때만 “연간”을 붙이고 비율을 금액으로 바꾸지 않음. 다른 문맥의 turnover에는 이 치환을 적용하지 않음. |
| Slippage | 예상·체결 가격 차이 | 원문에서 정한 기준 가격과 실제 체결 가격의 차이. 거래 수수료와 구분하고 유리한 체결 가능성 및 부호 유지. |
| Tracking error / portfolio risk | 기준 대비 수익률 차이의 변동성 | 포트폴리오와 기준지수 수익률 차이의 표준편차. 단순 누적수익률 차이나 모델 예측오차와 구분. |
| `%p` | 퍼센트포인트 | 비율 사이의 차이를 나타내는 단위. 예: 2%p → 2퍼센트포인트. 2%로 바꾸거나 수치를 재계산하지 않음. |

Treat the table as wording guidance, not permission to replace a term when its local meaning differs. Preserve any more precise definition from the source in speaker notes when needed.

If a source uses a nonstandard definition, preserve its values and explicitly identify the source-defined meaning; flag a conflict instead of silently correcting the calculation. Useful definition references: [CFA Institute on risk-adjusted measures](https://rpc.cfainstitute.org/-/media/documents/code/gips/case-study-risk-adjusted-performance-measures.pdf), [original Deflated Sharpe Ratio paper](https://www.davidhbailey.com/dhbpapers/deflated-sharpe.pdf), and [금융위원회 DSR explanation](https://www.fsc.go.kr/po010106/73338?curPage=301&srchBeginDt=&srchCtgry=&srchEndDt=&srchKey=&srchText=). Consult only when the supplied material does not resolve the definition; these references do not supply current regulatory thresholds.

## Fit the slide

- In tables and charts, use the easy expression as the column heading, axis title, legend, or callout.
- Shorten surrounding copy before shrinking type or crowding a visual with definitions.
- Put detail in speaker notes when a full definition would make the slide dense.
- Keep essential interpretation visible: measurement period, comparison benchmark, units, and qualifications needed to understand the claim must not disappear into notes. Use a short label plus a nearby explanation when needed.
- Create a separate glossary slide only when the deck contains enough essential specialist terminology that first-use explanations and notes are insufficient.
- After rewriting, render and inspect the deck. Confirm that longer Korean labels are not clipped, overlapping, or wrapping into unreadable shapes, and adjust the wording or layout without changing meaning.
- This rendering check applies when producing an edited or new deck, not to a text-only review. If rendering is unavailable, identify the unchecked visual requirement; do not claim that instruction checks prove rendering or automatic invocation works.

## Final checks

Confirm that:

- every visible unexplained acronym or specialist term is intentional;
- recurring acronyms are explained only on first use;
- expert terminology has not been over-simplified when an expert audience was specified;
- all original numbers, units, dates, calculations, and judgments remain unchanged; and
- any `[Terminology]` notes are attached to the relevant slides.
