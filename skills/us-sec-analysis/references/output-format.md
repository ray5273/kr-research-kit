# Output Format

Default to Korean for user-facing output unless the user explicitly asks for English.

<!-- US_SEC_REFERENCE_DIGEST_SECTION -->

<!-- US_SEC_SOURCE_MAP_SECTION -->

## Default SEC Analysis

Write this to `analysis-example/us/<company>/sec-analysis.md` when the workspace is writable and the user wants a reusable artifact.

```md
# <Company> SEC 분석

## 범위
- 회사명:
- 티커:
- CIK:
- 기준일:
- 대상 filings:
- SEC 수집 경로:

## Filing Set
| 역할 | Form | Accession | Filed | Period | Primary document | Source |
| --- | --- | --- | --- | --- | --- | --- |

## XBRL 핵심 지표
| 지표 | 값 | 단위 | 기간 | Form | Filed | Accession | Concept | 비고 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |

## 10-K 핵심 섹션
| Item | 섹션 | 상태 | 핵심 내용 | Source |
| --- | --- | --- | --- | --- |

## 10-Q 핵심 섹션
| Item | 섹션 | 상태 | 핵심 내용 | Source |
| --- | --- | --- | --- | --- |

## 최신 8-K 메타데이터
| Filed | Accession | Items | Primary document | Source |
| --- | --- | --- | --- | --- |

## 미공시 또는 별도 확인 필요
- ...

## Source Map
| 주장 또는 숫자 | Source type | 문서/Concept | Filed | Accession | URL | 상태 |
| --- | --- | --- | --- | --- | --- | --- |
```

## SEC Reference Digest

For long filings or memo-critical work, create a companion digest:

```md
# <Company> SEC Reference

<!-- US_SEC_REFERENCE_DIGEST_EXAMPLE -->

## Reference Cache Metadata
- 회사명:
- 티커:
- CIK:
- 기준일:
- 생성일:
- filings:

## Filing Set
| 역할 | Form | Accession | Filed | Period | URL |
| --- | --- | --- | --- | --- | --- |

## XBRL Core Facts
| Metric | Latest value | Unit | Period | Form | Filed | Concept | Accession |
| --- | --- | --- | --- | --- | --- | --- | --- |

## Section Coverage
| Item | Title | Status | Content length | Numeric blocks |
| --- | --- | --- | --- | --- |

## Key Section Digest
| Item | Title | Preview | Status |
| --- | --- | --- | --- |

## Not Separately Disclosed / Needs Review Log
- ...

## Source Map
| Claim or metric | Source type | Document or concept | Filed | Accession | URL | Status |
| --- | --- | --- | --- | --- | --- | --- |

## Next Update Checklist
- ...
```

## Rules

- Keep accession numbers and source URLs visible in every material row.
- Preserve XBRL units exactly, including `USD`, `shares`, or `USD/shares` style units.
- Use `not separately disclosed in standard SEC companyfacts` when the standard concept is absent but the filing may include custom tags or narrative disclosure.
- Use `needs_review` when a filing section is parser-weak.
- Do not add a target price, investment rating, or valuation conclusion in SEC analysis mode unless the user explicitly asks for broader `us-stock-analysis`.
