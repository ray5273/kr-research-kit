---
name: kr-chatgpt-review
description: Send a finished Korean stock or sector memo's reasoning to the user's logged-in ChatGPT website (paid web account, driven through a dedicated gstack browser profile — not the OpenAI API, not Codex) for an adversarial logic review, save the reply as structured feedback, then triage every point (accept / partial / reject / needs-check) and apply only verified fixes to memo.md. Use when the user asks for ChatGPT feedback, a second-opinion or red-team review of a memo's logic, or before publishing a memo to the blog. Do not use to gather facts, to replace primary-source verification, or to send holdings, the decision ledger, or the private voice profile anywhere.
---

# ChatGPT Logic Review — 웹 ChatGPT로 논리 반박 받기

메모를 다 쓴 뒤 **로그인된 ChatGPT 웹사이트**에 논리를 넣고 반대편 애널리스트 역할로
공격받는다. 받은 피드백은 에이전트가 하나씩 판정하고, 확인된 것만 메모에 반영한다.

API 키나 Codex 토큰을 쓰지 않는다. 사용자가 유료로 쓰는 chatgpt.com 계정을 전용 브라우저
프로필로 연다. 그래서 대화는 사용자 ChatGPT 기록에 남는다.

## 준비 (최초 1회)

```bash
node skills/kr-chatgpt-review/scripts/chatgpt-review.js login
```

전용 헤드 브라우저(`~/.gstack/kr-chatgpt-review/chromium-profile`)가 chatgpt.com을 연다.
**로그인은 사용자가 직접 한다.** 비밀번호·인증코드를 채팅으로 받지 않는다. 로그인 후:

```bash
node skills/kr-chatgpt-review/scripts/chatgpt-review.js status
```

`loggedIn: true`와 `model` 표시를 확인한다. 로그인 세션은 프로필에 남아 다음부터는 바로 쓴다.
네이버 발행 프로필과 분리돼 있어 서로 충돌하지 않는다.

## Workflow

1. **메모 확정.** `analysis-example/<market>/<company>/memo.md`가 최신인지 본다.
   말투 변환(`memo.voice.md`) 전 원본 메모로 검토한다 — 논리는 원본에 있다.
2. **검토 요청.**

   ```bash
   node skills/kr-chatgpt-review/scripts/chatgpt-review.js review \
     --memo analysis-example/kr/<company>/memo.md \
     --focus "사용자가 특히 걱정한 논점 한 줄 (선택)"
   ```

   새 대화를 열어 프롬프트를 붙여넣고, 답변이 끝날 때까지 기다린다(기본 20분 한도,
   `--timeout-min`). 메모 옆에 세 파일이 생긴다.

   | 파일 | 내용 |
   |---|---|
   | `chatgpt-review-prompt.md` | 실제로 보낸 프롬프트 |
   | `chatgpt-feedback.md` | 답변 원문(마크다운 복원) + 대화 URL·모델·판정 |
   | `chatgpt-feedback.json` | 섹션별 파싱 결과, `verdict`, `missingSections` |

   보내기 전에 프롬프트만 보고 싶으면 `build-prompt --memo ...`.
3. **판정.** [references/feedback-structure.md](references/feedback-structure.md)를 읽고
   지적마다 수용 / 부분 수용 / 기각 / 확인 필요를 정해 `chatgpt-triage.md`를 쓴다.
   수용하려면 1차 자료나 재계산으로 근거를 확인해야 한다.
4. **반영.** 수용·부분 수용만 원본 `memo.md`에 고친다. 확인 필요는 Decision-Changing
   Issues나 후속 확인 목록으로 보낸다. 그 다음 `kr-my-voice`, `kr-naver-blog-publish`
   변환을 다시 돌린다.
5. **(선택) 2회차.** 큰 수정이 있었으면 한 번만 더 `review`한다. 최대 2회.
6. **보고.** 사용자에게 ChatGPT 판정, 수용/기각 개수, 메모에서 바뀐 곳, 기각 이유 요약,
   대화 URL을 알려준다.

## 피드백 구조

ChatGPT에게는 고정 형식을 요구한다: `0. 한 줄 판정` · `1. 논리 비약` · `2. 숫자·계산 점검` ·
`3. 빠진 반대 논리` · `4. 확신도 점검` · `5. 결론을 뒤집을 데이터` · `6. 먼저 고칠 3가지`.
판정표 형식과 반영 규칙은 `references/feedback-structure.md`에 있다.

## Operating Rules

1. **ChatGPT는 검토자이지 출처가 아니다.** ChatGPT가 준 숫자·사실은 1차 자료로 확인한 뒤에만
   메모에 들어가고, 출처는 그 1차 자료로 적는다.
2. **보내면 안 되는 것.** 실보유 포트폴리오, `decision-ledger`, `portfolio.json`,
   `~/stock-analysis-private`·`~/folio-private` 아래 파일, 말투 프로필·코퍼스, 자격증명.
   스크립트가 경로·내용으로 막지만 에이전트도 확인한다.
3. **로그인·CAPTCHA·사용량 한도는 사용자 몫.** 감지되면 멈추고 알린다. 우회하지 않는다.
4. **브라우저는 gstack `browse` 전용 프로필로만 연다.** `mcp__claude-in-chrome__*`는 쓰지 않는다.
5. **판정표와 피드백 원문을 메모 본문에 붙이지 않는다.** 메모에는 반영 결과만 남긴다.
6. **결론 변경은 에이전트 판단이다.** ChatGPT 판정을 그대로 Structured Stance로 옮기지 않는다.
7. 검토는 메모당 최대 2회. 같은 지적이 되풀이되면 기존 판정을 유지한다.
8. 선택자(`#prompt-textarea`, `send-button`, `stop-button`, `data-message-author-role`)가
   바뀌어 실패하면 스크립트 오류를 그대로 보고하고, 수동으로 붙여넣은 답변을
   `chatgpt-feedback.md`로 저장해 판정 단계부터 이어간다.

## Commands

| 명령 | 하는 일 |
|---|---|
| `login` | 전용 브라우저로 chatgpt.com을 열고 로그인 상태 출력 |
| `status` | 새 대화 화면을 열어 로그인·모델 표시 확인 |
| `build-prompt --memo M [--focus F] [--out-dir D]` | 프롬프트 파일만 생성 (브라우저 안 씀) |
| `review --memo M [--focus F] [--out-dir D] [--timeout-min N]` | 프롬프트 생성 → 전송 → 답변 대기 → 저장 |
| `stop` | 전용 브라우저 종료 |

환경 변수: `CHATGPT_REVIEW_HOME`(런타임 디렉터리), `CHATGPT_REVIEW_PROFILE`(프로필 경로),
`CHATGPT_REVIEW_URL`(기본 `https://chatgpt.com/`).

## Validation

```bash
node skills/kr-chatgpt-review/scripts/test-chatgpt-review.js
node --check skills/kr-chatgpt-review/scripts/chatgpt-review.js
```

오프라인 테스트는 프롬프트 생성, 피드백 파싱, 비공개 경로 차단만 확인한다. 실제 전송은
로그인된 전용 브라우저가 있어야 한다.
