import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/ui",
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:44319",
    browserName: "chromium",
    headless: true,
  },
  timeout: 30000,
});
