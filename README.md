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
`POST /api/chat` accepts text-only user messages and validated assistant text/tool
history, converts them to model messages, and streams UI message events. Client
text parts render as plain text; typed Fabric Match parts render as React cards.
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

The endpoint is public and has no application-level per-user rate limit or
authentication. The developer has configured protection in the Vercel Firewall;
that external setting is not managed by this repository. Payload and token limits
bound one request but do not guarantee remaining quota. No external rate-limiting
dependency or conversation persistence is installed.

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

## FE-07 Phase A: Fabric Match server foundation

`findFabricGuidance` is a server-executed AI SDK tool for general fabric-category
guidance. It does not query products, availability, prices, orders, or a database.

### Contracts and curated matching

The strict Zod contracts live in `lib/ai/fabric-guidance.ts`. Inputs are required:

- Occasion: `everyday`, `work`, `wedding`, or `formal_event`.
- Climate: `hot`, `mild`, or `cool`.
- Main priority: `breathability`, `easy_care`, `drape`, or `structure`.

```ts
z.object({
  occasion: z.enum(["everyday", "work", "wedding", "formal_event"]),
  climate: z.enum(["hot", "mild", "cool"]),
  priority: z.enum(["breathability", "easy_care", "drape", "structure"]),
}).strict();
```

All three fields are required; additional properties are rejected.

The advisor must ask about missing or ambiguous preferences. It does not silently
invent defaults. `lib/ai/fabric-reference.ts` contains six curated categories:
cotton wovens, linen-rich wovens, wool suiting, fluid viscose wovens, easy-care
blends, and fluid crepe-textured fabrics. Their modest claims are qualified by
composition, weave, weight, finish, and care requirements; crepe is not treated as
a definite fibre composition.

All three criteria must match. Eligible entries retain dataset order, with no
random scores or generated reference text. At most three suggestions are returned.
An unreviewed combination returns an empty list, not invented matches. For
example, `formal_event` / `cool` / `breathability` currently has no matching entry.

The runtime-validated output contains `kind: "general-fabric-guidance"`, the
validated input, suggestions (`name`, `rationale`, `consideration`),
`source: "developer-curated-reference"`, `inventoryVerified: false`, and this fixed
disclaimer: "General fabric guidance only. Store products, prices, stock, and
availability are not verified."

### Execution and safe history

`lib/ai/tools.ts` defines the tool. Each request receives a new execution budget:
one call may execute the reference lookup, including when multiple calls arrive
in parallel. Further attempts fail safely. A failed attempt is not retried.
`streamText` allows at most two model steps; the first may call the tool, and the
second has tools disabled and can explain its result or failure. The unchanged
512 output-token limit applies per model call, so a two-step request can use up
to 1,024 output tokens. The same 45-second abort/timeout covers both steps.

`lib/ai/messages.ts` prepares the shared typed message contract.
`lib/ai/chat-history.ts` keeps user messages text-only and allowlists assistant
text, step markers, and the four states of `tool-findFabricGuidance`. It rejects
unknown tools, unsupported metadata/approvals, duplicate IDs, and malformed
parts. Gemini thought signatures are retained in bounded provider metadata.
Successful historical tool outputs must exactly match a fresh deterministic
lookup, not just pass a schema. Historical tool errors become a fixed safe
message; internal error details are never forwarded. Existing message-count and
body-size limits remain; structured parts also count toward conversation limits.

Incomplete stopped tool calls stay in validated history but are omitted when
building model messages. Failed calls without valid arguments are also omitted
from model context, without fabricating replacement arguments. This keeps a new
user message from being paired with an unresolved tool call. Cancellation is
checked before tool work and is not converted into a tool failure.

### Focused tests and genuine execution-failure testing

```bash
npm run test:fabric-guidance
npm run lint
npm run build
```

Tests use Node's test runner and the installed TypeScript compiler in memory.
The `react-server` condition permits the existing `server-only` boundary. SDK
mock models test execution and UI-stream protocol events without using Gemini
quota; these are server tests, not claims of live Gemini or React card rendering.

To exercise a genuine tool exception locally, start a development server with
`FABRIC_GUIDANCE_TEST_FAILURE=1` in its server environment. For PowerShell:

```powershell
$env:FABRIC_GUIDANCE_TEST_FAILURE = "1"
npm run dev -- --port 3101
```

Submit a complete prompt, such as "Match fabrics for work, in mild weather, with
structure as my priority." The development-only mode forces the named tool in
step one; its actual `execute` function then throws the safe error. The stream
emits `output-error`, not a fabricated successful result. Stop still aborts the
request normally. Disable the flag and restart to return to normal behavior:

```powershell
Remove-Item Env:FABRIC_GUIDANCE_TEST_FAILURE
npm run dev -- --port 3101
```

The flag is ignored unless `NODE_ENV` is exactly `development`. No public request
field, query parameter, or customer input enables this mode. Do not enable the
flag on Vercel. Existing production settings and firewall rules are unchanged.

### Phase B: Fabric Match UI

The chat now uses the shared `AdvisorMessage` type. `fabric-guidance-result.tsx`
renders preparation, searching with preferences, category cards (or an honest
empty result), and a fixed accessible error. Incomplete inputs are never treated
as complete selections. Pending parts from stopped requests display "Stopped";
completed cards and partial text remain in the conversation. There is no automatic
retry, resubmission, or resumption. The existing Send/Stop and scroll logic remain.

| Typed state | UI |
| --- | --- |
| `input-streaming` | Preparation indicator; incomplete selections are not presented as final. |
| `input-available` | Validated preferences and searching status. |
| `output-available` | Up to three recommendation cards and the inventory disclaimer, or an honest empty result. |
| `output-error` | Accessible error card: "Fabric guidance couldn't be loaded. Please try again." |

`lib/ai/client-history.ts` sends only text, assistant step boundaries and the named
tool's four supported states. It retains Gemini signatures and tool-only messages;
the server remains authoritative for validation and canonical historical results.
Other tool names, dynamic parts, reasoning and source parts are not forwarded.

Additional checks (no new test dependencies):

```bash
node scripts/fabric-guidance-ui.test.mjs
npx tsc --noEmit
node scripts/verify-fabric-advisor.mjs
```

The UI unit tests render controlled parts without Gemini calls. The browser check
requires a running local app on port 3100 and dedicated headless Chrome with remote
debugging on port 9222. It makes real Gemini requests and uses quota. Run it only
when verification is needed. `FABRIC_UI_TEST_MODE=failure` selects the browser
failure checks; it does not enable server failures. The server must separately
be started with the development-only flag described above, then stopped and
restarted without that flag. `FABRIC_UI_TEST_MODE=recovery` runs the normal
tool/follow-up checks without the extra cancellation calls.
`FABRIC_UI_TEST_MODE=regression` starts a fresh ordinary-chat conversation to
check live text streaming, pinned/unpinned scrolling, Jump to latest, Stop before
and after text, and Send after Stop. In PowerShell set the mode with
`$env:FABRIC_UI_TEST_MODE = "regression"` before running the browser script.

Local Phase B verification observed an automatic Gemini tool call, three curated
cards, a subsequent explanation, and a follow-up retaining the preferences and
tool signatures. The development-only execute exception produced safe error
cards and accepted a subsequent message; the failure server was then stopped and
normal mode restored. The brief preparation state is covered by controlled
component tests; live wire events confirm streamed tool input, but React may batch
that state before it is visibly painted.

Real ordinary-chat checks verified progressive text, thinking, Stop before/after
text, retained partial text, Send after Stop, context, and scroll/Jump behavior
during streaming. Cards fit 320, 375, 390 and 1280px. Some live attempts reached the
existing 45-second timeout; these were not counted as streaming passes. Browser
tests depend on provider latency and quota. Release requires developer approval,
a reviewed commit, and verification of real tool execution in production.

## FE-08: Error states, empty states and recovery

The advisor classifies network/offline errors, HTTP 429, provider quota errors,
HTTP validation failures, unavailable service, stream interruption, timeouts and
unknown failures using fixed messages in `lib/ai/errors.ts`. Raw response bodies,
provider details and stack traces are never displayed. `Retry-After` is honored
when a valid header is supplied. There are no automatic retries. Validation and
content-filter refusals offer editing instead of repeating an unsuitable request.
Empty completions are recoverable; length-limited responses invite a follow-up.

"Retry response" uses the installed AI SDK's `regenerate` for the latest failed
turn only. Earlier successful messages and Gemini metadata remain. A synchronous
request lock blocks double-clicks and simultaneous sends; Retry is disabled while
busy, stopping, offline or in a known cooldown. The last incomplete response is
kept in a labeled display-only snapshot while its replacement streams. It is not
added to `messages` or sent to Gemini. Success clears the snapshot/error; another
failure remains recoverable. Sending a new question removes the older Retry
action. Intentional Stop is not an error and never triggers automatic recovery.

Pending tool parts can display "Interrupted" separately from "Stopped" without
changing the four SDK tool states. Completed cards and received text are kept on
failure. The 45-second server deadline produces an explicit safe timeout error.
The first-run examples and empty-result "Adjust preferences" action only fill and
focus the editable composer; they never submit. Slow requests retain Stop and
show reassuring feedback after ten seconds, with no invented progress values.

`app/advisor/error.tsx` is a Client Component using this Next.js version's `retry()`
prop for route rendering recovery. It does not handle API errors or promise chat
persistence: recovering a rendering crash may restart the in-memory conversation.

### Quota-free local sabotage and tests

All fixtures require `NODE_ENV=development`, no `VERCEL` environment flag, and an
explicit server environment selection. There are no public test controls, request
parameters or customer-text switches. The model ID, production key and firewall
configuration are unchanged. Fixtures are labeled local test output, not Gemini.

`ADVISOR_DEV_SCENARIO` accepts `recovery`, `http503`, `http429`, `quota`,
`midstream`, `disconnect`, `slow`, `timeout`, `tool-failure`, `malformed-tool`,
`empty-match`, `empty-response`, or `refusal`. The existing SDK mock model drives
the real streaming pipeline and real curated tool execute function without any
Gemini call. `midstream` throws after text; `disconnect` genuinely errors the HTTP
response body after text. Malformed tool output is rejected before success cards.
`http429` supplies a two-second Retry-After. `timeout` shortens the local test
deadline only. `recovery` uses a documented deterministic request sequence:
baseline tool success, partial tool/text failure, successful retry, long response,
send after Stop, pre-text Stop, and Stop during tool input. Restart to reset it.

`ADVISOR_DEV_ROUTE_ERROR=once` causes one route-rendering exception for recovery
testing; `1` keeps throwing until disabled. Offline testing uses browser network
emulation, not a server flag. A fresh page tests first-run emptiness. The original
`FABRIC_GUIDANCE_TEST_FAILURE` flag remains supported, but by itself still uses
Gemini; use `ADVISOR_DEV_SCENARIO=tool-failure` for quota-free browser verification.

```powershell
# Local manual fixture; stop it before changing scenarios.
$env:ADVISOR_DEV_SCENARIO = "midstream"
npm run dev -- --port 3100
```

```bash
npm run test:fabric-guidance
node scripts/fabric-guidance-ui.test.mjs
node --conditions=react-server scripts/advisor-errors.test.mjs
npx tsc --noEmit
npm run lint
npm run build
```

For actual browser/transport tests, launch a **dedicated** Chrome profile with
remote debugging on port 9222. With port 3100 free, run:

```bash
node scripts/run-advisor-edge-cases.mjs
```

The runner owns and stops only the local dev processes it creates. Optional case
arguments select individual scenarios. The browser test proves partial content,
real exception delivery, visible error and Retry, double-click protection,
snapshot exclusion, earlier tool-history preservation and recovery. It also
checks Stop, scrolling, reduced motion and widths 320/375/390/768/1280. Static
component tests separately cover tool states that React may batch too quickly
for a browser paint. These fixtures are not evidence of live Gemini availability.

After manual testing, stop the fixture server and remove all testing flags before
restarting normal development:

```powershell
Remove-Item Env:ADVISOR_DEV_SCENARIO -ErrorAction SilentlyContinue
Remove-Item Env:ADVISOR_DEV_ROUTE_ERROR -ErrorAction SilentlyContinue
Remove-Item Env:FABRIC_GUIDANCE_TEST_FAILURE -ErrorAction SilentlyContinue
npm run dev -- --port 3100
```

Keep the existing normal-flow composer, 16px textarea, visible focus and reduced
motion styles. Chrome viewport tests do not establish iOS keyboard behavior;
actual Safari/iPhone keyboard and screen-reader review remain manual checks.
Checkpoint evidence should label local failure recordings, show Retry recovery
at 375px, and include a genuine Gemini happy path only when quota permits. Never
substitute fixture text for a real-provider success recording.

## FE-AA1 — Smart Send Button

Visit `/button-lab` (`http://localhost:3100/button-lab` when using port 3100).
This isolated client component simulates a send with a deterministic 1000ms
timer, never an API call. Select **Simulate Success** or **Simulate Failure**;
changes during a run apply to the next run. The Advisor is unchanged.

States: idle, hover/keyboard focus, loading, success, and persistent error with
**Try again** and **Reset**. Success holds for 1200ms before returning to idle.
A synchronous ref locks duplicate sends during loading/confirmation. Reset and
unmount clear both timers; transitions do not move keyboard focus.

Motion uses 150ms ease-out hover, 100ms ease-out press, 200ms ease-out label/icon
fade, a 700ms linear spinner, and one subtle 300ms ease-out error shake.
Transform/opacity avoid animating layout dimensions; button size stays fixed.
Reduced motion removes all these animations/transforms, retaining status text
and the static progress symbol. Native buttons, radio labels, visible focus,
44px minimum control targets, aria-disabled/busy, and a polite live region
provide non-color feedback. Busy sends remain focusable but cannot activate.

For the focused real-browser checks, start the dev app on port 3100 and Chrome
with remote debugging on port 9222, then run:

```bash
node scripts/verify-smart-send-button.mjs
```

The runner checks state sequences, duplicate clicks, next-run outcome changes,
keyboard activation/focus, reset/unmount cleanup, reduced motion, stable button
dimensions, console errors, and 320/375/390/1280px layouts without model calls.
Physical mobile devices and screen-reader announcements still need manual review.

## FE-09 — Testing pass

The Advisor now has component and browser regression checks for its validated
composer, message rendering, error recovery, and structured Fabric Match results.
Vitest, React Testing Library, user-event, and jsdom run 13 component tests.
They exercise the real Advisor UI with `useChat` mocked, including text parts,
pending and streamed text, Retry with retained partial content, empty/whitespace
validation, editable examples, and all four `tool-findFabricGuidance` states.
The UI deliberately ignores other SDK part types such as `step-start`; those are
not separate rendering branches and are not asserted as visible UI here.

Playwright opens a local `/advisor`, edits an onboarding example, sends it, sees
pending tool work and streamed text, and checks the Fabric Match card and ready
composer. Its local web server sets `ADVISOR_DEV_SCENARIO=recovery` and an empty
Google key. The existing development-only fixture passes through the real
`/api/chat` route and AI SDK stream/tool pipeline; it never calls Gemini or uses
quota. The test refuses to reuse an existing server and never targets production.
Fixture output is explicitly test data, not a live provider response.

Run the checks locally with:

```bash
npm ci
npx playwright install chromium
npm test
npm run test:existing
npm run test:e2e
npm run lint
npm run build
npx tsc --noEmit
```

The GitHub Actions `component-and-advisor-e2e` job runs on pushes and pull
requests with Node 22, `npm ci`, a Playwright Chromium install, both component
and existing server/UI suites, the browser test, lint, build, and TypeScript.
No provider credential is supplied. The job can later be required by branch
protection; this repository does not set that policy automatically.

Red-to-green exercise: on this feature branch, the assistant temporarily
asserted that whitespace-only input enabled Send. The focused Vitest run failed
with `Received element is not enabled`. The composer correctly blocks whitespace,
so the assertion was restored to `toBeDisabled()`. The full 13-test component
suite then passed. The intentional failure is absent from the final test file.

Local verification on 2026-10-27: 13 Vitest component tests, 28 existing
server/contract tests, 8 existing static UI tests, all 14 existing browser
fixture scenarios, and the Playwright E2E test passed. Lint, the production
build, and `tsc --noEmit` passed. GitHub Actions runs on feature-branch pushes
and pull requests; its status must be checked on GitHub. Real Gemini requests
and physical Safari testing were not part of this testing pass.
