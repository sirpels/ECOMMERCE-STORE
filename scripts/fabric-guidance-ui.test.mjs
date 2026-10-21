// Controlled presentation tests, not a substitute for real Gemini/browser tests.
// Run: node scripts/fabric-guidance-ui.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const load = createRequire(import.meta.url);
for (const extension of [".ts", ".tsx"]) load.extensions[extension] = (module, filename) => {
  const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }, fileName: filename,
  });
  module._compile(compiled.outputText, filename);
};
const Component = load("../app/advisor/fabric-guidance-result.tsx").default;
const { getOutgoingMessages } = load("../lib/ai/client-history.ts");
const input = { occasion: "wedding", climate: "hot", priority: "breathability" };
const base = { type: "tool-findFabricGuidance", toolCallId: "test-call" };
const render = (part, active = true) => renderToStaticMarkup(React.createElement(Component, { part: { ...base, ...part }, active }));

test("partial streamed inputs are safe and visually distinct from searching", () => {
  const preparing = render({ state: "input-streaming", input: { occasion: "wedd" } });
  const searching = render({ state: "input-available", input });
  assert.match(preparing, /Preparing a fabric lookup/);
  assert.doesNotMatch(preparing, /wedd/);
  assert.match(preparing, /border-dashed/);
  assert.match(searching, /Searching/);
  for (const value of ["Wedding", "Hot", "Breathability"]) assert.match(searching, new RegExp(value));
});
test("stopped pending parts do not keep loading", () => {
  for (const state of ["input-streaming", "input-available"]) {
    const html = render({ state, input }, false);
    assert.match(html, /Lookup stopped/);
    assert.doesNotMatch(html, /animate-pulse|Preparing a fabric lookup|Finding general/);
  }
});
test("failed pending lookup is interrupted, not an intentional Stop", () => {
  const html = renderToStaticMarkup(React.createElement(Component, { part: { ...base, state: "input-available", input }, active: false, outcome: "interrupted" }));
  assert.match(html, /Lookup interrupted/);
  assert.doesNotMatch(html, /Lookup stopped|animate-pulse/);
});
test("empty result provides a fill-only adjustment action when supplied", () => {
  const html = renderToStaticMarkup(React.createElement(Component, { part: { ...base, state: "output-available", input, output: { input, suggestions: [], disclaimer: "Not inventory." } }, active: false, onAdjustPreferences() {} }));
  assert.match(html, /type="button"/);
  assert.match(html, /Adjust preferences/);
  assert.match(html, /Not inventory/);
});
test("failure uses the exact safe accessible message, never raw errors", () => {
  const html = render({ state: "output-error", input, errorText: "SECRET_INTERNAL_EXCEPTION" });
  assert.match(html, /role="alert"/);
  assert.match(html, /Fabric guidance couldn&#x27;t be loaded\. Please try again\./);
  assert.doesNotMatch(html, /SECRET_INTERNAL_EXCEPTION/);
});
test("empty success is guidance, not an error", () => {
  const html = render({ state: "output-available", input, output: { input, suggestions: [], disclaimer: "General guidance, not inventory." } });
  assert.match(html, /No matching fabric category/);
  assert.match(html, /General guidance, not inventory/);
  assert.doesNotMatch(html, /role="alert"/);
});
test("cards render rationale and consideration rather than JSON", () => {
  const html = render({ state: "output-available", input, output: { input, suggestions: [{ name: "Cotton category", rationale: "Breathable starting point.", consideration: "Check weight." }], disclaimer: "Not stock." } });
  for (const value of ["Cotton category", "Breathable starting point", "Check weight", "Not stock"]) assert.match(html, new RegExp(value));
  assert.match(html, /<li/);
});
test("transport preserves tool-only history, order and signatures, omitting unsupported parts", () => {
  const signature = { google: { thoughtSignature: "test-signature" } };
  const tool = { ...base, state: "input-available", input, callProviderMetadata: signature };
  const result = getOutgoingMessages([
    { id: "empty", role: "assistant", parts: [{ type: "step-start" }] },
    { id: "tool", role: "assistant", parts: [{ type: "step-start" }, tool, { type: "text", text: "Explanation" }, { type: "reasoning", text: "private" }, { type: "dynamic-tool", toolName: "other" }] },
    { id: "only-tool", role: "assistant", parts: [tool] },
    { id: "user", role: "user", parts: [{ type: "text", text: "Next" }, tool] },
  ]);
  assert.equal(result.length, 3);
  assert.deepEqual(result[0].parts, [{ type: "step-start" }, tool, { type: "text", text: "Explanation" }]);
  assert.equal(result[0].parts[1].callProviderMetadata.google.thoughtSignature, "test-signature");
  assert.deepEqual(result[1].parts, [tool]);
  assert.deepEqual(result[2].parts, [{ type: "text", text: "Next" }]);
});
