// Quota-free server/contract tests. Run with node --conditions=react-server.
import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
import { APICallError, streamText, toUIMessageStream, isStepCount } from "ai";
const load = createRequire(import.meta.url);
load.extensions[".ts"] = (module, filename) => {
  const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: filename });
  module._compile(compiled.outputText, filename);
};
const errors = load("../lib/ai/errors.ts");
const fixtures = load("../lib/ai/dev-scenarios.ts");
const { safeStreamError, withTimeoutError } = load("../lib/ai/stream-errors.ts");
const { createAdvisorTools, prepareAdvisorToolStep } = load("../lib/ai/tools.ts");
const keys = ["NODE_ENV", "VERCEL", "ADVISOR_DEV_SCENARIO", "ADVISOR_DEV_ROUTE_ERROR", "FABRIC_GUIDANCE_TEST_FAILURE"];
async function inScenario(scenario, run) {
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  try { process.env.NODE_ENV = "development"; delete process.env.VERCEL; delete process.env.FABRIC_GUIDANCE_TEST_FAILURE; process.env.ADVISOR_DEV_SCENARIO = scenario; return await run(); }
  finally { for (const key of keys) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; } }
}
async function chunks(scenario) {
  return inScenario(scenario, async () => {
    const timeout = AbortSignal.timeout(scenario === "timeout" ? 20 : 15000);
    const result = streamText({ model: await fixtures.getDevModel(scenario), prompt: "Local fixture", tools: createAdvisorTools(), stopWhen: isStepCount(2), prepareStep: prepareAdvisorToolStep, abortSignal: timeout, maxRetries: 0, onError: () => {} });
    const output = [];
    for await (const chunk of withTimeoutError(toUIMessageStream({ stream: result.stream, onError: safeStreamError }), timeout, new AbortController().signal)) output.push(chunk);
    return output;
  });
}
test("safe classification does not render HTML, private errors or arbitrary prefixes", () => {
  for (const error of [new Error("<html>PRIVATE</html>"), new Error("The advisor PRIVATE"), { message: "PRIVATE" }]) assert.deepEqual(errors.classifyAdvisorError(error), { code: "unknown" });
  assert.equal(errors.classifyAdvisorError(new TypeError("Load failed")).code, "network");
  assert.equal(errors.classifyAdvisorError(new Error("anything"), true).code, "offline");
  assert.equal(errors.classifyAdvisorError(new Error(errors.errorCodeText("timeout"))).code, "timeout");
  assert.equal(errors.canRetryFailure("validation"), false);
  assert.equal(errors.canRetryFailure("refusal"), false);
});
test("HTTP and provider rate limits remain different", () => {
  const providerError = new APICallError({ message: "PRIVATE", url: "https://example.invalid", requestBodyValues: undefined, statusCode: 429 });
  assert.equal(errors.classifyAdvisorError(providerError).code, "rate_limit");
  assert.equal(safeStreamError(providerError), errors.errorCodeText("quota"));
  for (const status of [400, 413, 415]) assert.equal(errors.httpErrorCode(status), "validation");
  assert.equal(errors.httpErrorCode(503), "unavailable");
});
test("fetch middleware safely classifies 429 and respects a real Retry-After header", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response("<html>PRIVATE</html>", { status: 429, headers: { "Retry-After": "2" } });
    await assert.rejects(errors.advisorFetch("http://localhost/api/chat"), error => error.code === "rate_limit" && error.retryAt > Date.now() && !error.message.includes("PRIVATE"));
  } finally { globalThis.fetch = original; }
  assert.equal(errors.retryAfterTime("nonsense", 1000), undefined);
  assert.equal(errors.retryAfterTime("-1", 1000), undefined);
  assert.equal(errors.retryAfterTime("2", 1000), 3000);
  assert.deepEqual(errors.classifyAdvisorError(new errors.AdvisorRequestError("rate_limit", 3000), true), { code: "offline", retryAt: 3000 });
});
test("all fixture controls are inert in production and on Vercel", async () => {
  await inScenario("http503", async () => {
    process.env.ADVISOR_DEV_ROUTE_ERROR = "1";
    for (const mode of ["production", "vercel"]) {
      process.env.NODE_ENV = mode === "production" ? "production" : "development";
      if (mode === "vercel") process.env.VERCEL = "1";
      assert.equal(fixtures.getDevScenario(), undefined);
      assert.equal(fixtures.shouldCrashAdvisorRoute(), false);
      assert.equal(fixtures.devHttpResponse("http503"), undefined);
      await assert.rejects(fixtures.getDevModel("http503"));
      assert.throws(() => fixtures.disconnectFixture(new AbortController().signal));
    }
  });
});
test("HTTP sabotage produces actual error status codes without model calls", async () => {
  for (const [scenario, status] of [["http503", 503], ["http429", 429]]) await inScenario(scenario, async () => assert.equal(fixtures.devHttpResponse(scenario).status, status));
});
test("genuine stream exception follows received text and is sanitized", async () => {
  const output = await chunks("midstream");
  assert(output.findIndex(c => c.type === "text-delta") < output.findIndex(c => c.type === "error"));
  assert.equal(output.find(c => c.type === "error").errorText, errors.errorCodeText("stream"));
  assert(!JSON.stringify(output).includes("PRIVATE_SENTINEL"));
});
test("server deadline is an error, not a successful Stop", async () => {
  const output = await chunks("timeout");
  assert.equal(output.find(c => c.type === "error").errorText, errors.errorCodeText("timeout"));
});
test("quota and content filtering survive the actual SDK wire protocol", async () => {
  assert.equal((await chunks("quota")).find(c => c.type === "error").errorText, errors.errorCodeText("quota"));
  assert.equal((await chunks("refusal")).find(c => c.type === "finish").finishReason, "content-filter");
});
test("execute failure and malformed output produce safe tool errors, never fake success cards", async () => {
  for (const scenario of ["tool-failure", "malformed-tool"]) {
    const output = await chunks(scenario);
    assert(output.some(c => c.type === "tool-output-error"));
    assert(!output.some(c => c.type === "tool-output-available"));
    assert(!JSON.stringify(output).includes("PRIVATE_SENTINEL"));
  }
});
test("a genuine zero-match lookup succeeds through execute and streaming", async () => {
  const output = await chunks("empty-match");
  assert.deepEqual(output.find(c => c.type === "tool-output-available").output.suggestions, []);
});
test("connection fixture delivers text then genuinely errors its response body", async () => {
  await inScenario("disconnect", async () => {
    const reader = fixtures.disconnectFixture(new AbortController().signal).body.getReader();
    assert(new TextDecoder().decode((await reader.read()).value).includes("partial text"));
    await assert.rejects(reader.read());
  });
});
