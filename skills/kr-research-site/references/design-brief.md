# 사이트 디자인 브리프

2026-11-01 사용자 인터뷰 결과다. 사이트 디자인을 바꿀 때는 이 문서를 기준으로 삼고, 결정이 바뀌면 이 문서를 먼저 고친다.

## 배경

첫 버전(아이보리 배경 + 진녹색, 단일 칼럼 글 목록)은 "너무 구리다"는 평가를 받았다. 목표는 **전문적인 주식 리서치 사이트처럼 보이면서 깔끔한 것**이다.

## 2026-11-02 편집형 리디자인 (이 절이 아래 내용보다 우선)

사용자가 "전문 리서치 플랫폼" 방향의 리디자인 요청서를 주고 계획을 승인했다. 충돌하는 이전 결정은 이 절을 따른다.

- **느낌:** 애플풍(큰 둥근 모서리, 블러, 그림자)을 버리고 괘선 중심의 편집 디자인으로 간다. 모서리 4px, 그림자 없음. 흑백 + 오렌지 1색은 유지하되 오렌지는 기준일·현재 위치·핵심 답변 선에만 쓴다.
- **글꼴:** Pretendard 우선으로 OS 간 모양을 맞춘다. 크기는 12/13/15/17/20/26/34px, 간격은 4px 배수.
- **목록:** 메인·시장·태그·검색이 같은 행을 쓴다(회사·티커·분류 | 제목·요약 | 기준일·읽는 시간 | 썸네일). 썸네일은 사용자 선택으로 168px 유지, 모바일은 112px 옆 배치이고 요약은 뺀다(제목이 이미 한 문장 요약이고, 요약을 넣으면 산만하다는 사용자 피드백). 모바일 요약은 추천 맨 위 큰 카드에만 2줄로 둔다. 새 글은 메모 맨 앞 `한줄요약`(50자 이내)이 이 요약이 되어 2줄에서 잘리지 않는다.
- **필터:** 시장 필터를 다시 둔다. 기존 시장 페이지로 가는 링크라 JS가 없고 URL도 그대로다.
- **표:** 숫자가 대부분인 열은 우측 정렬한다(내용으로 판정, Markdown 정렬 힌트는 계속 무시). 모바일은 첫 열 고정과 넘침 그림자.
- **상세:** 경로 표시 → 회사·티커 → 제목 → 기준일 순서. 핵심 답변이 공유 버튼보다 먼저 온다. 요약 바로가기는 이미 있는 섹션으로의 링크일 뿐 문구를 만들지 않는다.
- **목차:** 넓은 화면은 왼쪽 고정(목차 안에서 스크롤), 1240px 미만은 접이식.

## 확정된 결정

| 항목 | 결정 |
|---|---|
| 사이트 이름 | **KR Research · 기준일 리서치**. 로고는 영문 'KR Research', 옆이나 아래에 부제 '기준일 리서치'. 모든 글에 기준일이 있다는 원칙을 부제로 드러낸다. (Datum Research도 검토했다가 버림) |
| 전체 분위기 | **리서치 리포트형**이되 화면은 단정하게: 표와 숫자는 본문 안에서 보여 주고, 화면 구성 요소는 최소로 둔다. |
| 레퍼런스 | **메르 블로그**(이미지·차트를 많이 써서 읽기 쉬움), **Koyfin·TIKR**(지표·차트 대시보드의 깔끔한 숫자 표현) |
| 판단 표시 | 종목 박스에 **등급 배지 긍정 / 중립 / 부정** + 한 줄 설명. 매수·매도 같은 직접 권유 단어는 쓰지 않는다(유사투자자문 오해 방지). |
| 이미지 | **다채롭게.** 네이버 블로그처럼 썸네일, 차트, 설명용 그림을 적극적으로 쓴다. 목록에도 썸네일을 보인다. |
| 색 | **흑백 + 오렌지 포인트 1색** (`#ea5a0c`, 다크 `#ff7a2f`). 배경 흰색, 회색 면 `#f5f5f7`, 글자 `#1d1d1f`. |
| 폰트·느낌 | **애플 느낌**: 시스템 글꼴(SF Pro, Apple SD Gothic Neo), 없으면 Pretendard. 큰 제목은 자간을 좁히고(-0.04em) 굵기 700, 모서리 14~20px, 그림자는 은은하게, 상단 바는 반투명 블러. |
| 밀도 | **덜어낸다.** 1차 시안(퀵바·3단·커버 종목 표·티커 줄)은 "난잡하다"는 평가. 한 화면에 하나의 할 일만 둔다. |

## 홈 화면 (2차 시안에서 확정)

1. **지금 읽을 만한 리서치(추천)**: 큰 카드 1 + 작은 카드 2. 썸네일 왼쪽 위에 **기준일 꼬리표**(사용자 요청: 기준일이 명확히 보일 것), 시장·티커·판단 배지, 제목, 한 줄 요약. 추천 순서는 `published.json`의 `featured`로 사람이 정한다.
2. **최신 / 인기** 세그먼트 전환 목록: 행마다 시장·티커·배지, 제목, 두 줄 요약, 기준일·읽는 시간, 오른쪽 썸네일. 인기는 방문 통계가 생기기 전까지 `published.json`의 순서(`popular`)로 대신한다.
3. 빼는 것: 커버 종목 표, 시장 탭, 상단 티커 줄, 사이드바. 시장별 목록은 상단 메뉴(한국·미국·섹터)로만 간다.

## 글 페이지 (2차 시안에서 확정)

1. 한 칼럼(최대 720px) 본문. 사이드바 없음.
2. 머리: 시장·티커·판단 배지 → 짧은 제목 → 작성자·기준일·읽는 시간 → **숫자 3칸**(기준 주가, 발표 전 대비, 기준 시나리오 가치. 메모에 있을 때만).
3. **핵심 답변 박스**: 회색 면, 오렌지 라벨, 결론 한 문장 + 근거 숫자.
4. 목차는 넓은 화면(1240px 이상)에서만 **화면 왼쪽 끝**(left 32px)에 세로선과 함께 띄운다(본문 옆에 붙으면 답답하다는 피드백). 읽는 위치는 오렌지로 표시. 모바일은 숨김.
5. 글 끝: 업데이트 내역·출처 → 공유 버튼 → **연관글 최대 4개**(같은 종목·같은 섹터·최신 발행순) → **이어서 읽기**(전체 발행순 이전·다음) → 승인된 댓글.

## 지켜야 할 기존 제약

- 핵심 답변 박스, 기준일·업데이트일 표시, 번호 출처, 면책문은 유지한다(YMYL·AEO).
- 광고 슬롯은 섹션 경계에만 둔다. 표·차트와 그 설명 사이에는 넣지 않는다.
- 색상 마커(빨강=좋은 것, 파랑=안 좋은 의견, 갈색=추측)는 의미를 유지한다. 판단 배지 색과 충돌하지 않게 고른다.
- 모바일 우선, 다크모드 지원, 외부 의존성은 Google Fonts·CDN 폰트 정도로 최소화한다(빌드는 Node stdlib).
- 판단 배지와 기준 주가, 시나리오 가치는 메모에 있는 값만 쓴다. 메모에 없으면 표시하지 않는다(`published.json`에서 지정하거나 메모의 Structured Stance에서 읽는다).

## Search, sharing and comments

Keep the existing white/black surfaces and orange accent tokens. Header navigation includes 검색. The search page has a visible query label, result count, reset, retry, empty state and back navigation; restore the query on browser history changes. Results show the same short title/summary as lists.

Article order: header metadata and share controls → article → end share controls and count explanation → related cards (maximum four) → publication previous/next → comments. Share controls are 카카오톡 / 공유하기 / 링크 복사 in a wrapping row with 44px targets. A live status explains success, cancel or failure. Counts start at `—` until a successful API response. Comment count links to the comment heading. Forms have visible labels, native validation, a pending-approval explanation and privacy/contact links. Render user text with textContent, preserving newlines; never render submitted markup. Maintain keyboard outlines, dark surfaces and no horizontal page overflow at 320/390px.

Share artwork is 1200×630: orange left rule, site name, company/ticker/sectors, large Korean title, concise summary and 자료 기준일. Use measured text wrapping and bundled Korean font; lists retain their own thumbnail assets.

## 기록 글 일괄 발행 시 날짜 표시 (2026-11-01)

사용자는 기존 메모를 당시의 기록으로 그대로 발간하도록 확정했다. 목록과 추천의 기본 순서는 사이트 발행일이 아니라 메모의 자료 기준일·기록된 최신 업데이트일 내림차순이다. 원래 기준일은 보존하며 후속 자료 업데이트가 있으면 별도로 표시한다. 이번 일괄 발행에서는 예전 featured 순위를 해제한다.
