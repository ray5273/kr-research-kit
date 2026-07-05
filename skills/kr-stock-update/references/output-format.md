# Output Formats

## Default Memo Header

Keep or add:

```md
기준일: 2026-03-20
최근 업데이트일: 2026-03-27
```

`기준일` is the original memo date.  
`최근 업데이트일` is the most recent follow-up refresh date.

## Default Update Log Shape

Append updates to the existing memo in this v2-compatible form. The metadata block is recommended for new updates and optional for legacy v1 inputs.

```md
## Update Log

### 2026-03-27 Update

#### Update packet

- Mode: hybrid
- Classification: refresh-now
- Thesis delta: weaker
- Event: 1Q26 earnings miss (eventKey: earnings-2026q1; date: 2026-03-27; materiality: high)

#### What happened
- ...

#### Why it matters
- ...

#### What changed in the thesis
- ...

#### What did not change
- ...

#### Signals to watch next
- ...

#### Follow-up prompt resolutions
- ...

#### DART recheck
- ...

#### Sources
- [Source label](https://example.com) (2026-03-27) — Source role: primary filing
```

## Classification Labels

- `answer-now`: answer from existing memo state; legacy alias `memo-only`.
- `refresh-now`: fetch post-`기준일` sources; legacy alias `refresh-needed`.
- `wait-for-event`: record the event/source trigger and do not force an update.
- `ask-user`: ask because the target, memo, or event frame is ambiguous.

## Thesis Delta Labels

Use `stronger`, `weaker`, `unchanged`, or `unclear`. Use a no-material-update block when no company-specific event passed the materiality filter.

## Hybrid Section Sync

Default writeback is Update Log only. When the hybrid gate triggers, update only the specific allowed sections through `apply-memo-section-updates.js` and state that body sections were synchronized in the final answer. Preserve `기준일`.

## Tone

- Be direct.
- Keep the update tied to the original thesis.
- Distinguish verified facts from inference.
- Prefer short, dated sections over long narrative rewrites.
- Use `No material company-specific update found after the memo date.` when that is the correct conclusion.
