import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.CONDUCTOR_PORT || process.env.PORT || 8912);
const baseURL = process.env.BASE_URL || `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: process.env.PLAYWRIGHT_WEB_SERVER_COMMAND || './scripts/smoke_server.sh',
    url: baseURL,
    reuseExistingServer: true,
    timeout: 180_000,
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], browserName: 'chromium', viewport: { width: 1280, height: 900 } },
    },
    {
      name: 'mobile-390',
      use: { ...devices['Pixel 5'], browserName: 'chromium', viewport: { width: 390, height: 844 } },
    },
    {
      name: 'tablet-834',
      use: { ...devices['Desktop Chrome'], browserName: 'chromium', viewport: { width: 834, height: 1112 } },
    },
  ],
});
