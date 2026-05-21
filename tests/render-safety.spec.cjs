const { test, expect } = require('@playwright/test');

function localDateKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

test('profile and meal names render as text, not injected markup', async ({ page }) => {
  const profileName = '<img src=x onerror="window.__sousProfileInjected=1"> Ada';
  const mealName = '<svg onload="window.__sousMealInjected=1"></svg> Lunch';
  const dateKey = localDateKey();

  await page.addInitScript(({ profileName, mealName, dateKey }) => {
    localStorage.clear();
    localStorage.setItem('sous_onboarding_seen', '1');
    localStorage.setItem('sous_profile', JSON.stringify({ name: profileName, targetKcal: 2200 }));
    localStorage.setItem('sous_log', JSON.stringify({
      [dateKey]: {
        totals: { kcal: 100, protein: 10, carbs: 12, fat: 3, fibre: 1 },
        meals: [{
          id: 101,
          name: mealName,
          time: `${dateKey}T12:00:00.000Z`,
          section: 'lunch',
          ingredients: [{ name: '<b>oats</b>', weight: 50, kcal: 100, protein: 10, carbs: 12, fat: 3, fibre: 1 }],
          totals: { kcal: 100, protein: 10, carbs: 12, fat: 3, fibre: 1 }
        }]
      }
    }));
  }, { profileName, mealName, dateKey });

  await page.goto('/');

  await expect(page.locator('#home-name')).toContainText(profileName);
  await expect(page.locator('#home-meals-list')).toContainText(mealName);
  await expect(page.locator('#home-name img')).toHaveCount(0);
  await expect(page.locator('#home-meals-list svg')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => ({
    profile: window.__sousProfileInjected === true,
    meal: window.__sousMealInjected === true
  }))).toEqual({ profile: false, meal: false });
});
