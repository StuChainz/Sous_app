const { test, expect } = require('@playwright/test');

async function boot(page, path = '/') {
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('sous_onboarding_seen', '1');
  });
  await page.goto(path);
}

test('bug button is visible by default in the friend-testing build', async ({ page }) => {
  await boot(page);

  await expect(page.getByTestId('bug-report-button')).toBeVisible();
});

test('test query shows bug button and opens report modal', async ({ page }) => {
  await boot(page, '/?test=1');

  await expect(page.getByTestId('bug-report-button')).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('sous_test_mode'))).toBe('1');
  await page.getByTestId('bug-report-button').click();
  await expect(page.getByTestId('bug-report-modal')).toBeVisible();
  await expect(page.getByText('What went wrong?')).toBeVisible();
});

test('profile diagnostics button opens report modal', async ({ page }) => {
  await boot(page, '/?test=1');

  await page.locator('.tab[data-tab="profile"]').click();
  await page.locator('#profile-diagnostics-btn').click();
  await expect(page.getByTestId('bug-report-modal')).toBeVisible();
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

  await expect(page.getByTestId('bug-report-button')).toBeVisible();
  await page.evaluate(() => window.__sousEnableTestMode());
  await expect(page.getByTestId('bug-report-button')).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('sous_test_mode'))).toBe('1');

  await page.evaluate(() => window.__sousDisableTestMode());
  await expect(page.getByTestId('bug-report-button')).toBeHidden();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('sous_test_mode'))).toBe('0');
});

test('diagnostics report includes note, app state, traces, storage counts, and console errors', async ({ page }) => {
  await boot(page, '/?test=1');

  await page.evaluate(() => {
    localStorage.setItem('sous_log', JSON.stringify({
      '2026-05-20': {
        meals: [
          { name: 'Private breakfast', ingredients: [{ name: 'Secret oats' }] },
          { name: 'Private lunch', ingredients: [{ name: 'Secret chicken' }] }
        ]
      }
    }));
    localStorage.setItem('sous_recipes', JSON.stringify([{ name: 'Private recipe' }]));
    localStorage.setItem('sous_usual_meals', JSON.stringify({ breakfast: [{ name: 'Private usual' }] }));
    localStorage.setItem('sous_meal_memories_v1', JSON.stringify([{ name: 'Private memory' }]));
    localStorage.setItem('userCustomFoods', JSON.stringify([{ name: 'Private custom food' }]));
    window.dispatchEvent(new ErrorEvent('error', {
      message: 'Synthetic tester error',
      filename: 'test-file.js',
      lineno: 12,
      colno: 3,
      error: new Error('Synthetic tester error')
    }));
  });

  const report = await page.evaluate(() => window.__sousBuildDiagnosticsReport('Mic stopped after banana'));

  expect(report.app).toBe('Jot');
  expect(report.reportType).toBe('beta-diagnostics');
  expect(report.testerNote).toBe('Mic stopped after banana');
  expect(report.currentURL).toContain('test=1');
  expect(report.userAgent).toBeTruthy();
  expect(typeof report.standalonePWA).toBe('boolean');
  expect(typeof report.online).toBe('boolean');
  expect(report.currentTab).toBe('home');
  expect(report.currentScreen).toBe('pane-home');
  expect(report.selectedDate).toBeTruthy();
  expect(report.currentVoiceInputMode).toBeTruthy();
  expect(report.currentMealSummary.itemCount).toBe(0);
  expect(report.voiceStatus).toEqual(expect.objectContaining({
    inputMode: expect.any(String)
  }));
  expect(Object.prototype.hasOwnProperty.call(report, 'lastTranscriptText')).toBe(true);
  expect(Array.isArray(report.voiceTrace)).toBe(true);
  expect(Array.isArray(report.voiceDecisionTrace)).toBe(true);
  expect(Array.isArray(report.voiceTestEvents)).toBe(true);
  expect(Array.isArray(report.barcodeTimingTrace)).toBe(true);
  expect(Object.prototype.hasOwnProperty.call(report, 'lastBarcodeError')).toBe(true);
  expect(report.photoEstimateState).toEqual(expect.objectContaining({
    hasPhotoEstimate: false,
    photoEstimateItemCount: 0
  }));
  expect(report.localStorageSummary.sensitiveCounts).toEqual(expect.objectContaining({
    logDayCount: 1,
    totalMealCount: 2,
    recipeCount: 1,
    usualMealCount: 1,
    mealMemoryCount: 1,
    customFoodCount: 1
  }));
  expect(report.localStorageSummary.knownKeys.sous_log.present).toBe(true);
  expect(report.recentConsoleErrors.some(error => error.message === 'Synthetic tester error')).toBe(true);

  const text = JSON.stringify(report);
  expect(text).not.toContain('Secret oats');
  expect(text).not.toContain('Private recipe');
  expect(text).not.toContain('Private usual');
  expect(text).not.toContain('Private memory');
  expect(text).not.toContain('Private custom food');
});

test('copy helper writes JSON bug report text to clipboard', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await boot(page, '/?test=1');

  await page.evaluate(() => window.__sousCopyBugReport('Copy helper note'));
  const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
  const report = JSON.parse(clipboardText);

  expect(report.testerNote).toBe('Copy helper note');
  expect(report.currentURL).toContain('test=1');
  expect(report.reportType).toBe('beta-diagnostics');
});

test('clipboard failure shows selectable diagnostics JSON fallback', async ({ page }) => {
  await boot(page, '/?test=1');

  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: () => Promise.reject(new Error('blocked')) }
    });
    document.execCommand = () => false;
  });

  await page.getByTestId('bug-report-button').click();
  await page.locator('#bug-report-note').fill('Clipboard blocked');
  await page.locator('#bug-report-copy').click();

  await expect(page.getByTestId('bug-report-output')).toBeVisible();
  const fallbackText = await page.getByTestId('bug-report-output').inputValue();
  const report = JSON.parse(fallbackText);
  expect(report.testerNote).toBe('Clipboard blocked');
  await expect(page.locator('#bug-report-status')).toContainText('Clipboard copy failed');
});

test('photo estimate offers camera and camera roll inputs', async ({ page }) => {
  await boot(page);

  await expect(page.getByTestId('photo-estimate-camera-btn')).toBeVisible();
  await expect(page.getByTestId('photo-estimate-library-btn')).toBeVisible();
  const attrs = await page.evaluate(() => {
    const camera = document.getElementById('photo-estimate-input');
    const library = document.getElementById('photo-estimate-library-input');
    return {
      cameraAccept: camera?.getAttribute('accept'),
      cameraCapture: camera?.getAttribute('capture'),
      libraryAccept: library?.getAttribute('accept'),
      libraryCapture: library?.hasAttribute('capture') ? library.getAttribute('capture') : null,
      hasCameraOpener: typeof window.openPhotoEstimateCameraPicker === 'function',
      hasLibraryOpener: typeof window.openPhotoEstimateLibraryPicker === 'function'
    };
  });

  expect(attrs).toEqual({
    cameraAccept: 'image/*',
    cameraCapture: 'environment',
    libraryAccept: 'image/*',
    libraryCapture: null,
    hasCameraOpener: true,
    hasLibraryOpener: true
  });
});
