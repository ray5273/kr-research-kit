# 정적 프리뷰

기업 이력·계산기 등 정적 기능을 운영 Worker와 분리해 검토한다. 광고와 방문 통계·댓글·공유 집계 클라이언트를 빼고 모든 응답·HTML에 noindex를 지정한다. 관리자·API·D1을 배포하지 않는다. canonical은 기존 발행 주소를 유지한다.

새 글·수정 글은 [가독성 검토 스킬](../../skills/kr-article-readability/SKILL.md)로 검토하고 기록한다. `npm run deploy:preview`는 `predeploy:preview`에서 `check:readability`를 먼저 실행하며, 검토 기록이 없거나 내용이 바뀌면 업로드 전에 중단한다. 운영 사이트·Pages 배포 명령에도 같은 검사가 적용된다.

```sh
npm run check:readability
npm run deploy:preview
```

기존 `site/pages-proxy` 배포는 운영 Worker로 전달하므로 새 정적 코드를 검토하는 프리뷰에는 사용하지 않는다. `main` 브랜치 배포는 기존 절차를 유지한다.

고정 검토 주소: **https://preview.kr-research-site.pages.dev/**

작업 Git 브랜치나 PR이 바뀌어도 Pages 배포 대상은 항상 `--branch preview`로 유지한다. 이 별칭은 가장 최근에 배포한 작업을 보여주므로 PR마다 검토 주소를 만들지 않는다. 개별 배포의 해시 주소는 과거 버전 비교에만 사용한다. 여러 PR을 동시에 배포하면 마지막 배포가 공통 주소를 갱신한다. 기존 `preview-earnings-research` 주소는 이전 배포용으로 남고 새 갱신에는 사용하지 않는다.

`deploy:preview`는 현재 체크아웃의 내용을 정적 빌드해 고정 별칭으로 배포한다. PR 자동 배포 트리거를 새로 만드는 명령은 아니다. 운영 배포 대상 `main`과 공개 canonical은 유지하며, 프리뷰는 계속 noindex다.

프리뷰의 공유 영역은 현재 프리뷰 URL을 복사하는 로컬 기능만 제공한다. 댓글 입력 폼·미작동 집계·통계 설정은 제거한다. `npm run test:preview`가 실제 빌드 HTML과 복사 동작을 확인한다.

인기 리서치 상자는 D1이 없으므로 `prepare.mjs`가 만든 고정 예시 순위(`/api/popular` → `api/popular.json`)로 표시하고, 안내 문구를 "프리뷰 예시 순위 · 실제 조회수가 아닙니다"로 바꾼다.

## Cloudflare DNS 오류 해결 기록 (2026-11-05)

증상: Wrangler가 `Unable to resolve Cloudflare's API hostname`로 실패하고, Node의 시스템 조회가 `ENOTFOUND`를 반환했다. 같은 환경에서 공개 DNS에 직접 질의하면 정상 응답했다. 배포 프로세스에만 대체 DNS 조회를 적용한 뒤 기존 OAuth 로그인과 preview 배포가 모두 성공했다. 인증 만료로 단정하거나 재로그인부터 시도하지 말고 DNS와 인증을 나눠 확인한다.

먼저 시스템 조회와 공개 DNS 조회를 비교한다.

```sh
node -e "require('node:dns').lookup('api.cloudflare.com',(e,a)=>console.log(e?.code||a))"
node -e "const d=require('node:dns');d.setServers(['1.1.1.1']);d.resolve4('api.cloudflare.com',(e,a)=>console.log(e?.code||a))"
```

첫 명령만 실패하고 두 번째 명령은 성공하면 아래 임시 preload를 만든다. 시스템 조회가 `ENOTFOUND` 또는 `EAI_AGAIN`으로 실패할 때만 해당 Node 프로세스에서 Cloudflare 공개 DNS를 사용한다. `dns.promises.lookup`도 함께 처리한다.

```sh
mkdir -p .tmp
cat > .tmp/preview-dns.cjs <<'EOF'
const dns = require('node:dns');
const net = require('node:net');
const original = dns.lookup.bind(dns);
const resolver = new dns.Resolver();
resolver.setServers(['1.1.1.1', '1.0.0.1']);
dns.lookup = function(host, options, callback) {
  if (typeof options === 'function') { callback = options; options = {}; }
  const opts = typeof options === 'number' ? {family: options} : (options || {});
  return original(host, opts, (error, address, family) => {
    if (!error || net.isIP(host) || !['ENOTFOUND','EAI_AGAIN'].includes(error.code)) return callback(error, address, family);
    const v6 = opts.family === 6;
    resolver[v6 ? 'resolve6' : 'resolve4'](host, (resolveError, addresses) => {
      if (resolveError || !addresses?.length) return callback(resolveError || error);
      const resolvedFamily = v6 ? 6 : 4;
      if (opts.all) callback(null, addresses.map(address => ({address, family: resolvedFamily})));
      else callback(null, addresses[0], resolvedFamily);
    });
  });
};
dns.promises.lookup = (host, options) => new Promise((resolve, reject) => dns.lookup(host, options || {}, (e, a, family) => e ? reject(e) : resolve(options?.all ? a : {address:a,family})));
EOF
```

로그인 상태를 확인한 뒤 같은 설정으로 배포한다. 아래 명령은 저장소 루트에서 실행한다.

```sh
NODE_OPTIONS="--require=$PWD/.tmp/preview-dns.cjs" WRANGLER_SEND_METRICS=false npx --no-install wrangler whoami
NODE_OPTIONS="--require=$PWD/.tmp/preview-dns.cjs" WRANGLER_SEND_METRICS=false npm run deploy:preview
```

이 방법은 시스템 DNS·VPN·TLS 검증 설정을 바꾸지 않는다. 명령이 끝나면 프로세스 한정 설정도 끝난다. 공개 DNS로 조회할 수 있는 배포용 호스트에만 사용한다. 공개 DNS 조회까지 실패하면 이번 사례와 다른 연결 문제이며, 로그인 오류가 반환되면 그때 별도로 인증을 점검한다.

배포 성공 메시지와 별칭만으로 끝내지 말고 실제 글의 HTTP 200, HTML의 `noindex,nofollow`, 응답의 `X-Robots-Tag`, `/robots.txt`의 `Disallow: /`를 확인한다. 검증용 Node 명령에도 같은 `NODE_OPTIONS`를 적용할 수 있다.

이번에 확인한 글: https://preview.kr-research-site.pages.dev/sector/clarity-act-2026-11-05/

성공 배포: https://317e894e.kr-research-site.pages.dev — 고정 preview 별칭의 실제 글 응답과 noindex까지 확인했다.
