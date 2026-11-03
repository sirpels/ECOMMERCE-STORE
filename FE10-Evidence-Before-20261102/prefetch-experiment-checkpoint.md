# FE-10 prefetch checkpoint — 2026-11-02

This is a **local production-build diagnostic**, not a Lighthouse score and not a deployed result. The clean production Lighthouse JSON files in this folder remain the before baselines. The earlier extension-affected files remain separate and are not used as a comparison.

## Source and conditions

- Unchanged source: Git `53f6bba` on `feat/fe10-a11y-performance`, identical source tree to tracked FE-AA2 merge `origin/main` (`dbe62fb`) at inspection time.
- Patched source: same revision plus one uncommitted change to `app/components/site-header.tsx`: the Advisor navigation Link has `prefetch={false}`; other navigation links use the default (`null`).
- Both versions: `npm run build` passed; served by `next start -p 3103` at `http://localhost:3103/`.
- Browser: Playwright headless Chromium; 375 × 812 CSS viewport, device scale factor 1, mobile user agent, CDP 4× CPU slowdown, 150 ms RTT, 204,800 B/s download and 84,375 B/s upload. A new browser context was used for each run; no application route was visited beforehand.
- Collection: three sequential runs per version. The blocking-time **proxy** is the sum of each Long Tasks API duration above 50 ms from FCP until 5,000 ms. It is **not** Lighthouse Total Blocking Time, which has different collection and end conditions. Navigation durations are wall-clock time from Playwright click to the destination heading becoming visible.
- No Gemini calls were made. There was no remote production/preview deployment or code commit.

## Individual results

| Version | Run | FCP ms | LCP ms | Blocking proxy ms | Home JS transferred bytes | RSC requests before navigation | Home → Lace ms | Lace → Advisor ms | Advisor chunk on home? | Advisor loaded after click? |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| Unchanged | 1 | 1,224 | 2,088 | 405 | 244,549 | 24 | 632 | 683 | Yes | Yes |
| Unchanged | 2 | 796 | 1,400 | 335 | 244,549 | 24 | 558 | 647 | Yes | Yes |
| Unchanged | 3 | 1,016 | 1,384 | 341 | 244,549 | 24 | 511 | 772 | Yes | Yes |
| Advisor prefetch off | 1 | 1,552 | 2,200 | 307 | 153,023 | 22 | 576 | 1,743 | No | Yes |
| Advisor prefetch off | 2 | 764 | 1,384 | 307 | 153,023 | 22 | 434 | 1,723 | No | Yes |
| Advisor prefetch off | 3 | 936 | 1,404 | 339 | 153,023 | 22 | 600 | 1,791 | No | Yes |

## Medians and interpretation

| Metric | Unchanged median | Patch median | Observed difference |
| --- | ---: | ---: | ---: |
| FCP | 1,016 ms | 936 ms | −80 ms |
| LCP | 1,400 ms | 1,404 ms | +4 ms |
| Blocking proxy | 341 ms | 307 ms | −34 ms |
| Home JS transferred | 244,549 B | 153,023 B | −91,526 B |
| Home → Lace | 558 ms | 576 ms | +18 ms |
| Lace → Advisor | 683 ms | 1,743 ms | +1,060 ms |

The Advisor route-specific chunk `1rnvo2ej4ayl7.js` was present during unchanged homepage loading and absent from patched homepage loading in all three runs. It loaded on deliberate Advisor navigation in all patched runs. The slower first Advisor transition is a measured tradeoff under these diagnostic conditions. The small blocking-proxy difference is not enough to claim a Lighthouse-score improvement.

## Measurement blocker

Lighthouse is not installed locally or globally, and no dependency installation is authorized. Therefore there are no matched local Lighthouse after scores, no median Lighthouse TBT, and no after Lighthouse screenshot. Production clean baselines were not compared directly against these local production builds.

Before proceeding to the approved accessibility changes, run three clean Lighthouse mobile Performance + Accessibility audits for each unchanged and patched **production-mode local build**, using the same Chrome version, viewport, throttling, cache reset, and server conditions. Save all JSON reports and screenshots, then compare medians and navigation impact. Do not treat the single deployed baseline or the earlier extension-affected run as the unchanged local comparator.
