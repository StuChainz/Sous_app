const { test, expect } = require('@playwright/test');

async function boot(page, init = () => {}) {
  await page.addInitScript(init);
  await page.goto('/');
}

test('AI interpretation requires an explicit plan or dev/test override', async ({ page }) => {
  await boot(page, () => {
    localStorage.clear();
    localStorage.setItem('sous_onboarding_seen', '1');
  });
  await expect.poll(() => page.evaluate(() => canUseAIInterpretation())).toBe(false);

  await page.evaluate(() => localStorage.setItem('userPlan', 'free'));
  await expect.poll(() => page.evaluate(() => canUseAIInterpretation())).toBe(false);

  await page.evaluate(() => localStorage.setItem('userPlan', 'pro'));
  await expect.poll(() => page.evaluate(() => canUseAIInterpretation())).toBe(true);
});

test('AI interpretation allows explicit dev and voice harness overrides', async ({ page }) => {
  await boot(page, () => {
    localStorage.clear();
    localStorage.setItem('sous_onboarding_seen', '1');
    localStorage.setItem('userPlan', 'free');
    localStorage.setItem('sous_voice_test_harness', '1');
  });
  await expect.poll(() => page.evaluate(() => canUseAIInterpretation())).toBe(true);

  await page.evaluate(() => {
    localStorage.removeItem('sous_voice_test_harness');
    localStorage.setItem('sous_ai_config', JSON.stringify({ dev: true }));
  });
  await expect.poll(() => page.evaluate(() => canUseAIInterpretation())).toBe(true);
});
