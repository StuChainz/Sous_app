const { test, expect } = require('@playwright/test');

async function boot(page) {
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('sous_onboarding_seen', '1');
    window.BarcodeDetector = class {};
    window.BarcodeDetector.getSupportedFormats = async () => ['ean_13'];
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: async () => { throw new Error('camera disabled in test'); } }
    });
  });
  await page.goto('/');
  await page.evaluate(() => {
    window.__barcodeAdds = [];
    window.addIngredientToMeal = item => window.__barcodeAdds.push(item);
  });
}

async function lookupBarcode(page, code) {
  await page.evaluate(() => window.openBarcodeScanner());
  await expect(page.locator('#barcode-manual-panel')).toBeVisible();
  await page.locator('#barcode-manual-input').fill(code);
  await page.locator('#barcode-manual-lookup-btn').click();
}

test('barcode serving kcal is not multiplied as per-gram nutrition', async ({ page }) => {
  await boot(page);
  await page.route('**/api/barcode/1234567890123', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      barcode: '1234567890123',
      name: 'Chicken wrap',
      brand: 'Test',
      quantity: '1 wrap',
      servingGrams: null,
      defaultAmount: 1,
      servingBasis: 'perServing',
      source: 'openfoodfacts',
      sourceId: 'off:1234567890123',
      nutritionPer100g: { calories: null, protein: null, carbs: null, fat: null, fibre: null },
      nutritionPerServing: { calories: 370, protein: 27, carbs: 38, fat: 12, fibre: 4 },
      diagnostics: {
        barcode: '1234567890123',
        source: 'openfoodfacts',
        rawNutritionFields: { 'energy-kcal_value': 370 },
        normalizedNutritionFields: { nutritionPerServing: { calories: 370, protein: 27, carbs: 38, fat: 12, fibre: 4 } },
        servingBasis: 'perServing',
        sanityWarnings: []
      },
      type: 'solid'
    })
  }));

  await lookupBarcode(page, '1234567890123');

  await expect(page.locator('#barcode-review-panel')).toBeVisible();
  await expect(page.locator('#barcode-kcal')).toHaveValue('370');
  await expect(page.locator('#barcode-product-name')).toHaveValue('Chicken wrap');
  await expect.poll(() => page.evaluate(() => window.__barcodeAdds.length)).toBe(0);

  await page.locator('#barcode-add-btn').click();
  const item = await page.evaluate(() => window.__barcodeAdds[0]);
  expect(item.kcal).toBe(370);
  expect(item.kcal).toBeLessThan(2000);
});

test('barcode impossible kcal per 100g is flagged before add', async ({ page }) => {
  await boot(page);
  await page.route('**/api/barcode/999999', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      barcode: '999999',
      name: 'Extreme bar',
      servingGrams: 100,
      defaultAmount: 100,
      servingBasis: 'per100g',
      source: 'openfoodfacts',
      sourceId: 'off:999999',
      nutritionPer100g: { calories: 950, protein: 10, carbs: 20, fat: 40, fibre: 0 },
      diagnostics: {
        barcode: '999999',
        source: 'openfoodfacts',
        rawNutritionFields: { 'energy-kcal_100g': 950 },
        normalizedNutritionFields: { nutritionPer100g: { calories: 950, protein: 10, carbs: 20, fat: 40, fibre: 0 } },
        servingBasis: 'per100g',
        sanityWarnings: ['kcal_per_100g_over_900']
      },
      type: 'solid'
    })
  }));

  await lookupBarcode(page, '999999');

  await expect(page.locator('#barcode-warning')).toContainText('Calories per 100g look unusually high.');
  await page.locator('#barcode-add-btn').click();
  await expect(page.locator('#barcode-status')).toContainText('tap Add again to confirm');
  await expect.poll(() => page.evaluate(() => window.__barcodeAdds.length)).toBe(0);
});

test('barcode not found shows manual fallback and links custom food to barcode', async ({ page }) => {
  await boot(page);
  await page.route('**/api/barcode/222222', route => route.fulfill({
    status: 404,
    contentType: 'application/json',
    body: JSON.stringify({ error: 'Product not found.', barcode: '222222' })
  }));

  await lookupBarcode(page, '222222');

  await expect(page.locator('#barcode-status')).toContainText('Not found — add manually');
  await expect(page.locator('#barcode-review-panel')).toBeVisible();
  await page.locator('#barcode-product-name').fill('Custom crackers');
  await page.locator('#barcode-serving-grams').fill('50');
  await page.locator('#barcode-kcal').fill('210');
  await page.locator('#barcode-protein').fill('5');
  await page.locator('#barcode-carbs').fill('32');
  await page.locator('#barcode-fat').fill('7');
  await page.locator('#barcode-add-btn').click();

  const result = await page.evaluate(() => ({
    item: window.__barcodeAdds[0],
    custom: JSON.parse(localStorage.getItem('userCustomFoods') || '[]')[0]
  }));
  expect(result.item).toEqual(expect.objectContaining({ name: 'Custom crackers', kcal: 210, barcode: '222222' }));
  expect(result.custom).toEqual(expect.objectContaining({ name: 'Custom crackers', barcode: '222222' }));

  await lookupBarcode(page, '222222');

  await expect(page.locator('#barcode-product-name')).toHaveValue('Custom crackers');
  await expect(page.locator('#barcode-serving-grams')).toHaveValue('50');
  await expect(page.locator('#barcode-kcal')).toHaveValue('210');
});

test('backend barcode normalization keeps per-serving data separate from per-100g data', () => {
  const { _test } = require('../server.js');
  const product = _test.normaliseBarcodeProduct('1234567890123', {
    product_name: 'Chicken wrap',
    quantity: '1 wrap',
    serving_size: '1 wrap',
    serving_quantity: 1,
    serving_quantity_unit: 'serving',
    nutrition_data_per: 'serving',
    nutriments: {
      'energy-kcal_value': 370,
      proteins_value: 27,
      carbohydrates_value: 38,
      fat_value: 12
    }
  });

  expect(product.servingBasis).toBe('perServing');
  expect(product.nutritionPerServing.calories).toBe(370);
  expect(product.nutritionPer100g.calories).toBeNull();
  expect(product.diagnostics.rawNutritionFields['energy-kcal_value']).toBe(370);
  expect(product.diagnostics.normalizedNutritionFields.defaultTotal.calories).toBe(370);
});
