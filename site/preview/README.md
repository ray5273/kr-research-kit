# 정적 프리뷰

기업 이력·계산기 등 정적 기능을 운영 Worker와 분리해 검토한다. 광고와 방문 통계·댓글·공유 집계 클라이언트를 빼고 모든 응답·HTML에 noindex를 지정한다. 관리자·API·D1을 배포하지 않는다. canonical은 기존 발행 주소를 유지한다.

```sh
npm run deploy:preview
```

기존 `site/pages-proxy` 배포는 운영 Worker로 전달하므로 새 정적 코드를 검토하는 프리뷰에는 사용하지 않는다. `main` 브랜치 배포는 기존 절차를 유지한다.

고정 검토 주소: **https://preview.kr-research-site.pages.dev/**

작업 Git 브랜치나 PR이 바뀌어도 Pages 배포 대상은 항상 `--branch preview`로 유지한다. 이 별칭은 가장 최근에 배포한 작업을 보여주므로 PR마다 검토 주소를 만들지 않는다. 개별 배포의 해시 주소는 과거 버전 비교에만 사용한다. 여러 PR을 동시에 배포하면 마지막 배포가 공통 주소를 갱신한다. 기존 `preview-earnings-research` 주소는 이전 배포용으로 남고 새 갱신에는 사용하지 않는다.

`deploy:preview`는 현재 체크아웃의 내용을 정적 빌드해 고정 별칭으로 배포한다. PR 자동 배포 트리거를 새로 만드는 명령은 아니다. 운영 배포 대상 `main`과 공개 canonical은 유지하며, 프리뷰는 계속 noindex다.

프리뷰의 공유 영역은 현재 프리뷰 URL을 복사하는 로컬 기능만 제공한다. 댓글 입력 폼·미작동 집계·통계 설정은 제거한다. `npm run test:preview`가 실제 빌드 HTML과 복사 동작을 확인한다.

인기 리서치 상자는 D1이 없으므로 `prepare.mjs`가 만든 고정 예시 순위(`/api/popular` → `api/popular.json`)로 표시하고, 안내 문구를 "프리뷰 예시 순위 · 실제 조회수가 아닙니다"로 바꾼다.
