// Real local Gemini/browser checks; requires app :3100 and dedicated Chrome :9222.
// Run normally, or FABRIC_UI_TEST_MODE=failure against the dev-only failure server.
// Never prints credentials or opaque provider signatures. No mocked responses.
import assert from "node:assert/strict";
const origin = process.env.ADVISOR_TEST_URL ?? "http://localhost:3100";
const mode = process.env.FABRIC_UI_TEST_MODE ?? "normal";
// This debugging browser is dedicated to these tests, never a personal profile.
for (const tab of await fetch("http://localhost:9222/json/list").then(r => r.json())) {
  if (tab.type === "page") await fetch(`http://localhost:9222/json/close/${tab.id}`);
}
const target = await fetch("http://localhost:9222/json/new?about:blank", { method: "PUT" }).then(r => r.json());
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
let id = 0;
const pending = new Map();
socket.onmessage = ({ data }) => {
  const m = JSON.parse(data), job = pending.get(m.id);
  if (job) { pending.delete(m.id); if (m.error) job.reject(m.error); else job.resolve(m.result); }
};
const cdp = (method, params = {}) => new Promise((resolve, reject) => {
  const n = ++id; pending.set(n, { resolve, reject }); socket.send(JSON.stringify({ id: n, method, params }));
});
async function evaluate(expression) {
  const r = await cdp("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw Error(JSON.stringify(r.exceptionDetails));
  return r.result.value;
}
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function wait(expression, timeout = 55000) {
  const start = Date.now();
  while (Date.now() - start < timeout) { if (await evaluate(expression)) return; await delay(30); }
  throw Error(`Timed out: ${expression}; ${JSON.stringify(await evaluate("({error:document.querySelector('[role=alert]')?.textContent, events:window.probe?.events})"))}`);
}
async function send(text) {
  await evaluate(`(() => { const t=document.querySelector('textarea'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(t,${JSON.stringify(text)});t.dispatchEvent(new Event('input',{bubbles:true})); })()`);
  await delay(80);
  await evaluate("document.querySelector('textarea').form.requestSubmit()");
  await wait("document.querySelector('textarea').disabled");
}
async function done() { await wait("!document.querySelector('textarea').disabled"); await delay(100); }
const prompt = "I'm attending a wedding in hot weather. Breathability is my main priority. Recommend suitable fabric categories.";
const report = { mode };
try {
  await cdp("Page.enable");
  await cdp("Emulation.setDeviceMetricsOverride", { width: 375, height: 850, deviceScaleFactor: 3, mobile: true });
  await cdp("Page.navigate", { url: `${origin}/advisor` });
  await wait("!!document.querySelector('textarea')");
  await wait("Object.keys(document.querySelector('textarea')).some(k=>k.startsWith('__reactProps$'))");
  await delay(2000);
  await evaluate(`(() => {
    window.probe={events:[],requests:[],states:[],samples:[],cancelTool:false,canceledTool:false};
    const original=window.fetch;
    window.fetch=async(...args)=>{
      if(String(args[0])!='/api/chat')return original(...args);
      const body=JSON.parse(args[1].body);
      probe.requests.push(body.messages.map(m=>({role:m.role,types:m.parts.map(p=>p.type),signature:m.parts.some(p=>!!p.callProviderMetadata?.google?.thoughtSignature)})));
      const response=await original(...args);
      if(response.ok){const copy=response.clone(); (async()=>{let buffer='';const reader=copy.body.getReader();const decoder=new TextDecoder();try{while(true){const {done,value}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});let end;while((end=buffer.indexOf(String.fromCharCode(10)))>=0){const line=buffer.slice(0,end);buffer=buffer.slice(end+1);if(line.startsWith('data: ')&&line!='data: [DONE]'){const item=JSON.parse(line.slice(6));probe.events.push({type:item.type,toolName:item.toolName});}}}}catch{} })();}
      return response;
    };
    new MutationObserver(()=>{
      for(const node of document.querySelectorAll('[data-tool-state]')){
        const state=node.dataset.toolState;
        if(!probe.states.includes(state))probe.states.push(state);
        if(probe.cancelTool && ['input-streaming','input-available'].includes(state)){
          const button=[...document.querySelectorAll('button')].find(b=>b.textContent==='Stop');
          if(button){probe.cancelTool=false;probe.canceledTool=true;button.click();}
        }
      }
    }).observe(document.body,{subtree:true,childList:true,attributes:true});
    function frame(){const view=document.querySelector('[aria-labelledby="conversation-title"]');const articles=[...document.querySelectorAll('article[aria-label="Advisor response"]')];const last=articles.at(-1);probe.samples.push({busy:document.querySelector('textarea').disabled,text:[...last?.querySelectorAll(':scope > p:not(:first-child)')??[]].map(p=>p.textContent).join('').length,thinking:[...document.querySelectorAll('p')].some(p=>p.textContent==='Advisor is thinking…'),top:view.scrollTop,remaining:view.scrollHeight-view.clientHeight-view.scrollTop});if(probe.samples.length>10000)probe.samples.shift();requestAnimationFrame(frame);}frame();
  })()`);
  if (mode === "regression") {
    await send("Explain fibre versus weave in twelve short numbered points with practical garment-care examples. Answer directly; this is general education, not a fabric-matching request.");
    await wait("probe.events.filter(e=>e.type==='text-delta').length>=3 && document.querySelector('textarea').disabled && document.querySelector('[aria-labelledby=\"conversation-title\"]').scrollTop>150");
    report.noTool = await evaluate("!probe.events.some(e=>e.type==='tool-input-start')");
    assert(report.noTool);
    await evaluate("document.querySelector('[aria-labelledby=\"conversation-title\"]').scrollIntoView({block:'center'})");
    report.pinned = await evaluate("(()=>{const v=document.querySelector('[aria-labelledby=\"conversation-title\"]');return {remaining:v.scrollHeight-v.clientHeight-v.scrollTop,busy:document.querySelector('textarea').disabled}})()");
    assert(report.pinned.remaining <= 48 && report.pinned.busy);
    const box = await evaluate("(()=>{const r=document.querySelector('[aria-labelledby=\"conversation-title\"]').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()");
    await cdp("Input.dispatchMouseEvent", { type: "mouseWheel", ...box, deltaX: 0, deltaY: -450 });
    await wait("[...document.querySelectorAll('button')].some(b=>b.textContent==='Jump to latest') && document.querySelector('textarea').disabled");
    report.unpinnedWhileStreaming = true;
    await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent==='Jump to latest').click()");
    await delay(30);
    report.jump = await evaluate("(()=>{const v=document.querySelector('[aria-labelledby=\"conversation-title\"]');return {remaining:v.scrollHeight-v.clientHeight-v.scrollTop,busy:document.querySelector('textarea').disabled}})()");
    assert(report.jump.remaining <= 48 && report.jump.busy);
    const partial = await evaluate("document.querySelector('article[aria-label=\"Advisor response\"]').textContent");
    await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent==='Stop').click()");
    await done(); await delay(200);
    const stopped = await evaluate("document.querySelector('article[aria-label=\"Advisor response\"]').textContent");
    assert(stopped.startsWith(partial));
    await delay(200);
    assert.equal(await evaluate("document.querySelector('article[aria-label=\"Advisor response\"]').textContent"), stopped);
    report.stopAfterText = true;
    await send("What two textile concepts were we discussing? Reply in one sentence, without a lookup."); await done();
    report.followup = await evaluate("[...document.querySelectorAll('article[aria-label=\"Advisor response\"]')].at(-1).textContent");
    assert.match(report.followup, /fibre|fiber/i); assert.match(report.followup, /weave/i);
    report.stopThenSend = true;
    const eventStart = await evaluate("probe.events.length");
    await send("Please explain garment care.");
    const beforeText = await evaluate(`!probe.events.slice(${eventStart}).some(e=>e.type==='text-delta')`);
    await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent==='Stop').click()"); await done();
    assert(beforeText);
    report.stopBeforeText = true;
    report.progressiveLengths = await evaluate("[...new Set(probe.samples.filter(s=>s.busy&&s.text>0).map(s=>s.text))]");
    assert(report.progressiveLengths.length >= 3);
    report.thinkingObserved = await evaluate("probe.samples.some(s=>s.busy&&s.thinking)");
    assert(report.thinkingObserved);
    assert(await evaluate("!document.querySelector('[role=alert]')"));
  } else {
  await send(prompt);
  await done();
  report.events = await evaluate("probe.events.map(e=>e.type)");
  report.states = await evaluate("probe.states");
  if (mode === "failure") {
    report.error = await evaluate("document.querySelector('[data-tool-state=output-error]')?.textContent");
    assert(report.error?.includes("Fabric guidance couldn't be loaded. Please try again."));
    assert(report.events.includes("tool-output-error"));
    await send("What is the difference between a weave and a fibre? Do not perform a fabric lookup.");
    await done();
    assert.equal(await evaluate("document.querySelectorAll('article[aria-label=\"Your message\"]').length"), 2);
    assert(await evaluate("[...document.querySelectorAll('[role=alert]')].every(n=>n.matches('[data-tool-state=output-error]'))"));
    report.recovered = true;
  } else {
    assert(report.events.includes("tool-input-start"), "Gemini did not automatically call tool");
    assert(report.events.includes("tool-input-available"));
    assert(report.events.includes("tool-output-available"));
    report.cards = await evaluate("[...document.querySelectorAll('[data-tool-state=output-available] h4')].map(e=>e.textContent)");
    assert.equal(report.cards.length, 3);
    assert(await evaluate("document.querySelector('article[aria-label=\"Advisor response\"]').textContent.includes('Store products, prices, stock, and availability are not verified.')"));
    report.explanation = await evaluate("[...document.querySelectorAll('article[aria-label=\"Advisor response\"] > p:not(:first-child)')].map(e=>e.textContent).join('')");
    assert(report.explanation.length > 30);
    await send("What occasion, weather and priority did I give you? Reply briefly without another lookup.");
    await done();
    report.followup = await evaluate("[...document.querySelectorAll('article[aria-label=\"Advisor response\"]')].at(-1).textContent");
    assert.match(report.followup, /wedding/i); assert.match(report.followup, /hot/i); assert.match(report.followup, /breathab/i);
    report.history = await evaluate("probe.requests.at(-1)");
    assert(report.history.some(m => m.types.includes("tool-findFabricGuidance")));
    report.widths = [];
    for (const width of [320, 375, 390, 1280]) {
      await cdp("Emulation.setDeviceMetricsOverride", { width, height: 850, deviceScaleFactor: width < 768 ? 3 : 1, mobile: width < 768 });
      await delay(150);
      const m = await evaluate(`(() => {const v=document.querySelector('[aria-labelledby="conversation-title"]');return {width:innerWidth,scroll:document.documentElement.scrollWidth,chatWidth:v.clientWidth,chatScroll:v.scrollWidth,controls:[...document.querySelectorAll('textarea,form button')].every(e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth}),links:[...document.querySelectorAll('header a,footer a')].every(e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth})}})()`);
      assert(m.scroll <= m.width && m.chatScroll <= m.chatWidth && m.controls && m.links);
      report.widths.push(m);
    }
    if (mode === "normal") {
      // Stop a genuine input stream, using actual DOM tool-state observation.
      await evaluate("probe.cancelTool=true");
      await send("Now find categories for work in cool weather with structure as my priority.");
      await done();
      report.stopDuringTool = await evaluate("({clicked:probe.canceledTool,stopped:[...document.querySelectorAll('[data-tool-state]')].some(n=>n.textContent.includes('Lookup stopped.')),cardsRetained:document.querySelectorAll('[data-tool-state=output-available] h4').length})");
      // Check that the next message can use history after the interrupted call.
      await send("What occasion did I originally mention? Reply briefly."); await done();
      report.stopThenSend = await evaluate("[...document.querySelectorAll('article[aria-label=\"Advisor response\"]')].at(-1).textContent");
      assert.match(report.stopThenSend, /wedding/i);
    }
    report.progressiveLengths = await evaluate("[...new Set(probe.samples.filter(s=>s.busy&&s.text>0).map(s=>s.text))]");
    assert(report.progressiveLengths.length >= 3);
    report.thinkingObserved = await evaluate("probe.samples.some(s=>s.busy&&s.thinking)");
    report.noGlobalError = await evaluate("!document.querySelector('[role=alert]')");
    assert(report.noGlobalError);
  }
  }
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  console.log(JSON.stringify(report, null, 2));
  throw error;
} finally { socket.close(); }
