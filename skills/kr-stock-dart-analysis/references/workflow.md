# Workflow Reference

## Scope Lock

- Identify the exact company, ticker, market, and share class.
- Identify the target filing type: `business report`, `quarterly report`, `half-year report`, `audit report`, `review report`, or `material disclosure`.
- Identify the target period and whether the user wants a broad filing digest or a narrower question such as results, segments, customer concentration, capex, related-party disclosures, or a contract-disclosure list.
- If a `kr-stock-plan` brief already exists, inherit its exact security definition, output mode, and must-answer questions before expanding scope.
- Set the reusable output path early when the workspace is writable. Default to `analysis-example/kr/<company>/dart-analysis.md`.
- If the filing is long enough that a full section sweep matters, also reserve `analysis-example/kr/<company>/dart-reference.md` and `analysis-example/kr/<company>/dart-cache.json`.

## Filing Set

Try to gather the smallest complete set that supports a precise answer:

1. Target filing
   The current quarter, half-year, or annual filing on DART.
2. Prior cumulative filing
   Needed when the current report gives only cumulative figures and the user wants the standalone quarter.
3. Prior-year comparable filing
   Needed for year-over-year comparison on the same basis.
4. Attached audit or review report
   Useful for note detail, customer concentration, accounting policies, and restatement context.
   When DART's inline viewer is awkward or incomplete for note-level work, use the company IR `감사보고서` or `reviewed financial statements` download page to reach the same official PDF directly.
5. Official earnings-release or IR material
   Optional support for management explanations or presentation tables.
6. KRX or DART contract disclosures
   Needed when the user asks for `단일판매ㆍ공급계약체결`, large order wins, amendments, or contract termination notices.

For note-driven annual tasks, steps 1-4 are mandatory before relying on step 5.

## DART-First Enforcement

- Treat these as note-driven tasks by default: customer concentration, geography mix, related-party transactions, internal-group revenue, segment margin, treasury-share detail, capital-allocation notes, and any memo-critical claim that depends on a filing note or appendix.
- Do not use company IR pages, newsroom posts, or third-party disclosure mirrors as substitutes for the DART filing path when a note-driven task is still incomplete.
- Accept a company IR `감사보고서` download page only as an alternate route to the same official audit or review PDF, not as a separate evidence standard.
- If the relevant DART note, appendix, or attached audit or review report has not been checked yet, the task is not complete.
- If note extraction remains partial after a real DART attempt, hand the item off as `partial`, `needs_review`, or `not separately disclosed after DART check` instead of filling the gap from company-site summaries.

## Claude.ai Viewer Export Path

- Use this path when the user wants to work from the live DART viewer inside a browser session instead of manually copying text.
- Supported first-pass page pattern: `https://dart.fss.or.kr/dsaf001/main.do*`
- Install the unpacked Chrome extension from `integrations/claude-dart-extension/`.
- Open the DART viewer page and let the extension auto-run.
- If the popup shows `Export ready`, save `dart-browser-export.json`.
- Normalize the saved export before section parsing:

```text
node skills/kr-stock-dart-analysis/scripts/normalize-browser-dart-export.js --input dart-browser-export.json --output dart-text.txt
node skills/kr-stock-dart-analysis/scripts/extract-dart-sections.js --input dart-text.txt --output sections.json
node skills/kr-stock-dart-analysis/scripts/verify-dart-coverage.js --input sections.json --output coverage.json
```

- This path has no alternate extraction route inside the extension flow. If extraction fails, retry on the viewer page and improve the extractor rather than silently switching source paths.

## Section Sweep And Coverage Verification

Use this step for annual `사업보고서`, `감사보고서`, or any filing where missing a note or appendix would materially change the answer.

1. Build the expected section list first.
   Start from the filing TOC or the visible heading list and keep the exact section titles.
2. Parse the filing into section units.
   At minimum, keep the section title, line or anchor position, content length, table presence, and a short preview.
3. Compare expected sections with parsed sections.
   Label each item as:
   - `parsed`
   - `partial`
   - `missing`
   - `needs_review`
4. Treat weak parses honestly.
   A heading-only capture, an abnormally short block, or a note-heavy section with no visible table or numeric block should not count as fully parsed.
5. Keep the verification artifact.
   Write the dated section report into `dart-reference.md` and the machine-readable state into `dart-cache.json` when the workspace is writable.
6. Use verification status in the analysis.
   - `parsed`: safe to cite normally with source mapping.
   - `partial`: cite cautiously and mark the limitation.
   - `missing` or `needs_review`: do not convert this into `not separately disclosed`.

For memo-critical annual work, do not move downstream to a settled conclusion until the note-driven sections that affect the thesis are at least `parsed` or explicitly marked unresolved.

Deep-read mode is mandatory, not optional, when:

- the filing is an annual `사업보고서` or audited annual report
- the user wants a reusable filing artifact
- the filing is being used to support a broader memo or stock thesis
- customer concentration, related-party revenue, segment margin, backlog, or capital-allocation claims matter to the conclusion

Recommended annual-report sweep targets:

- `I. 회사의 개요`
- `II. 사업의 내용`
- `III. 재무에 관한 사항`
- `IV. 이사의 경영진단 및 분석의견`
- `V. 회계감사인의 감사의견 등`
- `VI. 이사회 등 회사의 기관에 관한 사항`
- `VII. 주주에 관한 사항`
- `VIII. 임원 및 직원 등에 관한 사항`
- `IX. 계열회사 등에 관한 사항`
- `X. 대주주 등과의 거래내용`
- `XI. 그 밖에 투자자 보호를 위하여 필요한 사항`
- `XII. 상세표`
- `연결재무제표 주석`
- `재무제표 주석`

## Measurement Basis

Before extracting any number, classify the block:

- `consolidated disclosed`
- `separate disclosed`
- `derived from cumulative filing`
- `restated`
- `outside filing scope`

Do not mix bases in one comparison table without a visible note.

## Results Extraction Checklist

For the latest results block, try to capture:

- revenue
- operating profit
- net profit
- operating margin
- year-over-year change
- quarter-over-quarter change when the basis is comparable
- whether the figures are cumulative or standalone
- whether the block is consolidated or separate
- the table or section name where the number came from

If the filing gives only cumulative values:

1. Pull the current cumulative figure.
2. Pull the immediately prior cumulative figure for the same fiscal year.
3. Subtract to derive the standalone quarter.
4. Mark the result as `derived from cumulative filing`.
5. Show the brief calculation path in the note column.

## Mix And Detail Checklist

Extract only what is actually disclosed and relevant to the user's question:

- segment or business-unit revenue
- segment or business-unit profit
- product or service mix
- geography mix
- major customer concentration
- order backlog or contract balance
- capex and major asset additions
- working-capital signals such as inventory or receivables build
- related-party transactions
- internal-group sales ratio when note detail allows a direct numerator/denominator calculation
- treasury-share or shareholder-return items disclosed in filings or related KRX notices
- single-sales or supply-contract disclosures, amendments, and termination notices

When a useful split is missing, say `not separately disclosed` and move on.

For long annual filings, tighten that rule:

1. Check the relevant body section.
2. Check the attached audit or review report if note detail matters.
3. Check the official IR PDF route if the DART viewer is weak.
4. Confirm the section is not `missing` or `needs_review` in the coverage report.
5. Only then use `not separately disclosed`.

Step 3 is allowed only as the same official document route after attempting the DART filing path, not as a shortcut around DART-first work.

For `특수관계자`, `관련당사자`, `내부거래`, `계열 매출`, or `내부그룹 매출 비중` requests:

1. Lock the period first.
   Use the latest annual audited period unless the user explicitly wants another year.
2. Reach the audited note directly.
   Prefer the annual audit report PDF if the DART viewer path is slow, broken, or hard to deep-link.
3. Check both bases before calculating anything.
   Look for the related-party note in:
   - `연결재무제표 주석`
   - `별도재무제표 주석`
   If both exist, plan to report them separately rather than choosing only one.
4. Extract the denominator from the audited income statement or revenue note.
   Use the exact consolidated annual `매출액` line that matches the note period.
   If you later describe the separate-company note, do not reuse the consolidated revenue denominator for it unless the company separately discloses the matching separate revenue.
5. Extract the strict related-party numerator.
   Use the note table titled like `특수관계자와의 매출ㆍ매입 등 거래내역` or equivalent.
6. Check whether the note separately discloses `대규모기업집단 계열회사` transactions outside the strict related-party table.
   If yes, keep this as a second numerator rather than silently folding it into the first one.
7. Check the major-customer note.
   If the company discloses a customer like `삼성전자와 그 종속기업` as a 10%-plus external customer, keep that statement separate from the related-party ratio and explain the scope difference if needed.
8. Calculate and label two ratios when possible:
   - `내부그룹 매출 비중(엄격 기준)` = strict related-party sales / consolidated revenue
   - `내부그룹 매출 비중(확장 기준)` = (strict related-party sales + separately disclosed large-group affiliate sales) / consolidated revenue
9. If the separate-company note is available, add a second block for `별도 기준 특수관계자 구조`.
   Typical items are:
   - 당사 기준 특수관계자 매출 합계
   - 당사 기준 특수관계자 매입 합계
   - 당사에 유의적인 영향력을 행사하는 회사 및 그 종속기업
   - 종속기업
   - 관계기업
   - 대규모기업집단 계열회사 등
   This block is usually descriptive structure analysis, not a consolidated revenue ratio.
10. Keep the note numbers visible.
   Record the exact note number, table title, filing date, and whether the block is `연결` or `별도` in the source map.

For `매출 비중`, `구성 비중`, `계약 비중`, or `매출 비중과 계약 비중을 같이` requests:

1. Split the request into two blocks before extracting numbers.
   - `매출 비중 블록`
   - `계약 비중 블록`
2. Build the revenue denominator first.
   Use the same-period consolidated annual revenue by default unless the filing clearly anchors another basis.
3. Extract revenue numerators from disclosed mix tables.
   Typical candidates are segment revenue, cloud within IT service, major-customer sales, related-party sales, and large-group affiliate sales.
4. Calculate only like-for-like revenue ratios.
   Examples:
   - segment / consolidated revenue
   - cloud / IT service revenue
   - major customer / consolidated revenue
   - related-party sales / consolidated revenue
5. Build the contract block separately.
   Check whether the filing discloses:
   - official backlog or order balance
   - contract asset or contract liability
   - `보고기간 종료일 현재 수주잔고`
   - individual `단일판매ㆍ공급계약체결` notices
6. Decide whether a contract ratio is valid.
   If the contract figure is only for a narrow contract subset, you may show `해당 계약군 / 연결 매출` as a limited derived ratio, but label it as `단순 비중` or `범위 제한적`.
7. Never force a company-wide backlog read from a partial contract note.
   If only a subset such as cost-to-cost contracts is disclosed, say that it is not equivalent to formal company-wide backlog coverage.
8. Summarize the relationship.
   End with a short interpretation that distinguishes:
   - business mix
   - customer or internal-group concentration
   - contract visibility
   - what is not separately disclosed

For multi-segment companies:

- introduce the segment abbreviations once with full names and short Korean explanations before showing numbers
- prefer a matrix table with segments on rows and periods on columns when the user needs to compare multiple quarters or annual values at once
- keep `4Q 환산` visibly labeled if it is derived from cumulative filings or annual-minus-9M math
- separate the quantitative matrix from qualitative notes such as backlog, customer mix, or one-off-cost commentary

For single-segment or legally segmented-but-operationally-single companies:

- you may keep the simpler `공시 블록 | 값 또는 핵심 내용` structure if a matrix would add noise rather than clarity

## Contract List Mode

When the user asks for `수주계약건만`, `단일판매ㆍ공급계약만`, or a similar contract-only screen:

- gather every relevant contract disclosure in the requested period, not just the latest one
- keep `original`, `correction`, `amendment`, and `termination` status visible per row
- sort the full disclosure list by `공시일 내림차순`
- write the user-facing artifact in Korean unless the user asked for English
- capture at least these fields when disclosed:
  - 공시일
  - 원공시일
  - 상태
  - 정정사유
  - 계약명
  - 계약구분
  - 상대방
  - 계약금액
  - 최근매출액대비
  - 시작일
  - 종료일
  - 지역
  - source URL
- if multiple notices refer to the same contract, keep both the original notice and the latest effective notice visible
- also produce a second deduplicated table named `최신 유효 계약 상태` so the user can see the live state per contract chain
- when the user asks how much contract amount remains by period, also produce:
  - `계약 종료시점 분포`: bucket the latest effective contracts by end year or `종료일 미정`
  - `커버리지 요약`: a short cumulative table that shows at least `2026년까지`, `2027년까지`, `2028년까지`
  - `누적 계약 커버리지`: cumulative amount by end year such as `2027년까지`, `2028년까지`
- define the contract chain conservatively using filing evidence such as `계약명 + 상대방 + 프로젝트 설명` and keep different projects separate even if the counterparty is the same
- if the disclosure omits a field such as counterparty or exact period, write `not separately disclosed`
- do not confuse annual backlog tables with individually disclosed contract wins; keep them in separate blocks
- present the user-facing contract amount in `억원` by default; if exact 원단위 is material, keep it in a note or source-linked explanation instead of the main amount column
- if the user asks for `남은 수주`, explicitly state whether the company disclosed formal backlog. If not, label the period table as `현재 유효 계약 금액 기준` or `만기 분포 기준` rather than `잔여 수주잔고`.

## Fixed Contract Output Discipline

When contract-list mode is used, keep this section order unless the user explicitly overrides it:

1. `## 범위`
2. `## 검색 기준`
3. `## 공시행 전체 리스트`
4. `## 최신 유효 계약 상태`
5. `## 계약 종료시점 분포`
6. `## 커버리지 요약`
7. `## 누적 계약 커버리지`
8. `## 해석 메모`
9. `## 원문 링크`

In `공시행 전체 리스트`, keep this exact column order:

1. 공시일
2. 원공시일
3. 상태
4. 정정사유
5. 계약명
6. 상대방
7. 계약금액
8. 최근매출액대비
9. 계약기간
10. Source

In `최신 유효 계약 상태`, keep this exact column order:

1. 계약 체인
2. 최신 공시일
3. 상태
4. 상대방
5. 최신 계약금액
6. 최근매출액대비
7. 최신 계약기간
8. 비고
9. Source

In `계약 종료시점 분포`, keep this exact column order:

1. 종료 기준
2. 최신 유효 계약금액(억원)
3. 계약 체인 수
4. 비고

In `커버리지 요약`, keep this exact column order:

1. 기준 시점
2. 누적 계약금액(억원)
3. 비고

`커버리지 요약` should include at least:

- `2026년까지`
- `2027년까지`
- `2028년까지`

If later checkpoints matter, add them after the required three rows.

In `누적 계약 커버리지`, keep this exact column order:

1. 기준 시점
2. 누적 계약금액(억원)
3. 누적 계약 체인 수
4. 비고

If there are no matching disclosures, do not improvise. Use the same section order and write `검색 결과 없음` in the two tables.

## Backlog Coverage Mode

When the user asks for `수주잔고 대비 매출`, `백로그 커버리지`, `몇 년치 일감인지`, or similar questions:

- first confirm that the filing actually discloses backlog or order balance
- use the same basis for numerator and denominator
  - same company or segment scope
  - same consolidated or separate basis when possible
  - annual revenue by default unless the filing explicitly anchors a different period
- show both:
  - `수주잔고 / 연간 매출` as `x배`
  - `연 환산 커버리지` as `약 n년` or `약 n개월`
- if the backlog is disclosed for a subgroup like the core operating company while revenue is only available for that same subgroup in the business report, prefer that subgroup basis over a broad consolidated mismatch
- if the backlog table and revenue table are not directly comparable, still provide the calculation only if useful, but label the limitation clearly in `비고`
- do not describe the result as booked profit, guaranteed sales, or formal management guidance
- if the user asked for `계약 비중`, prefer one of these labels depending on scope:
  - `공식 backlog / 연간 매출`
  - `특정 계약군 수주잔고 / 연결 매출 단순 비중`
  - `최근 공시 계약금액 / 최근매출액대비`
  Never compress these different notions into one generic `계약 비중`.

## Integrated Backlog Mode

When the user wants `수주잔고 + 계약 만기 분포 + 커버리지` together:

- start from the official backlog table in the latest filing
- separately collect the last 12 months of `단일판매ㆍ공급계약체결` notices
- keep these concepts separate:
  - `공식 수주잔고`
  - `최근 12개월 개별 계약공시`
  - `현재 유효 계약의 종료연도 분포`
  - `수주잔고 / 연간 매출 커버리지`
- if the company has undisclosed-amount contracts, keep them in the list and latest-state table, but exclude them from amount sums and say so explicitly
- if the latest effective contract list does not reconcile to official backlog, do not force a tie-out; explain that contract notices are only a partial observable subset of backlog
- in integrated backlog mode, place `커버리지 요약` before the longer cumulative table so the user can answer `2027년까지 얼마` immediately

## Order Backlog Chart Handoff

When the planning brief says `Order-backlog route: yes`, hand `kr-order-backlog-analysis` one and only one primary basis:

- `official-revenue-schedule`: official backlog or remaining-performance amounts by expected revenue-recognition year
- `official-contract-end-year`: project-level remaining order amounts grouped by disclosed end year
- `contract-disclosure-maturity-proxy`: latest effective individual contract totals grouped by end year; never label this remaining backlog
- `official-total-only`: official backlog total with no defensible year allocation

Include the filing date, table unit, reporting scope, official total, annual-revenue denominator when comparable, dated buckets, undated amount, undisclosed-amount contract count, and source URLs. If only the total is disclosed, use one `연도 미공시` bucket. Do not manufacture a schedule from a coverage ratio or average project duration.

## Reasons For Change

- Quote management-stated reasons only when the filing, attached earnings material, or official presentation says them.
- Keep these categories separate:
  - `filing-stated reason`
  - `official IR commentary`
  - `analyst inference`
- Do not upgrade a likely explanation into a stated fact.

## Comparison Discipline

- Compare only like-for-like bases.
- Keep restated periods visible.
- Call out scope changes such as acquisitions, disposals, discontinued operations, or reporting-segment changes.
- If a prior period uses separate data and the current period uses consolidated data, do not present the comparison as cleanly comparable.

## Suggested Downstream Handoff

After the DART extraction is complete:

- hand off from `kr-stock-plan` into this skill when latest filing precision is central to the stock work
- hand off to `kr-order-backlog-analysis` before `kr-stock-data-pack` when the company is classified as order-driven
- hand off to `kr-stock-data-pack` for valuation, governance, chart, and outside-view blocks
- hand off to `kr-stock-analysis` for thesis, risks, catalysts, and conclusion

## Reference Digest And Cache

When a long filing section sweep was required, keep a reusable companion artifact:

1. `dart-reference.md`
   Human-readable digest with:
   - filing metadata
   - coverage summary
   - parsed vs partial vs missing sections
   - short section summaries
   - nondisclosure verification notes
   - next-update watchlist
2. `dart-cache.json`
   Machine-readable state with:
   - `reference.asOf`
   - `reference.lastCheckedAt`
   - `reference.lastFilingChecked`
   - coverage counts
   - missing, partial, and review-needed sections
   - compact per-section metadata

This cache is meant to make the next filing update easier, not to hide evidence.

## Claim Recheck Loop

Use this step whenever the filing output supports a broader stock memo, data pack, or thesis write-up.

1. Build a short claim list.
   Pull the 3-8 highest-impact claims from:
   - the scoped brief's must-answer questions
   - the current memo draft
   - the data pack
   - your own top-line filing summary
2. Phrase each claim so it can be falsified.
   Good examples:
   - `LG CNS의 연결 기준 계열 매출 비중은 약 60%다`
   - `삼성전자 DS 마진 회복 근거가 사업보고서에 직접 적혀 있다`
   - `두산에너빌리티 수주잔고는 계열사 관련 사업을 제외한다`
3. Recheck each claim against the filing set.
   Prefer the exact note, section, or table that directly proves or weakens the statement.
4. Assign one status per claim.
   - `confirmed`
   - `partially_supported`
   - `contradicted`
   - `not_separately_disclosed`
   - `needs_follow_up`
5. Keep the result visible.
   Write the claim, status, supporting value if any, and source section into `dart-reference.md` and `dart-cache.json`.
6. Use the claim status downstream.
   A memo should not present a thesis-critical statement as settled if the DART recheck left it `partially_supported`, `contradicted`, or `needs_follow_up`.

## Failure Modes To Avoid

- quoting cumulative nine-month or half-year numbers as if they were quarter-only results
- mixing consolidated and separate figures without labeling the switch
- copying IR tables without checking whether the filing says the same thing
- forcing a DART viewer path when the same audited note is easier to verify from the official audit-report PDF
- inventing a segment margin or customer split that the filing does not provide
- collapsing `특수관계자` and `대규모기업집단 계열회사` into one unlabeled internal-sales figure
- mixing `매출 비중` and `계약 비중` into one table without showing that the numerators come from different disclosure systems
- collapsing contract amendments or corrections into one unlabeled contract row
- flattening `not disclosed` into silence instead of making the gap explicit
- flattening `missing parse` or `needs_review` into `not separately disclosed`
- attributing a result change to management commentary when the filing does not state that reason
- ignoring restatements, note revisions, or reporting-segment changes
