import { defineConfig } from "playwright/test";

const port = 3000;

export default defineConfig({
  testDir: "./test/functional",
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    browserName: "chromium",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm start",
    env: {
      ...process.env,
      HOST: "127.0.0.1",
      PORT: String(port),
      STATUS_MODE: "success",
    },
    port,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
