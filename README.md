# FlyRank FE-04: Fashion Store Skeleton

This is a small fashion e-commerce capstone with the FE-04 foundation (routing,
shared layout, responsive styling, placeholders, and a working health check) and
the FE-06 Fabric & Style Advisor. It does not include live product data, checkout,
authentication, payments, or a database.

## Stack

- Next.js (App Router) and TypeScript
- React
- Tailwind CSS 4
- ESLint

## Routes

### Storefront

`/`, `/shop`, `/men`, `/women`, `/fabrics`, `/lace`, `/shoes`, `/bags`, `/products/[id]`, `/cart`, `/order`, `/login`, `/account`, and `/orders`.

### Admin

`/admin`, `/admin/products`, `/admin/products/new`, `/admin/products/[id]/edit`, `/admin/inventory`, and `/admin/orders`.

### System

`/health` renders live data fetched from the local `/api/health` route handler.

## Components and rendering

Pages and shared layout components are Server Components by default. The FE-06 advisor chat is a Client Component because it handles input, streaming messages, cancellation, and scroll position. Navigation still uses responsive CSS without browser state.

## Environment variables

Copy `.env.example` to `.env.local` for local development. `NEXT_PUBLIC_` values may be exposed to browser code; private values (such as `PRIVATE_API_KEY`) remain server-only. Do not commit `.env.local` or real secrets.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The app is deployable on Vercel without additional configuration.

## Checks

```bash
npm run lint
npm run build
```

## FE-06: Fabric & Style Advisor

Visit `/advisor` for conversational fabric, styling, occasion, and sewing guidance.
The feature uses AI SDK Core, its React `useChat` hook, and the direct Google
provider with `gemini-3.5-flash-lite`. No AI Gateway is used.

Set `GOOGLE_GENERATIVE_AI_API_KEY` in your ignored `.env.local` file (and in your
deployment environment). Never prefix this key with `NEXT_PUBLIC_`. The example
file contains only a blank entry. Missing or placeholder keys return HTTP 503.
Restart the development server after changing environment variables.

`lib/ai/config.ts` owns the server-only model configuration and system prompt.
`POST /api/chat` accepts text-only user/assistant messages, converts them to model
messages, and streams UI message events. Client text parts render as plain text.
Chats remain in browser memory and are lost on reload. No stock, price, product
search, or ordering integration is present.

Usage limits: 64 KB request body, 24 messages, 2,000 characters per user message,
8,000 per assistant message, 16,000 total conversation characters, 512 output
tokens, no automatic retries, and a 45-second generation timeout. Invalid requests
return 400, unsupported content types 415, and oversized input 413. Reload to
start a new conversation when the history limit is reached.

Stop aborts the browser request and forwards request cancellation to Google.
Received partial text remains in the conversation. Automatic stream resumption is
disabled. `vercel.json` enables request cancellation for this Node.js function;
verify cancellation again on the deployed environment before release.

The transcript follows new content while pinned near the bottom. Scrolling upward
releases pinning; incoming content then offers “Jump to latest.” Returning to the
bottom or choosing that control resumes following.

### Free-tier and deployment limitations

This project does not enable billing or provision paid services. Use a Google API
project configured for the Free Tier; account billing and eligibility cannot be
enforced by this application. Free-tier quotas and model availability can change.
Provider failures and quota exhaustion show a safe error instead of raw details.

The endpoint is public and has no per-user rate limit or authentication. Payload
and token limits bound one request, but do not prevent repeated requests from
exhausting the quota. Review that exposure before public deployment. No external
rate-limiting service or conversation persistence is installed.

Recommended demo protection: configure the included Vercel Hobby WAF rate-limit
rule for POST requests to `/api/chat`, counted per IP, for example 6 requests per
60 seconds with a block response. Vercel currently documents one rate-limit rule
and 1,000,000 allowed requests included for Hobby; confirm the project's dashboard
and plan before enabling anything. This requires no application dependency or
database and has not been enabled by this code change. See
https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting.

An in-memory counter in a serverless function is not an effective shared limit:
instances and regions have separate memory, and restarts clear counters. Even an
IP-based WAF rule cannot prevent distributed abuse or guarantee remaining Google
quota; Vercel's counters are per region rather than a global quota. Shared networks
can also cause legitimate users to share a limit. If the
included rule is unavailable, keep the demo access restricted until suitable
protection is agreed, rather than treating local counters as a global quota.

Manual verification: test a real streamed response, multi-turn follow-up, Stop
before and after text arrives, Stop then Send, upward scrolling during a long
response, Jump to latest, keyboard focus, and widths of 375px and 1280px.

`node scripts/verify-advisor.mjs` runs optional browser/API smoke checks without
adding test dependencies. It expects the app on port 3100 (override with
`ADVISOR_TEST_URL`) and Chrome running with remote debugging on port 9222. It
makes real provider requests and reports checks blocked by provider errors.

The original `gemini-2.5-flash-lite` model was unavailable to this project. With
developer approval it was replaced by `gemini-3.5-flash-lite`. Real browser checks
observed progressive generated text, contextual follow-up, Stop before text,
Stop after partial text, and continued submission after Stop. Scroll checks used
an actual upward wheel event during generation and confirmed Jump to latest and
resumed following while more real text arrived. Layout checks found no horizontal
overflow at 375px or 1280px. Verify cancellation once more on Vercel after any
future deployment; these checks were local.

Dependency audit: the five high-severity findings are in the development-only
ESLint chain (`eslint-config-next`, `@next/eslint-plugin-next`, `fast-glob`,
`micromatch`, and `braces`). `npm audit --omit=dev` reported zero vulnerabilities.
No forced fixes or dependency changes were applied during model verification.
