// Local-only browser checks. No Advisor/API calls or provider credentials are used.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const origin = process.argv[2] ?? process.env.FEAA2_ORIGIN ?? "http://localhost:3100";
if (!/^http:\/\/localhost:31\d\d$/.test(origin)) {
  throw new Error("Bag Studio verification only runs against localhost ports 3100–3199.");
}

const browser = await chromium.launch({
  headless: true,
  args: ["--enable-webgl", "--use-gl=angle", "--use-angle=swiftshader"],
});
const errors = [];
const context = await browser.newContext({ viewport: { width: 375, height: 850 }, deviceScaleFactor: 1 });
const page = await context.newPage();
page.on("pageerror", error => errors.push(error.message));
page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });

await page.addInitScript(() => {
  window.__bagDraws = [];
  for (const prototype of [WebGLRenderingContext.prototype, WebGL2RenderingContext.prototype]) {
    for (const name of ["drawArrays", "drawElements", "drawArraysInstanced", "drawElementsInstanced"]) {
      const original = prototype[name];
      if (typeof original !== "function") continue;
      prototype[name] = function (...args) {
        window.__bagDraws.push(performance.now());
        return original.apply(this, args);
      };
    }
  }
});

function hash(data) { return createHash("sha256").update(data).digest("hex"); }
async function imageHash() {
  return hash(await page.locator("canvas").screenshot());
}
async function sizes() {
  return page.evaluate(() => {
    const entries = [...performance.getEntriesByType("resource")];
    const nav = performance.getEntriesByType("navigation")[0];
    return { transferBytes: Math.round((nav?.transferSize ?? 0) + entries.reduce((sum, item) => sum + item.transferSize, 0)),
      resourceCount: entries.length };
  });
}

try {
  await page.goto(`${origin}/bag-studio`, { waitUntil: "networkidle" });
  assert.match(await page.locator("h1").innerText(), /3D Bag Color Studio/);
  assert.equal(await page.locator("canvas").count(), 0);
  assert.equal(await page.locator('svg[aria-label="Clay tote bag concept illustration"]').count(), 1);
  const initial = await sizes();

  const widths = [];
  for (const width of [320, 375, 768, 1280]) {
    await page.setViewportSize({ width, height: 850 });
    const measured = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth, controlsInside: [...document.querySelectorAll("main button, main a")]
        .every(element => { const box = element.getBoundingClientRect(); return box.left >= 0 && box.right <= innerWidth; }) }));
    assert(measured.document <= measured.client && measured.controlsInside, JSON.stringify(measured));
    widths.push(measured);
  }
  await page.setViewportSize({ width: 375, height: 850 });

  await page.getByRole("button", { name: "Olive" }).click();
  assert.equal(await page.locator('svg[aria-label="Olive tote bag concept illustration"]').count(), 1);
  assert.equal(await page.locator('svg path[fill="#617459"]').count(), 1);

  await page.getByRole("button", { name: "Load 3D viewer" }).click();
  await page.locator("canvas").waitFor({ timeout: 30000 });
  await page.waitForTimeout(500);
  const graphics = await page.locator("canvas").evaluate(canvas => {
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    const debug = gl?.getExtension("WEBGL_debug_renderer_info");
    return { renderer: gl && debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl?.getParameter(gl.RENDERER),
      version: gl?.getParameter(gl.VERSION) };
  });
  const screenshotPath = join(tmpdir(), "FEAA2-bag-studio-375.png");
  await page.screenshot({ path: screenshotPath, fullPage: true });
  const loaded = await sizes();
  const firstImage = await imageHash();
  await page.getByRole("button", { name: "Midnight" }).click();
  await page.waitForTimeout(250);
  const colorChanged = await imageHash();
  assert.notEqual(colorChanged, firstImage, "Color selection should redraw the real WebGL canvas.");

  const canvas = page.locator("canvas");
  const box = await canvas.boundingBox();
  assert(box);
  const centerX = box.x + box.width / 2;
  const centerY = box.y + box.height / 2;
  await page.mouse.move(centerX, centerY);
  await page.mouse.down();
  await page.evaluate(() => { window.__bagDraws = []; });
  for (let step = 1; step <= 22; step++) {
    await page.mouse.move(centerX + step * 5, centerY + step * 1.5);
    await page.waitForTimeout(16);
  }
  await page.mouse.up();
  await page.waitForTimeout(150);
  const rotated = await imageHash();
  assert.notEqual(rotated, colorChanged, "Mouse drag should rotate the rendered bag.");

  const drawTimes = await page.evaluate(() => window.__bagDraws);
  const frameStarts = drawTimes.filter((time, index) => index === 0 || time - drawTimes[index - 1] > 8);
  const measuredFps = frameStarts.length > 1
    ? Math.round(((frameStarts.length - 1) * 1000 / (frameStarts.at(-1) - frameStarts[0])) * 10) / 10
    : null;

  await page.mouse.wheel(0, -250);
  await page.waitForTimeout(250);
  const zoomed = await imageHash();
  assert.notEqual(zoomed, rotated, "Mouse wheel should zoom the rendered bag.");
  await page.getByRole("button", { name: "Rotate left" }).click();
  await page.waitForTimeout(150);
  assert.notEqual(await imageHash(), zoomed, "Keyboard-accessible camera button should rotate the bag.");
  const afterCameraButton = await imageHash();
  await page.locator('[role="group"][aria-label$="bag concept preview"]').focus();
  await page.keyboard.press("ArrowLeft");
  await page.waitForTimeout(150);
  assert.notEqual(await imageHash(), afterCameraButton, "Focused preview should respond to arrow keys.");

  const reduced = await browser.newContext({ viewport: { width: 375, height: 850 }, reducedMotion: "reduce" });
  const reducedPage = await reduced.newPage();
  await reducedPage.goto(`${origin}/bag-studio`);
  await reducedPage.getByRole("button", { name: "Load 3D viewer" }).click();
  assert.equal(await reducedPage.locator("canvas").count(), 0);
  assert.match(await reducedPage.locator("main").innerText(), /reduced-motion preference/);
  await reduced.close();

  const noWebgl = await browser.newContext({ viewport: { width: 375, height: 850 } });
  await noWebgl.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
      if (kind === "webgl" || kind === "webgl2") return null;
      return getContext.call(this, kind, ...args);
    };
  });
  const noWebglPage = await noWebgl.newPage();
  await noWebglPage.goto(`${origin}/bag-studio`);
  await noWebglPage.getByRole("button", { name: "Load 3D viewer" }).click();
  assert.equal(await noWebglPage.locator("canvas").count(), 0);
  assert.match(await noWebglPage.locator("main").innerText(), /3D graphics are unavailable/);
  await noWebgl.close();

  const lowPower = await browser.newContext({ viewport: { width: 375, height: 850 } });
  await lowPower.addInitScript(() => Object.defineProperty(navigator, "deviceMemory", { value: 1, configurable: true }));
  const lowPowerPage = await lowPower.newPage();
  await lowPowerPage.goto(`${origin}/bag-studio`);
  await lowPowerPage.getByRole("button", { name: "Load 3D viewer" }).click();
  assert.equal(await lowPowerPage.locator("canvas").count(), 0);
  assert.match(await lowPowerPage.locator("main").innerText(), /low-power or data-saving mode/);
  await lowPower.close();

  const touch = await browser.newContext({ viewport: { width: 375, height: 850 }, isMobile: true, hasTouch: true });
  const touchPage = await touch.newPage();
  await touchPage.goto(`${origin}/bag-studio`);
  await touchPage.getByRole("button", { name: "Load 3D viewer" }).click();
  await touchPage.locator("canvas").waitFor();
  const touchBox = await touchPage.locator("canvas").boundingBox();
  assert(touchBox);
  const touchBefore = hash(await touchPage.locator("canvas").screenshot());
  const session = await touchPage.context().newCDPSession(touchPage);
  const tx = Math.round(touchBox.x + touchBox.width / 2), ty = Math.round(touchBox.y + touchBox.height / 2);
  await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: tx, y: ty, id: 1 }] });
  for (let step = 1; step <= 12; step++) {
    await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: tx + step * 6, y: ty, id: 1 }] });
    await touchPage.waitForTimeout(20);
  }
  await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await touchPage.waitForTimeout(200);
  const touchAfter = hash(await touchPage.locator("canvas").screenshot());
  assert.notEqual(touchAfter, touchBefore, "Touch drag should rotate the WebGL canvas.");
  await touch.close();

  assert.deepEqual(errors, [], `Browser errors: ${errors.join(" | ")}`);
  console.log(JSON.stringify({ passed: true, origin, widths, initial, loaded,
    screenshotPath, graphics,
    incrementalTransferBytes: loaded.transferBytes - initial.transferBytes,
    webglDrawCallsDuringDrag: drawTimes.length, webglRenderBurstsDuringDrag: frameStarts.length,
    measuredDragSpanMs: frameStarts.length > 1 ? Math.round(frameStarts.at(-1) - frameStarts[0]) : null,
    observedWebglBurstsPerSecond: measuredFps, mouseDrag: true, wheelZoom: true,
    colorChange: true, keyboardControl: true, arrowKeyControl: true, touchDrag: true,
    reducedMotionFallback: true, noWebglFallback: true, lowPowerFallback: true,
    browserErrors: errors.length }, null, 2));
} finally {
  await context.close();
  await browser.close();
}
