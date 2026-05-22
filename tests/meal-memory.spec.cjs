const { test, expect } = require('@playwright/test');

function oatsMemory(overrides = {}) {
  return {
    id: overrides.id || 'oats-memory',
    version: 1,
    name: overrides.name || 'Oats',
    section: overrides.section || 'breakfast',
    phrases: overrides.phrases || ['my oats', 'usual oats'],
    ingredients: overrides.ingredients || [
      { name: 'Oats', source: 'food-db', weight: 80, kcal: 300, protein: 10, carbs: 50, fat: 6, fibre: 8, confidence: 'high' },
      { name: 'Banana', source: 'food-db', weight: 120, kcal: 107, protein: 1.3, carbs: 27, fat: 0.4, fibre: 3.1, confidence: 'high' },
      { name: 'Peanut butter', source: 'food-db', weight: 20, kcal: 118, protein: 5, carbs: 4, fat: 10, fibre: 1.2, confidence: 'high' }
    ],
    totals: overrides.totals || { kcal: 525, protein: 16.3, carbs: 81, fat: 16.4, fibre: 12.3 },
    source: overrides.source || 'manual',
    createdAt: overrides.createdAt || 1,
    updatedAt: overrides.updatedAt || 1,
    useCount: overrides.useCount || 0,
    lastUsed: overrides.lastUsed || null
  };
}

async function bootPage(page, voice = false) {
  await page.addInitScript(voiceFlag => {
    localStorage.clear();
    localStorage.setItem('userPlan', 'free');
    localStorage.setItem('sous_onboarding_seen', '1');
    localStorage.setItem('sous_voice_feedback', '0');
    if (voiceFlag) localStorage.setItem('sous_voice_test_harness', '1');
  }, voice);
  await page.goto(voice ? '/?sousVoiceTest=1' : '/');
  if (voice) {
    await page.waitForFunction(() => typeof window.__sousStartVoiceTestSession === 'function');
  }
}

async function startVoiceSession(page) {
  await page.evaluate(() => window.__sousStartVoiceTestSession('breakfast'));
  await expect.poll(() => page.evaluate(() => window.__sousVoiceState().state), { timeout: 6000 }).toBe('listening');
}

async function sendTranscript(page, text) {
  await page.evaluate(transcript => window.__sousTestVoiceTranscript(transcript), text);
  await expect.poll(() => page.evaluate(() => window.__sousVoiceState().processing), { timeout: 6000 }).toBe(false);
}

async function mealItems(page) {
  return page.evaluate(() => window.__sousVoiceState().meal);
}

test('storage helpers add, normalize, update, and delete meal memories', async ({ page }) => {
  await bootPage(page);

  const result = await page.evaluate(memory => {
    const added = addMealMemory({
      ...memory,
      id: undefined,
      phrases: [' My Oats ', 'my oats', '', 'USUAL OATS']
    });
    updateMealMemory(added.id, { name: 'Morning oats', phrases: [' usual oats ', 'usual oats', 'saved oats'] });
    const updated = findMealMemoryById(added.id);
    removeMealMemory(added.id);
    return {
      addedPhrases: added.phrases,
      updatedName: updated.name,
      updatedPhrases: updated.phrases,
      remaining: getMealMemories().length
    };
  }, oatsMemory());

  expect(result.addedPhrases).toEqual(['my oats', 'usual oats']);
  expect(result.updatedName).toBe('Morning oats');
  expect(result.updatedPhrases).toEqual(['usual oats', 'saved oats']);
  expect(result.remaining).toBe(0);
});

test('create a memory from current meal, show it in Profile, and delete it', async ({ page }) => {
  await bootPage(page);

  await page.evaluate(() => {
    switchTab('log', { fresh: true, silent: true, section: 'breakfast', quick: true });
    addIngredientToMeal({ name: 'Oats', weight: 80, kcal: 300, protein: 10, carbs: 50, fat: 6, fibre: 8 }, { source: 'test', skipSnapshot: true, skipPersist: true });
    renderCurrentMeal();
    showSummary(false);
  });

  await page.locator('#remember-meal-btn').click();
  await page.locator('#memory-name-input').fill('Oats');
  await page.locator('#memory-phrases-input').fill('my oats\nusual oats\nmy oats');
  await page.locator('#remember-meal-save-btn').click();

  await expect.poll(() => page.evaluate(() => getMealMemories().length)).toBe(1);
  await page.evaluate(() => switchTab('profile'));
  await expect(page.locator('#meal-memory-list')).toContainText('Oats');
  await expect(page.locator('#meal-memory-list')).toContainText('my oats, usual oats');

  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Delete' }).click();
  await expect.poll(() => page.evaluate(() => getMealMemories().length)).toBe(0);
  await expect(page.locator('#meal-memory-list')).toContainText('No remembered meals yet');
});

test('malicious-looking memory fields render as text in management UI', async ({ page }) => {
  await bootPage(page);

  await page.evaluate(memory => {
    addMealMemory(memory);
    switchTab('profile');
  }, oatsMemory({
    name: '<img src=x onerror=alert(1)>',
    phrases: ['<script>alert(1)</script>']
  }));

  await expect(page.locator('#meal-memory-list')).toContainText('<img src=x onerror=alert(1)>');
  await expect(page.locator('#meal-memory-list')).toContainText('<script>alert(1)</script>');
  await expect(page.locator('#meal-memory-list img')).toHaveCount(0);
  await expect(page.locator('#meal-memory-list script')).toHaveCount(0);
});

test('voice harness recalls meal memories and applies safe transforms', async ({ page }) => {
  await bootPage(page, true);
  await page.evaluate(memory => addMealMemory(memory), oatsMemory());

  await startVoiceSession(page);
  await sendTranscript(page, 'my oats');
  let items = await mealItems(page);
  expect(items.map(item => item.name)).toEqual(['Oats', 'Banana', 'Peanut butter']);

  await startVoiceSession(page);
  await sendTranscript(page, 'my oats but no banana');
  items = await mealItems(page);
  expect(items.map(item => item.name)).toEqual(['Oats', 'Peanut butter']);

  await startVoiceSession(page);
  await sendTranscript(page, 'my oats but half peanut butter');
  items = await mealItems(page);
  const peanutButter = items.find(item => item.name === 'Peanut butter');
  expect(peanutButter).toBeTruthy();
  expect(Number(peanutButter.weight)).toBe(10);

  const trace = await page.evaluate(() => window.sousVoiceDebug());
  expect(trace.some(event => event.event === 'meal_memory_transform_applied')).toBe(true);
  expect(trace.some(event => event.route === 'personal-meal-memory')).toBe(true);
});
