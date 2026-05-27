const { test, expect } = require('@playwright/test');

async function boot(page) {
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('userPlan', 'free');
    localStorage.setItem('sous_onboarding_seen', '1');
    localStorage.setItem('sous_voice_feedback', '0');
  });
  await page.goto('/');
  await page.waitForFunction(() => typeof window.sumMacros === 'function');
}

function mealFixture(overrides = {}) {
  return {
    id: overrides.id ?? 1001,
    name: overrides.name || 'Breakfast plate',
    time: overrides.time || '2026-05-27T08:15:00.000Z',
    section: overrides.section || 'breakfast',
    source: overrides.source || 'manual',
    ingredients: overrides.ingredients || [
      { id: 1, name: 'Oats', weight: 80, kcal: 300, protein: 10, carbs: 50, fat: 6, fibre: 8 },
      { id: 2, name: 'Banana', weight: 120, kcal: 107, protein: 1.3, carbs: 27, fat: 0.4, fibre: 3.1 }
    ],
    totals: overrides.totals || { kcal: 407, protein: 11.3, carbs: 77, fat: 6.4, fibre: 11.1 }
  };
}

async function seedLog(page, byDate) {
  await page.evaluate(log => localStorage.setItem('sous_log', JSON.stringify(log)), byDate);
}

async function snapshotLog(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('sous_log') || '{}'));
}

test.describe('logging and history regression coverage', () => {
  test.beforeEach(async ({ page }) => {
    await boot(page);
  });

  test('saving a reviewed meal writes one dated meal, totals, draft clear, and recent ingredients', async ({ page }) => {
    const result = await page.evaluate(() => {
      switchTab('log', { fresh: true, silent: true, section: 'breakfast' });
      addIngredientToMeal({ name: 'Oats', weight: 80, kcal: 300, protein: 10, carbs: 50, fat: 6, fibre: 8 }, { source: 'test' });
      addIngredientToMeal({ name: 'Banana', weight: 120, kcal: 107, protein: 1.3, carbs: 27, fat: 0.4, fibre: 3.1 }, { source: 'test' });
      document.getElementById('sum-meal-name').value = 'Training breakfast';
      saveDraft({ shouldBeCleared: true });
      saveMealToLog(false);
      const log = getLog();
      const date = localDateStr();
      return {
        date,
        day: log[date],
        draft: localStorage.getItem('sous_draft'),
        recent: getRecentIngredients().map(item => ({ name: item.name, weight: item.weight }))
      };
    });

    expect(result.day.meals).toHaveLength(1);
    expect(result.day.meals[0].name).toBe('Training breakfast');
    expect(result.day.meals[0].section).toBe('breakfast');
    expect(result.day.meals[0].ingredients.map(item => item.name)).toEqual(['Oats', 'Banana']);
    expect(result.day.totals).toEqual({ kcal: 407, protein: 11.3, carbs: 77, fat: 6.4, fibre: 11.1 });
    expect(result.draft).toBeNull();
    expect(result.recent).toEqual([{ name: 'Banana', weight: 120 }, { name: 'Oats', weight: 80 }]);
  });

  test('saving without a typed name generates stable ingredient-based meal names', async ({ page }) => {
    const names = await page.evaluate(() => {
      const saveWith = ingredients => {
        switchTab('log', { fresh: true, silent: true, section: 'lunch' });
        ingredients.forEach(item => addIngredientToMeal(item, { source: 'test' }));
        document.getElementById('sum-meal-name').value = '';
        saveMealToLog(false);
        const mealObj = getLog()[localDateStr()].meals.at(-1);
        return mealObj.name;
      };
      return [
        saveWith([{ name: 'Egg', weight: 50, kcal: 78, protein: 6, carbs: 0.6, fat: 5, fibre: 0 }]),
        saveWith([
          { name: 'Oats', weight: 80, kcal: 300, protein: 10, carbs: 50, fat: 6, fibre: 8 },
          { name: 'Banana', weight: 120, kcal: 107, protein: 1.3, carbs: 27, fat: 0.4, fibre: 3.1 }
        ]),
        saveWith([
          { name: 'Oats', weight: 80, kcal: 300, protein: 10, carbs: 50, fat: 6, fibre: 8 },
          { name: 'Banana', weight: 120, kcal: 107, protein: 1.3, carbs: 27, fat: 0.4, fibre: 3.1 },
          { name: 'Protein powder', weight: 30, kcal: 120, protein: 24, carbs: 2, fat: 1, fibre: 0 },
          { name: 'Milk', weight: 200, kcal: 100, protein: 7, carbs: 10, fat: 3, fibre: 0 }
        ])
      ];
    });

    expect(names).toEqual(['Egg', 'Oats + Banana', 'Oats + 3 items']);
  });

  test('save as usual deduplicates equivalent meals and increments use count', async ({ page }) => {
    const usual = await page.evaluate(() => {
      const saveUsual = () => {
        switchTab('log', { fresh: true, silent: true, section: 'breakfast' });
        addIngredientToMeal({ name: 'Oats', weight: 80, kcal: 300, protein: 10, carbs: 50, fat: 6, fibre: 8 }, { source: 'test' });
        document.getElementById('sum-meal-name').value = 'My oats';
        saveMealToLog(true);
      };
      saveUsual();
      saveUsual();
      return getUsualMeals().breakfast.map(item => ({
        name: item.name,
        useCount: item.useCount,
        ingredientCount: item.ingredients.length
      }));
    });

    expect(usual).toEqual([{ name: 'My oats', useCount: 2, ingredientCount: 1 }]);
  });

  test('recent ingredients dedupe case-insensitively and cap at twenty entries', async ({ page }) => {
    const recent = await page.evaluate(() => {
      for (let i = 0; i < 25; i += 1) {
        addToRecentIngredients({ name: `Food ${i}`, weight: i + 1, kcal: i, protein: 0, carbs: 0, fat: 0, fibre: 0 });
      }
      addToRecentIngredients({ name: 'food 5', weight: 55, kcal: 5, protein: 0, carbs: 0, fat: 0, fibre: 0 });
      return getRecentIngredients().map(item => ({ name: item.name, weight: item.weight }));
    });

    expect(recent).toHaveLength(20);
    expect(recent[0]).toEqual({ name: 'food 5', weight: 55 });
    expect(recent.filter(item => item.name.toLowerCase() === 'food 5')).toHaveLength(1);
  });

  test('editing an existing logged meal replaces it instead of appending a duplicate', async ({ page }) => {
    const today = await page.evaluate(() => localDateStr());
    await seedLog(page, {
      [today]: {
        meals: [mealFixture({ id: 42, name: 'Original breakfast' })],
        totals: { kcal: 407, protein: 11.3, carbs: 77, fat: 6.4, fibre: 11.1 }
      }
    });

    const log = await page.evaluate(() => {
      currentEditMealId = 42;
      currentEditMealDate = localDateStr();
      switchTab('log', { fresh: true, silent: true, section: 'breakfast' });
      addIngredientToMeal({ name: 'Egg', weight: 100, kcal: 156, protein: 12, carbs: 1.2, fat: 10, fibre: 0 }, { source: 'test' });
      document.getElementById('sum-meal-name').value = 'Edited breakfast';
      saveMealToLog(false);
      return getLog();
    });

    expect(log[today].meals).toHaveLength(1);
    expect(log[today].meals[0].id).toBe(42);
    expect(log[today].meals[0].name).toBe('Edited breakfast');
    expect(log[today].meals[0].ingredients.map(item => item.name)).toEqual(['Egg']);
    expect(log[today].totals).toEqual({ kcal: 156, protein: 12, carbs: 1.2, fat: 10, fibre: 0 });
  });

  test('editing a meal on another date does not create an empty selected-day log entry', async ({ page }) => {
    const dates = await page.evaluate(() => {
      const today = localDateStr();
      const yesterday = localDateOffset(-1);
      return { today, yesterday };
    });
    await seedLog(page, {
      [dates.yesterday]: {
        meals: [mealFixture({ id: 77, name: 'Yesterday breakfast' })],
        totals: { kcal: 407, protein: 11.3, carbs: 77, fat: 6.4, fibre: 11.1 }
      }
    });

    const log = await page.evaluate(yesterday => {
      currentEditMealId = 77;
      currentEditMealDate = yesterday;
      selectedLogDate = localDateStr();
      switchTab('log', { fresh: true, silent: true, section: 'breakfast' });
      addIngredientToMeal({ name: 'Egg', weight: 100, kcal: 156, protein: 12, carbs: 1.2, fat: 10, fibre: 0 }, { source: 'test' });
      document.getElementById('sum-meal-name').value = 'Edited yesterday';
      saveMealToLog(false);
      return getLog();
    }, dates.yesterday);

    expect(Object.keys(log).sort()).toEqual([dates.yesterday]);
    expect(log[dates.yesterday].meals).toHaveLength(1);
    expect(log[dates.yesterday].meals[0].name).toBe('Edited yesterday');
  });

  test('history ingredient edit recalculates meal and day totals', async ({ page }) => {
    const today = await page.evaluate(() => localDateStr());
    await seedLog(page, {
      [today]: {
        meals: [mealFixture()],
        totals: { kcal: 407, protein: 11.3, carbs: 77, fat: 6.4, fibre: 11.1 }
      }
    });

    await page.locator('.tab[data-tab="history"]').click();
    await page.evaluate(todayKey => openHistoryIngredientEdit(todayKey, 0, 0), today);
    await page.locator('#hist-edit-name').fill('Oats');
    await page.locator('#hist-edit-weight').fill('100');
    await page.locator('#hist-edit-kcal').fill('375');
    await page.locator('#hist-edit-protein').fill('12.5');
    await page.locator('#hist-edit-carbs').fill('62.5');
    await page.locator('#hist-edit-fat').fill('7.5');
    await page.locator('#hist-edit-fibre').fill('10');
    await page.locator('#hist-edit-save-btn').click();

    const log = await snapshotLog(page);
    expect(log[today].meals[0].ingredients[0]).toMatchObject({
      name: 'Oats',
      weight: 100,
      kcal: 375,
      protein: 12.5,
      carbs: 62.5,
      fat: 7.5,
      fibre: 10
    });
    expect(log[today].meals[0].totals).toEqual({ kcal: 482, protein: 13.8, carbs: 89.5, fat: 7.9, fibre: 13.1 });
    expect(log[today].totals).toEqual({ kcal: 482, protein: 13.8, carbs: 89.5, fat: 7.9, fibre: 13.1 });
    await expect(page.locator('#hst-kcal')).toHaveText('482');
  });

  test('deleting one history ingredient keeps the meal and recalculates totals', async ({ page }) => {
    const today = await page.evaluate(() => localDateStr());
    await seedLog(page, {
      [today]: {
        meals: [mealFixture()],
        totals: { kcal: 407, protein: 11.3, carbs: 77, fat: 6.4, fibre: 11.1 }
      }
    });

    page.once('dialog', dialog => dialog.accept());
    await page.evaluate(todayKey => deleteHistoryIngredient(todayKey, 0, 1), today);

    const log = await snapshotLog(page);
    expect(log[today].meals).toHaveLength(1);
    expect(log[today].meals[0].ingredients.map(item => item.name)).toEqual(['Oats']);
    expect(log[today].meals[0].totals).toEqual({ kcal: 300, protein: 10, carbs: 50, fat: 6, fibre: 8 });
    expect(log[today].totals).toEqual({ kcal: 300, protein: 10, carbs: 50, fat: 6, fibre: 8 });
  });

  test('deleting the final history ingredient removes the empty meal and day', async ({ page }) => {
    const today = await page.evaluate(() => localDateStr());
    await seedLog(page, {
      [today]: {
        meals: [mealFixture({
          ingredients: [{ id: 1, name: 'Oats', weight: 80, kcal: 300, protein: 10, carbs: 50, fat: 6, fibre: 8 }],
          totals: { kcal: 300, protein: 10, carbs: 50, fat: 6, fibre: 8 }
        })],
        totals: { kcal: 300, protein: 10, carbs: 50, fat: 6, fibre: 8 }
      }
    });

    page.once('dialog', dialog => dialog.accept());
    await page.evaluate(todayKey => deleteHistoryIngredient(todayKey, 0, 0), today);

    const log = await snapshotLog(page);
    expect(log[today]).toBeUndefined();
  });

  test('deleting a history meal recalculates day totals and keeps other meals', async ({ page }) => {
    const today = await page.evaluate(() => localDateStr());
    await seedLog(page, {
      [today]: {
        meals: [
          mealFixture({ id: 1, name: 'Breakfast plate' }),
          mealFixture({
            id: 2,
            name: 'Dinner plate',
            section: 'dinner',
            ingredients: [{ id: 3, name: 'Rice', weight: 100, kcal: 130, protein: 2.7, carbs: 28, fat: 0.3, fibre: 0.4 }],
            totals: { kcal: 130, protein: 2.7, carbs: 28, fat: 0.3, fibre: 0.4 }
          })
        ],
        totals: { kcal: 537, protein: 14, carbs: 105, fat: 6.7, fibre: 11.5 }
      }
    });

    page.once('dialog', dialog => dialog.accept());
    await page.evaluate(todayKey => deleteHistoryMeal(todayKey, 0), today);

    const log = await snapshotLog(page);
    expect(log[today].meals.map(meal => meal.name)).toEqual(['Dinner plate']);
    expect(log[today].totals).toEqual({ kcal: 130, protein: 2.7, carbs: 28, fat: 0.3, fibre: 0.4 });
  });

  test('changing a history meal section persists only the section', async ({ page }) => {
    const today = await page.evaluate(() => localDateStr());
    await seedLog(page, {
      [today]: {
        meals: [mealFixture({ id: 5, section: 'breakfast' })],
        totals: { kcal: 407, protein: 11.3, carbs: 77, fat: 6.4, fibre: 11.1 }
      }
    });

    await page.evaluate(todayKey => changeHistoryMealSection(todayKey, 0, 'dinner'), today);

    const log = await snapshotLog(page);
    expect(log[today].meals[0].section).toBe('dinner');
    expect(log[today].meals[0].ingredients.map(item => item.name)).toEqual(['Oats', 'Banana']);
    expect(log[today].totals).toEqual({ kcal: 407, protein: 11.3, carbs: 77, fat: 6.4, fibre: 11.1 });
  });

  test('history render escapes meal and ingredient names', async ({ page }) => {
    const today = await page.evaluate(() => localDateStr());
    await seedLog(page, {
      [today]: {
        meals: [mealFixture({
          name: '<img src=x onerror=alert(1)>',
          ingredients: [{ id: 1, name: '<script>alert(1)</script>', weight: 10, kcal: 1, protein: 0, carbs: 0, fat: 0, fibre: 0 }],
          totals: { kcal: 1, protein: 0, carbs: 0, fat: 0, fibre: 0 }
        })],
        totals: { kcal: 1, protein: 0, carbs: 0, fat: 0, fibre: 0 }
      }
    });

    await page.locator('.tab[data-tab="history"]').click();
    await expect(page.locator('#hist-meals-list')).toContainText('<img src=x onerror=alert(1)>');
    await expect(page.locator('#hist-meals-list')).toContainText('<script>alert(1)</script>');
    await expect(page.locator('#hist-meals-list img')).toHaveCount(0);
    await expect(page.locator('#hist-meals-list script')).toHaveCount(0);
  });

  test('home delete removes the final meal day instead of leaving empty log shells', async ({ page }) => {
    const today = await page.evaluate(() => localDateStr());
    await seedLog(page, {
      [today]: {
        meals: [mealFixture({ id: 909 })],
        totals: { kcal: 407, protein: 11.3, carbs: 77, fat: 6.4, fibre: 11.1 }
      }
    });

    const log = await page.evaluate(() => {
      selectedLogDate = localDateStr();
      deleteMealFromHome(909);
      return getLog();
    });

    expect(log[today]).toBeUndefined();
  });

  test('corrupt log storage is treated as empty and can be overwritten by the next save', async ({ page }) => {
    const result = await page.evaluate(() => {
      localStorage.setItem('sous_log', '{bad json');
      const before = getLog();
      switchTab('log', { fresh: true, silent: true, section: 'snacks' });
      addIngredientToMeal({ name: 'Banana', weight: 120, kcal: 107, protein: 1.3, carbs: 27, fat: 0.4, fibre: 3.1 }, { source: 'test' });
      saveMealToLog(false);
      return { before, after: getLog() };
    });

    expect(result.before).toEqual({});
    const savedMeals = Object.values(result.after).flatMap(day => day.meals || []);
    expect(savedMeals).toHaveLength(1);
    expect(savedMeals[0].ingredients.map(item => item.name)).toEqual(['Banana']);
  });

  test('editing history with blank ingredient name is rejected without changing storage', async ({ page }) => {
    const today = await page.evaluate(() => localDateStr());
    await seedLog(page, {
      [today]: {
        meals: [mealFixture()],
        totals: { kcal: 407, protein: 11.3, carbs: 77, fat: 6.4, fibre: 11.1 }
      }
    });

    await page.locator('.tab[data-tab="history"]').click();
    await page.evaluate(todayKey => openHistoryIngredientEdit(todayKey, 0, 0), today);
    await page.locator('#hist-edit-name').fill('');
    await page.locator('#hist-edit-save-btn').click();

    const log = await snapshotLog(page);
    expect(log[today].meals[0].ingredients[0].name).toBe('Oats');
    await expect(page.locator('#hist-edit-modal')).toBeVisible();
  });
});
