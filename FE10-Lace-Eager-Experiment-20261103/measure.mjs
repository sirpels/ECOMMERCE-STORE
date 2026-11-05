// Matched local production-build diagnostic. Run once as `before`, then once as `after`.
// This does not produce Lighthouse scores or make Gemini calls.
import { chromium } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const variant = process.argv[2];
if (!['before', 'after'].includes(variant)) throw new Error('Pass before or after');
const folder = dirname(fileURLToPath(import.meta.url));
const root = resolve(folder, '..');
const origin = 'http://localhost:3103';
const sourceFiles = [
  'app/lace/lace-photo-zoom.tsx',
  'app/advisor/advisor-chat.tsx',
  'app/layout.tsx',
  'app/globals.css',
  'app/components/site-header.tsx',
];
const sourceHashes = Object.fromEntries(await Promise.all(sourceFiles.map(async (file) =>
  [file, createHash('sha256').update(await readFile(join(root, file))).digest('hex')],
)));
const browser = await chromium.launch({ headless: true, args: ['--disable-extensions'] });

async function setup() {
  const context = await browser.newContext({
    viewport: { width: 412, height: 823 }, deviceScaleFactor: 1.75,
    isMobile: true, hasTouch: true, serviceWorkers: 'block',
  });
  const page = await context.newPage();
  await page.addInitScript(() => {
    globalThis.__fe10 = { lcp: [], shifts: [], tasks: [] };
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) globalThis.__fe10.lcp.push({
        startTime: entry.startTime, tag: entry.element?.tagName,
        id: entry.element?.id, url: entry.url,
      });
    }).observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) if (!entry.hadRecentInput) globalThis.__fe10.shifts.push({ startTime: entry.startTime, value: entry.value });
    }).observe({ type: 'layout-shift', buffered: true });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) globalThis.__fe10.tasks.push({ startTime: entry.startTime, duration: entry.duration });
    }).observe({ type: 'longtask', buffered: true });
  });
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false, latency: 150,
    downloadThroughput: 204800, uploadThroughput: 84375,
  });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  return { context, page };
}

async function laceRun(index) {
  const { context, page } = await setup();
  try {
    const response = await page.goto(`${origin}/lace`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => {
      const img = document.querySelector('button[aria-label="Enlarge the lace photograph to inspect its embroidery"] img');
      return img?.complete && img.naturalWidth > 0;
    }, undefined, { timeout: 20000 });
    const elapsed = await page.evaluate(() => performance.now());
    await page.waitForTimeout(Math.max(0, 5500 - elapsed));
    const measured = await page.evaluate(() => {
      const image = document.querySelector('button[aria-label="Enlarge the lace photograph to inspect its embroidery"] img');
      const resource = performance.getEntriesByType('resource').find((entry) => entry.name.includes('selected-lace.jpg'));
      const fcp = performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null;
      const lcp = globalThis.__fe10.lcp.at(-1) ?? null;
      const tbtProxy = globalThis.__fe10.tasks.filter((task) => fcp !== null && task.startTime >= fcp && task.startTime < 5000)
        .reduce((sum, task) => sum + Math.max(0, task.duration - 50), 0);
      return {
        loading: image?.getAttribute('loading'), fetchPriority: image?.getAttribute('fetchpriority'),
        imageNaturalWidth: image?.naturalWidth, dialogImageBeforeOpen: !!document.querySelector('dialog img'),
        imageRequest: resource ? { startTime: resource.startTime, responseStart: resource.responseStart, responseEnd: resource.responseEnd, transferSize: resource.transferSize, name: resource.name } : null,
        fcpMs: fcp, lcp, cls: globalThis.__fe10.shifts.reduce((sum, item) => sum + item.value, 0),
        tbtProxyMs: tbtProxy, longTasks: globalThis.__fe10.tasks,
        documentWidth: document.documentElement.scrollWidth, viewportWidth: innerWidth,
      };
    });
    // Interaction checks occur only after the initial-load metrics are captured.
    const photo = page.getByRole('button', { name: 'Enlarge the lace photograph to inspect its embroidery' });
    await photo.focus();
    await page.keyboard.press('Enter');
    const dialogOpened = await page.getByRole('dialog', { name: 'Enlarged lace photograph' }).isVisible();
    const zoom = page.getByRole('button', { name: 'Zoom in' });
    await zoom.click();
    const zoomed = await page.getByRole('button', { name: 'Fit image' }).isVisible();
    await page.keyboard.press('Escape');
    const focusRestored = await photo.evaluate((element) => document.activeElement === element);
    return { index, status: response?.status(), ...measured, dialogOpened, zoomed, focusRestored };
  } finally {
    await context.close();
  }
}

async function transitionRun(index) {
  const { context, page } = await setup();
  try {
    await page.goto(origin, { waitUntil: 'networkidle' });
    const started = Date.now();
    await page.getByRole('link', { name: 'Explore Lace' }).click();
    await page.getByRole('heading', { name: 'Lace collection', exact: true }).waitFor({ state: 'visible', timeout: 20000 });
    const headingMs = Date.now() - started;
    await page.waitForFunction(() => {
      const img = document.querySelector('button[aria-label="Enlarge the lace photograph to inspect its embroidery"] img');
      return img?.complete && img.naturalWidth > 0;
    }, undefined, { timeout: 20000 });
    return { index, headingMs, imageReadyMs: Date.now() - started, url: page.url() };
  } finally {
    await context.close();
  }
}

try {
  // Warm the local image optimizer without using the warm-up as a result.
  const warm = await setup();
  await warm.page.goto(`${origin}/lace`, { waitUntil: 'networkidle' });
  await warm.context.close();
  const lace = [];
  const transitions = [];
  for (let i = 1; i <= 3; i++) lace.push(await laceRun(i));
  for (let i = 1; i <= 3; i++) transitions.push(await transitionRun(i));
  const report = {
    label: 'Local production-build Chrome diagnostic, not Lighthouse or production',
    variant, collectedAt: new Date().toISOString(), chromiumVersion: browser.version(),
    sourceRevision: '53f6bba plus uncommitted FE-10 accessibility changes', sourceHashes,
    conditions: { viewport: { width: 412, height: 823, dpr: 1.75 }, mobile: true, touch: true, cpuSlowdown: 4,
      latencyMs: 150, downloadBytesPerSecond: 204800, uploadBytesPerSecond: 84375,
      freshContextPerRun: true, cacheDisabled: true, serviceWorkersBlocked: true, localImageOptimizerWarmup: true },
    lace, transitions,
  };
  await writeFile(join(folder, `${variant}.json`), JSON.stringify(report, null, 2), { flag: 'wx' });
  console.log(JSON.stringify({ variant, saved: join(folder, `${variant}.json`), lace, transitions }, null, 2));
} finally {
  await browser.close();
}
