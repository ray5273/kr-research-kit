# 리서치 통계 운영

공개 사이트는 정적 빌드를 유지한다. `/admin`, `/admin/*`, `/api/analytics/events`만 Worker를 우선 실행한다. 관리자 HTML/JS는 Worker의 텍스트 모듈이며 `site-dist`에 복사하지 않는다. 수집은 설정과 DB 연결이 완료된 후 동의한 방문부터 시작한다. 기존 방문 데이터를 복원하지 않는다.

## GitHub 연동으로 최초 연결

1. D1 `kr-research`(ID `ec768f39-f7b3-4515-8095-804a6405bc77`)가 `wrangler.jsonc`의 `DB` 바인딩에 연결되어 있다. 배포 계정에 이 DB가 있어야 한다. 비밀번호는 소스에 넣지 않는다.
2. Cloudflare → Workers & Pages → **kr-research-site** → Settings → Variables and Secrets에서 아래 두 항목을 **Secret**으로 등록한다. 추가 창의 Deploy(저장 및 배포)까지 완료한다. 기존 Worker Secret을 그대로 상속한다. Builds → Build Variables and Secrets에 같은 이름으로 등록된 값도 지원하며, 배포 스크립트가 해당 두 값만 권한 0600의 임시 JSON 파일로 넘겨 암호화된 런타임 Secret으로 함께 등록하고 성공·실패 후 파일을 삭제한다. 값은 로그에 출력하지 않는다.
   - `ADMIN_PASSWORD`: 본인이 정한 관리자 비밀번호, 12~256자. 비밀번호 관리자로 만든 긴 무작위 값을 권장한다.
   - `ANALYTICS_HMAC_SECRET`: 암호학적 난수 32바이트 이상. 브라우저 식별자 HMAC 및 관리자 세션 서명에 사용한다. 값은 Git이나 대화에 보내지 않는다.
3. Access 앱 생성이나 이메일 설정은 필요 없다. `/admin/`에서 별도 비밀번호로 로그인한다. 비밀값이 없거나 형식이 맞지 않으면 관리자 접근과 로그인이 차단된다. 이미 사이트에 Access가 켜져 있다면 기존 정책이 별도로 적용되므로 의도한 공개 경로와 맞는지 확인한다.
4. Workers Builds의 Build command를 `npm ci && npm run check:site`, Deploy command를 `npm run deploy:site`로 설정한다. Node 22.22 이상을 사용한다. 배포 토큰에는 해당 Worker와 D1 마이그레이션 권한이 필요하다. Build watch paths에는 `package*.json`, `site/**`, `wrangler.jsonc`, 기존 빌드 스크립트/공개 자료 경로를 포함한다.
5. GitHub에 변경 내용을 push한다. 자동으로 테스트와 빌드를 실행하고, D1 마이그레이션을 적용한 뒤 Worker를 배포한다. 기존 정적 빌드 명령과 `npx wrangler deploy`만 사용하면 새 테스트와 마이그레이션이 생략되므로 위 명령으로 갱신한다.
6. 비로그인 상태에서 `/admin/`은 로그인 화면으로 이동하며, `/admin/app.js`와 `/admin/api/analytics`는 401을 반환하는지 확인한다. 로그인 후 페이지와 API가 정상이며 `Cache-Control: private, no-store`인지 확인한다. 관리자 경로에 별도 캐시 규칙을 만들지 않는다.
7. 공개 페이지에서 동의 전·거절 후에는 `/api/analytics/events` 요청이 없고, 허용 후 202가 반환되는지 확인한다. Cron은 매시 5분에 실행하므로 첫 집계까지 기다린다. `/admin`의 시작·마지막 수신·집계 시각을 확인한다.

`wrangler.jsonc`의 `secrets.required`로 실제 배포 바인딩을 Wrangler가 검증한다. 기존 `wrangler secret list` 결과만 보고 배포를 차단하는 사전 검사는 사용하지 않는다. 이름이 없으면 Wrangler의 누락 Secret 오류가 표시되며 인증은 계속 차단된다.

`npm run deploy:site`는 실제 원격 DB와 Worker를 변경하는 명령이다. 로컬 테스트에는 Cloudflare 로그인이나 운영 비밀값이 필요 없다.

## 관리자 인증

로그인 폼은 `/admin/login`, 로그아웃은 POST `/admin/logout`이다. 비밀번호는 HTTPS POST 본문에서만 받고 URL·분석 DB·로그에 저장하지 않는다. 서버에서 고정 길이 해시를 비교하고, 성공하면 최대 8시간 유효한 HMAC 서명 쿠키를 발급한다. 쿠키는 `__Host-` 접두사, `Secure`, `HttpOnly`, `SameSite=Strict`, `Path=/`를 사용한다. 서명은 비밀번호와 HMAC Secret 모두에 종속되고 사이트 origin에 묶여 있다. 둘 중 하나를 바꾸면 기존 로그인이 무효화된다. 로그아웃은 현재 브라우저 쿠키를 지운다.

로그인과 로그아웃은 같은 출처의 POST만 허용한다. 로그인 본문은 2KiB까지 받는다. D1의 영속 카운터로 전체 사이트에 15분 고정 구간당 로그인 시도 20회 제한을 적용한다(성공·실패 포함). IP는 저장하지 않는다. 공격이 있으면 본인도 다음 구간까지 기다려야 할 수 있다. 세션 쿠키가 유출된 경우 비밀번호를 교체해 기존 서명을 무효화한다.

## 로컬 개발

```sh
npm ci
npm run check:site
npx wrangler d1 migrations apply DB --local
npx wrangler dev --test-scheduled
```

`.dev.vars`에 로컬 테스트용 `ADMIN_PASSWORD`와 `ANALYTICS_HMAC_SECRET`을 넣을 수 있다(Git 제외). 관리자 인증 우회 스위치는 없다. 테스트는 로컬 테스트 비밀번호와 서명 쿠키를 사용하며 로그인·만료·위조·비밀번호 변경·출처 검증·시도 제한을 확인한다. 운영 Cloudflare 계정에는 연결하지 않는다. `site/analytics/test.mjs`는 Wrangler 번들을 실제 Miniflare D1에서 검증하고 `test-tracker.mjs`는 동의와 활성 시간의 경계 동작을 검증한다.

## 지표와 데이터 상태

- `page_view`는 이벤트 ID = 조회 ID, 재시도는 같은 ID로 보낸다. 서버는 HMAC 브라우저의 최근 활동이 30분 이내면 세션을 공유한다. 저장소 미사용 방문은 조회 단위로만 연결한다. 같은 조회에 대한 재시도는 기존 세션을 유지한다.
- 읽기 이벤트는 누적 최대값이다. 깊이와 활성 시간은 조회별 MAX를 사용하며, 내부 글 클릭률 분자는 한 번 이상 클릭한 조회 수다. 실제 이동은 같은 세션의 연속 페이지 조회로 계산하므로 클릭과 일치하지 않을 수 있다. 새 탭의 이동 순서는 수신된 조회 시각 기준이다.
- UTM은 최대 80자, 문자·숫자·공백·밑줄·점·슬래시·하이픈만 허용한다. 그 외 값은 비운다. 리퍼러는 도메인만 남기고 첫 진입의 도메인·UTM을 해당 세션의 후속 조회에도 적용한다. 외부 도메인 없는 방문은 ‘직접·알 수 없음’이다. 임의 URL 쿼리, IP와 User-Agent는 저장하지 않는다.
- 세션 수와 재방문 세션 비율은 해당 기간에 시작한 관측 세션 기준이다. 글 상세의 세션 수는 그 글에서 시작한 세션이다. 평균 활성 시간과 깊이의 분모는 전체 해당 조회 수다. 완독률은 글 조회만 분모에 포함한다. 검색/목록 등 일반 페이지에는 읽기 이벤트를 수집하지 않는다.
- 최근 90일 이내 화면의 고유 브라우저 수는 상세 기록에서 기간 전체 중복 제거한다. 저장소 미사용 방문은 고유 브라우저 수에 포함하지 않는다. 365일 화면에서는 일별 고유 수만 제공하며 합산하지 않는다.
- 최근 완료된 7일의 글 조회가 30회 미만이면 ‘표본 부족’. 유입 증가는 직전 7일도 30회 이상이며 50% 이상 증가할 때, 읽기 개선은 완독률 <30%, 이어 읽기 개선은 클릭률 <10%, 추천 검토는 완독률 ≥60% 및 클릭률 ≥20%다. 이 규칙은 관측된 표본의 상관관계이며 원인을 추정하지 않는다.
- Cron은 KST 오늘과 최근 2일을 트랜잭션으로 덮어써 지연 도착을 반영한다. 수신은 과거 48시간 이내로 제한한다. 90일이 지난 상세와 식별자를 지우고, 365일의 KST 일별 집계만 남긴다. 삭제는 시간별 Cron마다 적용하므로 만료 후 최대 약 1시간 지연된다.
- 집계가 없는 날짜는 비어 있는 상태로 제공한다. 0으로 보간하지 않는다. `coverageHours`는 성공한 Cron의 UTC 시간 목록이며, 수집의 완전성을 보증하지 않는다. `health.state`가 `delayed`이면 마지막 집계 후 2시간 이상 지연된 상태, DB 쿼리 실패는 503 `error`, 최초 수신 전은 `empty`다. 수집 클라이언트는 일부 5xx 이벤트를 메모리에서 재시도하지만 페이지 종료 시 손실될 수 있다. 누락 규모는 알 수 없다.

## 한도와 장애

무료 플랜을 전제로 별도 유료 서비스는 사용하지 않는다. 이벤트는 최대 30개·32KiB, 15초 단위 묶음이며 유휴 탭은 전송을 멈춘다. 일별 조회, 시간·뷰·브라우저 인덱스로 읽기 비용을 줄인다. 공개 수집 API는 출처를 검증하지만 자동화된 조작을 완전히 막지는 못한다. 트래픽이 늘면 Cloudflare 대시보드의 Worker/D1 무료 할당량을 확인하고 필요시 해당 경로에 플랫폼 rate limit을 설정한다. 별도 IP 식별자를 DB에 넣지 않는다.

Cron 실패는 Cloudflare 대시보드의 실패 이력과 관리자 집계 지연으로 확인한다. 장애 복구 후 `aggregate`를 다시 실행하면 최근 2일이 재집계된다. 상세 기록은 남아 있지만 2일보다 오래된 집계가 필요한 경우 보관 기간 내에서 별도 유지보수 작업으로 수행한다. 자동 재실행이 과거 365일을 원본 없이 재작성하지 않도록 한다.

참고: [Worker 우선 라우팅](https://developers.cloudflare.com/workers/static-assets/routing/worker-script/), [Cloudflare Secrets](https://developers.cloudflare.com/workers/configuration/secrets/).
