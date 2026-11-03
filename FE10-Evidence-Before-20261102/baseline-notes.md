# FE-10 baseline evidence — 2026-11-02

Production origin: https://ecommerce-store-gamma-sable.vercel.app

This folder contains **before** screenshots only. No application code, deployment, or Gemini configuration was changed. One production Advisor question was sent and stopped as part of the keyboard journey; no completed Gemini answer was evaluated.

## Tool conditions and limitations

- Browser checks: Playwright with headless Chromium 156.0.8078.4, CSS viewport 375 × 812, device scale factor 1.
- WAVE: official WAVE online URL checker, initial rendered route only. Its proxy did not display the Next-optimized lace image, though the real production image returned HTTP 200 and loaded. WAVE screenshots show the final summary counts. Dynamic chat and dialog states were not scanned by WAVE.
- Lighthouse: **not run**. The package is not installed, `npx --no-install lighthouse` failed, the PageSpeed Insights API returned HTTP 429 `RESOURCE_EXHAUSTED`, and its web form said it could not resolve the production URL. The JSON in this folder is an error response, not a Lighthouse report.
- Diagnostic browser timings below are **not Lighthouse scores**, were captured without explicit throttling, and are single-run figures rather than statistical estimates.

| Route | WAVE errors | WAVE contrast errors | WAVE alerts | Chrome LCP (ms) | Chrome CLS | Navigation TTFB (ms) | Approx. transferred bytes |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `/` | 0 | 0 | 1 (long alternative text) | 1,436 | 0 | 761 | 353,359 |
| `/lace` | 0 | 0 | 0 | 1,004 | 0 | 325 | 332,137 |
| `/advisor` | 0 | 0 | 0 | 1,416 | 0 | 585 | 295,548 |

WAVE counts describe initial pages only; they do not prove conformance. Lighthouse mobile performance and accessibility scores remain unavailable, so the 80/90 targets cannot yet be assessed.

## Observed keyboard journey

- At 375px, homepage, Lace, and Advisor all had `document.documentElement.scrollWidth === innerWidth === 375`.
- Homepage primary links had visible 3px focus outlines. It took 12 Tabs from the start of the homepage to reach Explore Lace; Enter navigated to `/lace`.
- On Lace, Tab reached the image button; Enter opened the native dialog and focused Zoom in. Tab reached Close and then the image scroll region. Escape closed the dialog and restored focus to the image button. The dialog image was visible after approximately 552ms in one run; a screenshot taken immediately on open was blank during loading.
- On Advisor, the textarea has a visible label; Tab from the typed textarea reached Send. Enter sent one question. Stop became visible, enabled, and keyboard-focusable. Enter activated Stop; status changed to `Response stopped. You can send another question.` Focus returned to the textarea, and Send was available again. No uncaught page errors were observed in this scripted journey.
- The homepage tailoring link was keyboard-focusable, had a visible outline, and pointed to a prefilled `wa.me` URL that opens in a new tab. No message was sent.
- The Advisor's status line is `role="status"` and `aria-live="polite"`. The streaming message text is rendered in ordinary article/paragraph markup without a live region, so actual response-content announcements are not established by this audit. No physical screen reader was tested.

## Evidence files

- `production-home-mobile-before.png`, `production-lace-mobile-delayed-before.png`, `production-advisor-mobile-before.png`: actual production pages after images settled.
- `production-lace-dialog-loaded-before.png`: actual photograph in the open dialog.
- `wave-home-before.png`, `wave-lace-before.png`, `wave-advisor-before.png`: official WAVE online report screenshots.
- `lighthouse-home-mobile.json`: PageSpeed API quota error, **not** a Lighthouse report.
- `pagespeed-home-interactive-attempt.png`: PageSpeed web-form resolution error.

Earlier immediate captures (`production-lace-mobile-before.png`, `production-lace-dialog-mobile-before.png`) show the temporary empty image area before the optimized photograph loaded. They are retained as timing evidence, not as claims of a permanently missing image.
