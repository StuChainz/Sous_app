const path = require('path');
const { defineConfig } = require('@playwright/test');

const fakeMicAudio = process.env.SOUS_FAKE_MIC_AUDIO ||
  path.resolve(__dirname, 'tests/audio-fixtures/wav/oats.wav');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 30000,
  use: {
    baseURL: 'http://127.0.0.1:8732',
    channel: 'chrome',
    trace: 'on-first-retry'
  },
  projects: [
    {
      name: 'chrome',
      testIgnore: /voice-real-audio\.spec\.cjs/
    },
    {
      name: 'real-audio-chrome',
      testMatch: /voice-real-audio\.spec\.cjs/,
      timeout: 60000,
      use: {
        channel: 'chrome',
        headless: process.env.SOUS_FAKE_MIC_HEADLESS === '1',
        permissions: ['microphone'],
        launchOptions: {
          args: [
            '--use-fake-ui-for-media-stream',
            '--use-fake-device-for-media-stream',
            `--use-file-for-fake-audio-capture=${fakeMicAudio}`
          ]
        }
      }
    }
  ],
  webServer: {
    command: 'python3 -m http.server 8732',
    url: 'http://127.0.0.1:8732',
    reuseExistingServer: true,
    timeout: 10000
  }
});
