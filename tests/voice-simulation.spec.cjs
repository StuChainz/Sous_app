const { test, expect } = require('@playwright/test');

async function bootVoiceHarness(page) {
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('userPlan', 'free');
    localStorage.setItem('sous_onboarding_seen', '1');
    localStorage.setItem('sous_voice_feedback', '0');
    localStorage.setItem('sous_voice_input_mode', 'continuous');
  });
  await page.goto('/');
  await page.waitForFunction(() => typeof window.__sousStartVoiceTestSession === 'function');
  await page.evaluate(() => window.__sousStartVoiceTestSession('breakfast'));
  await expect.poll(() => page.evaluate(() => window.__sousVoiceState().state)).toBe('listening');
}

async function sendTranscript(page, text) {
  await page.evaluate(transcript => window.__sousTestVoiceTranscript(transcript), text);
}

async function installAIRepairMock(page, candidates, options = {}) {
  await page.evaluate(({ candidates, options }) => {
    window.__aiRepairCalls = [];
    window.repairTranscriptWithAI = async payload => {
      window.__aiRepairCalls.push(payload);
      if (options.neverResolve) return new Promise(() => {});
      return candidates;
    };
  }, { candidates, options });
}

async function aiRepairCallCount(page) {
  return page.evaluate(() => (window.__aiRepairCalls || []).length);
}

async function activeScreen(page) {
  return page.evaluate(() => window.__sousVoiceState().activeScreen);
}

async function useDefaultQuantityIfAsked(page) {
  if ((await activeScreen(page)) === 'ls-quantity') {
    await page.locator('#qty-default-btn').click();
    await expect.poll(() => activeScreen(page)).toBe('ls-listening');
  }
}

async function commitReviewIfShown(page) {
  if ((await activeScreen(page)) === 'ls-multi-confirm') {
    await expect(page.locator('#mc-list > div')).toHaveCount(3);
    await expect(page.locator('#mc-list input[type="number"]')).toHaveCount(15);
    await page.locator('#mc-add-btn').click();
    await expect.poll(() => activeScreen(page)).toBe('ls-listening');
  }
}

function countByName(items) {
  return items.reduce((counts, item) => {
    counts[item.name] = (counts[item.name] || 0) + 1;
    return counts;
  }, {});
}

test('simulated voice transcripts can build and save a meal without microphone access', async ({ page }) => {
  await bootVoiceHarness(page);

  await sendTranscript(page, 'banana');
  await useDefaultQuantityIfAsked(page);

  await sendTranscript(page, 'cheddar 30g');
  await expect.poll(() => page.evaluate(() => window.__sousVoiceState().meal.length)).toBe(2);

  await sendTranscript(page, {
    transcript: '30g jeans',
    alternatives: [
      { text: '30g cheese', confidence: 0.91 },
      { text: '30g beans', confidence: 0.63 }
    ]
  });
  await expect.poll(() => page.evaluate(() => window.__sousVoiceState().meal.length)).toBe(3);

  await sendTranscript(page, '15g soy source');
  await expect.poll(() => page.evaluate(() => window.__sousVoiceState().meal.length)).toBe(4);

  await sendTranscript(page, 'oats banana whey');
  await expect.poll(() => activeScreen(page)).toBe('ls-multi-confirm');
  await commitReviewIfShown(page);

  await sendTranscript(page, 'cheese');
  const clarification = await page.evaluate(() => window.__sousVoiceState().clarification);
  if (clarification && clarification.active) {
    await sendTranscript(page, 'cheddar 30g');
  } else {
    await useDefaultQuantityIfAsked(page);
  }

  await expect.poll(() => page.evaluate(() => window.__sousVoiceState().meal.length)).toBe(8);
  await expect(page.locator('#current-meal-list button[title="Edit"]')).toHaveCount(8);

  const counts = await page.evaluate(() => {
    const items = window.__sousVoiceState().meal;
    return items.reduce((acc, item) => {
      acc[item.name] = (acc[item.name] || 0) + 1;
      return acc;
    }, {});
  });
  expect(counts).toEqual(countByName([
    { name: 'Banana' },
    { name: 'Cheddar' },
    { name: 'Cheddar' },
    { name: 'Soy sauce' },
    { name: 'Oats' },
    { name: 'Banana' },
    { name: 'Protein powder' },
    { name: 'Cheddar' }
  ]));

  await page.locator('#finished-meal-btn').click();
  await expect.poll(() => activeScreen(page)).toBe('ls-summary');
  await expect(page.locator('#ing-list .ing-item')).toHaveCount(8);

  await page.locator('#save-meal-btn').click();
  await expect.poll(() => page.evaluate(() => {
    const log = JSON.parse(localStorage.getItem('sous_log') || '{}');
    return Object.values(log).flatMap(day => day.meals || []).length;
  })).toBe(1);
});

test('repairs first-word oats misheard as oops and commits voice-filled review', async ({ page }) => {
  await bootVoiceHarness(page);

  await sendTranscript(page, 'Oops banana and whey');
  await expect.poll(() => activeScreen(page)).toBe('ls-multi-confirm');
  await expect(page.locator('#mc-list > div')).toHaveCount(3);

  const repaired = await page.evaluate(() =>
    window.sousVoiceDebug().some(event =>
      event.event === 'transcript_repaired' &&
      event.from === 'Oops banana and whey' &&
      event.to === 'oats banana and whey'
    )
  );
  expect(repaired).toBe(true);

  await sendTranscript(page, '70 g oats 70 g banana 50 g protein');
  await expect.poll(() => activeScreen(page)).toBe('ls-listening');

  const state = await page.evaluate(() => window.__sousVoiceState());
  expect(state.meal.map(item => item.name)).toEqual(['Oats', 'Banana', 'Protein powder']);
  expect(state.meal.map(item => item.weight)).toEqual([70, 70, 50]);
});

test('does not call AI repair for strong local parse', async ({ page }) => {
  await bootVoiceHarness(page);
  await installAIRepairMock(page, [{ transcript: 'oats banana and whey', score: 0.9, reason: 'should not be used' }]);

  await sendTranscript(page, 'oats banana and whey');
  await expect.poll(() => activeScreen(page)).toBe('ls-multi-confirm');
  expect(await aiRepairCallCount(page)).toBe(0);
});

test('uses local repairs for common food mishears before AI', async ({ page }) => {
  await bootVoiceHarness(page);
  await installAIRepairMock(page, [{ transcript: 'should not run', score: 0.9, reason: 'local repair should win' }]);

  await sendTranscript(page, '30 g way protein');
  await expect.poll(() => page.evaluate(() => window.__sousVoiceState().meal.some(item => item.name === 'Protein powder'))).toBe(true);

  await sendTranscript(page, '200 ml all milk');
  await expect.poll(() => page.evaluate(() => window.__sousVoiceState().meal.some(item => item.name === 'Oat milk'))).toBe(true);

  expect(await aiRepairCallCount(page)).toBe(0);
});

test('accepts bounded AI repair only after local validation', async ({ page }) => {
  await bootVoiceHarness(page);
  await installAIRepairMock(page, [{ transcript: '200 ml oat milk', score: 0.93, reason: 'awl mlk sounds like oat milk' }]);

  await sendTranscript(page, '200 ml awl mlk');
  await expect.poll(() => page.evaluate(() => window.__sousVoiceState().meal.some(item => item.name === 'Oat milk'))).toBe(true);

  const trace = await page.evaluate(() => window.sousVoiceDebug());
  expect(trace.some(event => event.event === 'ai_repair_requested')).toBe(true);
  expect(trace.some(event => event.event === 'ai_repair_accepted' && event.to === '200 ml oat milk')).toBe(true);
});

test('rejects aggressive AI repair expansion and preserves fallback flow', async ({ page }) => {
  await bootVoiceHarness(page);
  await installAIRepairMock(page, [{ transcript: 'sauce on toast', score: 0.95, reason: 'too aggressive' }]);

  await sendTranscript(page, 'sorse tostie');
  await expect.poll(() => page.evaluate(() => window.__sousVoiceState().processing)).toBe(false);

  const state = await page.evaluate(() => window.__sousVoiceState());
  const trace = await page.evaluate(() => window.sousVoiceDebug());
  expect(state.meal).toHaveLength(0);
  expect(trace.some(event => event.event === 'ai_repair_rejected')).toBe(true);
});

test('times out AI repair and falls back cleanly', async ({ page }) => {
  await bootVoiceHarness(page);
  await installAIRepairMock(page, [], { neverResolve: true });

  await sendTranscript(page, 'blorph');
  await expect.poll(() => page.evaluate(() => window.__sousVoiceState().processing), { timeout: 3000 }).toBe(false);

  const trace = await page.evaluate(() => window.sousVoiceDebug());
  expect(trace.some(event => event.event === 'ai_repair_timeout')).toBe(true);
  expect(await page.evaluate(() => window.__sousVoiceState().meal.length)).toBe(0);
});

test('bypasses AI repair for parsed voice commands', async ({ page }) => {
  await bootVoiceHarness(page);
  await installAIRepairMock(page, [{ transcript: 'oats', score: 0.9, reason: 'should not be used' }]);

  await sendTranscript(page, 'undo that');
  await expect.poll(() => page.evaluate(() => window.__sousVoiceState().processing)).toBe(false);

  expect(await aiRepairCallCount(page)).toBe(0);
  const trace = await page.evaluate(() => window.sousVoiceDebug());
  expect(trace.some(event => event.event === 'ai_repair_requested')).toBe(false);
});
