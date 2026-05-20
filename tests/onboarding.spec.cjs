const { test, expect } = require('@playwright/test');

async function clearOnboarding(page) {
  await page.addInitScript(() => {
    localStorage.clear();
  });
}

test('onboarding appears on first load', async ({ page }) => {
  await clearOnboarding(page);
  await page.goto('/');

  await expect(page.getByTestId('onboarding-overlay')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Tap once, keep logging' })).toBeVisible();
});

test('dismissing onboarding stores the seen flag', async ({ page }) => {
  await clearOnboarding(page);
  await page.goto('/');

  await page.getByRole('button', { name: 'Skip onboarding' }).click();
  await expect(page.getByTestId('onboarding-overlay')).toBeHidden();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('sous_onboarding_seen'))).toBe('1');
});

test('onboarding does not appear after dismissal', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('sous_onboarding_seen', '1');
  });
  await page.goto('/');

  await expect(page.getByTestId('onboarding-overlay')).toBeHidden();
});

test('__sousShowOnboarding reopens onboarding', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('sous_onboarding_seen', '1');
  });
  await page.goto('/');
  await expect(page.getByTestId('onboarding-overlay')).toBeHidden();

  await page.evaluate(() => window.__sousShowOnboarding());
  await expect(page.getByTestId('onboarding-overlay')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Tap once, keep logging' })).toBeVisible();
});

test('onboarding remains usable on a small mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await clearOnboarding(page);
  await page.goto('/');

  await expect(page.getByTestId('onboarding-overlay')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Skip onboarding' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Next onboarding card' })).toBeVisible();

  for (const title of [
    'Speak normally',
    'Everything is editable',
    'Corrections are expected',
    'Sous gets faster over time'
  ]) {
    await page.getByRole('button', { name: /Next onboarding card|Start logging/ }).click();
    await expect(page.getByRole('heading', { name: title })).toBeVisible();
    await expect(page.getByRole('button', { name: /Back/ })).toBeVisible();
  }
  await expect(page.getByRole('button', { name: 'Start logging' })).toBeVisible();
});

test('final card starts logging experience and stores the seen flag', async ({ page }) => {
  await clearOnboarding(page);
  await page.goto('/');

  for (let i = 0; i < 4; i += 1) {
    await page.getByRole('button', { name: 'Next onboarding card' }).click();
  }
  await expect(page.getByRole('heading', { name: 'Sous gets faster over time' })).toBeVisible();
  await page.getByRole('button', { name: 'Start logging' }).click();

  await expect(page.getByTestId('onboarding-overlay')).toBeHidden();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('sous_onboarding_seen'))).toBe('1');
});
