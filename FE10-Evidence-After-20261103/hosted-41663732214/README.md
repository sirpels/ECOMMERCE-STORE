# FE-10 hosted matched Lighthouse evidence

The [GitHub Actions run](https://github.com/sirpels/ECOMMERCE-STORE/actions/runs/41663732214) completed successfully. Its `matched-mobile-lighthouse` job built and audited the unchanged released source (`53f6bba27bba17d2d98c32be2a797051d8d2dd53`) and then the FE-10 candidate (`71ee99889367513cb2ac66357b1fdaa612e9282f`). The full `fe10-hosted-lighthouse` artifact (ID `13245765393`) contains **all 18** JSON reports, HTML reports, and real Lighthouse score screenshots. This folder keeps the two complete run summaries, both median/range summaries, and one genuine score screenshot for each page and variant.

Both builds were normal production builds with no diagnostic browser source maps. The runner used Node `22.22.0`, lockfile-pinned Chrome for Testing `156.0.8078.4`, and standalone Lighthouse `13.5.0`. Each page had three cold Lighthouse runs at 412 × 823 CSS pixels, DPR 1.75, mobile emulation, simulated 150 ms RTT / 4× CPU throttling, and the same cache/storage-reset behavior. No run recorded a Lighthouse warning. The Advisor was not sent a message, so these are page-load results, not Gemini or interactive-state tests.

| Page | Released performance (all runs; median) | Candidate performance (all runs; median) | Accessibility (both variants) | Released median FCP / LCP / TBT | Candidate median FCP / LCP / TBT |
| --- | --- | --- | --- | --- | --- |
| Home | 98, 99, 98; **98** | 97, 98, 100; **98** | 100 | 907 / 2400 / 47 ms | 910 / 2403 / 48 ms |
| Lace | 99, 96, 95; **96** | 87, 97, 96; **96** | 100 | 755 / 2706 / 94 ms | 756 / 2706 / 100 ms |
| Advisor | 99, 99, 99; **99** | 99, 98, 99; **99** | 100 | 756 / 2109 / 81 ms | 757 / 1961 / 88 ms |

All CLS readings were 0. One candidate Lace run scored 87; it is retained in the artifact and summary, not discarded. All hosted runs exceeded the assignment's absolute 80 performance minimum and reached 100 automated accessibility. The performance medians were unchanged, so this comparison **does not establish a performance improvement**. The comparison is local production builds on a GitHub-hosted runner, not the deployed Vercel site; it must not be mixed with deployed baselines or earlier laptop audits.

- [Released run summary](released/summary.json) and [median/range summary](released/medians-and-ranges.json)
- [Candidate run summary](candidate/summary.json) and [median/range summary](candidate/medians-and-ranges.json)
- Released score screenshots: [Home](released/home-1-score.png), [Lace](released/lace-2-score.png), [Advisor](released/advisor-2-score.png)
- Candidate score screenshots: [Home](candidate/home-2-score.png), [Lace](candidate/lace-3-score.png), [Advisor](candidate/advisor-1-score.png)

The existing Vercel preview required login when checked; no public preview Lighthouse result was obtained. Production remains on the previously released source until the developer approves a merge and deployment.
