// Optional dependency-free smoke test. Requires a running app and headless Chrome
// with --remote-debugging-port=9222. This makes real Gemini calls using app config.
// Run: node scripts/verify-advisor.mjs
import assert from "node:assert/strict";

const origin = process.env.ADVISOR_TEST_URL ?? "http://localhost:3100";
const testWidth = Number(process.env.ADVISOR_TEST_WIDTH ?? 1280);
const browserOrigin = process.env.ADVISOR_BROWSER_URL ?? "http://localhost:9222";
const target = await fetch(`${browserOrigin}/json/new?about:blank`, { method: "PUT" }).then((r) => r.json());
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
let nextId = 0;
const pending = new Map();
const canceledRequests = [];
const requestUrls = new Map();
socket.onmessage = ({ data }) => {
  const message = JSON.parse(data);
  if (message.method === "Network.requestWillBeSent") {
    requestUrls.set(message.params.requestId, message.params.request.url);
  }
  if (message.method === "Network.loadingFailed" && message.params.canceled &&
      requestUrls.get(message.params.requestId) === `${origin}/api/chat`) {
    canceledRequests.push(message.params.requestId);
  }
  if (message.id) {
    const job = pending.get(message.id);
    if (job) {
      pending.delete(message.id);
      if (message.error) job.reject(message.error);
      else job.resolve(message.result);
    }
  }
};
function cdp(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await cdp("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitFor(expression, timeout = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await evaluate(expression)) return true;
    await delay(50);
  }
  return false;
}
async function send(text) {
  await evaluate(`(() => {
    const input = document.querySelector('textarea');
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(input, ${JSON.stringify(text)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await delay(60);
  await evaluate("document.querySelector('textarea').form.requestSubmit()");
}
const snapshotExpression = `(() => {
  const view = document.querySelector('[aria-labelledby="conversation-title"]');
  const answers = [...document.querySelectorAll('article[aria-label="Advisor response"]')];
  return {
    answers: answers.length,
    textLength: answers.at(-1)?.textContent.length ?? 0,
    top: view.scrollTop,
    remaining: view.scrollHeight - view.scrollTop - view.clientHeight,
    busy: document.querySelector('textarea').disabled,
    jump: [...document.querySelectorAll('button')].some(b => b.textContent === 'Jump to latest'),
    error: document.querySelector('[role="alert"]')?.textContent ?? null
  };
})()`;
const report = {};
try {
  await cdp("Network.enable");
  await cdp("Page.enable");
  await cdp("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await cdp("Page.navigate", { url: `${origin}/advisor` });
  assert(await waitFor("!!document.querySelector('textarea')"), "Advisor did not render");
  await delay(1200);
  report.page = await evaluate("document.querySelector('h1').textContent");
  report.widths = [];
  for (const width of [375, 1280]) {
    await cdp("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: width === 375 });
    await delay(150);
    const layout = await evaluate(`({ viewport: innerWidth, document: document.documentElement.scrollWidth, input: document.querySelector('textarea').getBoundingClientRect().width, advisorLink: !!document.querySelector('nav a[href="/advisor"]') })`);
    assert(layout.document <= layout.viewport, `Overflow at ${width}px`);
    assert(layout.input > 200 && layout.advisorLink);
    report.widths.push({ width, ...layout });
  }

  await cdp("Emulation.setDeviceMetricsOverride", {width:testWidth,height:900,deviceScaleFactor:testWidth<768?3:1,mobile:testWidth<768,screenWidth:testWidth,screenHeight:900});
  await cdp("Emulation.setTouchEmulationEnabled", {enabled:testWidth<768});
  report.chatViewport = testWidth;

  const invalidCases = [
    ["malformed JSON", "{", 400],
    ["empty messages", JSON.stringify({ messages: [] }), 400],
    ["system role", JSON.stringify({ messages: [{ id: "1", role: "system", parts: [{ type: "text", text: "test" }] }] }), 400],
    ["oversized message", JSON.stringify({ messages: [{ id: "1", role: "user", parts: [{ type: "text", text: "a".repeat(2001) }] }] }), 413],
    ["oversized body", "a".repeat(65537), 413],
    ["too many messages", JSON.stringify({ messages: Array.from({ length: 25 }, (_, id) => ({ id: String(id), role: "user", parts: [{ type: "text", text: "a" }] })) }), 413],
    ["non-text part", JSON.stringify({ messages: [{ id: "1", role: "user", parts: [{ type: "file", text: "test" }] }] }), 400],
  ];
  report.validation = [];
  for (const [name, body, expected] of invalidCases) {
    const response = await fetch(`${origin}/api/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body });
    assert.equal(response.status, expected, name);
    report.validation.push({ name, status: response.status });
  }
  const unsupported = await fetch(`${origin}/api/chat`, { method: "POST", body: "test" });
  assert.equal(unsupported.status, 415);
  report.validation.push({ name: "unsupported content type", status: unsupported.status });

  // Observe real painted states; no artificial stream chunks or network delays.
  await evaluate(`(() => {
    window.advisorFrames = [];
    let previous = '';
    function sample() {
      const answers = [...document.querySelectorAll('article[aria-label="Advisor response"]')];
      const input = document.querySelector('textarea');
      const state = {
        busy: input.disabled,
        length: answers.at(-1)?.textContent.length ?? 0,
        thinking: document.querySelector('[role="status"]').textContent.includes('thinking'),
        documentWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        innerWidth,
        horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        controlsFit: [...document.querySelectorAll('form textarea, form button')].every(e=>{
          const r=e.getBoundingClientRect();return r.width>0 && r.left>=0 && r.right<=document.documentElement.clientWidth;
        }),
        bubblesWrap: answers.every(e=>e.scrollWidth<=e.clientWidth)
      };
      const signature = JSON.stringify(state);
      if (signature !== previous) { window.advisorFrames.push(state); previous = signature; }
      requestAnimationFrame(sample);
    }
    requestAnimationFrame(sample);
  })()`);
  await send("I need help selecting an outfit for a summer occasion. Please explain the fabric considerations.");
  assert(await waitFor("document.querySelector('textarea').disabled", 1500));
  assert.equal((await evaluate(snapshotExpression)).answers, 0, "Text arrived before the pre-text Stop test");
  await evaluate("[...document.querySelectorAll('button')].find(b => b.textContent === 'Stop').click()");
  assert(await waitFor("!document.querySelector('textarea').disabled", 10000));
  report.stopBeforeText = await evaluate(snapshotExpression);
  assert.equal(report.stopBeforeText.answers, 0);
  assert(await waitFor("!document.querySelector('[role=\"alert\"]')", 1000));
  // A deliberately stopped pre-text request has its own stopping frames;
  // inspect the thinking-to-text handoff of the following real response only.
  await evaluate("window.advisorFrames = []");

  await send("I am attending a wedding in hot weather. Give a detailed numbered list of 20 fabric and styling considerations, several short sentences each. Focus on breathable materials. My personal fabric note is " + "lightweightcotton".repeat(30) + ".");
  report.thinking = await waitFor("document.querySelector('[role=\"status\"]').textContent.includes('thinking')", 2000);
  const receivedText = await waitFor("!!document.querySelector('article[aria-label=\"Advisor response\"]') || !!document.querySelector('[role=\"alert\"]')");
  assert(receivedText, "No text or safe error arrived");
  let snapshot = await evaluate(snapshotExpression);
  if (snapshot.error) {
    report.liveProviderError = snapshot.error;
    // We can still verify cancellation before text and subsequent submission.
    await send("Which breathable fabric suits a summer wedding?");
    if (await waitFor("document.querySelector('textarea').disabled", 1500)) {
      await evaluate("[...document.querySelectorAll('button')].find(b => b.textContent === 'Stop').click()");
      assert(await waitFor("!document.querySelector('textarea').disabled", 10000));
      report.stopBeforeText = await evaluate(snapshotExpression);
      report.canceledRequests = canceledRequests.length;
      await send("What should I consider when choosing lace?");
      assert(await waitFor("document.querySelector('textarea').disabled", 1500));
      assert(await waitFor("!document.querySelector('textarea').disabled", 45000));
      report.sendAfterStop = await evaluate(snapshotExpression);
    }
    report.unverified = ["progressive response text", "contextual follow-up", "partial text after Stop", "scroll release and Jump to latest during streaming"];
  } else {
    const lengths = new Set([snapshot.textLength]);
    let released = false;
    for (let i = 0; i < 400; i++) {
      snapshot = await evaluate(snapshotExpression);
      lengths.add(snapshot.textLength);
      if (!released && snapshot.remaining < 49 && snapshot.top > 100 && snapshot.busy) {
        const point = await evaluate(`(() => {
          const v = document.querySelector('[aria-labelledby="conversation-title"]');
          v.scrollIntoView({ block: 'center' });
          const r = v.getBoundingClientRect();
          return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
        })()`);
        await cdp("Input.dispatchMouseEvent", { type: "mouseWheel", ...point, deltaX: 0, deltaY: -500 });
        await waitFor(`document.querySelector('[aria-labelledby="conversation-title"]').scrollTop < ${snapshot.top}`, 1500);
        released = true;
      }
      if (released && snapshot.jump && snapshot.busy && lengths.size >= 3) break;
      if (!snapshot.busy) break;
      await delay(25);
    }
    report.progressiveTextLengths = [...lengths];
    report.scrollDuringStream = { released, ...snapshot };
    if (snapshot.jump) {
      await evaluate("[...document.querySelectorAll('button')].find(b => b.textContent === 'Jump to latest').click()");
      report.afterJump = await evaluate(snapshotExpression);
      const beforeGrowth = report.afterJump.textLength;
      // ResizeObserver pins after layout; do not sample between a React text
      // commit and the browser's next layout/observer delivery.
      report.grewAfterJump = await waitFor(`(() => {
        const state = ${snapshotExpression};
        return state.textLength > ${beforeGrowth} && state.remaining <= 48 && state.busy;
      })()`, 5000);
      report.followingAfterJump = await evaluate(snapshotExpression);
      assert(report.grewAfterJump && report.followingAfterJump.remaining <= 48, "Following did not resume after Jump to latest");
    }
    if (snapshot.busy) {
      await evaluate("[...document.querySelectorAll('button')].find(b => b.textContent === 'Stop').click()");
      assert(await waitFor("!document.querySelector('textarea').disabled", 10000), "Input did not recover after Stop");
      report.afterStop = await evaluate(snapshotExpression);
      assert(report.afterStop.textLength >= snapshot.textLength, "Partial text was lost");
      const partialText = await evaluate("[...document.querySelectorAll('article[aria-label=\"Advisor response\"]')].at(-1).textContent");
      await delay(300);
      assert.equal(await evaluate("[...document.querySelectorAll('article[aria-label=\"Advisor response\"]')].at(-1).textContent"), partialText, "Stopped text continued changing");
      assert.equal(await evaluate("document.querySelector('textarea').disabled"), false);
      report.stoppedTextStable = true;
      report.canceledRequests = canceledRequests.length;
    } else report.stopDuringText = "Response finished before Stop could be exercised";

    await send("For that same wedding and weather, which one of those fabrics would you choose and why? Keep it concise.");
    await waitFor("!document.querySelector('textarea').disabled", 45000);
    report.followUp = await evaluate(snapshotExpression);
    report.followUpText = await evaluate("[...document.querySelectorAll('article[aria-label=\"Advisor response\"]')].at(-1)?.textContent");
    assert.equal(report.followUp.error, null);
    assert(report.followUp.answers >= 2 && report.followUp.textLength > 50, "Follow-up did not produce an answer");
    assert(/wedding|hot.weather|summer/i.test(report.followUpText), "Follow-up did not refer to prior context");
    const completeAnswer = report.followUpText;
    await delay(300);
    assert.equal(await evaluate("[...document.querySelectorAll('article[aria-label=\"Advisor response\"]')].at(-1)?.textContent"), completeAnswer);
    report.completedAnswerRetained = true;
    report.paintedStates = await evaluate("window.advisorFrames");
    assert(report.paintedStates.every(state=>!state.horizontalOverflow), "Document overflow during real chat");
    assert(report.paintedStates.every(state=>state.controlsFit && state.bubblesWrap), "Chat content or controls overflowed");
    // The old assistant text must not count as the next turn's generated text.
    const firstThinking = report.paintedStates.findIndex((state) => state.thinking);
    const firstText = report.paintedStates.findIndex((state) => state.length > 0);
    assert(firstThinking >= 0 && firstText > firstThinking);
    assert(report.paintedStates.slice(firstThinking, firstText).filter((state) => state.busy).every((state) => state.thinking), "Blank handoff frame before text");
    assert(lengths.size > 2, "Did not observe progressive rendered text");
    assert(released && report.scrollDuringStream.busy && report.scrollDuringStream.jump, "Scroll release was not verified during streaming");
    assert(report.afterStop && report.canceledRequests >= 2, "Both requests were not canceled");
  }
  if (process.env.ADVISOR_TEST_SUMMARY) {
    console.log(JSON.stringify({
      width:testWidth,
      stopBeforeText:!report.stopBeforeText?.busy,
      thinking:report.thinking,
      progressiveLengths:report.progressiveTextLengths,
      scrollReleased:report.scrollDuringStream?.released && report.scrollDuringStream?.busy,
      jumpDuringStream:report.afterJump?.busy && report.afterJump?.remaining === 0,
      followingResumed:report.grewAfterJump && report.followingAfterJump?.remaining === 0,
      stoppedTextStable:report.stoppedTextStable,
      canceledRequests:report.canceledRequests,
      followUpCompleted:report.completedAnswerRetained,
      maxDocumentWidth:Math.max(...(report.paintedStates??[]).map(state=>state.documentWidth)),
      minClientWidth:Math.min(...(report.paintedStates??[]).map(state=>state.clientWidth)),
      horizontalOverflow:report.paintedStates?.some(state=>state.horizontalOverflow),
      controlsFit:report.paintedStates?.every(state=>state.controlsFit),
      bubblesWrap:report.paintedStates?.every(state=>state.bubblesWrap),
      error:report.liveProviderError??null
    }));
  } else console.log(JSON.stringify(report, null, 2));
} catch (error) {
  console.log(JSON.stringify(report, null, 2));
  throw error;
} finally {
  socket.close();
  await fetch(`${browserOrigin}/json/close/${target.id}`);
}
