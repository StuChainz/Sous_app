const { test, expect } = require('@playwright/test');

async function bootVoiceHarness(page, { mode = 'continuous' } = {}) {
  await page.addInitScript(selectedMode => {
    localStorage.clear();
    localStorage.setItem('userPlan', 'free');
    localStorage.setItem('sous_onboarding_seen', '1');
    localStorage.setItem('sous_voice_feedback', '0');
    localStorage.setItem('sous_voice_test_harness', '1');
    if (selectedMode) localStorage.setItem('sous_voice_input_mode', selectedMode);
  }, mode);
  await page.goto('/?sousVoiceTest=1');
  await page.waitForFunction(() => typeof window.__sousStartVoiceTestSession === 'function');
  await page.evaluate(() => window.__sousStartVoiceTestSession('breakfast'));
  await expect.poll(() => page.evaluate(() => window.__sousVoiceState().state)).toBe('listening');
}

async function sendTranscript(page, text) {
  await page.evaluate(transcript => window.__sousTestVoiceTranscript(transcript), text);
}

async function activeScreen(page) {
  return page.evaluate(() => window.__sousVoiceState().activeScreen);
}

async function mealRows(page) {
  return page.evaluate(() => window.__sousVoiceState().meal.map(item => ({
    name: item.name,
    weight: item.weight
  })));
}

async function mealDetails(page) {
  return page.evaluate(() => window.__sousVoiceState().meal.map(item => ({
    name: item.name,
    weight: item.weight,
    kcal: item.kcal,
    protein: item.protein,
    carbs: item.carbs,
    fat: item.fat
  })));
}

async function bootHoldRecognizerHarness(page) {
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('userPlan', 'free');
    localStorage.setItem('sous_onboarding_seen', '1');
    localStorage.setItem('sous_voice_feedback', '0');
    localStorage.setItem('sous_realtime_voice', '0');
    localStorage.setItem('sous_voice_test_harness', '1');
    localStorage.setItem('sous_voice_input_mode', 'hold');
    window.__mockVoiceStats = { starts: 0, stops: 0, ends: 0, active: 0 };
    window.__mockRecognizers = [];
    class MockSpeechRecognition {
      constructor() {
        this.onstart = null;
        this.onend = null;
        this.onerror = null;
        this.onresult = null;
        this.onsoundstart = null;
        this.onspeechstart = null;
        this.onspeechend = null;
        this.onsoundend = null;
        this.onnomatch = null;
        this._active = false;
        this._ended = false;
        window.__mockRecognizers.push(this);
      }
      start() {
        if (this._active) throw new DOMException('Recognition already started', 'InvalidStateError');
        this._active = true;
        this._ended = false;
        window.__mockVoiceStats.starts += 1;
        window.__mockVoiceStats.active += 1;
        setTimeout(() => this.onstart && this.onstart(), 0);
      }
      stop() {
        window.__mockVoiceStats.stops += 1;
        this.__finish();
      }
      abort() {
        this.__finish();
      }
      __emitFinal(transcript, confidence = 0.96) {
        const result = [{ transcript, confidence }];
        result.isFinal = true;
        this.onresult && this.onresult({ resultIndex: 0, results: [result] });
      }
      __finish() {
        if (this._ended) return;
        this._ended = true;
        if (this._active) {
          this._active = false;
          window.__mockVoiceStats.active = Math.max(0, window.__mockVoiceStats.active - 1);
        }
        window.__mockVoiceStats.ends += 1;
        setTimeout(() => this.onend && this.onend(), 0);
      }
    }
    window.SpeechRecognition = MockSpeechRecognition;
    window.webkitSpeechRecognition = MockSpeechRecognition;
  });
  await page.goto('/?sousVoiceTest=1');
  await page.waitForFunction(() => typeof window.__sousVoiceState === 'function');
  await page.evaluate(() => switchTab('log', { fresh: true, silent: true, section: 'breakfast' }));
  await expect.poll(() => page.evaluate(() => window.__sousVoiceState().voiceInputMode)).toBe('hold');
}

async function holdStart(page) {
  await page.locator('#mic-btn').dispatchEvent('pointerdown', { pointerId: 1, pointerType: 'mouse', bubbles: true });
  await expect.poll(() => page.evaluate(() => window.__sousVoiceState().state), { timeout: 3000 }).toBe('listening');
}

async function holdStop(page) {
  await page.locator('#mic-btn').dispatchEvent('pointerup', { pointerId: 1, pointerType: 'mouse', bubbles: true });
}

async function emitHoldFinal(page, transcript) {
  await page.evaluate(text => {
    window.__mockRecognizers[window.__mockRecognizers.length - 1].__emitFinal(text);
  }, transcript);
}

test('new installs default to hold-to-talk beta mode', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('userPlan', 'free');
    localStorage.setItem('sous_onboarding_seen', '1');
    localStorage.setItem('sous_voice_feedback', '0');
    localStorage.setItem('sous_voice_test_harness', '1');
  });
  await page.goto('/?sousVoiceTest=1');
  await page.waitForFunction(() => typeof window.__sousVoiceState === 'function');

  const state = await page.evaluate(() => window.__sousVoiceState());
  await expect(page.locator('#mic-btn')).toHaveAttribute('aria-label', 'Hold to speak');
  expect(state.voiceInputMode).toBe('hold');
});

test('simple food opens quantity review and commits the default once', async ({ page }) => {
  await bootVoiceHarness(page);

  await sendTranscript(page, 'banana');
  await expect.poll(() => activeScreen(page)).toBe('ls-quantity');
  await page.locator('#qty-default-btn').click();

  await expect.poll(() => mealRows(page)).toEqual([{ name: 'Banana', weight: 120 }]);
});

test('grams food commits exact grams once', async ({ page }) => {
  await bootVoiceHarness(page);

  await sendTranscript(page, 'oats 75g');

  await expect.poll(() => mealRows(page)).toEqual([{ name: 'Oats', weight: 75 }]);
});

test('multi-food review commits reviewed ingredients once each', async ({ page }) => {
  await bootVoiceHarness(page);

  await sendTranscript(page, 'oats banana whey');
  await expect.poll(() => activeScreen(page)).toBe('ls-multi-confirm');
  await expect(page.locator('#mc-list > div')).toHaveCount(3);
  await page.locator('#mc-add-btn').click();

  await expect.poll(() => mealRows(page)).toEqual([
    { name: 'Oats', weight: 100 },
    { name: 'Banana', weight: 120 },
    { name: 'Protein powder', weight: 30 }
  ]);
});

test('quantity prompt accepts the next spoken grams answer', async ({ page }) => {
  await bootVoiceHarness(page);

  await sendTranscript(page, 'oats');
  await expect.poll(() => activeScreen(page)).toBe('ls-quantity');
  await sendTranscript(page, '50 grams');

  await expect.poll(() => mealRows(page)).toEqual([{ name: 'Oats', weight: 50 }]);
});

test('clarification flow preserves type and quantity answer', async ({ page }) => {
  await bootVoiceHarness(page);

  await sendTranscript(page, 'cheese');
  await expect.poll(() => page.evaluate(() => window.__sousVoiceState().clarification?.active || false)).toBe(true);
  await sendTranscript(page, 'cheddar 30 grams');

  await expect.poll(() => mealRows(page)).toEqual([{ name: 'Cheddar', weight: 30 }]);
  await expect.poll(() => page.evaluate(() => window.__sousVoiceState().clarification)).toBe(null);
});

test('manual unresolved food selection preserves typed grams', async ({ page }) => {
  await bootVoiceHarness(page);

  await page.locator('#text-input').fill('70g cookie');
  await page.locator('#text-input').press('Enter');
  await expect.poll(() => activeScreen(page)).toBe('ls-multi-resolve');
  await page.locator('#ls-multi-resolve button', { hasText: 'Chocolate chip cookie' }).first().click();
  await page.locator('#ls-multi-resolve button', { hasText: 'Add 1 ingredient to meal' }).click();

  await expect.poll(() => mealRows(page)).toEqual([{ name: 'Chocolate chip cookie', weight: 70 }]);
});

test('parser preserves beef and serving quantities in dense multi-item transcripts', async ({ page }) => {
  await bootVoiceHarness(page);

  const summary = await page.evaluate(() => {
    const summarize = input => (window.parseText(input) || []).map(item => item.ambiguous
      ? { type: 'ambiguous', label: item.label, amount: item.amount, matches: item.matches.map(food => food.name) }
      : { type: 'food', name: item.name, weight: item.weight, weightSpecified: !!item.weightSpecified });
    return {
      beef: summarize('50g beef'),
      dense: summarize('2 slices of bread 50g beef 10g mayonnaise'),
      malformed: summarize('De slice of bread 50 g of beef 10 g of mayonnaise 10 g of a wood'),
      diagnostics: window.parserDiagnostics('De slice of bread 50 g of beef 10 g of mayonnaise 10 g of a wood')
    };
  });

  expect(summary.beef).toEqual([
    { type: 'ambiguous', label: 'beef', amount: 50, matches: ['Beef steak', 'Beef mince'] }
  ]);
  expect(summary.dense).toEqual([
    { type: 'ambiguous', label: 'bread', amount: 80, matches: ['Bread', 'White bread', 'Rye bread'] },
    { type: 'ambiguous', label: 'beef', amount: 50, matches: ['Beef steak', 'Beef mince'] },
    { type: 'food', name: 'Mayonnaise', weight: 10, weightSpecified: true }
  ]);
  expect(summary.malformed.some(item => item.label === 'beef' && item.amount === 50)).toBe(true);
  expect(JSON.stringify(summary.malformed).toLowerCase()).not.toContain('wood');
  expect(summary.diagnostics.segments.some(seg => seg.segment === '10 g of a wood' && seg.status === 'unmatched')).toBe(true);
});

test('editing current meal weight recalculates macros and totals', async ({ page }) => {
  await bootVoiceHarness(page);

  await sendTranscript(page, '50g egg');
  await expect.poll(() => mealRows(page)).toEqual([{ name: 'Egg', weight: 50 }]);
  const before = await page.evaluate(() => {
    const item = window.__sousVoiceState().meal[0];
    return {
      item: { kcal: item.kcal, protein: item.protein, carbs: item.carbs, fat: item.fat },
      total: sumMacros(window.__sousVoiceState().meal)
    };
  });

  await page.locator('#current-meal-list button[title="Edit"]').first().click();
  await expect(page.locator('#edit-modal')).toBeVisible();
  await page.locator('#edit-weight').fill('100');
  await page.locator('#edit-save-btn').click();

  await expect.poll(() => mealDetails(page)).toEqual([
    { name: 'Egg', weight: 100, kcal: 156, protein: 12, carbs: 1.2, fat: 10 }
  ]);
  const after = await page.evaluate(() => {
    const item = window.__sousVoiceState().meal[0];
    return {
      item: { kcal: item.kcal, protein: item.protein, carbs: item.carbs, fat: item.fat },
      total: sumMacros(window.__sousVoiceState().meal)
    };
  });
  expect(after.item.kcal).toBeGreaterThan(before.item.kcal * 1.9);
  expect(after.total.kcal).toBe(after.item.kcal);
});

test('spoken serving quantities stay attached across a multi-item phrase', async ({ page }) => {
  await bootVoiceHarness(page);

  await sendTranscript(page, 'two sausages two eggs one slice of cheese cup of pineapple');

  await expect.poll(() => mealRows(page)).toEqual([
    { name: 'Sausages', weight: 120 },
    { name: 'Egg', weight: 100 },
    { name: 'Cheddar', weight: 25 },
    { name: 'Pineapple', weight: 165 }
  ]);
  const cheddar = (await mealRows(page)).find(item => item.name === 'Cheddar');
  expect(cheddar.weight).toBeGreaterThanOrEqual(20);
  expect(cheddar.weight).toBeLessThanOrEqual(35);
});

test('hold-to-talk ignores duplicate final transcript from one recognizer run', async ({ page }) => {
  await bootHoldRecognizerHarness(page);

  await holdStart(page);
  await emitHoldFinal(page, 'oats 75');
  await emitHoldFinal(page, 'oats 75');
  await holdStop(page);

  await expect.poll(() => page.evaluate(() => window.__sousVoiceState().processing), { timeout: 5000 }).toBe(false);
  await expect.poll(() => mealRows(page)).toEqual([{ name: 'Oats', weight: 75 }]);

  const trace = await page.evaluate(() => window.sousVoiceDebug());
  expect(trace.some(event => event.event === 'duplicate_transcript_ignored')).toBe(true);
});

test('hold-to-talk page leave cleans up recognizer state without restart', async ({ page }) => {
  await bootHoldRecognizerHarness(page);

  await holdStart(page);
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await page.waitForTimeout(250);

  const state = await page.evaluate(() => window.__sousVoiceState());
  const stats = await page.evaluate(() => window.__mockVoiceStats);
  const trace = await page.evaluate(() => window.sousVoiceDebug());
  expect(state.state).toBe('idle');
  expect(state.recognizerActive).toBe(false);
  expect(state.voiceHoldActive).toBe(false);
  expect(stats.active).toBe(0);
  expect(trace.some(event => event.event === 'voice_lifecycle_pause' && event.reason === 'pagehide')).toBe(true);
  expect(trace.some(event => event.event === 'session_restart_requested')).toBe(false);
});

test('save from review updates history and home once even if save is repeated', async ({ page }) => {
  await bootVoiceHarness(page);

  await sendTranscript(page, 'oats 75g');
  await expect.poll(() => mealRows(page)).toEqual([{ name: 'Oats', weight: 75 }]);
  await page.locator('#finished-meal-btn').click();
  await expect.poll(() => activeScreen(page)).toBe('ls-summary');
  await expect(page.locator('#save-meal-btn')).toBeEnabled();
  await page.locator('#save-meal-btn').click();
  await page.locator('#save-meal-btn').click({ force: true });

  await expect.poll(() => page.evaluate(() => {
    const log = JSON.parse(localStorage.getItem('sous_log') || '{}');
    return Object.values(log).flatMap(day => day.meals || []).length;
  })).toBe(1);
  await expect.poll(() => page.evaluate(() => window.__sousVoiceState().currentTab), { timeout: 3000 }).toBe('home');
  await expect(page.locator('#home-meals-list')).toContainText('Oats');
});
