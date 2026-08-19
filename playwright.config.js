const { defineConfig, devices } = require('@playwright/test');
const path = require('node:path');
const os = require('node:os');

module.exports = defineConfig({
  testDir: './tests/e2e',
  outputDir: path.join(os.tmpdir(), 'danbridge-playwright-results'),
  timeout: 30_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  workers: 3,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://127.0.0.1:4173',
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'ipad-chromium', use: { ...devices['iPad Pro 11'], browserName: 'chromium' } },
    { name: 'mobile-chromium', use: { ...devices['iPhone 13'], browserName: 'chromium' } },
    { name: 'desktop-webkit', use: { ...devices['Desktop Safari'], browserName: 'webkit' } },
    { name: 'ipad-webkit', use: { ...devices['iPad Pro 11'], browserName: 'webkit' } },
    { name: 'mobile-webkit', use: { ...devices['iPhone 13'], browserName: 'webkit' } }
  ],
  webServer: process.env.E2E_BASE_URL ? undefined : {
    command: 'node tools/e2e_static_server.js',
    url: 'http://127.0.0.1:4173/index.html',
    reuseExistingServer: !process.env.CI,
    timeout: 15_000,
    stdout: 'ignore',
    stderr: 'ignore'
  }
});
