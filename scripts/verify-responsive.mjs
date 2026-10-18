// Dependency-free Chrome measurements. App on :3100, remote debugging on :9222.
import assert from "node:assert/strict";
const browserOrigin = process.env.ADVISOR_BROWSER_URL ?? "http://localhost:9222";
const target = await fetch(`${browserOrigin}/json/new?about:blank`, { method: "PUT" }).then(r => r.json());
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
let id = 0;
const pending = new Map();
socket.onmessage = ({ data }) => {
  const message = JSON.parse(data);
  const job = pending.get(message.id);
  if (job) { pending.delete(message.id); if (message.error) job.reject(message.error); else job.resolve(message.result); }
};
function cdp(method, params = {}) {
  return new Promise((resolve, reject) => { const n = ++id; pending.set(n, { resolve, reject }); socket.send(JSON.stringify({ id: n, method, params })); });
}
async function evaluate(expression) {
  const result = await cdp("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const measurements = `(() => {
  const root = document.documentElement;
  const nodes = [...document.querySelectorAll('body *')].filter(e => !['SCRIPT','STYLE'].includes(e.tagName));
  const describe = e => { const r=e.getBoundingClientRect(); const c=getComputedStyle(e); return { tag:e.tagName, class:e.className, text:e.textContent.slice(0,65), left:r.left, right:r.right, width:r.width, scrollWidth:e.scrollWidth, clientWidth:e.clientWidth, minWidth:c.minWidth, cssWidth:c.width, display:c.display, overflowX:c.overflowX }; };
  return {
    innerWidth, clientWidth:root.clientWidth, scrollWidth:root.scrollWidth, screenWidth:screen.width, visualWidth:visualViewport.width,
    viewport:document.querySelector('meta[name=viewport]')?.content,
    bodyWidth:document.body.getBoundingClientRect().width,
    verticalScrolling:root.scrollHeight>root.clientHeight,
    overflow:nodes.filter(e=>{const r=e.getBoundingClientRect();return r.width && (r.right>root.clientWidth+1 || r.left < -1)}).slice(0,15).map(describe),
    shared:['header>div','footer>div','main','textarea'].map(s=>document.querySelector(s)).filter(Boolean).map(describe),
    unusableLinks:[...document.querySelectorAll('header a,footer a')].filter(e=>{const r=e.getBoundingClientRect();return r.left<0||r.right>root.clientWidth||r.height<16}).map(describe)
  };
})()`;
try {
  await cdp("Page.enable");
  const defaultUserAgent = (await cdp("Browser.getVersion")).userAgent;
  const report = [];
  for (const mobile of [false, true]) {
    await cdp("Emulation.setUserAgentOverride", {
      userAgent:mobile?"Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Mobile Safari/537.36":defaultUserAgent,
      platform:mobile?"Android":"Win32"
    });
    await cdp("Emulation.setTouchEmulationEnabled", { enabled:mobile });
    for (const width of [320,375,390,768,1280]) {
      await cdp("Emulation.setDeviceMetricsOverride", { width,height:850,deviceScaleFactor:mobile?3:1,mobile,screenWidth:width,screenHeight:850 });
      for (const path of ["/","/advisor"]) {
        await cdp("Page.navigate", {url:`http://localhost:3100${path}`});
        for(let i=0;i<100;i++) {
          if(await evaluate(`location.pathname === ${JSON.stringify(path)} && document.readyState === 'complete' && !!document.querySelector('footer') && getComputedStyle(document.querySelector('main')).minHeight !== '0px'`))break;
          await delay(50);
        }
        await evaluate("document.fonts.ready.then(() => true)");
        await delay(150);
        const result = await evaluate(measurements);
        await evaluate("window.scrollTo(200, 0)");
        result.horizontalScrollX = await evaluate("scrollX");
        await evaluate("window.scrollTo(0, document.documentElement.scrollHeight)");
        result.verticalScrollY = await evaluate("scrollY");
        await evaluate("window.scrollTo(0, 0)");
        report.push({mobile,width,path,...result});
        if(process.env.ASSERT_NO_OVERFLOW) assert(result.scrollWidth<=result.clientWidth && result.innerWidth<=width && result.unusableLinks.length===0,JSON.stringify({mobile,width,path,...result}));
      }
    }
  }
  console.log(JSON.stringify(report.map(({mobile,width,path,innerWidth,clientWidth,scrollWidth,bodyWidth,horizontalScrollX,verticalScrollY,overflow,unusableLinks})=>({mobile,width,path,innerWidth,clientWidth,scrollWidth,bodyWidth,horizontalScrollX,verticalScrollY,overflow,unusableLinks})),null,2));
} finally { socket.close(); await fetch(`${browserOrigin}/json/close/${target.id}`); }
