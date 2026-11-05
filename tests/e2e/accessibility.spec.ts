import { expect, test } from "@playwright/test";

test("skip link moves focus past navigation and the lace dialog restores focus", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  const fitsViewport = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  expect(await fitsViewport()).toBe(true);
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to main content" });
  await expect(skip).toBeFocused();
  await expect.poll(() => skip.evaluate((element) => element.getBoundingClientRect().top)).toBeGreaterThanOrEqual(0);
  await page.keyboard.press("Enter");
  await expect(page.locator("main#main-content")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Explore Lace" })).toBeFocused();

  await page.getByRole("link", { name: "Explore Lace" }).click();
  expect(await fitsViewport()).toBe(true);
  const photo = page.getByRole("button", { name: "Enlarge the lace photograph to inspect its embroidery" });
  await photo.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "Enlarged lace photograph" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(photo).toBeFocused();

  await page.goto("/bag-studio");
  await expect(page.getByRole("heading", { name: "3D Bag Color Studio" })).toBeVisible();
  expect(await fitsViewport()).toBe(true);
  await page.keyboard.press("Tab");
  await expect(skip).toBeFocused();
});

test("fixture-generated answer has a polite content announcement separate from visible streaming", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/advisor");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole("textbox", { name: "Your fabric or style question" }).fill("How should I choose a work fabric?");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  const announcement = page.getByTestId("answer-announcement");
  await expect(announcement).toHaveAttribute("aria-live", "polite");
  await expect(announcement).toContainText(/Local test fixture|fabric guidance response/, { timeout: 15_000 });
  await expect(page.getByRole("article", { name: "Advisor response" }).last()).toContainText("This is not a Gemini response.");
});
