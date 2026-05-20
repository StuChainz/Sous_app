const { test, expect } = require('@playwright/test');

async function bootVoiceHarness(page) {
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('userPlan', 'free');
    localStorage.setItem('sous_voice_feedback', '0');
  });
  await page.goto('/');
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
