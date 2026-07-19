# 제닉 Sell-Side / Research Digest

- 기준일: 2026-07-03
- 대상: 제닉 (123330, KOSDAQ)
- 작성 방식: `kr-analyst-report-discover`는 Hankyung/Naver 경로에서 gstack 브라우저 오류로 빈 인덱스를 반환했으므로, 공개 검색으로 확인된 최근 PDF와 IRGO 리포트 목록을 수동 보강했다.
- 주의: 아래 내용은 증권사 및 유관기관의 관점 요약이며, DART 공시로 확인되는 사실과 구분해 사용한다.

## Consensus Snapshot

최근 공개 리포트 대부분은 `Not Rated` 또는 목표주가 미제시다. 확인된 수치형 추정치는 KIRS 2026년 예상치와 하나증권의 2Q26 추정치가 중심이며, 공식 컨센서스 TP 중앙값은 산출하지 않았다.

| Source | Date | Rating / TP | Key Estimate | Link |
| --- | --- | --- | --- | --- |
| KIRS | 2026-04-09 | N/R | 2026E 매출 1,019억원, 영업이익 226억원, 지배순이익 207억원 | https://w4.kirs.or.kr/download/research/260409_%EC%A0%9C%EB%8B%89.pdf |
| 유안타증권 | 2026-05-14 | Not Rated / TP 없음 | 마스크팩 수출 확대와 CAPA 확대를 2026년 호실적 요인으로 제시 | https://file.alphasquare.co.kr/media/pdfs/market-report/%EC%A0%9C%EB%8B%8926%EB%85%8420260514%EC%9C%A0%EC%95%88%ED%83%80%EC%A6%9D%EA%B6%8C. |
| 하나증권 | 2026-06-05 | Not Rated / TP 없음 | 2Q26 매출 396억원, 영업이익 76억원 전망; 1Q26 수익성 저하는 수율/초과근무 이슈로 해석 | https://www.hanaw.com/main/research/research/download.cmd?attachFileSeq=1&bbsCd=2224&bbsId=&bbsSeq=1287448&dbType= |
| IRGO 리포트 목록 | 2026-06-24 | 교보증권 N/R 리포트 존재 확인 | "탐방 노트: 지금은 초호황" 리포트가 등록되어 있으나 직접 PDF 다운로드는 접근 제한으로 실패 | https://m.irgo.co.kr/IR-COMP/123330/-IR-PAGE |

## Decision-Relevant Street Takeaways

- `Street view`: KIRS는 2026년 실적을 매출 1,019억원, 영업이익 226억원, 지배순이익 207억원으로 전망한다. 이는 2025년 DART 기준 매출 782억원, 영업이익 150억원보다 추가 성장을 전제한다.
- `Street view`: 하나증권은 1Q26 매출 294억원이 역대 최대 수준이지만, 영업이익률 12%대가 기대보다 낮았다고 해석했다. 핵심 논점은 주문 증가 자체보다 수율 정상화와 라인 증설 후 마진 회복이다.
- `Street view`: 유안타증권은 마스크팩 수출 확대와 CAPA 확대를 2026년 호실적의 두 축으로 제시했다.
- `Not separately disclosed`: 주요 고객사 이름, 고객별 매출 비중, 신제품 수율 문제의 고객별 영향은 DART에서 별도 공시되지 않는다.

## Source Quality

- PDF 추출 성공: KIRS 2026-04-09, 유안타 2026-05-14, 하나 2026-06-05.
- 접근 제한: 교보증권 2026-06-24 PDF는 `RSDownloadServlet` 직접 다운로드가 차단되어 IRGO/뉴스 목록 확인까지만 반영했다.
- 자동 리포트 체인 상태: `discover-reports.js`는 gstack 브라우저 활성 페이지 오류로 Hankyung/Naver에서 빈 결과를 반환했다.
