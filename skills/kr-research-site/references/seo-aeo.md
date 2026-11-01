# SEO · AEO · 광고 배치 규칙

`build-site.js`가 아래 규칙을 코드로 강제한다. 규칙을 바꾸면 `test-build-site.js`도 같이 바꾼다.

## 제목과 설명

- `<title>`: `종목명(티커) | 쟁점 | 기준일`. 티커가 없으면(섹터 글) `이름 | 쟁점 | 기준일`.
  - 종목명: `published.json`의 `company` → 메모 `대상` → H1 순서.
  - 쟁점: `issue` → 핵심 답변(Summary 첫 볼드)에서 68자까지. 끝의 마침표는 뗀다.
- `<h1>`: 메모의 H1을 그대로 쓴다. 제목 규칙과 H1이 달라도 된다.
- meta description: 핵심 답변 한 문장 + 첫 문단, 마크다운을 벗기고 160자로 자른다.
- `lang="ko"`, `og:locale=ko_KR`, canonical은 `baseUrl/slug/`. slug는 한 번 공개하면 바꾸지 않는다.
- OG 이미지: 메모 폴더의 `assets/naver-thumbnail.png`(git 추적 시) → 본문 첫 이미지 → `defaultOgImage`. 홈·목록·정책 페이지에도 기본 이미지를 적용한다. `/assets/name.png` 형식으로 설정하면 git 추적 중인 `site/assets/name.png`만 빌드에 복사하고 공개 절대 URL로 변환한다. 개별 글 이미지가 우선한다.

## 핵심 답변 박스 (AEO)

- Summary 섹션이 있으면 Summary, 없으면 Decision Frame, 둘 다 없으면 첫 섹션에서 뽑는다.
- 첫 블록 전체가 볼드면 그 볼드가 결론, 다음 문단이 근거 숫자다. 볼드로 시작하는 문단이면 볼드가 결론, 나머지가 근거다.
- 박스 아래에 `기준일`과 `최근 업데이트`를 붙인다. AI 답변 엔진이 "결론 + 숫자 + 날짜"를 한 덩어리로 인용할 수 있게 하기 위해서다.
- 메모의 사실·계산·추론 라벨은 손대지 않는다.

## 구조화 데이터 (JSON-LD)

- `Article`: `headline`(H1, 110자), `datePublished`(최초 기준일), `dateModified`(기준일·`최근 업데이트일`·Update Log `### YYYY-MM-DD` 중 최댓값), `author` Person, `publisher`, `about` Corporation(`tickerSymbol`은 `거래소 티커`, 한국은 `KRX`), `inLanguage` ko-KR.
- `BreadcrumbList`: 홈 → 시장 → 글.
- `FAQPage`: 첫 열 머리글에 "질문"이 들어간 표(예: "판단을 바꾸는 질문")가 있을 때만. 질문=첫 열, 답=나머지 열.

## 사이트 전역 파일

- `sitemap.xml`: 글, 홈, 시장 목록, 정책 페이지. `lastmod`=dateModified. 태그 페이지는 `noindex,follow`라 넣지 않는다.
- `feed.xml`: Atom, 최근 업데이트순 50개.
- `robots.txt`: 전체 허용 + Sitemap 줄.
- `llms.txt`: 글 목록과 한 줄 요약(기준일·업데이트일 포함). `llms-full.txt`: 글마다 핵심 답변, 수치 표(마크다운), 출처.
- `urls.json`: URL별 HTML sha256. IndexNow 변경 감지에 쓴다.

## 본문 렌더 규칙

- 제외 섹션: Research Brief, Follow-up Research Prompts(네이버 변환과 같다). 내부 파일 링크는 라벨만 남긴다.
- Update Log는 "업데이트 내역"으로 출처 앞에 둔다.
- 본문 링크는 라벨을 남기고 번호 각주(`[n]`)를 붙인다. 번호는 본문 첫 등장 순서, 그 다음 Sources 섹션 순서다. 출처 목록 라벨은 Sources 섹션의 라벨을 우선한다.
- 색상 마커 `[red:]`, `[blue:]`, `[brown:]`는 `tone-pos`, `tone-neg`, `tone-spec` span으로 바꾸고 색상 안내를 박스 아래에 한 번 둔다.
- 표는 실제 `<table>`로 렌더하고, 좁은 화면에서는 가로 스크롤한다.

## 광고 배치

- `adsense.client`가 비어 있으면 광고 코드 0, `ads.txt` 없음.
- 슬롯은 3개, 전부 섹션 경계에만 둔다.
  - `afterSummary`: 첫 본문 섹션(보통 Summary 나머지) 뒤.
  - `midArticle`: 본문 섹션이 4개 이상일 때 가운데 섹션 경계.
  - `endArticle`: 출처 섹션 바로 앞.
- 표·차트와 그 설명 사이에는 넣지 않는다. 슬롯 id가 비어 있는 슬롯은 출력하지 않는다(자동 광고만 쓰는 경우).
- EU 동의 관리는 AdSense 대시보드의 Google CMP로 처리한다.

## YMYL 신뢰 신호

- 모든 글: 작성자, 최초 기준일, 최근 업데이트일, 번호 출처, 면책문.
- `site/pages/`: 소개(작성자, AI 보조 작성 공개), 면책 고지, 개인정보처리방침(AdSense 쿠키 고지), 문의.

Search pages use `noindex,follow` and are omitted from sitemap/feed. Their static index is generated solely from `published.json` article models; exclude body text, source paths and unpublished memos. Article OG/Twitter title uses the short headline while the SEO title retains company/issue/date. OG images are separate generated 1200×630 PNGs with absolute HTTPS URLs, image width/height/type and descriptive alt metadata. Share URLs are canonical article URLs without query or fragment. Use platform recrawl tools after deployments; see site/analytics/OPERATIONS.md.
