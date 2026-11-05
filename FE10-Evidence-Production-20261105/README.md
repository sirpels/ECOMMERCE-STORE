# FE-10 production evidence — 2026-11-05

The deployed site was audited at commit `e5bd6d5eec9be772d74102d8b8a8b7ce865df7b2`.

- [GitHub Actions run 41963417016](https://github.com/sirpels/ECOMMERCE-STORE/actions/runs/41963417016) retained all nine production Lighthouse JSON/HTML reports and score screenshots in its `fe10-hosted-lighthouse` artifact.
- [`lighthouse/summary.json`](lighthouse/summary.json) records every run and its settings.
- [`lighthouse/medians-and-ranges.json`](lighthouse/medians-and-ranges.json) records medians and ranges.
- [`lighthouse/screenshots/`](lighthouse/screenshots/) contains one representative genuine Lighthouse score screenshot per route.
- [`wave/`](wave/) contains official WAVE extension counts and screenshots for Home, the open Lace dialog, and the Advisor initial state.
- [`production-regression.json`](production-regression.json) records the 375px keyboard, layout, route, Bag Studio and WhatsApp-destination checks.

The production Advisor request made during the regression pass exposed the Stop control and left the composer usable, but the automation did not capture visible generated text. Production streaming is therefore not claimed as verified by this pass. The earlier Windows Narrator evidence used a clearly identified deterministic local fixture.
