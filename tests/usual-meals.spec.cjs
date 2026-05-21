const { test, expect } = require('@playwright/test');

function meal(name, oatsGrams, wheyGrams) {
  return {
    name,
    section: 'breakfast',
    ingredients: [
      { name: 'oats', source: 'food-db', weight: oatsGrams, kcal: oatsGrams * 4, protein: oatsGrams * 0.1, carbs: oatsGrams * 0.6, fat: oatsGrams * 0.07, fibre: oatsGrams * 0.1 },
      { name: 'whey', source: 'food-db', weight: wheyGrams, kcal: wheyGrams * 4, protein: wheyGrams * 0.8, carbs: wheyGrams * 0.05, fat: wheyGrams * 0.04, fibre: 0 }
    ]
  };
}

test('usual meal fingerprints include quantities and update exact repeats', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('sous_onboarding_seen', '1');
  });
  await page.goto('/');

  const result = await page.evaluate(({ small, large }) => {
    updateUsualMeals(small);
    updateUsualMeals(large);
    updateUsualMeals(small);

    const usuals = getUsualMeals().breakfast || [];
    return {
      count: usuals.length,
      smallUseCount: usuals.find(u => u.name === small.name)?.useCount,
      largeUseCount: usuals.find(u => u.name === large.name)?.useCount,
      fingerprints: usuals.map(u => u.fingerprint)
    };
  }, {
    small: meal('oats 50g whey 30g', 50, 30),
    large: meal('oats 100g whey 60g', 100, 60)
  });

  expect(result.count).toBe(2);
  expect(result.smallUseCount).toBe(2);
  expect(result.largeUseCount).toBe(1);
  expect(new Set(result.fingerprints).size).toBe(2);
});
