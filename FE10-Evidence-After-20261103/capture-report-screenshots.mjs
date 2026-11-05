import { chromium } from "@playwright/test";
import { mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const folder = dirname(fileURLToPath(import.meta.url));
const browser = await chromium.launch({ headless: true, args: ["--disable-extensions"] });
try {
  for (const variant of ["released", "candidate"]) {
    const reportDir = join(folder, "lighthouse", variant);
    const screenshotDir = join(reportDir, "screenshots");
    await mkdir(screenshotDir, { recursive: true });
    for (const route of ["home", "lace", "advisor"]) {
      for (let run = 1; run <= 3; run++) {
        const base = `${route}-${run}.report`;
        const report = JSON.parse(await readFile(join(reportDir, `${base}.json`), "utf8"));
        const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
        await page.goto(pathToFileURL(join(reportDir, `${base}.html`)).href);
        await page.locator(".lh-gauge:visible").first().waitFor({ timeout: 15000 });
        const visibleScore = (await page.locator(".lh-gauge__percentage:visible").first().textContent())?.trim();
        const expectedScore = String(Math.round(report.categories.performance.score * 100));
        if (visibleScore !== expectedScore) throw new Error(`${variant} ${route} ${run}: HTML score ${visibleScore} != JSON ${expectedScore}`);
        const screenshot = join(screenshotDir, `${route}-${run}-score.png`);
        await page.screenshot({ path: screenshot });
        console.log(`${variant} ${route} #${run}: ${screenshot}`);
        await page.close();
      }
    }
  }
} finally {
  await browser.close();
}
