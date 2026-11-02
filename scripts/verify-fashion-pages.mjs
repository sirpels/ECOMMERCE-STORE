// Local browser checks for the homepage and lace photograph; no AI requests.
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const origin = process.argv[2] ?? "http://localhost:3104";
if (!/^http:\/\/localhost:31\d\d$/.test(origin)) {
  throw new Error("Fashion-page verification only runs against localhost ports 3100–3199.");
}

const browser = await chromium.launch({
  headless: true,
  args: ["--enable-webgl", "--use-gl=angle", "--use-angle=swiftshader"],
});
const context = await browser.newContext({ viewport: { width: 375, height: 850 }, deviceScaleFactor: 1 });
await context.addInitScript(() => {
  const shifts = [];
  Reflect.set(window, "feaa2LayoutShifts", shifts);
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (!entry.hadRecentInput) shifts.push(entry.value);
    }
  }).observe({ type: "layout-shift", buffered: true });
});

const page = await context.newPage();
const errors = [];
const aiRequests = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});
page.on("request", (request) => {
  if (request.url().includes("/api/chat") || request.url().includes("generativelanguage.googleapis.com")) {
    aiRequests.push(request.url());
  }
});

async function transfer(targetPage) {
  return targetPage.evaluate(() => {
    const navigation = performance.getEntriesByType("navigation")[0];
    const resources = performance.getEntriesByType("resource");
    return Math.round((navigation?.transferSize ?? 0) + resources.reduce((total, entry) => total + entry.transferSize, 0));
  });
}

async function documentWidth(targetPage) {
  return targetPage.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
  }));
}

const widths = [320, 375, 390, 768, 1280];
await page.goto(origin, { waitUntil: "networkidle" });
await page.locator('img[alt^="Illustrative editorial fashion image"]').evaluate((image) => image.decode());
await page.waitForTimeout(150);
const homeTransfer = await transfer(page);
const homeScripts = new Set(await page.evaluate(() => performance.getEntriesByType("resource")
  .filter((entry) => entry.name.includes("/_next/static/") && entry.name.includes(".js"))
  .map((entry) => entry.name)));
const imageEntries = await page.evaluate(() => performance.getEntriesByType("resource")
  .filter((entry) => entry.name.includes("/_next/image"))
  .map((entry) => ({ url: entry.name, transferBytes: Math.round(entry.transferSize) })));
const layoutShift = await page.evaluate(() => window.feaa2LayoutShifts.reduce((total, value) => total + value, 0));
assert.ok(layoutShift < 0.1, `Homepage layout shift was ${layoutShift}.`);

const homepageWidths = [];
const homeDesktopScreenshot = join(tmpdir(), "FEAA2-home-1280.png");
for (const width of widths) {
  await page.setViewportSize({ width, height: 850 });
  await page.goto(origin, { waitUntil: "networkidle" });
  await page.locator('img[alt^="Illustrative editorial fashion image"]').evaluate((image) => image.decode());
  const result = await documentWidth(page);
  assert.ok(result.document <= result.viewport, `Homepage overflows at ${width}px: ${result.document}px`);
  assert.equal(await page.locator('img[alt^="Illustrative editorial fashion image"]').count(), 1);
  assert.equal(await page.locator("canvas").count(), 0, "Homepage must not load a WebGL canvas.");
  const heroBounds = await page.locator('section[aria-labelledby="home-title"]').evaluate((section) => {
    const box = section.getBoundingClientRect();
    const image = section.querySelector("img");
    const heading = section.querySelector("h1");
    const cta = section.querySelector('a[href="/lace"]');
    const headingBox = heading?.getBoundingClientRect();
    const ctaBox = cta?.getBoundingClientRect();
    return {
      left: box.left,
      width: box.width,
      imageLoaded: Boolean(image?.complete && image.naturalWidth > 0),
      objectPosition: image ? getComputedStyle(image).objectPosition : null,
      headingVisible: Boolean(headingBox && headingBox.left >= 0 && headingBox.right <= window.innerWidth),
      ctaVisible: Boolean(ctaBox && ctaBox.left >= 0 && ctaBox.right <= window.innerWidth),
    };
  });
  assert.ok(Math.abs(heroBounds.left) <= 1 && Math.abs(heroBounds.width - width) <= 1,
    `Hero is not full-width at ${width}px: ${JSON.stringify(heroBounds)}`);
  assert.ok(heroBounds.imageLoaded, `Hero image did not load at ${width}px.`);
  assert.ok(heroBounds.headingVisible, `Hero heading extends outside ${width}px viewport.`);
  assert.ok(heroBounds.ctaVisible, `Primary CTA extends outside ${width}px viewport.`);
  const ctaBounds = await page.getByRole("link", { name: "Explore Lace" }).evaluate((element) => {
    const box = element.getBoundingClientRect();
    return { left: box.left, right: box.right };
  });
  assert.ok(ctaBounds.left >= 0 && ctaBounds.right <= width, `Primary CTA extends outside ${width}px viewport.`);
  assert.equal(await page.getByRole("link", { name: "Explore Lace" }).getAttribute("href"), "/lace");
  if (width === 1280) await page.screenshot({ path: homeDesktopScreenshot, fullPage: true });
  homepageWidths.push({ ...result, ...heroBounds });
}

await page.setViewportSize({ width: 375, height: 850 });
await page.goto(origin, { waitUntil: "networkidle" });
const laceLink = page.getByRole("link", { name: "Explore Lace" });
assert.equal(await laceLink.getAttribute("href"), "/lace");
const tailoringLink = page.getByRole("link", { name: "Have It Made — open a WhatsApp tailoring enquiry in a new tab" });
assert.equal(await tailoringLink.count(), 1, "The verified tailoring contact should render as an active link.");
const tailoringUrl = new URL(await tailoringLink.getAttribute("href"));
assert.equal(tailoringUrl.hostname, "wa.me");
assert.equal(tailoringUrl.pathname, "/2347066814272");
assert.match(tailoringUrl.searchParams.get("text") ?? "", /interested in having an outfit made/);
assert.equal(await tailoringLink.getAttribute("target"), "_blank");
assert.match(await tailoringLink.getAttribute("rel"), /noopener/);

// Intercept only the outbound navigation: prove the click opens its correct new
// tab without loading WhatsApp or sending a real message.
let openedWhatsAppUrl = null;
await context.route("https://wa.me/**", async (route) => {
  openedWhatsAppUrl = route.request().url();
  await route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>Local outbound-link check</title>" });
});
const [whatsAppTab] = await Promise.all([page.waitForEvent("popup"), tailoringLink.click()]);
await whatsAppTab.waitForLoadState("domcontentloaded");
assert.equal(openedWhatsAppUrl, tailoringUrl.href);
assert.equal(whatsAppTab.url(), tailoringUrl.href);
await whatsAppTab.close();
const homeScreenshot = join(tmpdir(), "FEAA2-home-375.png");
await page.screenshot({ path: homeScreenshot, fullPage: true });
await laceLink.click();
await page.waitForURL("**/lace");
assert.equal(await page.getByRole("heading", { name: "Lace collection" }).count(), 1);

const bagPage = await context.newPage();
await bagPage.goto(`${origin}/bag-studio`, { waitUntil: "networkidle" });
const beforeBagViewer = new Set(await bagPage.evaluate(() => performance.getEntriesByType("resource")
  .filter((entry) => entry.name.includes("/_next/static/") && entry.name.includes(".js"))
  .map((entry) => entry.name)));
await bagPage.getByRole("button", { name: "Load 3D viewer" }).click();
await bagPage.locator("canvas").waitFor();
const viewerChunks = (await bagPage.evaluate(() => performance.getEntriesByType("resource")
  .filter((entry) => entry.name.includes("/_next/static/") && entry.name.includes(".js"))
  .map((entry) => entry.name))).filter((url) => !beforeBagViewer.has(url));
assert.ok(viewerChunks.length > 0, "The Bag Studio should load at least one viewer-specific JavaScript chunk.");
assert.ok(viewerChunks.every((url) => !homeScripts.has(url)), "The homepage downloaded a 3D viewer chunk.");
await bagPage.close();

const reduced = await browser.newContext({ viewport: { width: 375, height: 850 }, reducedMotion: "reduce" });
const reducedPage = await reduced.newPage();
await reducedPage.goto(origin);
const reducedStyle = await reducedPage.locator('section[aria-labelledby="home-title"] img').evaluate((element) => ({
  transform: getComputedStyle(element).transform,
  filter: getComputedStyle(element).filter,
  duration: getComputedStyle(element).transitionDuration,
}));
assert.equal(reducedStyle.transform, "none");
assert.equal(reducedStyle.filter, "none");
assert.equal(reducedStyle.duration, "0s");
await reduced.close();

const laceWidths = [];
for (const width of widths) {
  await page.setViewportSize({ width, height: 850 });
  await page.goto(`${origin}/lace`, { waitUntil: "networkidle" });
  const result = await documentWidth(page);
  assert.ok(result.document <= result.viewport, `Lace page overflows at ${width}px: ${result.document}px`);
  assert.equal(await page.locator("canvas").count(), 0, "Lace page must not mount a 3D canvas.");
  await page.getByRole("button", { name: "Enlarge the lace photograph to inspect its embroidery" }).click();
  const mobileDialog = page.getByRole("dialog", { name: "Enlarged lace photograph" });
  const controlsInside = await mobileDialog.getByRole("button").evaluateAll((buttons) => buttons.every((button) => {
    const box = button.getBoundingClientRect();
    return box.left >= 0 && box.right <= window.innerWidth;
  }));
  assert.ok(controlsInside, `Lace lightbox controls extend outside ${width}px viewport.`);
  if (width === 320) {
    await mobileDialog.getByRole("button", { name: "Zoom in" }).click();
    const zoomWidth = await documentWidth(page);
    assert.ok(zoomWidth.document <= zoomWidth.viewport, "Zoomed lace image causes document overflow at 320px.");
  }
  await mobileDialog.getByRole("button", { name: "Close" }).click();
  laceWidths.push(result);
}

const laceMetricContext = await browser.newContext({ viewport: { width: 375, height: 850 }, deviceScaleFactor: 1 });
const lacePage = await laceMetricContext.newPage();
lacePage.on("pageerror", (error) => errors.push(error.message));
lacePage.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});
lacePage.on("request", (request) => {
  if (request.url().includes("/api/chat") || request.url().includes("generativelanguage.googleapis.com")) {
    aiRequests.push(request.url());
  }
});
await lacePage.goto(`${origin}/lace`, { waitUntil: "networkidle" });
const laceTransfer = await transfer(lacePage);
const opener = lacePage.getByRole("button", { name: "Enlarge the lace photograph to inspect its embroidery" });
await opener.click();
const dialog = lacePage.getByRole("dialog", { name: "Enlarged lace photograph" });
await dialog.waitFor({ state: "visible" });
const image = dialog.locator("img");
await image.evaluate((element) => element.decode());
const fitted = await image.evaluate((element) => ({ width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height }));
await dialog.getByRole("button", { name: "Zoom in" }).click();
await lacePage.waitForFunction((fittedWidth) => {
  const element = document.querySelector("dialog[open] img");
  return element && element.getBoundingClientRect().width > fittedWidth * 1.5;
}, fitted.width);
await image.evaluate((element) => element.decode());
const zoomed = await image.evaluate((element) => ({
  width: element.getBoundingClientRect().width,
  height: element.getBoundingClientRect().height,
  naturalWidth: element.naturalWidth,
  naturalHeight: element.naturalHeight,
}));
assert.ok(zoomed.width > fitted.width * 1.5, `Zoom did not enlarge the photograph (${fitted.width} to ${zoomed.width}).`);
assert.ok(Math.abs(zoomed.width / zoomed.height - zoomed.naturalWidth / zoomed.naturalHeight) < 0.01,
  `Zoom distorted the photograph's aspect ratio: ${JSON.stringify(zoomed)}.`);
const laceZoomTransfer = await transfer(lacePage);
const laceScreenshot = join(tmpdir(), "FEAA2-lace-zoom-375.png");
await lacePage.screenshot({ path: laceScreenshot });
await dialog.getByRole("button", { name: "Fit image" }).click();
await lacePage.waitForFunction((fittedWidth) => {
  const element = document.querySelector("dialog[open] img");
  return element && Math.abs(element.getBoundingClientRect().width - fittedWidth) < 2;
}, fitted.width);
const fittedAgain = await image.evaluate((element) => element.getBoundingClientRect().width);
assert.ok(Math.abs(fittedAgain - fitted.width) < 2, "Fit image did not restore the original view.");
await dialog.getByRole("button", { name: "Close" }).click();
assert.equal(await dialog.isVisible(), false);
assert.equal(await opener.evaluate((element) => document.activeElement === element), true,
  "Closing the lightbox must return keyboard focus to its opener.");
await opener.focus();
await lacePage.keyboard.press("Enter");
await dialog.waitFor({ state: "visible" });
await lacePage.keyboard.press("Escape");
assert.equal(await dialog.isVisible(), false, "Escape must close the lace lightbox.");

assert.deepEqual(aiRequests, [], "Fashion-page checks must not call Gemini.");
assert.deepEqual(errors, [], "Browser console/page errors occurred.");

console.log(JSON.stringify({
  passed: true,
  origin,
  homepageWidths,
  laceWidths,
  homeTransferBytes: homeTransfer,
  imageEntries,
  bagViewerChunksAbsentFromHome: viewerChunks.length,
  homeLayoutShift: layoutShift,
  laceInitialTransferBytes: laceTransfer,
  laceAfterZoomTransferBytes: laceZoomTransfer,
  fittedImageWidth: fitted.width,
  zoomedImageWidth: zoomed.width,
  homeScreenshot,
  homeDesktopScreenshot,
  laceScreenshot,
  aiRequests: aiRequests.length,
  browserErrors: errors.length,
}, null, 2));

await context.close();
await laceMetricContext.close();
await browser.close();
