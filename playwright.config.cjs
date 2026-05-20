const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 30000,
  use: {
    baseURL: 'http://127.0.0.1:8732',
    channel: 'chrome',
    trace: 'on-first-retry'
  },
  webServer: {
    command: 'python3 -m http.server 8732',
    url: 'http://127.0.0.1:8732',
    reuseExistingServer: true,
    timeout: 10000
  }
});
