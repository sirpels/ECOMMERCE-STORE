import { chromium } from "@playwright/test";
import { execFileSync, spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const [variant, baseUrl] = process.argv.slice(2);
const outputRoot = process.env.FE10_AUDIT_OUTPUT;
const lighthouseCli = process.env.FE10_LIGHTHOUSE_CLI;
if (!variant || !baseUrl || !outputRoot || !lighthouseCli) {
  throw new Error("Usage: FE10_AUDIT_OUTPUT=... FE10_LIGHTHOUSE_CLI=... node scripts/fe10-hosted-audit.mjs VARIANT BASE_URL");
}

const outputDir = join(outputRoot, variant);
await mkdir(outputDir, { recursive: true });
const chromePath = chromium.executablePath();
const chromeVersion = execFileSync(chromePath, ["--version"], { encoding: "utf8" }).trim();
const common = [
  "--quiet", "--no-enable-error-reporting", "--output=json", "--output=html",
  "--only-categories=performance,accessibility", "--form-factor=mobile",
  "--screenEmulation.mobile=true", "--screenEmulation.width=412",
  "--screenEmulation.height=823", "--screenEmulation.deviceScaleFactor=1.75",
  "--screenEmulation.disabled=false", "--throttling-method=simulate",
  "--throttling.rttMs=150", "--throttling.throughputKbps=1638.4",
  "--throttling.requestLatencyMs=562.5", "--throttling.downloadThroughputKbps=1474.56",
  "--throttling.uploadThroughputKbps=675", "--throttling.cpuSlowdownMultiplier=4",
  "--chrome-flags=--headless=new --no-sandbox --disable-extensions",
];

const results = [];
for (const [route, path] of [["home", "/"], ["lace", "/lace"], ["advisor", "/advisor"]]) {
  for (let run = 1; run <= 3; run++) {
    const url = new URL(path, baseUrl).href;
    const base = join(outputDir, `${route}-${run}`);
    const args = [lighthouseCli, url, ...common, `--output-path=${base}`];
    const exitCode = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, args, {
        env: { ...process.env, CHROME_PATH: chromePath },
        stdio: ["ignore", "ignore", "pipe"],
      });
      let stderr = "";
      child.stderr.on("data", chunk => { stderr += chunk.toString(); });
      child.on("error", reject);
      child.on("close", code => {
        if (code !== 0) console.error(stderr.slice(-1500));
        resolve(code);
      });
    });
    if (exitCode !== 0) throw new Error(`${variant} ${route} run ${run}: Lighthouse exited ${exitCode}`);

    const report = JSON.parse(await readFile(`${base}.report.json`, "utf8"));
    if (report.runtimeError) throw new Error(`${variant} ${route} run ${run}: ${report.runtimeError.code}`);
    if (report.configSettings.disableStorageReset !== false) throw new Error("Lighthouse storage reset was disabled");
    const result = {
      variant, route, run, url: report.finalUrl, fetchTime: report.fetchTime,
      lighthouseVersion: report.lighthouseVersion, nodeVersion: process.version, chromeVersion,
      sourceRevision: process.env.FE10_SOURCE_REVISION ?? "not recorded",
      performance: Math.round(report.categories.performance.score * 100),
      accessibility: Math.round(report.categories.accessibility.score * 100),
      fcpMs: report.audits["first-contentful-paint"].numericValue,
      lcpMs: report.audits["largest-contentful-paint"].numericValue,
      tbtMs: report.audits["total-blocking-time"].numericValue,
      cls: report.audits["cumulative-layout-shift"].numericValue,
      warnings: report.runWarnings ?? [],
      settings: report.configSettings,
    };
    results.push(result);
    await writeFile(join(outputDir, "summary.json"), JSON.stringify(results, null, 2));
    console.log(`${variant} ${route} #${run}: P${result.performance} A${result.accessibility} TBT${Math.round(result.tbtMs)}ms`);
  }
}

const browser = await chromium.launch({ headless: true, args: ["--disable-extensions"] });
try {
  const screenshotDir = join(outputDir, "screenshots");
  await mkdir(screenshotDir, { recursive: true });
  for (const { route, run, performance } of results) {
    const html = join(outputDir, `${route}-${run}.report.html`);
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    try {
      await page.goto(pathToFileURL(html).href);
      await page.locator(".lh-gauge:visible").first().waitFor({ timeout: 15_000 });
      const visibleScore = (await page.locator(".lh-gauge__percentage:visible").first().textContent())?.trim();
      if (visibleScore !== String(performance)) throw new Error(`${variant} ${route} #${run}: screenshot score mismatch`);
      await page.screenshot({ path: join(screenshotDir, `${route}-${run}-score.png`) });
    } finally {
      await page.close();
    }
  }
} finally {
  await browser.close();
}

const median = values => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[1];
};
const byRoute = Object.fromEntries(["home", "lace", "advisor"].map(route => {
  const runs = results.filter(result => result.route === route);
  const metrics = Object.fromEntries(
    ["performance", "accessibility", "fcpMs", "lcpMs", "tbtMs", "cls"].map(key => {
      const values = runs.map(result => result[key]);
      return [key, { median: median(values), min: Math.min(...values), max: Math.max(...values) }];
    }),
  );
  return [route, { metrics, warnings: [...new Set(runs.flatMap(result => result.warnings))] }];
}));
await writeFile(join(outputDir, "medians-and-ranges.json"), JSON.stringify(byRoute, null, 2));
