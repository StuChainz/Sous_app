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

test('menu scanner controls render and require macro targets', async ({ page }) => {
  let menuScanCalls = 0;
  await page.route('**/api/menu-scan', route => {
    menuScanCalls += 1;
    route.fulfill({ status: 500, body: 'menu scan should not be called without targets' });
  });
  await boot(page);

  await expect(page.getByTestId('menu-scan-open-btn')).toBeVisible();
  await page.getByTestId('menu-scan-open-btn').click();
  await expect(page.locator('#menu-scan-modal')).toBeVisible();
  await expect(page.getByTestId('menu-scan-camera-btn')).toBeVisible();
  await expect(page.getByTestId('menu-scan-library-btn')).toBeVisible();
  await expect(page.getByTestId('menu-scan-request')).toHaveAttribute('placeholder', 'e.g. I have one meal left and want a glass of prosecco with dinner');

  await page.getByTestId('menu-scan-submit-btn').click();
  await expect(page.getByTestId('menu-scan-status')).toContainText('Add macro targets in Profile before using menu recommendations.');
  expect(menuScanCalls).toBe(0);
});

test('menu scanner use action opens editable review without auto-saving', async ({ page }) => {
  let menuScanPayload = null;
  await page.route('**/api/menu-scan', route => {
    menuScanPayload = route.request().postDataJSON();
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        requestSummary: 'Dinner with prosecco reserved',
        reservedItems: [{
          id: 'consumable_prosecco-125ml',
          presetId: 'prosecco-125ml',
          name: 'prosecco 125ml',
          quantity: 125,
          unit: 'ml',
          kcal: 86,
          calories: 86,
          protein: 0.1,
          carbs: 2.1,
          fat: 0,
          source: 'consumable_preset',
          confidence: 'high'
        }],
        remainingBefore: { kcal: 850, protein: 55, carbs: 90, fat: 25 },
        remainingAfterReserved: { kcal: 764, protein: 54.9, carbs: 87.9, fat: 25 },
        suggestions: [{
          id: 'menu_1_grilled-chicken-salad',
          menuText: 'Grilled chicken salad',
          suggestedName: 'Grilled chicken salad',
          rank: 1,
          fitScore: 88,
          confidence: 'medium',
          reason: 'Good protein fit after reserving the prosecco.',
          portionAssumptions: 'Restaurant dressing on the side.',
          warnings: ['Dressing may add fat.'],
          estimate: {
            kcal: { low: 430, likely: 520, high: 650 },
            protein: { low: 35, likely: 45, high: 55 },
            carbs: { low: 18, likely: 25, high: 35 },
            fat: { low: 16, likely: 24, high: 34 }
          },
          rows: [{
            name: 'Grilled chicken salad',
            quantity: 1,
            unit: 'serving',
            kcal: 520,
            protein: 45,
            carbs: 25,
            fat: 24,
            source: 'menu_scan'
          }]
        }]
      })
    });
  });
  await boot(page);
  await page.evaluate(() => {
    localStorage.setItem('sous_profile', JSON.stringify({
      targetKcal: 2000,
      targetProtein: 130,
      targetCarbs: 220,
      targetFat: 70
    }));
    window.resizePhotoForEstimate = async () => ({
      image: 'data:image/jpeg;base64,AA==',
      bytes: 1,
      width: 1,
      height: 1
    });
  });

  await page.getByTestId('menu-scan-open-btn').click();
  await page.getByTestId('menu-scan-request').fill('I have one meal left and want a glass of prosecco with dinner');
  await page.locator('#menu-scan-library-input').setInputFiles({
    name: 'menu.png',
    mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=', 'base64')
  });
  await expect(page.getByTestId('menu-scan-status')).toContainText('Menu photo ready.');
  await page.getByTestId('menu-scan-submit-btn').click();
  await expect(page.getByTestId('menu-scan-results')).toContainText('Grilled chicken salad');
  expect(menuScanPayload.currentDayTotals).toEqual({ kcal: 0, protein: 0, carbs: 0, fat: 0 });
  await expect(page.getByTestId('menu-scan-results')).toContainText('Estimate confidence reflects menu readability and portion uncertainty');
  await expect(page.getByTestId('menu-scan-results')).toContainText('Estimate confidence: medium');

  await page.getByTestId('menu-scan-use-btn').click();
  await expect(page.locator('#photo-estimate-modal')).toBeVisible();
  await expect(page.locator('#photo-estimate-title')).toContainText('Review menu choice');
  await expect(page.locator('#photo-items-list')).toContainText('Estimate confidence: medium');
  await expect(page.locator('#photo-items-list')).toContainText('Qty/unit or grams · kcal · protein · carbs · fat');
  await expect.poll(() => page.locator('#photo-items-list input[aria-label="Food name"]').evaluateAll(inputs => inputs.map(input => input.value))).toEqual([
    'prosecco 125ml',
    'Grilled chicken salad'
  ]);
  await expect.poll(() => page.evaluate(() => {
    const log = JSON.parse(localStorage.getItem('sous_log') || '{}');
    return Object.values(log).reduce((count, day) => count + (day.meals || []).length, 0);
  })).toBe(0);

  await page.locator('#photo-estimate-cancel-btn').click();
  await expect(page.locator('#photo-estimate-modal')).toBeHidden();
  await expect.poll(() => page.evaluate(() => {
    const log = JSON.parse(localStorage.getItem('sous_log') || '{}');
    return Object.values(log).reduce((count, day) => count + (day.meals || []).length, 0);
  })).toBe(0);

  await page.evaluate(() => window.useMenuScanSuggestion(0));
  await page.locator('#photo-estimate-save-btn').click();
  const saved = await page.evaluate(() => {
    const day = Object.values(JSON.parse(localStorage.getItem('sous_log') || '{}'))[0];
    const meal = day && day.meals && day.meals[0];
    return {
      mealSource: meal && meal.source,
      rowSources: meal && meal.ingredients && meal.ingredients.map(item => item.source),
      itemNames: meal && meal.ingredients && meal.ingredients.map(item => item.name)
    };
  });
  expect(saved).toEqual({
    mealSource: 'menu_scan',
    rowSources: ['consumable_preset', 'menu_scan'],
    itemNames: ['prosecco 125ml', 'Grilled chicken salad']
  });
});
