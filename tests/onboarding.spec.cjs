const { test, expect } = require('@playwright/test');

async function clearOnboarding(page) {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('__sous_onboarding_test_cleared')) {
      localStorage.clear();
      sessionStorage.setItem('__sous_onboarding_test_cleared', '1');
    }
  });
}

async function fillProfileAndStart(page) {
  await page.locator('#onboarding-age').fill('34');
  await page.locator('#onboarding-sex').selectOption('male');
  await page.locator('#onboarding-height').fill('180');
  await page.locator('#onboarding-weight').fill('82');
  await page.locator('#onboarding-goal').selectOption('maintain');
  await page.getByRole('button', { name: 'Start first log' }).click();
}

async function activeLogScreen(page) {
  return page.evaluate(() => document.querySelector('.log-screen.active')?.id || '');
}

async function currentMealRowCount(page) {
  return page.evaluate(() => document.querySelectorAll('#current-meal-list .capture-row').length);
}

async function submitFirstFood(page, text = '2 eggs') {
  await page.locator('#text-input').fill(text);
  await page.locator('#send-btn').click();

  for (let i = 0; i < 6; i += 1) {
    if (await currentMealRowCount(page)) return;
    const screen = await activeLogScreen(page);
    if (screen === 'ls-multi-confirm') await page.locator('#mc-add-btn').click();
    else if (screen === 'ls-confirm') await page.locator('#confirm-btn').click();
    else if (screen === 'ls-quantity') await page.locator('#qty-default-btn').click();
    await page.waitForTimeout(300);
  }
  await expect.poll(() => currentMealRowCount(page), { timeout: 6000 }).toBeGreaterThan(0);
}

async function reachReview(page) {
  await page.locator('#finished-meal-btn').click();
  await expect(page.locator('#ls-summary')).toHaveClass(/active/);
  await expect(page.locator('#save-meal-btn')).toBeVisible();
}

test('onboarding shown first run', async ({ page }) => {
  await clearOnboarding(page);
  await page.goto('/');

  await expect(page.getByTestId('onboarding-overlay')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Quick setup' })).toBeVisible();
  await expect(page.locator('#onboarding-age')).toBeVisible();
  await expect(page.locator('#onboarding-weight')).toBeVisible();
});

test('onboarding skipped after completion', async ({ page }) => {
  await clearOnboarding(page);
  await page.goto('/');

  await page.getByRole('button', { name: 'Skip onboarding' }).click();
  await expect(page.getByTestId('onboarding-overlay')).toBeHidden();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('sous_onboarding_seen'))).toBe('1');

  await page.reload();
  await expect(page.getByTestId('onboarding-overlay')).toBeHidden();
});

test('__sousShowOnboarding and profile help reopen onboarding', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('sous_onboarding_seen', '1');
  });
  await page.goto('/');
  await expect(page.getByTestId('onboarding-overlay')).toBeHidden();

  await page.evaluate(() => window.__sousShowOnboarding());
  await expect(page.getByTestId('onboarding-overlay')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Quick setup' })).toBeVisible();
  await page.getByRole('button', { name: 'Skip onboarding' }).click();

  await page.locator('.tab[data-tab="profile"]').click();
  await page.locator('#profile-onboarding-btn').click();
  await expect(page.getByTestId('onboarding-overlay')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Quick setup' })).toBeVisible();
});

test('profile setup preserves existing profile storage and starts guided log', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('sous_profile', JSON.stringify({ name: 'Stu', activity: 1.7, targetKcal: 2200 }));
  });
  await page.goto('/');

  await fillProfileAndStart(page);
  await expect(page.getByTestId('onboarding-overlay')).toBeHidden();
  await expect(page.getByTestId('onboarding-coach')).toBeVisible();
  await expect(page.locator('#onboarding-coach-title')).toHaveText('Hold to speak');

  const profile = await page.evaluate(() => JSON.parse(localStorage.getItem('sous_profile')));
  expect(profile.name).toBe('Stu');
  expect(profile.activity).toBe(1.7);
  expect(profile.age).toBe(34);
  expect(profile.height).toBe(180);
  expect(profile.currentWeight).toBe(82);
});

test('first guided log reaches review flow', async ({ page }) => {
  await clearOnboarding(page);
  await page.goto('/');
  await fillProfileAndStart(page);

  await submitFirstFood(page);
  await expect(page.locator('#current-meal-list .capture-row')).toHaveCount(1);
  await expect(page.getByText('Tap to edit')).toBeVisible();

  await reachReview(page);
  await expect(page.getByText('Review before save')).toBeVisible();
});

test('editing during onboarding works', async ({ page }) => {
  await clearOnboarding(page);
  await page.goto('/');
  await fillProfileAndStart(page);
  await submitFirstFood(page);

  await page.locator('#current-meal-list .capture-row').first().click();
  await expect(page.locator('#edit-modal')).toBeVisible();
  await page.locator('#edit-weight').fill('123');
  await page.locator('#edit-save-btn').click();

  await expect(page.locator('#edit-modal')).toBeHidden();
  await expect(page.locator('#current-meal-list')).toContainText('123g');
});

test('onboarding completion persists after first saved log', async ({ page }) => {
  await clearOnboarding(page);
  await page.goto('/');
  await fillProfileAndStart(page);
  await submitFirstFood(page);
  await reachReview(page);

  await page.locator('#save-meal-btn').click();
  await expect(page.getByRole('heading', { name: 'Useful extras' })).toBeVisible({ timeout: 6000 });
  await expect(page.getByText('Bug → Send to Stu')).toBeVisible();
  await page.getByRole('button', { name: 'Got it' }).click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('sous_onboarding_seen'))).toBe('1');

  await page.reload();
  await expect(page.getByTestId('onboarding-overlay')).toBeHidden();
});

test('onboarding remains usable on a small mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await clearOnboarding(page);
  await page.goto('/');

  await expect(page.getByTestId('onboarding-overlay')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Skip onboarding' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start first log' })).toBeVisible();
  await expect(page.locator('#onboarding-weight')).toBeVisible();
});
