# Pages 무료 공개 주소

공개 주소는 https://kr-research-site.pages.dev 이다. 애드센스 사이트 입력에서 기존 Worker 주소가 하위 도메인으로 거절되어, 추가 도메인 구매 없이 등록을 시도할 수 있도록 연결했다. 이 주소의 애드센스 등록 허용과 콘텐츠 승인은 실제 계정에서 확인해야 한다.

Pages `kr-research-site`는 `RESEARCH` 서비스 바인딩으로 기존 Worker `kr-research-site`에 요청을 전달한다. 주소·Origin·쿠키·POST 본문을 보존한다. Worker의 D1, 관리자 Secret, 예약 집계는 그대로 사용하며 Pages에 비밀번호를 복사하지 않는다. 공개 주소는 Pages 하나만 사용한다. 기존 `kr-research-site.ray527321.workers.dev` 공개 경로와 Worker 미리보기 URL은 루트 `wrangler.jsonc`의 `workers_dev: false`, `preview_urls: false`로 비활성화한다. Worker 자체는 삭제하지 않는다. Pages 서비스 바인딩과 D1·예약 집계는 공개 경로 없이 동작한다. canonical·사이트맵·피드·OG 주소는 Pages를 가리키며, 변경된 사이트는 기존 `npm run check:site`와 `npm run deploy:site`로 발행한다.

초기 연결 또는 프록시 코드 변경 시:

```sh
npm run test:pages
npm run deploy:pages
```

`prepare.mjs`는 `_worker.js`와 `_routes.json`만 `.tmp/pages-proxy`에 복사한다. 설정·운영 문서·비밀값을 정적 자산으로 올리지 않는다. 실제 Pages 프로젝트가 있어야 한다. 새 프로젝트를 만들 때 Wrangler가 Workers 배포로 자동 전환하는 버전이 있으므로 `--cwd site/pages-proxy`로 advanced-mode 프로젝트 문맥을 지정하고, 배포 결과의 `pages.dev` 주소를 확인한다. Pages 미리보기에는 `X-Robots-Tag: noindex, nofollow`를 붙인다.

Cloudflare의 무료 요청 할당량 안에서 운영한다. 공개 요청마다 Pages Function과 대상 Worker가 실행되므로 요청 수는 일반 정적 Pages 호스팅과 다르다. Pages 신규 비밀값이나 별도 DB는 필요 없다.

확인: 글·이미지·urls.json·사이트맵의 응답을 빌드와 대조하고 `/admin/api/analytics`와 `/admin/app.js`의 비로그인 401, `/admin/`의 로그인 이동, 크로스 오리진 수집 요청의 403을 확인한다. 동의하지 않은 사람의 분석 이벤트를 검증 목적으로 생성하지 않는다.

공식 문서: [서비스 바인딩](https://developers.cloudflare.com/pages/functions/bindings/#service-bindings), [advanced mode](https://developers.cloudflare.com/pages/functions/advanced-mode/).

기존 주소 비활성화 확인: Pages 홈·글·이미지·ads.txt와 관리자 보호를 확인한 뒤 기존 Worker 주소가 공개 콘텐츠를 반환하지 않는지 확인한다. 설정을 되돌려야 할 경우 `workers_dev: true`로 재배포한다.
