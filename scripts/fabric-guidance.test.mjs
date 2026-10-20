// Focused server tests: no Gemini calls, credentials, network, or new test runner.
import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
import { convertToModelMessages, generateText, isStepCount, streamText, toUIMessageStream } from "ai";
import { MockLanguageModelV4 } from "ai/test";

// Use the existing TypeScript compiler in memory, keeping test/build artifacts
// out of the repository. --conditions=react-server permits server-only imports.
const load = createRequire(import.meta.url);
load.extensions[".ts"] = (module, filename) => {
  const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: filename,
  });
  module._compile(compiled.outputText, filename);
};
const { fabricGuidanceInputSchema, fabricGuidanceOutputSchema, FABRIC_GUIDANCE_DISCLAIMER, FABRIC_GUIDANCE_ERROR_MESSAGE } = load("../lib/ai/fabric-guidance.ts");
const { findFabricMatches } = load("../lib/ai/fabric-reference.ts");
const { createAdvisorTools, FabricGuidanceError, isFabricGuidanceFailureTestEnabled, prepareAdvisorToolStep } = load("../lib/ai/tools.ts");
const { validateAdvisorMessages, getModelHistory, ChatRequestError } = load("../lib/ai/chat-history.ts");

const input = { occasion: "work", climate: "mild", priority: "structure" };
const user = (id, text = "Please suggest fabrics for work in mild weather; structure matters most.") => ({ id, role: "user", parts: [{ type: "text", text }] });
const toolPart = (overrides = {}) => ({ type: "tool-findFabricGuidance", toolCallId: "call-1", state: "output-available", input, output: findFabricMatches(input), ...overrides });
const history = (part) => ({ messages: [user("u1"), { id: "a1", role: "assistant", parts: [{ type: "step-start" }, part] }, user("u2", "What should I consider when sewing that?")] });
const validate = (body) => validateAdvisorMessages(body, createAdvisorTools());
const invalidHistory = (error) => error instanceof ChatRequestError && error.status === 400;
const oversizedHistory = (error) => error instanceof ChatRequestError && error.status === 413;

test("strict required input contract, with no defaults", () => {
  assert.deepEqual(fabricGuidanceInputSchema.parse(input), input);
  for (const field of Object.keys(input)) {
    const missing = { ...input }; delete missing[field];
    assert.equal(fabricGuidanceInputSchema.safeParse(missing).success, false);
    assert.equal(fabricGuidanceInputSchema.safeParse({ ...input, [field]: "unknown" }).success, false);
  }
  assert.equal(fabricGuidanceInputSchema.safeParse({ ...input, price: 5 }).success, false);
});

test("all 48 enum combinations give deterministic, schema-valid results with at most three suggestions", () => {
  for (const occasion of ["everyday", "work", "wedding", "formal_event"]) {
    for (const climate of ["hot", "mild", "cool"]) {
      for (const priority of ["breathability", "easy_care", "drape", "structure"]) {
        const selection = { occasion, climate, priority };
        const output = findFabricMatches(selection);
        assert.equal(fabricGuidanceOutputSchema.safeParse(output).success, true);
        assert.deepEqual(output, findFabricMatches(selection));
        assert.deepEqual(output.input, selection);
        assert(output.suggestions.length <= 3);
        assert.equal(output.inventoryVerified, false);
        assert.equal(output.disclaimer, FABRIC_GUIDANCE_DISCLAIMER);
      }
    }
  }
});

test("stable matching order and returned data cannot mutate the reference", () => {
  const output = findFabricMatches(input);
  assert.deepEqual(output.suggestions.map(item => item.name), [
    "Light- to medium-weight cotton wovens", "Linen-rich woven fabrics", "Wool suiting fabrics",
  ]);
  output.suggestions[0].name = "changed";
  assert.equal(findFabricMatches(input).suggestions[0].name, "Light- to medium-weight cotton wovens");
});

test("an unreviewed combination returns an honest empty list", () => {
  const output = findFabricMatches({ occasion: "formal_event", climate: "cool", priority: "breathability" });
  assert.deepEqual(output.suggestions, []);
  assert.equal(fabricGuidanceOutputSchema.safeParse(output).success, true);
});

test("output contract rejects extra entries, business claims, missing text, and extra fields", () => {
  const output = findFabricMatches(input);
  for (const changed of [
    { ...output, suggestions: [...output.suggestions, output.suggestions[0]] },
    { ...output, inventoryVerified: true }, { ...output, disclaimer: "In stock" },
    { ...output, price: 500 }, { ...output, input: { ...input, climate: "unknown" } },
    { ...output, suggestions: [{ name: "", rationale: "", consideration: "" }] },
  ]) assert.equal(fabricGuidanceOutputSchema.safeParse(changed).success, false);
});

test("execute validates inputs and returns validated reference output", async () => {
  const execute = createAdvisorTools().findFabricGuidance.execute;
  assert.deepEqual(await execute(input, { toolCallId: "t1", messages: [] }), findFabricMatches(input));
  await assert.rejects(createAdvisorTools().findFabricGuidance.execute({ ...input, climate: "invalid" }, { toolCallId: "t2", messages: [] }), FabricGuidanceError);
});

test("parallel tool calls share a one-execution budget, reset for a new request", async () => {
  const tools = createAdvisorTools();
  const results = await Promise.allSettled(["one", "two"].map(toolCallId => tools.findFabricGuidance.execute(input, { toolCallId, messages: [] })));
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
  const failure = results.find(result => result.status === "rejected");
  assert(failure.reason instanceof FabricGuidanceError);
  assert.equal(failure.reason.message, FABRIC_GUIDANCE_ERROR_MESSAGE);
  assert.equal((await createAdvisorTools().findFabricGuidance.execute(input, { toolCallId: "new", messages: [] })).kind, "general-fabric-guidance");
});

test("plain FE-06 text histories still validate and retain their order", async () => {
  const body = { messages: [user("u1"), { id: "a1", role: "assistant", parts: [{ type: "text", text: "Consider fabric weight." }] }, user("u2")] };
  assert.deepEqual(await validate(body), body.messages);
});

test("successful tool-only history is allowlisted, canonical, and preserves Gemini signatures", async () => {
  const part = toolPart({ callProviderMetadata: { google: { thoughtSignature: "test-signature" } } });
  const messages = await validate(history(part));
  assert.deepEqual(messages[1].parts[1], part);
  const converted = await convertToModelMessages(getModelHistory(messages), { tools: createAdvisorTools(), ignoreIncompleteToolCalls: true });
  assert(JSON.stringify(converted).includes("test-signature"));
  assert(JSON.stringify(converted).includes("tool-result"));
  assert.equal(converted.at(-1).role, "user");
});

test("schema-valid but fabricated historical outputs are rejected", async () => {
  const output = findFabricMatches(input);
  output.suggestions[0].name = "Invented store product";
  assert.equal(fabricGuidanceOutputSchema.safeParse(output).success, true);
  await assert.rejects(validate(history(toolPart({ output }))), invalidHistory);
  await assert.rejects(validate(history(toolPart({ output: findFabricMatches({ ...input, occasion: "everyday" }) }))), invalidHistory);
});

test("historical errors are sanitized before model conversion", async () => {
  const messages = await validate(history({ type: "tool-findFabricGuidance", toolCallId: "error", state: "output-error", input, errorText: "INTERNAL_SENTINEL_DO_NOT_EXPOSE" }));
  assert.equal(messages[1].parts[1].errorText, FABRIC_GUIDANCE_ERROR_MESSAGE);
  const converted = await convertToModelMessages(getModelHistory(messages), { tools: createAdvisorTools(), ignoreIncompleteToolCalls: true });
  assert(!JSON.stringify(converted).includes("INTERNAL_SENTINEL"));
  assert(JSON.stringify(converted).includes(FABRIC_GUIDANCE_ERROR_MESSAGE));
});

test("Stop during either input state does not leave an unmatched model call", async () => {
  for (const part of [
    { type: "tool-findFabricGuidance", toolCallId: "partial", state: "input-streaming", input: { occasion: "wedd" }, rawInput: '{"occasion":"wedd' },
    { type: "tool-findFabricGuidance", toolCallId: "ready", state: "input-available", input },
  ]) {
    const messages = await validate(history(part));
    assert.equal(messages[1].parts[1].state, part.state);
    const converted = await convertToModelMessages(getModelHistory(messages), { tools: createAdvisorTools(), ignoreIncompleteToolCalls: true });
    assert(!JSON.stringify(converted).includes('"type":"tool-call"'));
    assert.equal(converted.at(-1).role, "user");
  }
});

test("failed invalid tool arguments do not break the next request", async () => {
  const messages = await validate(history({ type: "tool-findFabricGuidance", toolCallId: "failed-input", state: "output-error", input: { climate: "wrong" }, errorText: "Invalid input details" }));
  assert.equal(messages[1].parts[1].input, undefined);
  const converted = await convertToModelMessages(getModelHistory(messages), { tools: createAdvisorTools(), ignoreIncompleteToolCalls: true });
  assert(!JSON.stringify(converted).includes("failed-input"));
});

test("unknown tools, user tool parts, provider-executed claims and malformed fields are rejected", async () => {
  for (const part of [
    toolPart({ type: "tool-other" }), toolPart({ type: "dynamic-tool", toolName: "findFabricGuidance" }),
    toolPart({ providerExecuted: true }), toolPart({ approval: { id: "approval" } }),
    toolPart({ input: { ...input, occasion: "unknown" } }),
    toolPart({ callProviderMetadata: { google: { apiKey: "not-a-real-key" } } }),
    { type: "file", url: "https://example.com/file" },
  ]) await assert.rejects(validate(history(part)), invalidHistory);
  await assert.rejects(validate({ messages: [{ ...user("u1"), parts: [toolPart()] }] }), invalidHistory);
  const duplicated = history(toolPart());
  duplicated.messages[1].parts.push(toolPart());
  await assert.rejects(validate(duplicated), invalidHistory);
});

test("roles, IDs, part counts and original conversation limits remain enforced", async () => {
  await assert.rejects(validate({ messages: [{ ...user("u1"), role: "system" }] }), invalidHistory);
  await assert.rejects(validate({ messages: [user("same"), user("same")] }), invalidHistory);
  await assert.rejects(validate({ messages: [user("u1", " ")] }), invalidHistory);
  await assert.rejects(validate({ messages: [{ ...user("u1"), parts: Array.from({ length: 17 }, () => ({ type: "text", text: "x" })) }] }), invalidHistory);
  await assert.rejects(validate({ messages: [user("u1", "x".repeat(2001))] }), oversizedHistory);
  await assert.rejects(validate({ messages: Array.from({ length: 25 }, (_, index) => user(String(index))) }), oversizedHistory);
  await assert.rejects(validate({ messages: Array.from({ length: 9 }, (_, index) => user(String(index), "x".repeat(2000))) }), oversizedHistory);
});

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 10, text: 10, reasoning: undefined },
};
const modelCall = { type: "tool-call", toolCallId: "sdk-call", toolName: "findFabricGuidance", input: JSON.stringify(input) };

test("SDK performs a tool step followed by a tool-disabled explanation step", async () => {
  const model = new MockLanguageModelV4({ doGenerate: [
    { content: [modelCall], finishReason: { unified: "tool-calls", raw: undefined }, usage, warnings: [] },
    { content: [{ type: "text", text: "A test-only reference explanation." }], finishReason: { unified: "stop", raw: undefined }, usage, warnings: [] },
  ] });
  const result = await generateText({ model, prompt: "Match the stated preferences.", tools: createAdvisorTools(), stopWhen: isStepCount(2), prepareStep: prepareAdvisorToolStep, maxRetries: 0 });
  assert.equal(model.doGenerateCalls.length, 2);
  assert.equal(result.steps[0].toolResults[0].output.kind, "general-fabric-guidance");
  assert.equal(model.doGenerateCalls[1].toolChoice.type, "none");
  assert.equal((model.doGenerateCalls[1].tools ?? []).length, 0);
  assert(JSON.stringify(model.doGenerateCalls[1].prompt).includes("developer-curated-reference"));
});

test("genuine execute failure emits a safe SDK output-error; production ignores the test flag; Stop wins", async () => {
  const previousEnvironment = process.env.NODE_ENV;
  const previousFlag = process.env.FABRIC_GUIDANCE_TEST_FAILURE;
  try {
    process.env.NODE_ENV = "development";
    process.env.FABRIC_GUIDANCE_TEST_FAILURE = "1";
    assert.equal(isFabricGuidanceFailureTestEnabled(), true);
    const controller = new AbortController();
    const cancellation = new DOMException("Test cancellation", "AbortError");
    controller.abort(cancellation);
    await assert.rejects(createAdvisorTools().findFabricGuidance.execute(input, { toolCallId: "stopped", messages: [], abortSignal: controller.signal }), error => error === cancellation);
    const model = new MockLanguageModelV4({ doStream: [
      { stream: ReadableStream.from([modelCall, { type: "finish", finishReason: { unified: "tool-calls", raw: undefined }, usage }]), warnings: [] },
      { stream: ReadableStream.from([{ type: "text-start", id: "t" }, { type: "text-delta", id: "t", delta: "Guidance could not be loaded." }, { type: "text-end", id: "t" }, { type: "finish", finishReason: { unified: "stop", raw: undefined }, usage }]), warnings: [] },
    ] });
    const result = streamText({ model, prompt: "Match work, mild, structure.", tools: createAdvisorTools(), stopWhen: isStepCount(2), prepareStep: prepareAdvisorToolStep, maxRetries: 0, onError: () => {} });
    const chunks = [];
    for await (const chunk of toUIMessageStream({ stream: result.stream, onError: error => error instanceof FabricGuidanceError ? error.message : "Safe failure." })) chunks.push(chunk);
    const errorChunk = chunks.find(chunk => chunk.type === "tool-output-error");
    assert.equal(errorChunk.errorText, FABRIC_GUIDANCE_ERROR_MESSAGE);
    assert.equal(model.doStreamCalls.length, 2);
    assert.equal(model.doStreamCalls[1].toolChoice.type, "none");
    process.env.NODE_ENV = "production";
    assert.equal(isFabricGuidanceFailureTestEnabled(), false);
    assert.equal((await createAdvisorTools().findFabricGuidance.execute(input, { toolCallId: "production", messages: [] })).kind, "general-fabric-guidance");
  } finally {
    if (previousEnvironment === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousEnvironment;
    if (previousFlag === undefined) delete process.env.FABRIC_GUIDANCE_TEST_FAILURE;
    else process.env.FABRIC_GUIDANCE_TEST_FAILURE = previousFlag;
  }
});
