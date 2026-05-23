const { test, expect } = require('@playwright/test');
const {
  findConsumablePresetByText,
  getConsumablePresets,
  resolveConsumablePresetQuantity,
  createConsumablePresetRow,
  createCustomConsumableEstimate
} = require('../js/consumable-presets.js');

test('matches prosecco preset from direct and natural text', () => {
  expect(findConsumablePresetByText('prosecco')?.name).toBe('prosecco 125ml');
  expect(findConsumablePresetByText('glass of prosecco')?.name).toBe('prosecco 125ml');
});

test('matches common drink aliases', () => {
  expect(findConsumablePresetByText('diet coke')?.name).toBe('diet cola 330ml');
  expect(findConsumablePresetByText('gin and slimline tonic')?.name).toBe('gin and slimline tonic');
});

test('matches beer can wording as a preset', () => {
  expect(findConsumablePresetByText('can of beer')?.id).toBe('beer-can-330ml');
  expect(findConsumablePresetByText('2 cans of beer')?.id).toBe('beer-can-330ml');
  expect(findConsumablePresetByText('two cans of beer')?.id).toBe('beer-can-330ml');
  expect(findConsumablePresetByText('2 beers')?.id).toBe('beer-can-330ml');
});

test('extracts obvious consumable preset quantities', () => {
  const beer = findConsumablePresetByText('can of beer');
  const prosecco = findConsumablePresetByText('glass of prosecco');

  expect(resolveConsumablePresetQuantity('can of beer', beer)).toMatchObject({ quantity: 1 });
  expect(resolveConsumablePresetQuantity('2 cans of beer', beer)).toMatchObject({
    quantity: 2,
    servingLabel: '2 cans'
  });
  expect(resolveConsumablePresetQuantity('two cans of beer', beer)).toMatchObject({
    quantity: 2,
    servingLabel: '2 cans'
  });
  expect(resolveConsumablePresetQuantity('2 beers', beer)).toMatchObject({
    quantity: 2,
    servingLabel: '2 beers'
  });
  expect(resolveConsumablePresetQuantity('two beers', beer)).toMatchObject({
    quantity: 2,
    servingLabel: '2 beers'
  });
  expect(resolveConsumablePresetQuantity('glass of prosecco', prosecco)).toMatchObject({ quantity: 1 });
  expect(resolveConsumablePresetQuantity('3 glasses of prosecco', prosecco)).toMatchObject({
    quantity: 3,
    servingLabel: '3 glasses'
  });
  expect(resolveConsumablePresetQuantity('prosecco with dinner', prosecco)).toMatchObject({ quantity: 1 });
});

test('server menu reservations multiply preset macros before subtracting remaining macros', () => {
  const { _test } = require('../server.js');
  const reserved = _test.resolveReservedConsumables('dinner options under 900 calories total with highest protein possible. 2 cans of beer already reserved.');

  expect(reserved[0]).toMatchObject({
    presetId: 'beer-can-330ml',
    name: 'Beer Can 330ml × 2',
    reservedQuantity: 2,
    servingLabel: '2 cans',
    kcal: 284,
    protein: 3.4,
    carbs: 23.2,
    fat: 0
  });
  expect(_test.remainingAfterMenuRows({ kcal: 3032, protein: 0, carbs: 0, fat: 0 }, reserved).kcal).toBe(2748);
});

test('menu OCR guard preserves likely real dish names over fake fuzzy corrections', () => {
  const { _test } = require('../server.js');
  const result = _test.validateMenuOcrName({
    menuText: 'Shakshuka',
    suggestedName: 'shakeplate',
    confidence: 'low'
  });

  expect(result.displayName).toBe('Shakshuka');
  expect(result.confidence).toBe('low');
  expect(result.ocr).toMatchObject({
    originalText: 'Shakshuka',
    correctedText: 'shakeplate',
    correctionPreserved: true,
    correctionRejected: true,
    lowConfidence: true
  });
});

test('menu OCR guard keeps cuisine-specific dish names in menu mode', () => {
  const { _test } = require('../server.js');
  const terms = [
    'shakshuka',
    'bibimbap',
    'chilaquiles',
    'arepa reina pepiada',
    'huevos rancheros',
    'croque madame',
    'crème brûlée',
    'pho',
    'shakshuka with eggs'
  ];

  for (const term of terms) {
    const result = _test.validateMenuOcrName({
      menuText: term,
      suggestedName: term,
      confidence: 'low'
    });
    expect(result.displayName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')).toBe(
      term.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    );
    expect(result.ocr.correctionPreserved).toBe(true);
  }
});

test('menu OCR guard rejects invented fake dish names', () => {
  const { _test } = require('../server.js');
  for (const fakeName of ['shakeplate', 'eggcano', 'toastbucket', 'ricewhip']) {
    const result = _test.validateMenuOcrName({
      menuText: fakeName,
      suggestedName: fakeName,
      confidence: 'low'
    });
    expect(result.displayName).toBe('Unclear menu item');
    expect(result.ocr.correctionRejected).toBe(true);
    expect(result.ocr.lowConfidence).toBe(true);
  }
});

test('server menu scan normalisation replaces rejected fake row names and exposes OCR metadata', () => {
  const { _test } = require('../server.js');
  const result = _test.normaliseMenuScanResult({
    requestSummary: 'Dinner',
    customReservedItems: [],
    suggestions: [{
      id: 'menu_1',
      menuText: 'Shakshuka',
      suggestedName: 'shakeplate',
      rank: 1,
      fitScore: 70,
      confidence: 'low',
      reason: 'Good fit.',
      portionAssumptions: 'One restaurant portion.',
      warnings: [],
      estimate: {
        kcal: { low: 350, likely: 450, high: 550 },
        protein: { low: 15, likely: 22, high: 30 },
        carbs: { low: 20, likely: 30, high: 40 },
        fat: { low: 15, likely: 24, high: 32 }
      },
      rows: [{
        name: 'shakeplate',
        quantity: 1,
        unit: 'serving',
        kcal: 450,
        protein: 22,
        carbs: 30,
        fat: 24,
        source: 'menu_scan'
      }]
    }]
  }, {
    requestText: 'Dinner',
    remainingBefore: { kcal: 800, protein: 50, carbs: 80, fat: 30 },
    reservedItems: []
  });

  expect(result.suggestions[0].suggestedName).toBe('Shakshuka');
  expect(result.suggestions[0].rows[0].name).toBe('Shakshuka');
  expect(result.suggestions[0].confidence).toBe('low');
  expect(result.suggestions[0].ocr).toMatchObject({
    correctionPreserved: true,
    correctionRejected: true,
    lowConfidence: true
  });
  expect(result.suggestions[0].warnings[0]).toContain('Low confidence menu read');
});

test('unknown consumable text returns null', () => {
  expect(findConsumablePresetByText('truffle risotto')).toBeNull();
});

test('matched presets are cloned and cannot mutate source presets', () => {
  const matched = findConsumablePresetByText('prosecco');
  matched.name = 'mutated prosecco';
  matched.aliases.push('mutated alias');

  const fresh = findConsumablePresetByText('prosecco');
  expect(fresh.name).toBe('prosecco 125ml');
  expect(fresh.aliases).not.toContain('mutated alias');

  const source = getConsumablePresets().find(item => item.id === 'prosecco-125ml');
  expect(source.name).toBe('prosecco 125ml');
});

test('converts a preset into a meal/photo review row shape', () => {
  const preset = findConsumablePresetByText('diet coke');
  const row = createConsumablePresetRow(preset);

  expect(row).toMatchObject({
    presetId: 'diet-cola-330ml',
    name: 'diet cola 330ml',
    quantity: 330,
    unit: 'ml',
    calories: 1,
    kcal: 1,
    protein: 0,
    carbs: 0,
    fat: 0,
    source: 'consumable_preset',
    editable: true,
    loggable: true,
    reservable: true
  });
});

test('custom consumable estimates use low-confidence AI estimate metadata', () => {
  const custom = createCustomConsumableEstimate({
    name: 'dessert wine',
    kcal: 120,
    quantity: 75,
    unit: 'ml'
  });

  expect(custom).toMatchObject({
    name: 'dessert wine',
    defaultQuantity: 75,
    defaultUnit: 'ml',
    kcal: 120,
    protein: 0,
    carbs: 0,
    fat: 0,
    source: 'consumable_ai_estimate',
    confidence: 'low',
    editable: true,
    loggable: true,
    reservable: true
  });
});
