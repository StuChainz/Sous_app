const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('sous_onboarding_seen', '1');
  });
  await page.goto('/');
});

test('exports durable Jot data and imports it with a pre-import safety backup', async ({ page }) => {
  const result = await page.evaluate(() => {
    localStorage.setItem('sous_profile', JSON.stringify({ name: 'Beta', targetKcal: 2100 }));
    localStorage.setItem('sous_weights', JSON.stringify([{ date: '2026-05-20', kg: 82.4 }]));
    localStorage.setItem('sous_log', JSON.stringify({
      '2026-05-20': {
        meals: [{ name: 'Breakfast', ingredients: [{ name: 'Oats', kcal: 180 }], totals: { kcal: 180 } }],
        totals: { kcal: 180 }
      }
    }));
    localStorage.setItem('sous_recipes', JSON.stringify([{ id: 'r1', name: 'Chilli', ingredients: [] }]));
    localStorage.setItem('sous_recent_ingredients', JSON.stringify([{ name: 'Oats' }]));
    localStorage.setItem('sous_usual_meals', JSON.stringify({ breakfast: [{ name: 'Usual oats', ingredients: [] }] }));
    localStorage.setItem('sous_meal_memories_v1', JSON.stringify([{ id: 'm1', name: 'Oats', phrases: ['usual oats'], ingredients: [] }]));
    localStorage.setItem('userCustomFoods', JSON.stringify([{ id: 'cf_1', name: 'Protein bar' }]));
    localStorage.setItem('sous_custom_serving_units', JSON.stringify({ oats: { label: 'scoop', grams: 40 } }));
    localStorage.setItem('userFoodOverrides', JSON.stringify({ oats: { kcal: 370 } }));
    localStorage.setItem('sous_theme', JSON.stringify({ mode: 'dark', hl: 'blue' }));
    localStorage.setItem('userCountry', 'GB');
    localStorage.setItem('sous_voice_input_mode', 'continuous');
    localStorage.setItem('sous_voice_feedback', '0');
    localStorage.setItem('sous_realtime_voice', '1');
    localStorage.setItem('sous_draft', JSON.stringify({ shouldNotExport: true }));

    const backup = createJotBackup();

    localStorage.setItem('sous_profile', JSON.stringify({ name: 'Current' }));
    localStorage.setItem('sous_log', JSON.stringify({}));
    localStorage.setItem('other_app_key', 'keep me');

    const imported = importJotBackup(backup, { confirm: false, toast: false });
    return {
      imported,
      backupApp: backup.app,
      schemaVersion: backup.schemaVersion,
      counts: backup.counts,
      hasDraft: Object.prototype.hasOwnProperty.call(backup.data, 'sous_draft'),
      restoredProfile: JSON.parse(localStorage.getItem('sous_profile')),
      restoredLog: JSON.parse(localStorage.getItem('sous_log')),
      restoredCountry: localStorage.getItem('userCountry'),
      otherKey: localStorage.getItem('other_app_key'),
      preImportBackup: JSON.parse(localStorage.getItem('jot_pre_import_backup_v1'))
    };
  });

  expect(result.backupApp).toBe('Jot');
  expect(result.schemaVersion).toBe(1);
  expect(result.counts.logDays).toBe(1);
  expect(result.counts.loggedMeals).toBe(1);
  expect(result.counts.recipes).toBe(1);
  expect(result.counts.usualMeals).toBe(1);
  expect(result.counts.mealMemories).toBe(1);
  expect(result.counts.customFoods).toBe(1);
  expect(result.hasDraft).toBe(false);
  expect(result.imported.ok).toBe(true);
  expect(result.restoredProfile.name).toBe('Beta');
  expect(result.restoredLog['2026-05-20'].meals[0].name).toBe('Breakfast');
  expect(result.restoredCountry).toBe('GB');
  expect(result.otherKey).toBe('keep me');
  expect(result.preImportBackup.app).toBe('Jot');
  expect(result.preImportBackup.data.sous_profile.name).toBe('Current');
});

test('rejects invalid JSON and wrong app/schema without writing data', async ({ page }) => {
  const result = await page.evaluate(() => {
    localStorage.setItem('sous_profile', JSON.stringify({ name: 'Keep' }));
    localStorage.setItem('sous_log', JSON.stringify({ original: { meals: [] } }));

    const invalidJson = parseAndImportJotBackupText('{not json', { confirm: false, toast: false });
    const wrongApp = importJotBackup({ app: 'Other', schemaVersion: 1, data: {} }, { confirm: false, toast: false });
    const wrongSchema = importJotBackup({ app: 'Jot', schemaVersion: 99, data: {} }, { confirm: false, toast: false });
    const wrongTypeBackup = createJotBackup();
    wrongTypeBackup.data.sous_log = [];
    const wrongType = importJotBackup(wrongTypeBackup, { confirm: false, toast: false });

    return {
      invalidJson,
      wrongApp,
      wrongSchema,
      wrongType,
      profile: JSON.parse(localStorage.getItem('sous_profile')),
      log: JSON.parse(localStorage.getItem('sous_log')),
      preImportBackup: localStorage.getItem('jot_pre_import_backup_v1')
    };
  });

  expect(result.invalidJson.ok).toBe(false);
  expect(result.wrongApp.ok).toBe(false);
  expect(result.wrongSchema.ok).toBe(false);
  expect(result.wrongType.ok).toBe(false);
  expect(result.profile.name).toBe('Keep');
  expect(result.log.original).toBeTruthy();
  expect(result.preImportBackup).toBeNull();
});

test('shows backup controls in Profile', async ({ page }) => {
  await page.locator('.bottom-tabs .tab[data-tab="profile"]').click();
  await expect(page.getByText('Data backup')).toBeVisible();
  await expect(page.getByText('Export Jot data')).toBeVisible();
  await expect(page.getByText('Import Jot data')).toBeVisible();
});
