# kr-naver-blogger — Release Notes

## 2026-04-15

이번 릴리즈는 `discover-bloggers.js`의 후보 품질 필터링을 크게 강화한다.
기존에는 post 레벨(제목 분류)과 trading-shop ratio만 있었지만, 블로그 전체
타임라인과 커버리지의 시간적 분포까지 반영하도록 3개의 블로그-레벨 시그널을
추가했다. 또한 대형주를 위한 `--deep` 모드를 도입했다.

### 신규 기능

#### 1. `--deep` 모드 — 기술/경쟁력 분석 블로거 필터링

대형주(삼성바이오로직스, SK하이닉스 등)처럼 후보 pool이 30~50개 이상인 경우,
`dedicatedPostCount` 상위권이 전부 매매·시황 블로그로 채워지는 문제가 있었다.
`--deep` 플래그는 다음을 수행한다.

- 쿼리 pool에 `<회사> 기술 분석`, `<회사> 경쟁력`, `<회사> 기술 로드맵` 자동 주입.
- 각 블로거의 title-matched 포스트 중 `isDeepTechTitle()`이 양성인 것을
  `deepTechPostCount`로 집계.
- 자격 조건: `deepTechPostCount >= 1` (일반 모드의 `dedicatedPostCount` 기반 기준을 대체).
- 랭킹: `deepTechPostCount` 내림차순이 1차 키.

`isDeepTechTitle()`은 `기술/공정/특허/양산/수율/경쟁력/점유율/해자/로드맵/...` 등의
긍정 어휘가 하나 이상 포함되고, `오늘/내일/금주/실시간/속보/종가/급등/...` 등의
근시안적 disqualifier가 없는 제목만 양성으로 분류한다.

#### 2. 블로그 타임라인 품질 게이트 (`stockPostRatio`)

`--deep` 모드 전용. 후보당 `readBlogPostList(blogId, {max: 20})`을 1회 호출해
블로그의 **일반 최근 포스트** (쿼리 무관) 20개를 가져온다.

- `stockPostRatio` = 20개 중 `isStockRelatedTitle()` 양성 비율.
- 커리어/일상 블로그(`stockRatio≈0`), 정치·연예 혼재 뉴스 어그리게이터
  (`stockRatio≈0.4`)를 걸러낸다. 실제 주식 블로거는 0.7+.
- 컷오프: **0.5 미만이면 `deepTechPostCount`와 무관하게 배제**.

이전에 삼성바이오로직스 canary에서 `dodam852` (취업 블로그, 기술 키워드 1개
우연 매치), `ittimesnews` (뉴스 어그리게이터)가 `deepTechPostCount=1`로
통과했던 버그를 잡는다.

#### 3. Staleness 필터 (`staleCoverageRatio`)

일반 모드 + `--deep` 모드 **모두** 적용. 과거엔 활발했지만 1년 넘게 해당 종목을
쓰지 않은 dormant 블로거를 배제한다.

- 데이터 소스: `searchWithinBlog` 결과(title-matched 포스트)의 `date` 필드.
- `datedPostCount` — 날짜 파싱이 성공한 포스트 수.
- `stalePostCount` — 그 중 365일 이상 지난 포스트 수.
- `staleCoverageRatio` = `stalePostCount / datedPostCount`.
- `latestRelevantPostDate` — title-matched 포스트 중 최신 날짜.
- 배제 조건: `datedPostCount >= 3` **AND** `staleCoverageRatio >= 0.8`.

`>= 3` floor는 거짓 양성 방지용 guardrail이다. 날짜 토큰 파싱이 실패한 활성
블로거를 단일 dated post만으로 배제하지 않는다.

엘앤에프 canary 결과:
- ✓ `arirangya` 배제 (3/3 stale, 최신 2023-10-10)
- ✓ `kfour7575` 배제 (10/10 stale, 최신 2024-12-30 — ded=9로 기존엔 상위권이었음)
- ✓ 활성 블로거(무영/문벵/가로/sowlllm/gunyoung88 등) 전원 유지

#### 4. AI 콘텐츠 팜 관측 시그널 (미적용, 출력 전용)

블로그-레벨 게이트를 확장하기 위한 observability 시그널 2종을 추가했다. 현재는
자격 조건에 연결돼 있지 않고 출력 JSON과 verbose 로그에만 기록된다.

- `bracketedTitleRatio` — `[특징주]`, `【시황】` 같은 대괄호 prefix 제목 비율.
  뉴스 어그리게이터 포맷 감지.
- `formulaicTitleRatio` — 템플릿 clickbait 패턴(`지금 사면 늦을까`, `왜 오를까`,
  `TOP N`, `알아보기`, `총정리` 등) 매치 비율. Canary에서 `dkdlvkr3` (AI farm)
  1.00 vs `gunyoung88` (실제 애널리스트) 0.00으로 완벽 분리 확인.

데이터 분포를 관찰한 뒤 자동 배제 임계값을 결정할 예정.

### 인프라 변경

#### `browse-naver.js`: `searchWithinBlog`가 date 반환

기존 `searchWithinBlog`는 `browse links`만 호출했는데, Naver의 anchor-list 출력엔
날짜 토큰이 포함되지 않는다. 이제 같은 URL을 `browseText`로 추가 fetch해서
`YYYY/MM/DD HH:MM` 라인을 파싱하고 title 매치로 merge한다.

- 신규 함수: `parseBlogSearchDatesFromText(text)` → `Map<title, "YYYY-MM-DD">`.
- Merge 로직은 exact title match + startsWith fallback. `parseBlogSearchResults`가
  제목을 첫 ` → ` 구분자에서 자르는 탓에, 제목에 화살표가 들어간 포스트는
  prefix 매치로 복구한다.
- 비용: 후보당 1회 추가 fetch. 기존 1회와 합쳐 후보당 2회 + 타임라인용 1회
  = 총 3회.

#### `discover-bloggers.js`

- `--deep` 플래그, `--no-blog-filter` 플래그 추가.
- `isTradingBlog` exclusion 뒤에 staleness gate, deep 전용 `stockPostRatio` gate
  순으로 자격 조건 통합.
- 블로거 출력 객체에 신규 필드: `deepTechPostCount`, `generalPostCount`,
  `stockPostRatio`, `bracketedTitleRatio`, `formulaicTitleRatio`,
  `datedPostCount`, `staleCoverageRatio`, `latestRelevantPostDate`.
- `latestPostDate`는 이전까지 항상 `null`이었는데 이번에 `latestRelevantPostDate`의
  alias로 실제 값이 채워진다 (스키마 호환).

#### `lib/title-filters.js`

- `STOCK_RELATED_TERMS`, `isStockRelatedTitle()` — 블로그-레벨 주식 집중도 판단.
- `DEEP_TECH_TERMS`, `DEEP_TECH_DISQUALIFIERS`, `isDeepTechTitle()` — deep-tech 분류.
- `BRACKETED_PREFIX_RX`, `isBracketedTitle()` — 뉴스 어그리게이터 포맷 감지.
- `FORMULAIC_PATTERNS`, `isFormulaicTitle()` — SEO 상투어 + 주식 AI 팜 clickbait.
- `COMPANY_TOKEN_STOPWORDS`, `extractCompanyTokens()` — 제목에서 회사-유사 토큰
  추출 (종목 다양성 시그널의 초기 버전 — 현재 사용되지 않지만 export됨).

### 출력 스키마 변경

`bloggers[].*`에 8개 신규 필드가 추가됐다. 기존 소비자는 영향 없음.
`kr-naver-insight`처럼 이 JSON을 읽는 downstream skill은 필드를 모르면 조용히
무시한다.

```jsonc
{
  "deepTechPostCount": 2,
  "generalPostCount": 20,
  "stockPostRatio": 0.85,
  "bracketedTitleRatio": 0.00,
  "formulaicTitleRatio": 0.10,
  "datedPostCount": 6,
  "staleCoverageRatio": 0.00,
  "latestRelevantPostDate": "2026-04-12"
}
```

meta에도 `deepMode`, `blogFilterApplied` 플래그 추가.

### 마이그레이션

파괴적 변경 없음. `--deep`은 opt-in이고, staleness·blog 필터는 `opts.blogFilter`
기본 true이지만 기존 후보를 무작정 떨어뜨리지 않는다 (staleness는 `>= 3` dated
posts guardrail로 보호됨).

회귀 테스트 플래그:
- `--no-quality-filter` — trading/listicle/deep-tech 필터 끔.
- `--no-blog-filter` — blog-level (stockRatio) + staleness 게이트 끔.

### Canary 결과

| Company | Mode | 이전 결과 | 이번 결과 | 주요 변화 |
|---|---|---|---|---|
| 엘앤에프 | 기본 | 14 qualified | 12 qualified | arirangya(2023-10), kfour7575(2024-12) stale 배제. 4/4 target top 5 유지. |
| SK하이닉스 | 기본 | — | 6 qualified | lbk4366/paranikid/torahome/gunyoung88/feel2269/dongil1012 전원 활성. |
| SK하이닉스 | `--deep` | gunyoung88 통과 | 0 qualified | gunyoung88 `stockRatio=0.00`으로 배제. **알려진 false positive** — readBlogPostList가 최근 20개 포스트에 주식 vocab이 없는 경우. 후속 작업 필요. |
| 삼성바이오로직스 | `--deep` | — | 0 qualified | dodam852/ittimesnews 포함 전원 배제 (정상). |

### 알려진 이슈

- **`stockPostRatio` 위음성 (false negative)**: deep 모드에서 `readBlogPostList`가
  반환하는 일반 타임라인이 주식 관련 어휘를 충분히 포함하지 않으면 진짜 애널리스트
  블로거도 배제된다. 예: SK하이닉스 deep의 `gunyoung88`. 최근 20개 포스트 제목이
  일반 투자 에세이·거시경제 성격이면 `isStockRelatedTitle` 매치가 낮게 나온다.
  대응책 후보: (a) `STOCK_RELATED_TERMS` 확장, (b) 임계값 0.5 → 0.3 완화, (c)
  blog name/카테고리 2차 시그널 추가. 현재는 `--no-blog-filter`로 수동 우회.

- **1~2 dated posts**: 날짜 파싱이 부분적으로만 되는 블로거는 staleness 판정
  유보. rcncap1(엘앤에프, 2024-12-08)처럼 분명히 stale한 후보도 guardrail에
  의해 통과한다. 의도된 trade-off — 거짓 양성보다 거짓 음성을 선호.

### 관련 문서

- `skills/kr-naver-blogger/references/workflow.md` — 워크플로 전체 설명. 이번에
  "Blog-Level Quality Filter", "Staleness Filter" 섹션 추가.
- `/home/sh/.claude/plans/sunny-growing-ripple.md` — 설계 계획 (staleness 섹션 포함).
