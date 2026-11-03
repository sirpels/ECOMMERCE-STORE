## FE-10 accessibility and performance audit — draft

This PR adds a keyboard-visible Skip to main content link, polite batched announcements for newly streamed Advisor answer text, a shorter informative/illustrative Home hero alt, and eager loading for the above-the-fold Lace preview. The larger Lace dialog image remains on demand. Advisor navigation retains default prefetch. No Gemini, API, checkout, 3D, dependency or design changes are intended.

The developer chose to retain Lace eager loading as a loading strategy, **not** as a proven Lighthouse improvement. The isolated prefetch experiment was rejected because its first Lace → Advisor transition was slower. A one-off source-mapped diagnostic found the largest sampled Advisor startup costs in framework/runtime and dependency code, with no supported localized app fix.

Local checks passed: 15/15 Vitest, 28/28 existing server checks, 8/8 UI checks, 3/3 Playwright, 32/32 fixture-backed keyboard/responsive checks, lint, TypeScript, production build and `git diff --check`. The normal production build generated no browser source maps. No real Gemini request was used for the fixture-backed checks.

The clean deployed baseline is Home 79/100, Lace 83/100 and Advisor 80/100 (performance/accessibility). A separate matched local Lighthouse 13.5.0 comparison has candidate performance medians of Home 73, Lace 70 and Advisor 70, all with accessibility 100; every run warned that the laptop CPU was slower than Lighthouse expects. These numbers do **not** establish a causal performance change or meet the absolute 80 minimum. The new `matched-mobile-lighthouse` GitHub Actions job is intended to supply hosted matched-source results and optional, separate Vercel preview results. Its outcome must be reviewed, not assumed.

Human-supplied local initial-state WAVE screenshots show Home 0 errors/0 contrast errors/1 long-alt alert before shortening; Lace and Advisor 0/0/0. Post-alt Home and interactive-state WAVE are pending. The human-reported skip-link keyboard journey passed. Actual screen-reader speech, physical Safari and production after-audits remain pending. See [AUDIT.md](../AUDIT.md) for evidence, exact conditions and limitations.

**Do not merge or promote to production until the developer reviews hosted results and outstanding accessibility checks.** Raw diagnostic profiles/maps, `.env.local`, unrelated `AGENTS.md` and assets are excluded from this PR.
