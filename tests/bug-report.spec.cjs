const { test, expect } = require('@playwright/test');

async function boot(page, path = '/') {
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('sous_onboarding_seen', '1');
  });
  await page.goto(path);
}

test('bug button is hidden for normal users', async ({ page }) => {
  await boot(page);

  await expect(page.getByTestId('bug-report-button')).toBeHidden();
});

test('test query shows bug button and opens report modal', async ({ page }) => {
  await boot(page, '/?test=1');

  await expect(page.getByTestId('bug-report-button')).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('sous_test_mode'))).toBe('1');
  await page.getByTestId('bug-report-button').click();
  await expect(page.getByTestId('bug-report-modal')).toBeVisible();
  await expect(page.getByText('What went wrong?')).toBeVisible();
});

test('bug button stays inside the app shell on wide screens', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 800 });
  await boot(page, '/?test=1');

  const boxes = await page.evaluate(() => {
    const app = document.querySelector('.app').getBoundingClientRect();
    const button = document.querySelector('#bug-report-button').getBoundingClientRect();
    return {
      appRight: app.right,
      buttonRight: button.right,
      appLeft: app.left,
      buttonLeft: button.left
    };
  });

  expect(boxes.buttonRight).toBeLessThanOrEqual(boxes.appRight);
  expect(boxes.buttonLeft).toBeGreaterThanOrEqual(boxes.appLeft);
});

test('helpers enable and disable test mode', async ({ page }) => {
  await boot(page);

  await expect(page.getByTestId('bug-report-button')).toBeHidden();
  await page.evaluate(() => window.__sousEnableTestMode());
  await expect(page.getByTestId('bug-report-button')).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('sous_test_mode'))).toBe('1');

  await page.evaluate(() => window.__sousDisableTestMode());
  await expect(page.getByTestId('bug-report-button')).toBeHidden();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('sous_test_mode'))).toBe(null);
});

test('bug report includes note, app state, voice traces, and console errors', async ({ page }) => {
  await boot(page, '/?test=1');

  await page.evaluate(() => {
    window.dispatchEvent(new ErrorEvent('error', {
      message: 'Synthetic tester error',
      filename: 'test-file.js',
      lineno: 12,
      colno: 3,
      error: new Error('Synthetic tester error')
    }));
  });

  const report = await page.evaluate(() => window.__sousBuildBugReport('Mic stopped after banana'));

  expect(report.testerNote).toBe('Mic stopped after banana');
  expect(report.currentURL).toContain('test=1');
  expect(report.userAgent).toBeTruthy();
  expect(typeof report.standalonePWA).toBe('boolean');
  expect(typeof report.online).toBe('boolean');
  expect(report.currentTab).toBe('home');
  expect(report.currentScreen).toBe('pane-home');
  expect(Array.isArray(report.currentMealRows)).toBe(true);
  expect(Object.prototype.hasOwnProperty.call(report, 'lastTranscriptText')).toBe(true);
  expect(Array.isArray(report.voiceTrace)).toBe(true);
  expect(Array.isArray(report.voiceTestEvents)).toBe(true);
  expect(report.recentConsoleErrors.some(error => error.message === 'Synthetic tester error')).toBe(true);
});

test('copy helper writes JSON bug report text to clipboard', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await boot(page, '/?test=1');

  await page.evaluate(() => window.__sousCopyBugReport('Copy helper note'));
  const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
  const report = JSON.parse(clipboardText);

  expect(report.testerNote).toBe('Copy helper note');
  expect(report.currentURL).toContain('test=1');
});
