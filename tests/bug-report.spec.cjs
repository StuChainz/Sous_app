const { test, expect } = require('@playwright/test');
const fs = require('fs');
const os = require('os');
const path = require('path');

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
  await expect(page.getByText('Report a bug')).toBeVisible();
  await expect(page.getByText('What were you trying to do?')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send to Stu' })).toBeVisible();
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

test('diagnostics report includes tester context, app state, traces, storage counts, and console errors', async ({ page }) => {
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

  const report = await page.evaluate(() => window.__sousBuildDiagnosticsReport(
    'Mic stopped after banana',
    'Logged breakfast by voice'
  ));

  expect(report.app).toBe('Jot');
  expect(report.reportType).toBe('beta-diagnostics');
  expect(report.testerIntent).toBe('Logged breakfast by voice');
  expect(report.testerNote).toBe('Mic stopped after banana');
  expect(report.currentURL).toContain('test=1');
  expect(report.currentApiBaseUrl).toBe('');
  expect(report.userAgent).toBeTruthy();
  expect(typeof report.standalonePWA).toBe('boolean');
  expect(typeof report.runningAsPWA).toBe('boolean');
  expect(typeof report.runningAsCapacitor).toBe('boolean');
  expect(report.runtime).toEqual(expect.objectContaining({
    capacitor: expect.any(Boolean),
    pwa: expect.any(Boolean)
  }));
  expect(typeof report.online).toBe('boolean');
  expect(report.currentTab).toBe('home');
  expect(report.currentScreen).toBe('pane-home');
  expect(report.selectedDate).toBeTruthy();
  expect(report.currentVoiceInputMode).toBeTruthy();
  expect(report.currentVoiceFeedbackMode).toBe('silent');
  expect(report.currentMealSummary.itemCount).toBe(0);
  expect(report.voiceStatus).toEqual(expect.objectContaining({
    inputMode: expect.any(String),
    feedbackMode: 'silent'
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
  expect(report.localStorageSummary.knownKeys.sous_voice_feedback_mode.present).toBe(true);
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

  await page.evaluate(() => window.__sousCopyBugReport('Copy helper note', 'Edited a saved meal'));
  const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
  const report = JSON.parse(clipboardText);

  expect(report.testerNote).toBe('Copy helper note');
  expect(report.testerIntent).toBe('Edited a saved meal');
  expect(report.currentURL).toContain('test=1');
  expect(report.reportType).toBe('beta-diagnostics');
});

test('send to Stu posts diagnostics with tester fields and ignores double tap', async ({ page }) => {
  const submissions = [];
  await page.route('**/api/bug-report', async route => {
    submissions.push(route.request().postDataJSON());
    await new Promise(resolve => setTimeout(resolve, 80));
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, id: 'bug_123' })
    });
  });
  await boot(page, '/?test=1');

  await page.getByTestId('bug-report-button').click();
  await page.locator('#bug-report-intent').fill('Scanned a photo');
  await page.locator('#bug-report-note').fill('Photo came back as pasta');
  await page.evaluate(() => {
    document.getElementById('bug-report-send').click();
    document.getElementById('bug-report-send').click();
  });

  await expect(page.locator('#bug-report-status')).toContainText('Sent to Stu. Report bug_123');
  expect(submissions).toHaveLength(1);
  expect(submissions[0]).toEqual(expect.objectContaining({
    testerIntent: 'Scanned a photo',
    testerNote: 'Photo came back as pasta',
    reportType: 'beta-diagnostics'
  }));
});

test('failed send leaves copy fallback available with report JSON', async ({ page }) => {
  await page.route('**/api/bug-report', route => route.fulfill({
    status: 500,
    contentType: 'application/json',
    body: JSON.stringify({ error: 'Temporary issue' })
  }));
  await boot(page, '/?test=1');

  await page.getByTestId('bug-report-button').click();
  await page.locator('#bug-report-intent').fill('Tried to save dinner');
  await page.locator('#bug-report-note').fill('Save button did nothing');
  await page.locator('#bug-report-send').click();

  await expect(page.locator('#bug-report-status')).toContainText('Copy Report is still available');
  await expect(page.locator('#bug-report-copy')).toBeVisible();
  await expect(page.getByTestId('bug-report-output')).toBeVisible();
  const fallbackText = await page.getByTestId('bug-report-output').inputValue();
  const report = JSON.parse(fallbackText);
  expect(report.testerIntent).toBe('Tried to save dinner');
  expect(report.testerNote).toBe('Save button did nothing');
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
  await page.locator('#bug-report-intent').fill('Logged breakfast by voice');
  await page.locator('#bug-report-note').fill('Clipboard blocked');
  await page.locator('#bug-report-copy').click();

  await expect(page.getByTestId('bug-report-output')).toBeVisible();
  const fallbackText = await page.getByTestId('bug-report-output').inputValue();
  const report = JSON.parse(fallbackText);
  expect(report.testerIntent).toBe('Logged breakfast by voice');
  expect(report.testerNote).toBe('Clipboard blocked');
  await expect(page.locator('#bug-report-status')).toContainText('Clipboard copy failed');
});

test('backend stores bug report JSONL with safe request metadata', async () => {
  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'sous-bug-reports-'));
  const modulePath = require.resolve('../server.js');
  delete require.cache[modulePath];
  process.env.SOUS_BUG_REPORT_DIR = tempDir;
  process.env.SOUS_BUG_REPORT_MAX_BYTES = String(256 * 1024);
  const { app } = require('../server.js');
  const server = await new Promise(resolve => {
    const started = app.listen(0, '127.0.0.1', () => resolve(started));
  });
  const address = server.address();

  try {
    const res = await fetch(`http://127.0.0.1:${address.port}/api/bug-report`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Sous test agent'
      },
      body: JSON.stringify({
        testerIntent: 'Logged breakfast by voice',
        testerNote: 'Mic stopped',
        apiKey: 'sk-test-secret-value'
      })
    });
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body).toEqual({ ok: true, id: expect.any(String) });

    const files = await fs.promises.readdir(tempDir);
    expect(files).toHaveLength(1);
    const lines = (await fs.promises.readFile(path.join(tempDir, files[0]), 'utf8')).trim().split('\n');
    const stored = JSON.parse(lines[0]);
    expect(stored.id).toBe(body.id);
    expect(stored.receivedAt).toBeTruthy();
    expect(stored.request).toEqual(expect.objectContaining({
      method: 'POST',
      path: '/api/bug-report',
      userAgent: 'Sous test agent',
      payloadBytes: expect.any(Number)
    }));
    expect(stored.report.testerIntent).toBe('Logged breakfast by voice');
    expect(stored.report.testerNote).toBe('Mic stopped');
    expect(stored.report.apiKey).toBe('[REDACTED]');
  } finally {
    await new Promise(resolve => server.close(resolve));
    delete process.env.SOUS_BUG_REPORT_DIR;
    delete process.env.SOUS_BUG_REPORT_MAX_BYTES;
    delete require.cache[modulePath];
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  }
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

test('saved photo estimate totals preserve fibre from reviewed rows', async ({ page }) => {
  await boot(page);

  await page.evaluate(() => {
    window.renderPhotoEstimateReview({
      mealName: 'Bean salad',
      confidence: 'medium',
      items: [
        {
          name: 'Black beans',
          estimatedGrams: 120,
          calories: 160,
          protein: 10,
          carbs: 28,
          fat: 1,
          fibre: 7.4,
          confidence: 'medium',
          notes: ''
        },
        {
          name: 'Sweetcorn',
          estimatedGrams: 60,
          calories: 55,
          protein: 2,
          carbs: 12,
          fat: 0.8,
          fibre: 1.8,
          confidence: 'medium',
          notes: ''
        }
      ],
      totals: { calories: 215, protein: 12, carbs: 40, fat: 1.8 }
    });
  });

  await page.locator('#photo-estimate-save-btn').click();

  const saved = await page.evaluate(() => {
    const day = Object.values(JSON.parse(localStorage.getItem('sous_log') || '{}'))[0];
    const meal = day?.meals?.[0];
    return {
      mealTotals: meal?.totals,
      dayTotals: day?.totals,
      rowFibre: meal?.ingredients?.map(item => item.fibre)
    };
  });
  expect(saved.rowFibre).toEqual([7.4, 1.8]);
  expect(saved.mealTotals.fibre).toBe(9.2);
  expect(saved.dayTotals.fibre).toBe(9.2);
});

test('single-item photo correction updates meal title before saving', async ({ page }) => {
  let adjustPayload = null;
  await page.route('**/api/photo-estimate-adjust', route => {
    adjustPayload = route.request().postDataJSON();
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: [{
          name: 'Lasagne',
          quantity: 1,
          unit: 'serving',
          grams: 350,
          kcal: 630,
          protein: 32,
          carbs: 54,
          fat: 30,
          fibre: 4,
          confidence: 'medium',
          reason: 'Corrected whole-photo estimate identity.'
        }],
        summary: 'Corrected to lasagne.',
        warnings: []
      })
    });
  });
  await boot(page);

  await page.evaluate(() => {
    window.renderPhotoEstimateReview({
      mealName: 'cheese ravioli and meat sauce',
      confidence: 'medium',
      items: [{
        name: 'cheese ravioli and meat sauce',
        estimatedGrams: 350,
        calories: 610,
        protein: 28,
        carbs: 58,
        fat: 27,
        confidence: 'medium',
        notes: ''
      }],
      totals: { calories: 610, protein: 28, carbs: 58, fat: 27 }
    });
  });

  await expect(page.locator('#photo-estimate-modal')).toBeVisible();
  await expect(page.locator('#photo-meal-name')).toHaveValue('cheese ravioli and meat sauce');

  await page.locator('#photo-adjust-input').fill("it's lasagne");
  await page.locator('#photo-adjust-btn').click();

  await expect.poll(() => page.locator('#photo-items-list input[aria-label="Food name"]').evaluateAll(inputs => inputs.map(input => input.value))).toEqual(['Lasagne']);
  await expect(page.locator('#photo-meal-name')).toHaveValue('Lasagne');
  await expect(page.locator('#photo-estimate-title')).toContainText('Review Lasagne');
  expect(adjustPayload.correction).toBe("it's lasagne");
  expect(adjustPayload.previousEstimate.mealName).toBe('cheese ravioli and meat sauce');

  await page.locator('#photo-estimate-save-btn').click();
  const saved = await page.evaluate(() => {
    const day = Object.values(JSON.parse(localStorage.getItem('sous_log') || '{}'))[0];
    const meal = day?.meals?.[0];
    return {
      mealName: meal?.name,
      itemNames: meal?.ingredients?.map(item => item.name)
    };
  });
  expect(saved).toEqual({
    mealName: 'Lasagne',
    itemNames: ['Lasagne']
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

test('menu-scanned history meal can be photo-updated without changing other meals', async ({ page }) => {
  let updatePayload = null;
  await page.route('**/api/menu-scan/photo-update', route => {
    updatePayload = route.request().postDataJSON();
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        mealName: 'Updated chicken salad',
        source: 'menu_scan',
        confidence: 'medium',
        items: [
          {
            name: 'prosecco 125ml',
            estimatedGrams: null,
            calories: 86,
            protein: 0.1,
            carbs: 2.1,
            fat: 0,
            confidence: 'high',
            notes: 'Reserved drink preserved.',
            source: 'consumable_preset',
            presetId: 'prosecco-125ml'
          },
          {
            name: 'Actual grilled chicken salad',
            estimatedGrams: null,
            calories: 610,
            protein: 50,
            carbs: 22,
            fat: 32,
            confidence: 'medium',
            notes: 'Updated from the plate photo.',
            source: 'menu_scan',
            presetId: null
          }
        ],
        totals: { calories: 696, protein: 50.1, carbs: 24.1, fat: 32 },
        notes: 'Updated from actual plate photo.'
      })
    });
  });
  await boot(page);
  await page.evaluate(() => {
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    const today = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    localStorage.setItem('sous_log', JSON.stringify({
      [today]: {
        meals: [
          {
            id: 101,
            name: 'Manual toast',
            time: new Date().toISOString(),
            section: 'breakfast',
            source: 'manual',
            ingredients: [{ id: 1, name: 'Toast', weight: 60, kcal: 180, protein: 6, carbs: 32, fat: 3, source: 'manual' }],
            savedIngredients: [{ id: 1, name: 'Toast', weight: 60, kcal: 180, protein: 6, carbs: 32, fat: 3, source: 'manual' }],
            totals: { kcal: 180, protein: 6, carbs: 32, fat: 3, fibre: 0 }
          },
          {
            id: 202,
            name: 'Grilled chicken salad',
            time: new Date().toISOString(),
            section: 'dinner',
            source: 'menu_scan',
            confidence: 'medium',
            ingredients: [
              { id: 2, name: 'prosecco 125ml', weight: null, kcal: 86, protein: 0.1, carbs: 2.1, fat: 0, confidence: 'high', source: 'consumable_preset', presetId: 'prosecco-125ml' },
              { id: 3, name: 'Grilled chicken salad', weight: null, kcal: 520, protein: 45, carbs: 25, fat: 24, confidence: 'medium', source: 'menu_scan' }
            ],
            savedIngredients: [],
            totals: { kcal: 606, protein: 45.1, carbs: 27.1, fat: 24, fibre: 0 }
          }
        ],
        totals: { kcal: 786, protein: 51.1, carbs: 59.1, fat: 27, fibre: 0 }
      }
    }));
    window.resizePhotoForEstimate = async () => ({
      image: 'data:image/jpeg;base64,AA==',
      bytes: 1,
      width: 1,
      height: 1
    });
  });

  await page.locator('.tab[data-tab="history"]').click();
  await expect(page.getByText('Manual toast')).toBeVisible();
  await expect(page.getByText('Grilled chicken salad', { exact: true })).toBeVisible();
  await expect(page.getByTestId('menu-photo-update-btn')).toHaveCount(1);

  await page.getByTestId('menu-photo-update-btn').click();
  await page.locator('#photo-estimate-input').setInputFiles({
    name: 'plate.png',
    mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=', 'base64')
  });
  await expect(page.locator('#photo-estimate-modal')).toBeVisible();
  await expect(page.locator('#photo-estimate-title')).toContainText('Review updated menu estimate');
  await expect.poll(() => page.locator('#photo-items-list input[aria-label="Food name"]').evaluateAll(inputs => inputs.map(input => input.value))).toEqual([
    'prosecco 125ml',
    'Actual grilled chicken salad'
  ]);
  expect(updatePayload.existingRows.map(row => row.source)).toEqual(['consumable_preset', 'menu_scan']);

  await page.locator('#photo-estimate-cancel-btn').click();
  await expect(page.locator('#photo-estimate-modal')).toBeHidden();
  await expect.poll(() => page.evaluate(() => {
    const day = Object.values(JSON.parse(localStorage.getItem('sous_log') || '{}'))[0];
    return day.meals.map(meal => ({ name: meal.name, kcal: meal.totals.kcal, rows: meal.ingredients.map(row => row.name) }));
  })).toEqual([
    { name: 'Manual toast', kcal: 180, rows: ['Toast'] },
    { name: 'Grilled chicken salad', kcal: 606, rows: ['prosecco 125ml', 'Grilled chicken salad'] }
  ]);

  await page.getByTestId('menu-photo-update-btn').click();
  await page.locator('#photo-estimate-input').setInputFiles({
    name: 'plate-2.png',
    mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=', 'base64')
  });
  await expect(page.locator('#photo-estimate-title')).toContainText('Review updated menu estimate');
  await page.locator('#photo-estimate-save-btn').click();
  const saved = await page.evaluate(() => {
    const day = Object.values(JSON.parse(localStorage.getItem('sous_log') || '{}'))[0];
    return day.meals.map(meal => ({
      id: meal.id,
      name: meal.name,
      source: meal.source,
      kcal: meal.totals.kcal,
      rows: meal.ingredients.map(row => ({ name: row.name, source: row.source, kcal: row.kcal }))
    }));
  });
  expect(saved).toEqual([
    {
      id: 101,
      name: 'Manual toast',
      source: 'manual',
      kcal: 180,
      rows: [{ name: 'Toast', source: 'manual', kcal: 180 }]
    },
    {
      id: 202,
      name: 'Updated chicken salad',
      source: 'menu_scan',
      kcal: 696,
      rows: [
        { name: 'prosecco 125ml', source: 'consumable_preset', kcal: 86 },
        { name: 'Actual grilled chicken salad', source: 'menu_scan', kcal: 610 }
      ]
    }
  ]);
});
