const { test, expect } = require('@playwright/test');

function memory(id, name, section, phrases) {
  return {
    id,
    version: 1,
    name,
    section,
    phrases,
    ingredients: [{ name: 'oats', weight: 80, kcal: 300, protein: 10, carbs: 50, fat: 6, fibre: 8 }],
    totals: { kcal: 300, protein: 10, carbs: 50, fat: 6, fibre: 8 },
    source: 'manual',
    createdAt: 1,
    updatedAt: 1,
    useCount: 0,
    lastUsed: null
  };
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('sous_onboarding_seen', '1');
  });
  await page.goto('/');
});

test('matches explicit personal meal memory phrases', async ({ page }) => {
  const result = await page.evaluate(() => {
    saveMealMemories([
      {
        id: 'oats',
        version: 1,
        name: 'Oats',
        section: 'breakfast',
        phrases: ['my oats', 'usual oats'],
        ingredients: [{ name: 'oats', weight: 80, kcal: 300, protein: 10, carbs: 50, fat: 6, fibre: 8 }],
        totals: { kcal: 300, protein: 10, carbs: 50, fat: 6, fibre: 8 },
        source: 'manual',
        createdAt: 1,
        updatedAt: 1,
        useCount: 0,
        lastUsed: null
      }
    ]);

    return {
      myOats: findBestMealMemoryMatch('my oats'),
      usualOats: findBestMealMemoryMatch('usual oats'),
      logMyOats: findBestMealMemoryMatch('log my oats')
    };
  });

  expect(result.myOats.matched).toBe(true);
  expect(result.myOats.memory.id).toBe('oats');
  expect(result.usualOats.matched).toBe(true);
  expect(result.usualOats.memory.id).toBe('oats');
  expect(result.logMyOats.matched).toBe(true);
  expect(result.logMyOats.memory.id).toBe('oats');
});

test('returns ambiguous rather than guessing between strong matches', async ({ page }) => {
  const result = await page.evaluate(({ first, second }) => {
    saveMealMemories([first, second]);
    return findBestMealMemoryMatch('my oats');
  }, {
    first: memory('oats-a', 'Oats A', 'breakfast', ['my oats']),
    second: memory('oats-b', 'Oats B', 'breakfast', ['my oats'])
  });

  expect(result.matched).toBe(false);
  expect(result.ambiguous).toBe(true);
  expect(result.matches.map(match => match.memory.id).sort()).toEqual(['oats-a', 'oats-b']);
});

test('does not hijack normal food quantity logging', async ({ page }) => {
  const result = await page.evaluate(({ oats }) => {
    saveMealMemories([oats]);
    return {
      command: parseMealMemoryCommand('oats 50g'),
      match: findBestMealMemoryMatch('oats 50g')
    };
  }, {
    oats: memory('oats', 'Oats', 'breakfast', ['my oats', 'usual oats'])
  });

  expect(result.command).toBeNull();
  expect(result.match.matched).toBe(false);
  expect(result.match.ambiguous).toBe(false);
});

test('usual section recall is safe only when unambiguous', async ({ page }) => {
  const result = await page.evaluate(({ breakfast, lunch, secondBreakfast }) => {
    saveMealMemories([breakfast, lunch]);
    const oneBreakfast = findBestMealMemoryMatch('usual breakfast');
    saveMealMemories([breakfast, secondBreakfast, lunch]);
    const twoBreakfasts = findBestMealMemoryMatch('usual breakfast');
    return { oneBreakfast, twoBreakfasts };
  }, {
    breakfast: memory('breakfast-oats', 'Oats', 'breakfast', ['my oats']),
    lunch: memory('lunch-rice', 'Rice', 'lunch', ['my rice']),
    secondBreakfast: memory('breakfast-toast', 'Toast', 'breakfast', ['my toast'])
  });

  expect(result.oneBreakfast.matched).toBe(true);
  expect(result.oneBreakfast.memory.id).toBe('breakfast-oats');
  expect(result.twoBreakfasts.matched).toBe(false);
  expect(result.twoBreakfasts.ambiguous).toBe(true);
});
