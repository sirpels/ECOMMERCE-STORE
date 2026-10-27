import { expect, test } from "@playwright/test";

test("an editable example streams a fixture response and a real Fabric Match tool result", async ({ page }) => {
  const chatRequests: string[] = [];
  const providerRequests: string[] = [];
  const browserErrors: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/chat")) chatRequests.push(request.url());
    if (request.url().includes("generativelanguage.googleapis.com")) providerRequests.push(request.url());
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") browserErrors.push(message.text()); });

  await page.goto("/advisor");
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("heading", { name: "Fabric & Style Advisor", level: 1 })).toBeVisible();
  await expect(page.getByText(/Choose a question to edit before sending/)).toBeVisible();

  await page.getByRole("button", { name: /Suggest fabric categories for a wedding/ }).click();
  const composer = page.getByRole("textbox", { name: "Your fabric or style question" });
  await expect(composer).toHaveValue(/wedding in hot weather/);
  expect(chatRequests).toHaveLength(0);
  await composer.fill("Suggest general fabrics for a work outfit in mild weather; structure matters most.");

  // Record brief visible states before sending; polling can miss a streamed frame.
  await page.evaluate(() => {
    const observation = { pending: false, partialText: false };
    Reflect.set(window, "fe09Observation", observation);
    const observe = () => {
      const text = document.querySelector("main")?.textContent ?? "";
      if (/Advisor is thinking|Preparing a fabric lookup|Finding general fabric categories/.test(text)) observation.pending = true;
      const response = document.querySelector('article[aria-label="Advisor response"]')?.textContent ?? "";
      if (response.includes("Local test fixture:") && !response.includes("This is not a Gemini response.")) observation.partialText = true;
    };
    new MutationObserver(observe).observe(document.querySelector("main")!, { subtree: true, childList: true, characterData: true });
    observe();
  });

  const apiResponse = page.waitForResponse((response) => response.url().endsWith("/api/chat"));
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();
  expect((await apiResponse).status()).toBe(200);

  await expect(page.getByRole("region", { name: "Fabric Match results" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Light- to medium-weight cotton wovens" })).toBeVisible();
  await expect(page.getByText(/Store products, prices, stock, and availability are not verified/)).toBeVisible();
  const answer = page.getByRole("article", { name: "Advisor response" });
  await expect(answer).toContainText("Local test fixture:");
  await expect(answer).toContainText("This is not a Gemini response.");
  expect(await page.evaluate(() => Reflect.get(window, "fe09Observation"))).toEqual({ pending: true, partialText: true });
  await expect(composer).toBeEnabled();
  await composer.fill("Could you explain the fabric weight?");
  await expect(page.getByRole("button", { name: "Send", exact: true })).toBeEnabled();
  expect(chatRequests).toHaveLength(1);
  expect(providerRequests).toEqual([]);
  expect(browserErrors).toEqual([]);
});
