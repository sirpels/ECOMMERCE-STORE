import { defineConfig, devices } from "@playwright/test";

const baseURL = "http://localhost:3101";

export default defineConfig({
  testDir: "./tests/e2e",
  reporter: "list",
  workers: 1,
  use: { ...devices["Desktop Chrome"], baseURL, trace: "retain-on-failure" },
  webServer: {
    command: "npm run dev -- --port 3101",
    url: `${baseURL}/advisor`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      ADVISOR_DEV_SCENARIO: "recovery",
      GOOGLE_GENERATIVE_AI_API_KEY: "",
      VERCEL: "",
    },
  },
});
