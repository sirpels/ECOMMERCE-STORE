// Quota-free real browser/transport checks. Requires Chrome :9222 and dev app :3100.
// Server: ADVISOR_DEV_SCENARIO=<case>; this runner: ADVISOR_BROWSER_CASE=<case>.
// Never run against production. Fixtures are explicitly not Gemini evidence.
import assert from "node:assert/strict";
const origin = "http://localhost:3100";
const scenario = process.env.ADVISOR_BROWSER_CASE ?? "recovery";
const browser = "http://localhost:9222";
const target = await fetch(`${browser}/json/new?about:blank`, { method: "PUT" }).then(r => r.json());
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
let id = 0;
const pending = new Map(), requests = [], responses = [], exceptions = [];
socket.onmessage = ({ data }) => {
  const m = JSON.parse(data);
  if (m.method === "Network.requestWillBeSent" && m.params.request.url === `${origin}/api/chat`) requests.push(JSON.parse(m.params.request.postData));
  if (m.method === "Network.responseReceived" && m.params.response.url === `${origin}/api/chat`) responses.push(m.params.response.status);
  if (m.method === "Runtime.exceptionThrown") exceptions.push(m.params.exceptionDetails.text);
  const job = pending.get(m.id);
  if (job) { pending.delete(m.id); if (m.error) job.reject(m.error); else job.resolve(m.result); }
};
function cdp(method, params = {}) { return new Promise((resolve, reject) => { const n = ++id; pending.set(n, { resolve, reject }); socket.send(JSON.stringify({ id: n, method, params })); }); }
async function ev(expression) {
  const r = await cdp("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw Error(JSON.stringify(r.exceptionDetails));
  return r.result.value;
}
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function wait(expression, timeout = 25000) {
  const start = Date.now();
  while (Date.now() - start < timeout) { if (await ev(expression)) return; await delay(25); }
  throw Error(`Timeout: ${expression}; body=${await ev("document.querySelector('main')?.innerText.slice(-1800)")}`);
}
const retry = "[...document.querySelectorAll('button')].find(b=>b.textContent==='Retry response')";
const lastAnswer = "[...document.querySelectorAll('article[aria-label=\"Advisor response\"]')].at(-1)";
async function fill(text) {
  await ev(`(()=>{const t=document.querySelector('textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(t,${JSON.stringify(text)});t.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await delay(60);
}
async function send(text) { await fill(text); await ev("document.querySelector('textarea').form.requestSubmit()"); await wait("document.querySelector('textarea').disabled"); }
async function done() { await wait("!document.querySelector('textarea').disabled"); await delay(80); }
async function stop() { await ev("[...document.querySelectorAll('button')].find(b=>b.textContent==='Stop').click()"); await done(); }
const report = { scenario, fixture: true };
async function widths() {
  const result = [];
  for (const width of [320, 375, 390, 768, 1280]) {
    await cdp("Emulation.setDeviceMetricsOverride", { width, height: 850, deviceScaleFactor: width < 768 ? 3 : 1, mobile: width < 768 }); await delay(80);
    const m = await ev(`(()=>{const v=document.querySelector('[aria-labelledby="conversation-title"]');return {width:innerWidth,document:document.documentElement.scrollWidth,client:document.documentElement.clientWidth,chat:v.scrollWidth,chatClient:v.clientWidth,controls:[...document.querySelectorAll('main button,textarea')].every(e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth}),vertical:document.documentElement.scrollHeight>document.documentElement.clientHeight}})()`);
    assert(m.document <= m.client && m.chat <= m.chatClient && m.controls, JSON.stringify(m)); result.push(m);
  }
  await cdp("Emulation.setDeviceMetricsOverride", { width: 375, height: 850, deviceScaleFactor: 3, mobile: true });
  return result;
}
try {
  await cdp("Network.enable"); await cdp("Runtime.enable"); await cdp("Page.enable");
  await cdp("Emulation.setDeviceMetricsOverride", { width: 375, height: 850, deviceScaleFactor: 3, mobile: true });
  await cdp("Page.navigate", { url: `${origin}/advisor` });
  if (scenario === "route-error") {
    await wait("!![...document.querySelectorAll('button')].find(b=>b.textContent==='Try loading the advisor again')");
    assert(await ev("document.querySelector('main').textContent.includes('may restart your in-memory conversation')"));
    await ev("[...document.querySelectorAll('button')].find(b=>b.textContent==='Try loading the advisor again').click()");
    await wait("!!document.querySelector('textarea')"); report.recovered = true;
  } else {
    await wait("!!document.querySelector('textarea') && Object.keys(document.querySelector('textarea')).some(k=>k.startsWith('__reactProps$'))");
    await ev(`(()=>{window.edgeStates=[];window.edgeFrames=[];new MutationObserver(()=>{for(const n of document.querySelectorAll('[data-tool-state]'))if(!edgeStates.includes(n.dataset.toolState))edgeStates.push(n.dataset.toolState)}).observe(document.querySelector('main'),{subtree:true,childList:true,attributes:true});function sample(){const v=document.querySelector('[aria-labelledby="conversation-title"]');const a=[...document.querySelectorAll('article[aria-label="Advisor response"]')].at(-1);edgeFrames.push({busy:document.querySelector('textarea').disabled,length:a?.textContent.length??0,top:v.scrollTop,remaining:v.scrollHeight-v.clientHeight-v.scrollTop,thinking:[...document.querySelectorAll('p')].some(p=>p.textContent==='Advisor is thinking…')});requestAnimationFrame(sample)}sample()})()`);
    if (scenario === "recovery") {
      await ev("document.querySelector('[aria-labelledby=\"conversation-title\"] button').click()");
      assert(await ev("document.activeElement===document.querySelector('textarea') && document.querySelector('textarea').value.includes('wedding')"));
      assert.equal(requests.length, 0); report.examplesFillOnly = true;
      await fill("   "); await ev("document.querySelector('textarea').form.requestSubmit()"); await delay(80); assert.equal(requests.length, 0);
      await cdp("Network.emulateNetworkConditions", { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
      await wait("document.querySelector('main').textContent.includes('reconnect to send or retry')");
      await fill("An offline draft"); assert(await ev("document.querySelector('form button[type=submit]').disabled"));
      await ev("document.querySelector('textarea').form.requestSubmit()"); assert.equal(requests.length, 0);
      await cdp("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
      await wait("!document.querySelector('form button[type=submit]').disabled"); assert.equal(await ev("document.querySelector('textarea').value"), "An offline draft"); report.offlineDraft = true;
      await send("Local baseline with fabric guidance."); await done();
      assert.equal(await ev("document.querySelectorAll('[data-tool-state=output-available] h4').length"), 3);
      const baseline = await ev("document.querySelector('article[aria-label=\"Advisor response\"]').textContent");
      await send("Local partial failure with fabric guidance.");
      await wait(`${lastAnswer}?.textContent.includes('Local test fixture:') && document.querySelector('textarea').disabled`);
      report.partialVisibleBeforeFailure = true;
      await wait("!!document.querySelector('[aria-label=\"Advisor response issue\"]')"); await done();
      assert.equal(await ev("document.querySelectorAll('[data-tool-state=output-available] h4').length"), 6);
      assert(await ev(`${lastAnswer}.textContent.includes('Local test fixture:')`));
      assert(await ev("document.querySelector('[role=alert]').textContent.includes('response was interrupted')"));
      await cdp("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
      await cdp("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
      await ev(`${retry}.focus()`);
      assert(await ev(`(()=>{const b=${retry};const s=getComputedStyle(b);return b.matches(':focus-visible')&&s.outlineStyle!=='none'&&parseFloat(s.outlineWidth)>=2})()`));
      report.retryFocusVisible = true;
      report.errorWidths = await widths();
      const beforeRetry = requests.length;
      await ev(`${retry}.click(); ${retry}.click()`);
      await wait("!!document.querySelector('[aria-label=\"Previous incomplete response\"]')");
      assert.equal(await ev("document.querySelectorAll('[aria-label=\"Previous incomplete response\"] h4').length"), 3);
      await done(); assert.equal(requests.length, beforeRetry + 1);
      assert.equal(requests.at(-1).messages.filter(m=>m.role==='user').length, 2);
      assert.equal(requests.at(-1).messages.filter(m=>m.role==='assistant').length, 1);
      assert(requests.at(-1).messages[1].parts.some(p=>p.type==='tool-findFabricGuidance'&&p.callProviderMetadata?.google?.thoughtSignature));
      assert.equal(await ev("document.querySelectorAll('article[aria-label=\"Your message\"]').length"), 2);
      assert.equal(await ev("document.querySelector('article[aria-label=\"Advisor response\"]').textContent"), baseline);
      assert(await ev("!document.querySelector('[role=alert]') && !document.querySelector('[aria-label=\"Previous incomplete response\"]')"));
      report.retryRecovery = { oneRequest: true, earlierHistoryRetained: true, snapshotNotSent: true, userNotDuplicated: true };
      await cdp("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
      await send("Local long response for scroll and Stop tests.");
      await wait("document.querySelector('[aria-labelledby=\"conversation-title\"]').scrollTop>150 && document.querySelector('textarea').disabled");
      await ev("document.querySelector('[aria-labelledby=\"conversation-title\"]').scrollIntoView({block:'center'})");
      const pos = await ev("(()=>{const r=document.querySelector('[aria-labelledby=\"conversation-title\"]').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()");
      await cdp("Input.dispatchMouseEvent", { type: "mouseWheel", ...pos, deltaX: 0, deltaY: -400 });
      await wait("[...document.querySelectorAll('button')].some(b=>b.textContent==='Jump to latest') && document.querySelector('textarea').disabled");
      const top = await ev("document.querySelector('[aria-labelledby=\"conversation-title\"]').scrollTop");
      await delay(160);
      assert.equal(await ev("document.querySelector('[aria-labelledby=\"conversation-title\"]').scrollTop"), top);
      await ev("[...document.querySelectorAll('button')].find(b=>b.textContent==='Jump to latest').click()");
      assert(await ev("(()=>{const v=document.querySelector('[aria-labelledby=\"conversation-title\"]');return v.scrollHeight-v.clientHeight-v.scrollTop<=48&&document.querySelector('textarea').disabled})()"));
      const partial = await ev(`${lastAnswer}.textContent`); await stop(); await delay(200);
      const stopped = await ev(`${lastAnswer}.textContent`); assert(stopped.startsWith(partial)); await delay(150); assert.equal(await ev(`${lastAnswer}.textContent`), stopped);
      assert(await ev("!document.querySelector('[role=alert]')")); report.scrollAndStop = true;
      await send("Local send after Stop."); await done(); assert(await ev(`${lastAnswer}.textContent.includes('Local test fixture:')`)); report.stopThenSend = true;
      const answerCount = await ev("document.querySelectorAll('article[aria-label=\"Advisor response\"]').length");
      await send("Local Stop before text.");
      // Wait for HTTP acknowledgement, not text, so an aborted-before-dispatch
      // request cannot skip an ordinal in the deterministic server fixture.
      for (let i = 0; i < 100 && responses.length < requests.length; i++) await delay(10);
      assert.equal(responses.length, requests.length);
      await stop(); assert(await ev("!document.querySelector('[role=alert]')"));
      assert.equal(await ev("document.querySelectorAll('article[aria-label=\"Advisor response\"]').length"), answerCount);
      report.stopBeforeText = true;
      await send("Local Stop during a tool lookup."); await wait("!!document.querySelector('[data-tool-state=input-streaming]')");
      assert(await ev("(()=>{const nodes=[...document.querySelectorAll('main [class*=animate-pulse]')];return nodes.length>0&&nodes.every(n=>getComputedStyle(n).animationName==='none')})()"));
      report.reducedMotion = true;
      await stop(); assert(await ev("document.querySelector('[data-tool-state=input-streaming]').textContent.includes('Stopped')"));
      assert(await ev("!document.querySelector('[role=alert]')")); report.stopDuringTool = true;
      report.states = await ev("edgeStates");
      report.frames = await ev("({progressive:[...new Set(edgeFrames.filter(f=>f.busy).map(f=>f.length))].length,thinking:edgeFrames.some(f=>f.thinking)})");
      assert(report.frames.progressive>3 && report.frames.thinking);
      report.finalWidths = await widths();
      await cdp("Emulation.setDeviceMetricsOverride", { width: 375, height: 400, deviceScaleFactor: 3, mobile: true });
      await ev("document.querySelector('textarea').focus();document.querySelector('textarea').scrollIntoView({block:'center'})");
      assert(await ev("document.documentElement.scrollWidth===document.documentElement.clientWidth && [...document.querySelectorAll('textarea,form button')].every(e=>{const r=e.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight})")); report.smallHeight = true;
    } else {
      await send("Local deterministic edge-case question.");
      if (scenario === "slow") {
        await wait("document.querySelector('main').textContent.includes('Still working.')", 15000); report.slowFeedback = true; await stop(); assert(await ev("!document.querySelector('[role=alert]')"));
      } else {
        await done();
        if (["tool-failure", "malformed-tool"].includes(scenario)) {
          assert(await ev("document.querySelector('[data-tool-state=output-error]').textContent.includes(\"Fabric guidance couldn't be loaded. Please try again.\")"));
          assert.equal(await ev("document.querySelectorAll('[data-tool-state=output-available]').length"), 0);
        } else if (scenario === "empty-match") {
          assert(await ev("document.querySelector('[data-tool-state=output-available]').textContent.includes('No matching fabric category')"));
          const before = requests.length; await ev("[...document.querySelectorAll('button')].find(b=>b.textContent==='Adjust preferences').click()");
          assert(await ev("document.activeElement===document.querySelector('textarea') && document.querySelector('textarea').value.includes('adjust')")); assert.equal(requests.length, before);
          assert(await ev("!document.querySelector('[role=alert]')"));
        } else {
          const expected = { http503: "temporarily unavailable", http429: "Too many requests", quota: "usage limit", timeout: "took too long", midstream: "response was interrupted", disconnect: "connection was interrupted", "empty-response": "finished without an answer", refusal: "couldn't answer that request" }[scenario];
          assert(await ev(`document.querySelector('[aria-label="Advisor response issue"]')?.textContent.includes(${JSON.stringify(expected)})`));
          if (["midstream", "disconnect"].includes(scenario)) assert(await ev(`${lastAnswer}.textContent.includes('Local test fixture:')`));
          if (scenario === "http429") { assert(await ev(`${retry}.disabled`)); await wait(`!${retry}.disabled`, 5000); }
          if (scenario !== "refusal") {
            await ev(`${retry}.click();${retry}.click()`); await done(); assert.equal(requests.length, 2); assert(await ev("!!document.querySelector('[aria-label=\"Advisor response issue\"]')")); report.secondFailureRecoverable = true;
            if (scenario === "midstream") {
              await send("A new question after an error."); await done();
              assert.equal(requests.length, 3);
              assert.equal(requests.at(-1).messages.filter(m=>m.role==='user').length, 2);
              assert.equal(await ev("[...document.querySelectorAll('button')].filter(b=>b.textContent==='Retry response').length"), 1);
              report.normalSendAfterError = true;
            }
          } else assert(await ev(`!${retry}`));
        }
        report.widths = await widths();
        assert(await ev("!document.querySelector('main').textContent.includes('PRIVATE_SENTINEL')"));
      }
    }
  }
  report.requests = requests.length; report.httpStatuses = responses;
  report.exceptions = exceptions;
  if (scenario !== "route-error") assert.equal(exceptions.length, 0);
  console.log(JSON.stringify(report, null, 2));
} catch (error) { console.log(JSON.stringify(report, null, 2)); throw error; }
finally { socket.close(); await fetch(`${browser}/json/close/${target.id}`); }
