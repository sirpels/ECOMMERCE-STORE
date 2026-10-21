import "server-only";
import { APICallError, type LanguageModel } from "ai";
import { setTimeout as delay } from "node:timers/promises";

const scenarios = ["recovery", "http503", "http429", "quota", "midstream", "disconnect", "slow", "timeout", "tool-failure", "empty-match", "empty-response", "refusal", "malformed-tool"] as const;
type Scenario = typeof scenarios[number];
let requestNumber = 0;
let routeCrashed = false;

export function getDevScenario(): Scenario | undefined {
  if (process.env.NODE_ENV !== "development" || process.env.VERCEL) return;
  const value = process.env.ADVISOR_DEV_SCENARIO;
  return scenarios.find(scenario => scenario === value);
}
export function shouldCrashAdvisorRoute() {
  if (process.env.NODE_ENV !== "development" || process.env.VERCEL) return false;
  if (process.env.ADVISOR_DEV_ROUTE_ERROR === "1") return true;
  if (process.env.ADVISOR_DEV_ROUTE_ERROR === "once" && !routeCrashed) {
    routeCrashed = true;
    return true;
  }
  return false;
}
export function devHttpResponse(scenario: Scenario | undefined) {
  if (!scenario || getDevScenario() !== scenario) return;
  if (scenario === "http503") return Response.json({ code: "unavailable" }, { status: 503 });
  if (scenario === "http429") return Response.json({ code: "rate_limit" }, { status: 429, headers: { "Retry-After": "2" } });
}

// Deterministic local fixtures, NEVER Gemini evidence. No request parameter or
// message text selects these scenarios. The installed SDK mock drives the real
// streamText/tool execute pipeline; it is loaded only in explicitly gated dev mode.
export async function getDevModel(scenario: Scenario): Promise<LanguageModel> {
  if (getDevScenario() !== scenario) throw new Error("Development fixture unavailable");
  const { MockLanguageModelV4 } = await import("ai/test");
  const request = ++requestNumber;
  let step = 0;
  const usage = { inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined }, outputTokens: { total: 1, text: 1, reasoning: undefined } };
  return new MockLanguageModelV4({
    doStream: async ({ abortSignal }) => {
      const currentStep = step++;
      let cancelled = false;
      const stream = new ReadableStream({
        start(controller) {
          void (async () => {
            const emit = (chunk: unknown) => { abortSignal?.throwIfAborted(); if (!cancelled) controller.enqueue(chunk); };
            const wait = (ms: number) => delay(ms, undefined, { signal: abortSignal });
            try {
              if (scenario === "quota") throw new APICallError({ message: "LOCAL_PRIVATE_SENTINEL", url: "https://example.invalid", requestBodyValues: undefined, statusCode: 429 });
              if (scenario === "recovery" && request === 6) await wait(500);
              const toolTurn = ["tool-failure", "empty-match", "malformed-tool"].includes(scenario) || (scenario === "recovery" && (request <= 2 || request === 7));
              if (currentStep === 0 && toolTurn) {
                const input = scenario === "empty-match" ? { occasion: "formal_event", climate: "cool", priority: "breathability" } : { occasion: "work", climate: "mild", priority: "structure" };
                emit({ type: "tool-input-start", id: `local-tool-${request}`, toolName: "findFabricGuidance" });
                emit({ type: "tool-input-delta", id: `local-tool-${request}`, delta: '{"occasion":' });
                await wait(300);
                emit({ type: "tool-call", toolCallId: `local-tool-${request}`, toolName: "findFabricGuidance", input: JSON.stringify(input), providerMetadata: { google: { thoughtSignature: "local-test-signature" } } });
                emit({ type: "finish", finishReason: { unified: "tool-calls", raw: undefined }, usage });
              } else {
                if (scenario === "slow") await wait(11_000);
                if (scenario === "timeout") await wait(2000);
                if (!["empty-response", "refusal"].includes(scenario)) {
                  emit({ type: "text-start", id: "local-text" });
                  const long = scenario === "recovery" && request >= 4 && request % 2 === 0;
                  const chunks = long ? Array.from({ length: 40 }, (_, i) => `Local test fixture paragraph ${i + 1}: fabric weight and weave affect comfort. This is controlled test output, not Gemini.\n\n`) : ["Local test fixture: ", "fabric guidance response. ", "Earlier conversation remains available. ", "This is not a Gemini response."];
                  for (const text of chunks) { emit({ type: "text-delta", id: "local-text", delta: text }); await wait(long ? 100 : 180); }
                  if (scenario === "midstream" || (scenario === "recovery" && request === 2)) throw new Error("LOCAL_PRIVATE_SENTINEL");
                  emit({ type: "text-end", id: "local-text" });
                }
                emit({ type: "finish", finishReason: { unified: scenario === "refusal" ? "content-filter" : "stop", raw: undefined }, usage });
              }
              if (!cancelled) controller.close();
            } catch (error) {
              if (!cancelled) {
                if (abortSignal?.aborted) controller.error(error);
                else {
                  // Model adapters report caught exceptions as error chunks;
                  // streamText and the UI serializer sanitize the actual error.
                  controller.enqueue({ type: "error", error });
                  controller.close();
                }
              }
            }
          })();
        },
        cancel() { cancelled = true; },
      });
      // The SDK validates and converts this fixture's model chunks as usual.
      return { stream, warnings: [] };
    },
  });
}

export function disconnectFixture(signal: AbortSignal) {
  if (getDevScenario() !== "disconnect") throw new Error("Development fixture unavailable");
  let cancelled = false;
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      controller.enqueue(encoder.encode('data: {"type":"start"}\n\ndata: {"type":"text-start","id":"disconnect"}\n\ndata: {"type":"text-delta","id":"disconnect","delta":"Local test fixture: partial text before a connection failure."}\n\n'));
      void delay(1000, undefined, { signal }).then(() => {
        if (!cancelled) controller.error(new Error("Local connection termination"));
      }).catch(() => {});
    },
    cancel() { cancelled = true; },
  }), { headers: { "Content-Type": "text/event-stream", "x-vercel-ai-ui-message-stream": "v1", "Cache-Control": "no-store" } });
}
