const { test, expect } = require('@playwright/test');

test('local date helpers use local calendar days for log keys', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('sous_onboarding_seen', '1');
  });
  await page.goto('/');

  const result = await page.evaluate(() => {
    const morning = new Date(2026, 0, 2, 0, 30, 0);
    const evening = new Date(2026, 6, 9, 23, 45, 0);
    return {
      morningKey: window.localDateKey(morning),
      eveningKey: window.localDateKey(evening),
      today: todayStr(),
      selected: localDateStr(),
      historyToday: histDateStr(0),
      aiToday: buildAIActionContext().today
    };
  });

  expect(result.morningKey).toBe('2026-01-02');
  expect(result.eveningKey).toBe('2026-07-09');
  expect(result.today).toBe(result.selected);
  expect(result.historyToday).toBe(result.selected);
  expect(result.aiToday).toBe(result.selected);
});
