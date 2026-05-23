const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('sous_onboarding_seen', '1');
  });
});

test('profile height and bodyweight units convert without changing stored metric values', async ({ page }) => {
  await page.goto('/');
  await page.locator('.bottom-tabs .tab[data-tab="profile"]').click();

  await page.locator('#f-age').fill('30');
  await page.locator('#f-height').fill('180');
  await page.locator('#seg-height-unit [data-val="ftin"]').click();

  await expect(page.locator('#f-height-ft')).toHaveValue('5');
  await expect(page.locator('#f-height-in')).toHaveValue(/10\.9|11/);

  await page.locator('#f-height-ft').fill('6');
  await page.locator('#f-height-in').fill('0');
  await page.locator('#seg-weight-unit [data-val="lb"]').click();
  await page.locator('#prof-bw-input').fill('180');
  await page.getByRole('button', { name: 'Save profile' }).click();

  const saved = await page.evaluate(() => ({
    profile: JSON.parse(localStorage.getItem('sous_profile') || '{}'),
    weights: JSON.parse(localStorage.getItem('sous_weights') || '[]'),
    sub: document.getElementById('tdee-sub')?.textContent || ''
  }));

  expect(saved.profile.heightUnit).toBe('ftin');
  expect(saved.profile.weightUnit).toBe('lb');
  expect(saved.profile.height).toBeGreaterThan(182);
  expect(saved.profile.height).toBeLessThan(184);
  expect(saved.weights[0].kg).toBeGreaterThan(81);
  expect(saved.weights[0].kg).toBeLessThan(82);
  expect(saved.sub).toContain('lb');
});

test('home bodyweight logging uses the saved weight unit preference', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('sous_profile', JSON.stringify({ weightUnit: 'lb' }));
  });
  await page.goto('/');

  await expect(page.locator('.home-bodyweight .weight-unit-label')).toHaveText('lb');
  await page.locator('#home-bw-input').fill('181');
  await page.getByRole('button', { name: 'Log' }).click();

  const weights = await page.evaluate(() => JSON.parse(localStorage.getItem('sous_weights') || '[]'));
  expect(weights[0].kg).toBeGreaterThan(82);
  expect(weights[0].kg).toBeLessThan(82.2);
});
