// Local, quota-free Chrome checks. Start Next on :3100 and Chrome CDP on :9222.
import assert from "node:assert/strict";

const origin = "http://localhost:3100";
const browser = "http://localhost:9222";
const target = await fetch(`${browser}/json/new?about:blank`, { method: "PUT" }).then(r => r.json());
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
let id = 0;
const pending = new Map(), errors = [], apiCalls = [];
socket.onmessage = ({ data }) => {
  const message = JSON.parse(data);
  if (message.method === "Runtime.exceptionThrown") errors.push(message.params.exceptionDetails.text);
  if (message.method === "Runtime.consoleAPICalled" && message.params.type === "error") errors.push(message.params.args);
  if (message.method === "Network.requestWillBeSent" && message.params.request.url.includes("/api/")) apiCalls.push(message.params.request.url);
  const job = pending.get(message.id);
  if (job) { pending.delete(message.id); if (message.error) job.reject(message.error); else job.resolve(message.result); }
};
function cdp(method, params = {}) {
  return new Promise((resolve, reject) => { const n = ++id; pending.set(n, { resolve, reject }); socket.send(JSON.stringify({ id: n, method, params })); });
}
async function ev(expression) {
  const result = await cdp("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function wait(expression, timeout = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeout) { if (await ev(expression)) return; await delay(30); }
  throw Error(`Timeout: ${expression}; ${await ev("JSON.stringify({text:document.querySelector('main')?.innerText,states:window.labStates})")}`);
}
const button = "document.querySelector('[data-send-state]')";
const state = value => `${button}?.dataset.sendState === '${value}'`;
async function choose(value) {
  await ev(`document.querySelector('input[value="${value}"]').click()`);
  await delay(60);
}
const reset = () => ev("[...document.querySelectorAll('main button')].find(b=>b.textContent==='Reset').click()");
async function click() {
  const point = await ev(`(()=>{const b=${button};b.scrollIntoView({block:'center'});const r=b.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);
  await cdp("Input.dispatchMouseEvent", { type: "mousePressed", button: "left", clickCount: 1, ...point });
  await cdp("Input.dispatchMouseEvent", { type: "mouseReleased", button: "left", clickCount: 1, ...point });
}
async function key(key, code, virtual) {
  await cdp("Input.dispatchKeyEvent", { type: "keyDown", key, code, windowsVirtualKeyCode: virtual, text: key === "Enter" ? "\r" : key });
  await cdp("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode: virtual });
}
async function load() {
  await cdp("Page.navigate", { url: `${origin}/button-lab` });
  await wait(`${button} && Object.keys(${button}).some(k=>k.startsWith('__reactProps$'))`);
}
const report = {};
try {
  await cdp("Page.enable"); await cdp("Runtime.enable"); await cdp("Network.enable");
  await cdp("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await load();
  await ev(`(()=>{
    window.labStates=['idle'];window.labSizes=[];
    const b=${button};
    new MutationObserver(()=>{const s=b.dataset.sendState;if(labStates.at(-1)!==s)labStates.push(s);labSizes.push([s,b.offsetWidth,b.offsetHeight]);}).observe(b,{attributes:true,childList:true,subtree:true});
    window.labTimers=[];
    const originalSet=window.setTimeout,originalClear=window.clearTimeout;
    window.setTimeout=function(callback,ms,...args){const entry={ms,fired:false,cleared:false};const timer=originalSet(()=>{entry.fired=true;callback(...args)},ms);entry.id=timer;labTimers.push(entry);return timer;};
    window.clearTimeout=function(timer){const entry=labTimers.find(t=>t.id===timer);if(entry)entry.cleared=true;return originalClear(timer);};
  })()`);
  await click(); await wait(state("loading"));
  // Two synchronous clicks must neither create timers nor restart the run.
  const timerCount = await ev("labTimers.filter(t=>t.ms===1000).length");
  await ev(`${button}.click();${button}.click()`);
  assert.equal(await ev("labTimers.filter(t=>t.ms===1000).length"), timerCount);
  assert(await ev(`${button}.getAttribute('aria-disabled')==='true' && ${button}.getAttribute('aria-busy')==='true'`));
  const center = await ev(`(()=>{const r=${button}.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);
  await cdp("Input.dispatchMouseEvent", { type: "mouseMoved", ...center }); await delay(180);
  assert.equal(await ev(`getComputedStyle(${button}).transform`), "none");
  await choose("failure"); await ev("document.querySelector('input[value=failure]').focus()");
  await wait(state("success"));
  assert(await ev("document.activeElement.matches('input[value=failure]')"));
  await wait(state("idle"));
  assert.deepEqual(await ev("labStates"), ["idle", "loading", "success", "idle"]);
  report.successDuplicateHoverFocusAndNextOutcome = true;

  // The changed outcome now fails. Space/Enter use actual browser key events.
  await ev(`${button}.focus()`); await key(" ", "Space", 32);
  await wait(state("error")); await delay(350);
  assert(await ev("document.querySelector('[role=status]').textContent.startsWith('Failed.')"));
  assert(await ev(`document.activeElement===${button}`));
  assert.equal(await ev(`getComputedStyle(${button}).outlineStyle`), "solid");
  await delay(1300); assert(await ev(state("error")));
  await choose("success"); await ev(`${button}.focus()`); await key("Enter", "Enter", 13);
  await wait(state("success")); await wait(state("idle"));
  report.persistentErrorKeyboardRetryAndFocus = true;
  await choose("failure"); await click(); await wait(state("error")); await delay(350);
  await reset(); await wait(state("idle")); report.resetAfterFailure = true;

  await cdp("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await click(); await wait(state("loading"));
  assert.equal(await ev(`getComputedStyle(${button}.querySelector('[aria-hidden]')).animationName`), "none");
  await wait(state("error"));
  assert.equal(await ev(`getComputedStyle(${button}).animationName`), "none");
  assert.equal(await ev(`getComputedStyle(${button}).transform`), "none");
  await reset(); report.reducedMotion = true;

  // Ignore transform frames (the error shake/press) when comparing layout size.
  const sizes = await ev("labSizes");
  assert(sizes.every(([, w, h]) => Math.abs(w - 256) < .1 && Math.abs(h - 56) < .1), JSON.stringify(sizes));
  report.stableButtonSize = { width: 256, height: 56 };
  report.viewports = [];
  for (const width of [320, 375, 390, 1280]) {
    await cdp("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: width < 768 });
    await delay(100);
    const metrics = await ev(`(()=>{const controls=[...document.querySelectorAll('main button,main label')];return{viewport:innerWidth,scrollWidth:document.documentElement.scrollWidth,clientWidth:document.documentElement.clientWidth,controlsFit:controls.every(e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.height>=44})}})()`);
    assert(metrics.scrollWidth<=metrics.clientWidth && metrics.controlsFit, JSON.stringify(metrics));
    const before = await ev(`({width:${button}.offsetWidth,height:${button}.offsetHeight})`);
    await click(); await wait(state("error")); await delay(350);
    assert.equal(await ev(`${button}.offsetWidth`), before.width);
    assert.equal(await ev(`${button}.offsetHeight`), before.height);
    assert(await ev("document.documentElement.scrollWidth<=document.documentElement.clientWidth"));
    await reset(); report.viewports.push(metrics);
  }
  // Reset must cancel the outstanding operation, not just change its label.
  await click(); await wait(state("loading"));
  const resetTimer = await ev("labTimers.filter(t=>t.ms===1000).at(-1).id");
  await reset(); await delay(1100);
  assert(await ev(state("idle")));
  assert(await ev(`labTimers.find(t=>t.id===${resetTimer}).cleared && !labTimers.find(t=>t.id===${resetTimer}).fired`));
  report.resetPendingTimer = true;

  // Client navigation unmounts without replacing the instrumented window.
  await click(); await wait(state("loading"));
  const unmountTimer = await ev("labTimers.filter(t=>t.ms===1000).at(-1).id");
  await ev("[...document.querySelectorAll('main a')].find(a=>a.textContent==='Back to storefront').click()");
  await wait("location.pathname==='/' && !document.querySelector('[data-send-state]')"); await delay(1100);
  assert(await ev(`labTimers.find(t=>t.id===${unmountTimer}).cleared && !labTimers.find(t=>t.id===${unmountTimer}).fired`));
  report.unmountCancelsPendingTimer = true;
  await load(); assert(await ev(state("idle")));
  assert.deepEqual(errors, []); assert.deepEqual(apiCalls, []);
  report.consoleErrors = errors; report.apiCalls = apiCalls;
  console.log(JSON.stringify(report, null, 2));
} finally {
  socket.close(); await fetch(`${browser}/json/close/${target.id}`);
}
