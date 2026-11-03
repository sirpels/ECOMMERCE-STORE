import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const folder = dirname(fileURLToPath(import.meta.url));
const [variant, port] = process.argv.slice(2);
if (!(["released", "candidate"].includes(variant) && /^\d+$/.test(port ?? ""))) {
  throw new Error("Usage: node run-lighthouse.mjs released|candidate PORT");
}
const cli = "C:/Users/user/AppData/Local/Temp/FE10-Lighthouse-13.5.0/node_modules/lighthouse/cli/index.js";
const outputDir = join(folder, "lighthouse", variant);
await mkdir(outputDir, { recursive: true });
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
for (const route of ["home", "lace", "advisor"]) {
  for (let run = 1; run <= 3; run++) {
    const url = `http://127.0.0.1:${port}${route === "home" ? "/" : `/${route}`}`;
    const base = join(outputDir, `${route}-${run}`);
    const args = [cli, url, ...common, `--output-path=${base}`];
    const code = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, args, {
        env: { ...process.env, CHROME_PATH: chromium.executablePath() },
        stdio: ["ignore", "pipe", "pipe"],
      });
      let error = "";
      child.stderr.on("data", chunk => { error += chunk.toString(); });
      child.on("error", reject);
      child.on("close", value => {
        if (value !== 0) console.error(`${variant} ${route} run ${run}: ${error.slice(-1200)}`);
        resolve(value);
      });
    });
    if (code !== 0) throw new Error(`Lighthouse failed for ${variant} ${route} run ${run}: ${code}`);
    const report = JSON.parse(await readFile(`${base}.report.json`, "utf8"));
    const result = {
      variant, route, run, url: report.finalUrl, fetchTime: report.fetchTime,
      lighthouseVersion: report.lighthouseVersion,
      performance: Math.round(report.categories.performance.score * 100),
      accessibility: Math.round(report.categories.accessibility.score * 100),
      fcpMs: report.audits["first-contentful-paint"].numericValue,
      lcpMs: report.audits["largest-contentful-paint"].numericValue,
      tbtMs: report.audits["total-blocking-time"].numericValue,
      cls: report.audits["cumulative-layout-shift"].numericValue,
      settings: report.configSettings,
      json: `${route}-${run}.report.json`, html: `${route}-${run}.report.html`,
    };
    results.push(result);
    await writeFile(join(outputDir, "summary.json"), JSON.stringify(results, null, 2));
    console.log(`${variant} ${route} #${run}: P${result.performance} A${result.accessibility} FCP${Math.round(result.fcpMs)} LCP${Math.round(result.lcpMs)} TBT${Math.round(result.tbtMs)} CLS${result.cls}`);
  }
}
