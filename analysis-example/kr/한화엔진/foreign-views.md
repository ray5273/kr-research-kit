## Foreign-IB Coverage Check

- **Coverage window:** 2025-07-12 to 2026-07-12.
- **Result:** No recent foreign-IB view is included. I found no dated Korean news article in the checked results that jointly identified a foreign broker, its rating/view, and a target price for Hanwha Engine (082740).
- **Method limitation:** `kr-foreign-analyst` was invoked on 2026-07-12 and wrote [`foreign-coverage.json`](foreign-coverage.json), but its Naver News discovery calls failed because the installed `kr-naver-browse` interface lacks `searchNaverNewsStructured`; consequently it inspected zero articles. A separate web query did not surface a qualifying article. This is a **coverage gap / unverified**, not evidence that no foreign-IB research exists.
- **Use in memo:** Do not attribute a foreign-broker rating, target price, or thesis to this company until a dated Korean news URL supports all three fields. Track subsequent Naver/major Korean financial-news coverage and rerun after the browser-wrapper compatibility issue is repaired.
