# FE-10 local production-build profile — 2026-11-02

Exploratory Chrome Performance traces, **not Lighthouse runs** and **not deployed results**. The source is commit `53f6bba` plus the uncommitted FE-10 accessibility changes on `feat/fe10-a11y-performance`. No Gemini request was made.

## Conditions

- `npm run build`, then `npm run start -- -p 3103`; one fresh Chromium 156.0.8078.4 context per route.
- Mobile emulation: 412 × 823 CSS pixels, DPR 1.75, touch enabled.
- CDP: cache disabled; 4× CPU slowdown; 150 ms latency; 204,800 B/s down and 84,375 B/s up.
- Trace began before navigation and ended after network idle plus three seconds. Coverage and a separate CPU sample profile were captured. These conditions resemble, but are **not identical to**, the clean production Lighthouse simulation. Single exploratory runs are not medians and cannot establish a score improvement.

| Local route | HTTP | Observer long tasks / summed duration | Next JS bytes transferred | Key trace observations |
| --- | ---: | ---: | ---: | --- |
| Home | 200 | 2 / 440 ms | 246,105 | Main-thread initial layout ~363 ms; `209aaqjv6z8gh.js` evaluation ~381 ms. |
| Lace | 200 | 1 / 352 ms | 246,105 | Main-thread initial layout ~350 ms; same root chunk evaluation ~348 ms. Lace image response ~128,122 B. |
| Advisor | 200 | 3 / 773 ms | 246,105 | Main-thread initial layout ~363 ms, root chunk evaluation ~324 ms and later function call ~392 ms. |

The observer's task totals are **not Lighthouse TBT**: its observation window and calculation differ. Background V8 parsing events are not main-thread blocking time and should not be added to these totals. Exact timing fluctuates across runs.

## Attribution supported by artifacts

- `.next/build-manifest.json` lists `209aaqjv6z8gh.js` and `2xkfcaku-px-l.js` as shared `rootMainFiles` for every route. The former contains `appBootstrap` and React DOM code; the latter begins with Next routing utilities. Their measured main-thread work is primarily framework/bootstrap work, though minified stacks do not identify every nested function.
- `.next/server/app/advisor/page_client-reference-manifest.js` maps `app/advisor/advisor-chat.tsx` to `3rq4t2jdv8jx6.js` and smaller chunks. Coverage recorded only 1/7 top-level functions called in that larger chunk on Home and Lace, versus 232/1352 functions called on Advisor. The chunk is fetched/parsed on Home and Lace during default prefetch, but this trace does **not** show its application chat logic as the dominant main-thread task there. Turning off prefetch was separately rejected because it slowed the first Lace → Advisor transition.
- `.next/server/app/lace/page_client-reference-manifest.js` maps `app/lace/lace-photo-zoom.tsx` to `0kyot4svflzmp.js` and a small shared chunk. CPU samples attributed only ~8 ms to one minified function in that route chunk during the separate Lace profile. This is not enough to implicate the zoom component in the large shared startup tasks.
- The CPU profiles' largest named samples include the Turbopack runtime loader and minified root chunks. Without production source maps or unminified call stacks, finer attribution to a specific React/Next function or application operation is **uncertain**.

## Distinct deployed Lighthouse findings (not local comparisons)

- Home clean baseline: performance 79, accessibility 100, LCP ~1.4 s (hero image), TBT ~940 ms, unused-JS estimate ~119 KiB.
- Lace clean baseline: 83/100, LCP ~2.6 s (lace photograph), TBT ~560 ms. The report shows `fetchpriority="high"` **and** `loading="lazy"` on that LCP image, ~429 ms resource-load delay and ~69 KiB estimated image-delivery savings. This is a page-specific LCP issue, distinct from shared scripting.
- Advisor clean baseline: 80/100, LCP ~1.4 s (introductory text), TBT ~880 ms and ~575 ms LCP element-render delay. Its interactive chat bundle executes here; the trace does not prove how much of the delay a particular application function causes.

The smallest evidence-supported **proposal for human approval**, not implemented here: set `loading="eager"` on the above-the-fold preview `<Image>` in `app/lace/lace-photo-zoom.tsx`, retaining `fetchPriority="high"`. The installed Next 16 Image guide recommends eager loading for above-the-fold images and does not recommend combining preload with `fetchPriority`. The tradeoff is earlier competition for ~128 KiB of photo transfer on a constrained connection. Compare unchanged and one-prop-changed production builds with at least three matched mobile Lighthouse runs per version, plus Lace initial request timing and Home → Lace navigation; retain or reject based on measured LCP/performance and navigation, not this single diagnostic trace. No Home/Advisor code optimization is supported strongly enough yet.

## Files

- `home-trace.json`, `lace-trace.json`, `advisor-trace.json`: Chrome trace events; import into Chrome DevTools Performance panel.
- `home-profile.json`, `lace-profile.json`, `advisor-profile.json`: run conditions, resource transfers, long-task entries and precise coverage.
- `home.cpuprofile`, `lace.cpuprofile`, `advisor.cpuprofile`: separate Chrome CPU samples; import into Chrome DevTools Performance/JavaScript profiler.
- `profile.mjs`, `cpu-profile.mjs`, `analyze.mjs`: reproducible evidence collection and analysis scripts. These are not application source and should not be deployed.
