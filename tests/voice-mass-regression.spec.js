const { test, expect } = require('@playwright/test');

test.setTimeout(180000);

const DEFAULT_FORBIDDEN_STATES = [
  'processingListeningConflict',
  'stuckProcessing',
  'duplicateRecognizerState',
  'silentScreenMove'
];

function makeScenario(overrides) {
  return {
    name: overrides.name,
    startingState: {
      section: 'breakfast',
      seedUtterances: [],
      ...(overrides.startingState || {})
    },
    utterances: overrides.utterances || [],
    expectedUiResult: {
      allowedScreens: null,
      visibleTextIncludesAny: [],
      savedMealCount: null,
      ...(overrides.expectedUiResult || {})
    },
    expectedVoicePromptResult: {
      requiredEventTypes: ['transcript received'],
      anyEventTypes: ['parser result', 'clarification shown', 'ingredient row added', 'voice feedback requested', 'error/fallback shown'],
      promptIncludesAny: [],
      ...(overrides.expectedVoicePromptResult || {})
    },
    expectedMealIngredients: {
      contains: [],
      exactCounts: null,
      minCount: null,
      maxCount: null,
      ...(overrides.expectedMealIngredients || {})
    },
    expectedReviewIngredients: {
      contains: [],
      minRows: null,
      ...(overrides.expectedReviewIngredients || {})
    },
    forbiddenStates: overrides.forbiddenStates || DEFAULT_FORBIDDEN_STATES,
    expectedFinalVoiceSessionState: {
      sessionActive: true,
      allowedStates: ['listening', 'restarting'],
      processing: false,
      noConflict: true,
      ...(overrides.expectedFinalVoiceSessionState || {})
    },
    interactions: {
      quantity: 'default',
      review: 'commit',
      saveSummary: false,
      ...(overrides.interactions || {})
    }
  };
}

const weightedFoods = [
  ['Oats', 'oats', [30, 50, 75]],
  ['Oats', 'porridge oats', [40, 60]],
  ['Cheddar', 'cheddar', [20, 30, 50]],
  ['Banana', 'banana', [80, 120]],
  ['Egg', 'egg', [50, 100]],
  ['White bread', 'white bread', [40, 80]],
  ['Whole milk', 'whole milk', [100, 200]],
  ['Oat milk', 'oat milk', [100, 200]],
  ['Black beans', 'black beans', [80, 120]],
  ['Soy sauce', 'soy sauce', [10, 15]],
  ['Chicken breast', 'chicken breast', [100, 150]],
  ['Full fat Greek yoghurt', 'full fat greek yoghurt', [50, 100]],
  ['Fat free Greek yoghurt', 'fat free greek yoghurt', [50, 100]],
  ['Protein powder', 'protein powder', [25, 30]],
  ['Protein powder', 'whey', [25, 30]]
];

const weightedScenarios = weightedFoods.flatMap(([expectedName, spokenName, weights]) =>
  weights.flatMap(weight => [
    makeScenario({
      name: `${weight}g ${spokenName}`,
      utterances: [`${weight}g ${spokenName}`],
      expectedMealIngredients: { contains: [expectedName], minCount: 1 },
      expectedVoicePromptResult: { requiredEventTypes: ['transcript received', 'parser result', 'ingredient row added'] }
    }),
    makeScenario({
      name: `add ${weight} grams ${spokenName}`,
      utterances: [`add ${weight} grams ${spokenName}`],
      expectedMealIngredients: { contains: [expectedName], minCount: 1 },
      expectedVoicePromptResult: { requiredEventTypes: ['transcript received', 'parser result', 'ingredient row added'] }
    })
  ])
);

const defaultQuantityScenarios = [
  ['banana', 'Banana'],
  ['one banana', 'Banana'],
  ['porridge oats', 'Oats'],
  ['toast', 'Bread'],
  ['two eggs', 'Egg'],
  ['black beans', 'Black beans'],
  ['soy sauce', 'Soy sauce'],
  ['whey', 'Protein powder'],
  ['protein powder', 'Protein powder'],
  ['white bread', 'White bread'],
  ['whole milk', 'Whole milk'],
  ['oat milk', 'Oat milk']
].map(([utterance, expectedName]) => makeScenario({
  name: `default quantity: ${utterance}`,
  utterances: [utterance],
  expectedMealIngredients: { contains: [expectedName], minCount: 1 },
  expectedVoicePromptResult: { requiredEventTypes: ['transcript received', 'parser result', 'ingredient row added'] }
}));

const reviewScenarios = [
  {
    utterance: 'oats banana whey',
    contains: ['Oats', 'Banana', 'Protein powder'],
    rows: 3
  },
  {
    utterance: 'black beans and soy sauce',
    contains: ['Black beans', 'Soy sauce'],
    rows: 2
  },
  {
    utterance: 'two eggs and toast',
    contains: ['Egg', 'Bread'],
    reviewContains: ['Bread'],
    rows: 1
  },
  {
    utterance: 'banana cheddar whey',
    contains: ['Banana', 'Cheddar', 'Protein powder'],
    rows: 3
  },
  {
    utterance: 'oats and soy sauce',
    contains: ['Oats', 'Soy sauce'],
    rows: 2
  },
  {
    utterance: 'white bread and banana',
    contains: ['White bread', 'Banana'],
    rows: 2
  },
  {
    utterance: 'whole milk and oats',
    contains: ['Whole milk', 'Oats'],
    rows: 2
  },
  {
    utterance: 'oat milk and protein powder',
    contains: ['Oat milk', 'Protein powder'],
    rows: 2
  },
  {
    utterance: 'chicken breast and black beans',
    contains: ['Chicken breast', 'Black beans'],
    rows: 2
  },
  {
    utterance: 'cheddar banana oats',
    contains: ['Cheddar', 'Banana', 'Oats'],
    rows: 3
  }
].map(({ utterance, contains, reviewContains, rows }) => makeScenario({
  name: `review flow: ${utterance}`,
  utterances: [utterance],
  expectedReviewIngredients: { contains: reviewContains || contains, minRows: rows },
  expectedMealIngredients: { contains, minCount: contains.length },
  expectedVoicePromptResult: { requiredEventTypes: ['transcript received', 'parser result', 'ingredient row added'] }
}));

const promptAndClarificationScenarios = [
  makeScenario({
    name: 'mandatory oats regression prompt',
    utterances: ['oats'],
    interactions: { quantity: 'none', review: 'none' },
    expectedUiResult: { allowedScreens: ['ls-quantity', 'ls-food-choice', 'ls-confirm', 'ls-listening'] },
    expectedVoicePromptResult: {
      requiredEventTypes: ['transcript received', 'parser result'],
      anyEventTypes: ['clarification shown', 'voice feedback requested', 'ingredient row added']
    },
    expectedMealIngredients: { contains: [] },
    forbiddenStates: [
      'recognizedTranscriptWithDidntCatch',
      'noVoiceOrPromptEvent',
      'processingListeningConflict',
      'stuckProcessing',
      'duplicateRecognizerState',
      'silentScreenMove'
    ]
  }),
  makeScenario({
    name: 'cheese clarification to cheddar',
    utterances: ['cheese', 'cheddar 30g'],
    expectedMealIngredients: { contains: ['Cheddar'], minCount: 1 },
    expectedVoicePromptResult: { requiredEventTypes: ['transcript received', 'clarification shown', 'parser result', 'ingredient row added'] }
  }),
  makeScenario({
    name: 'greek yoghurt asks for type or resolves',
    utterances: ['greek yoghurt'],
    interactions: { quantity: 'none', review: 'none' },
    expectedUiResult: { allowedScreens: ['ls-listening', 'ls-multi-confirm', 'ls-food-choice'] },
    expectedVoicePromptResult: { requiredEventTypes: ['transcript received', 'parser result'], anyEventTypes: ['clarification shown', 'voice feedback requested'] }
  }),
  makeScenario({
    name: 'milk asks for type or resolves',
    utterances: ['milk'],
    interactions: { quantity: 'none', review: 'none' },
    expectedUiResult: { allowedScreens: ['ls-listening', 'ls-multi-confirm', 'ls-food-choice'] },
    expectedVoicePromptResult: { requiredEventTypes: ['transcript received', 'parser result'], anyEventTypes: ['clarification shown', 'voice feedback requested'] }
  }),
  makeScenario({
    name: 'bread yoghurt review stays explainable',
    utterances: ['bread yoghurt'],
    interactions: { review: 'none' },
    expectedUiResult: { allowedScreens: ['ls-multi-confirm'] },
    expectedReviewIngredients: { contains: ['Bread', 'Greek yoghurt'], minRows: 2 },
    expectedVoicePromptResult: { requiredEventTypes: ['transcript received', 'parser result'] }
  }),
  makeScenario({
    name: 'chicken and sauce does not silently fail',
    utterances: ['chicken and sauce'],
    interactions: { quantity: 'none', review: 'none' },
    expectedVoicePromptResult: { requiredEventTypes: ['transcript received'], anyEventTypes: ['clarification shown', 'voice feedback requested', 'error/fallback shown'] }
  }),
  makeScenario({
    name: 'chicken unknown sauce does not silently fail',
    utterances: ['chicken something unknown sauce'],
    interactions: { quantity: 'none', review: 'none' },
    expectedVoicePromptResult: { requiredEventTypes: ['transcript received'], anyEventTypes: ['clarification shown', 'voice feedback requested', 'error/fallback shown'] }
  }),
  makeScenario({
    name: 'soy source repair',
    utterances: ['15g soy source'],
    expectedMealIngredients: { contains: ['Soy sauce'], minCount: 1 },
    expectedVoicePromptResult: { requiredEventTypes: ['transcript received', 'parser result', 'ingredient row added'] }
  })
];

const correctionScenarios = [
  makeScenario({
    name: 'delete oats removes seeded oats',
    startingState: { seedUtterances: ['50g oats'] },
    utterances: ['delete oats'],
    expectedMealIngredients: { maxCount: 0 },
    expectedVoicePromptResult: { requiredEventTypes: ['transcript received', 'parser result'] }
  }),
  makeScenario({
    name: 'remove oats removes seeded oats',
    startingState: { seedUtterances: ['50g oats'] },
    utterances: ['remove oats'],
    expectedMealIngredients: { maxCount: 0 },
    expectedVoicePromptResult: { requiredEventTypes: ['transcript received', 'parser result'] }
  }),
  makeScenario({
    name: 'undo that removes last add',
    startingState: { seedUtterances: ['50g oats', '30g cheddar'] },
    utterances: ['undo that'],
    expectedMealIngredients: { exactCounts: { Oats: 1, Cheddar: 0 } },
    expectedVoicePromptResult: { requiredEventTypes: ['transcript received', 'parser result'] }
  }),
  makeScenario({
    name: 'change that to 150g updates last ingredient',
    startingState: { seedUtterances: ['50g oats'] },
    utterances: ['change that to 150g'],
    expectedMealIngredients: { exactCounts: { Oats: 1 }, contains: ['Oats'] },
    expectedVoicePromptResult: { requiredEventTypes: ['transcript received', 'parser result'] }
  }),
  makeScenario({
    name: 'actually make that 150 grams updates last ingredient',
    startingState: { seedUtterances: ['30g cheddar'] },
    utterances: ['actually make that 150 grams'],
    expectedMealIngredients: { exactCounts: { Cheddar: 1 }, contains: ['Cheddar'] },
    expectedVoicePromptResult: { requiredEventTypes: ['transcript received', 'parser result'] }
  }),
  makeScenario({
    name: 'clear this meal empties seeded meal',
    startingState: { seedUtterances: ['50g oats', '30g cheddar'] },
    utterances: ['clear this meal'],
    expectedMealIngredients: { maxCount: 0 },
    expectedVoicePromptResult: { requiredEventTypes: ['transcript received', 'parser result'] }
  }),
  makeScenario({
    name: 'finish meal opens summary',
    startingState: { seedUtterances: ['50g oats'] },
    utterances: ['finish meal'],
    interactions: { saveSummary: false },
    expectedUiResult: { allowedScreens: ['ls-summary'] },
    expectedMealIngredients: { contains: ['Oats'], minCount: 1 },
    expectedFinalVoiceSessionState: { sessionActive: false, allowedStates: ['idle'], processing: false, noConflict: true }
  }),
  makeScenario({
    name: 'finish then save meal',
    startingState: { seedUtterances: ['50g oats', '30g cheddar'] },
    utterances: ['finish meal'],
    interactions: { saveSummary: true },
    expectedUiResult: { allowedScreens: ['ls-summary'], savedMealCount: 1 },
    expectedMealIngredients: { contains: ['Oats', 'Cheddar'], minCount: 2 },
    expectedFinalVoiceSessionState: { sessionActive: false, allowedStates: ['idle'], processing: false, noConflict: true }
  }),
  makeScenario({
    name: 'save meal utterance falls back without stuck state',
    startingState: { seedUtterances: ['50g oats'] },
    utterances: ['save meal'],
    expectedVoicePromptResult: { requiredEventTypes: ['transcript received', 'parser result'], anyEventTypes: ['error/fallback shown', 'voice feedback requested'] },
    forbiddenStates: ['processingListeningConflict', 'stuckProcessing', 'duplicateRecognizerState']
  }),
  makeScenario({
    name: 'repeated same utterance twice quickly',
    utterances: ['cheddar 30g', 'cheddar 30g'],
    expectedMealIngredients: { exactCounts: { Cheddar: 2 }, minCount: 2 },
    expectedVoicePromptResult: { requiredEventTypes: ['transcript received', 'parser result', 'ingredient row added'] }
  })
];

const fallbackScenarios = [
  '',
  '   ',
  'random nonsense',
  'purple cloud spoon',
  'add the thing from yesterday',
  'sauce unknown unknown',
  'delete spaceship',
  'make that enormous',
  'save meal',
  'this is not food'
].map((utterance, index) => makeScenario({
  name: `fallback/no-op ${index + 1}: ${utterance || 'empty transcript'}`,
  utterances: [utterance],
  expectedVoicePromptResult: {
    requiredEventTypes: ['transcript received'],
    anyEventTypes: utterance.trim() ? ['parser result', 'error/fallback shown', 'voice feedback requested'] : ['error/fallback shown', 'session restarted']
  },
  expectedMealIngredients: { maxCount: 0 },
  forbiddenStates: ['processingListeningConflict', 'stuckProcessing', 'duplicateRecognizerState']
}));

const scenarios = [
  ...weightedScenarios,
  ...defaultQuantityScenarios,
  ...reviewScenarios,
  ...promptAndClarificationScenarios,
  ...correctionScenarios,
  ...fallbackScenarios
];

function namesFromMeal(meal) {
  return meal.map(item => item.name);
}

function countByName(meal) {
  return meal.reduce((counts, item) => {
    counts[item.name] = (counts[item.name] || 0) + 1;
    return counts;
  }, {});
}

function groupMatches(name, expected) {
  const options = Array.isArray(expected) ? expected : [expected];
  return options.some(option => name === option || name.toLowerCase().includes(String(option).toLowerCase()));
}

function assertContainsGroups(actualNames, expectedGroups, label) {
  for (const expected of expectedGroups || []) {
    if (!actualNames.some(name => groupMatches(name, expected))) {
      throw new Error(`${label}: missing ${Array.isArray(expected) ? expected.join(' or ') : expected}; got ${actualNames.join(', ') || 'none'}`);
    }
  }
}

async function resetAppForScenario(page, scenario) {
  await page.goto('/?sousVoiceTest=1');
  await page.waitForFunction(() => typeof window.__sousStartVoiceTestSession === 'function');
  await page.evaluate(section => window.__sousStartVoiceTestSession(section), scenario.startingState.section);
  await page.waitForFunction(() => window.__sousVoiceState().state === 'listening');
  for (const seed of scenario.startingState.seedUtterances) {
    await sendAndSettle(page, seed, { quantity: 'default', review: 'commit' });
  }
}

async function snapshot(page) {
  return page.evaluate(() => ({
    state: window.__sousVoiceState(),
    events: window.__sousLastVoiceEvents(),
    visibleText: document.body.innerText,
    reviewRows: Array.from(document.querySelectorAll('#mc-list > div')).map(card => card.innerText),
    savedMealCount: Object.values(JSON.parse(localStorage.getItem('sous_log') || '{}')).flatMap(day => day.meals || []).length
  }));
}

async function waitUntilNotProcessing(page) {
  await expect.poll(
    () => page.evaluate(() => window.__sousVoiceState().processing),
    { timeout: 3000, intervals: [50, 100, 150, 250] }
  ).toBe(false);
}

async function assertNoProcessingConflict(page) {
  const state = await page.evaluate(() => window.__sousVoiceState());
  if (state.processing && (state.recognizerActive || state.voiceCurrentlyListening || state.isRecording)) {
    throw new Error(`processing/listening conflict: ${JSON.stringify(state)}`);
  }
  if (state.tapRecStarting && state.tapRecStopping) {
    throw new Error(`duplicate recognizer start/stop state: ${JSON.stringify(state)}`);
  }
}

async function applyInteractions(page, interactions) {
  for (let i = 0; i < 4; i++) {
    const state = await page.evaluate(() => window.__sousVoiceState());
    if (state.activeScreen === 'ls-quantity' && interactions.quantity === 'default') {
      await page.locator('#qty-default-btn').click();
      await waitUntilNotProcessing(page);
      continue;
    }
    if (state.activeScreen === 'ls-multi-confirm' && interactions.review === 'commit') {
      await page.locator('#mc-add-btn').click();
      await waitUntilNotProcessing(page);
      continue;
    }
    break;
  }
  if (interactions.saveSummary) {
    const state = await page.evaluate(() => window.__sousVoiceState());
    if (state.activeScreen === 'ls-summary') {
      await page.locator('#save-meal-btn').click();
    }
  }
}

async function sendAndSettle(page, utterance, interactions) {
  await page.evaluate(text => window.__sousTestVoiceTranscript(text), utterance);
  await waitUntilNotProcessing(page);
  await assertNoProcessingConflict(page);
  await applyInteractions(page, interactions);
  await assertNoProcessingConflict(page);
}

function validateScenarioResult(scenario, result) {
  const { state, events, visibleText, reviewRows, savedMealCount } = result;
  const eventTypes = events.map(event => event.type);
  const mealNames = namesFromMeal(state.meal);
  const reviewText = reviewRows.join('\n');
  const lowerVisible = visibleText.toLowerCase();
  const lastTranscript = [...scenario.utterances].reverse().find(text => String(text || '').trim());
  const recognizedTranscriptVisible = lastTranscript && state.transcriptText.toLowerCase().includes(String(lastTranscript).trim().toLowerCase());

  for (const type of scenario.expectedVoicePromptResult.requiredEventTypes) {
    if (!eventTypes.includes(type)) throw new Error(`missing event "${type}"; got ${eventTypes.join(', ') || 'none'}`);
  }
  if (scenario.expectedVoicePromptResult.anyEventTypes.length && !scenario.expectedVoicePromptResult.anyEventTypes.some(type => eventTypes.includes(type))) {
    throw new Error(`missing any expected voice/prompt event ${scenario.expectedVoicePromptResult.anyEventTypes.join(', ')}; got ${eventTypes.join(', ') || 'none'}`);
  }
  if (scenario.expectedVoicePromptResult.promptIncludesAny.length) {
    const prompts = events.map(event => event.prompt || event.key || '').join('\n').toLowerCase();
    if (!scenario.expectedVoicePromptResult.promptIncludesAny.some(text => prompts.includes(text.toLowerCase()) || lowerVisible.includes(text.toLowerCase()))) {
      throw new Error(`missing expected prompt text; wanted one of ${scenario.expectedVoicePromptResult.promptIncludesAny.join(', ')}`);
    }
  }

  if (scenario.expectedUiResult.allowedScreens && !scenario.expectedUiResult.allowedScreens.includes(state.activeScreen)) {
    throw new Error(`expected screen ${scenario.expectedUiResult.allowedScreens.join(' or ')}, got ${state.activeScreen}`);
  }
  if (scenario.expectedUiResult.visibleTextIncludesAny.length && !scenario.expectedUiResult.visibleTextIncludesAny.some(text => lowerVisible.includes(text.toLowerCase()))) {
    throw new Error(`missing expected UI text; wanted one of ${scenario.expectedUiResult.visibleTextIncludesAny.join(', ')}`);
  }
  if (scenario.expectedUiResult.savedMealCount !== null && savedMealCount !== scenario.expectedUiResult.savedMealCount) {
    throw new Error(`expected saved meal count ${scenario.expectedUiResult.savedMealCount}, got ${savedMealCount}`);
  }

  assertContainsGroups(mealNames, scenario.expectedMealIngredients.contains, 'meal');
  if (scenario.expectedMealIngredients.minCount !== null && state.meal.length < scenario.expectedMealIngredients.minCount) {
    throw new Error(`expected at least ${scenario.expectedMealIngredients.minCount} meal ingredients, got ${state.meal.length}`);
  }
  if (scenario.expectedMealIngredients.maxCount !== null && state.meal.length > scenario.expectedMealIngredients.maxCount) {
    throw new Error(`expected at most ${scenario.expectedMealIngredients.maxCount} meal ingredients, got ${state.meal.length}`);
  }
  if (scenario.expectedMealIngredients.exactCounts) {
    const counts = countByName(state.meal);
    for (const [name, count] of Object.entries(scenario.expectedMealIngredients.exactCounts)) {
      if ((counts[name] || 0) !== count) throw new Error(`expected ${count} ${name}, got ${counts[name] || 0}`);
    }
  }

  assertContainsGroups(reviewRows, scenario.expectedReviewIngredients.contains, 'review');
  if (scenario.expectedReviewIngredients.minRows !== null && reviewRows.length < scenario.expectedReviewIngredients.minRows) {
    throw new Error(`expected at least ${scenario.expectedReviewIngredients.minRows} review rows, got ${reviewRows.length}: ${reviewText}`);
  }

  if (scenario.expectedFinalVoiceSessionState.sessionActive !== null && state.sessionActive !== scenario.expectedFinalVoiceSessionState.sessionActive) {
    throw new Error(`expected sessionActive=${scenario.expectedFinalVoiceSessionState.sessionActive}, got ${state.sessionActive}`);
  }
  if (scenario.expectedFinalVoiceSessionState.allowedStates && !scenario.expectedFinalVoiceSessionState.allowedStates.includes(state.state)) {
    throw new Error(`expected final state ${scenario.expectedFinalVoiceSessionState.allowedStates.join(' or ')}, got ${state.state}`);
  }
  if (scenario.expectedFinalVoiceSessionState.processing === false && state.processing) {
    throw new Error('app stuck processing');
  }
  if (scenario.expectedFinalVoiceSessionState.noConflict && state.processing && state.recognizerActive) {
    throw new Error('processing/listening conflict at final state');
  }

  for (const forbidden of scenario.forbiddenStates) {
    if (forbidden === 'recognizedTranscriptWithDidntCatch' && recognizedTranscriptVisible && lowerVisible.includes("didn't catch")) {
      throw new Error(`forbidden contradiction: transcript "${lastTranscript}" visible with "didn't catch"`);
    }
    if (forbidden === 'noVoiceOrPromptEvent' && !['parser result', 'clarification shown', 'ingredient row added', 'voice feedback requested', 'error/fallback shown'].some(type => eventTypes.includes(type))) {
      throw new Error('no voice/prompt event was recorded');
    }
    if (forbidden === 'silentScreenMove' && state.activeScreen !== 'ls-listening' && !['parser result', 'clarification shown', 'ingredient row added', 'voice feedback requested', 'error/fallback shown'].some(type => eventTypes.includes(type))) {
      throw new Error(`screen moved to ${state.activeScreen} without explanatory event`);
    }
    if (forbidden === 'processingListeningConflict' && state.processing && state.recognizerActive) {
      throw new Error('processing/listening conflict');
    }
    if (forbidden === 'stuckProcessing' && state.processing) {
      throw new Error('stuck processing');
    }
    if (forbidden === 'duplicateRecognizerState' && state.tapRecStarting && state.tapRecStopping) {
      throw new Error('duplicate recognizer start/stop state');
    }
  }
}

test('mass simulated voice regression scenarios', async ({ page }) => {
  expect(scenarios.length).toBeGreaterThanOrEqual(100);
  const consoleErrors = [];
  await page.route('**/favicon.ico', route => route.fulfill({ status: 204, body: '' }));
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('userPlan', 'free');
    localStorage.setItem('sous_voice_feedback', '0');
    localStorage.setItem('sous_voice_test_harness', '1');
  });
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  const results = [];
  for (const scenario of scenarios) {
    const started = Date.now();
    try {
      await resetAppForScenario(page, scenario);
      for (const utterance of scenario.utterances) {
        await sendAndSettle(page, utterance, scenario.interactions);
      }
      const result = await snapshot(page);
      validateScenarioResult(scenario, result);
      results.push({
        name: scenario.name,
        ok: true,
        ms: Date.now() - started,
        screen: result.state.activeScreen,
        meal: namesFromMeal(result.state.meal),
        events: result.events.map(event => event.type)
      });
    } catch (error) {
      const result = await snapshot(page).catch(() => null);
      results.push({
        name: scenario.name,
        ok: false,
        ms: Date.now() - started,
        error: error.message,
        screen: result?.state?.activeScreen || null,
        state: result?.state || null,
        meal: result?.state ? namesFromMeal(result.state.meal) : [],
        events: result?.events?.map(event => event.type) || [],
        visibleText: result?.visibleText?.slice(0, 700) || ''
      });
    }
  }

  const failed = results.filter(result => !result.ok);
  if (failed.length || consoleErrors.length) {
    console.log(JSON.stringify({ scenarioCount: scenarios.length, failed, consoleErrors }, null, 2));
  } else {
    console.log(`Voice mass regression passed ${scenarios.length} scenarios.`);
  }
  expect(consoleErrors, 'console errors').toEqual([]);
  expect(failed, 'failed voice scenarios').toEqual([]);
});
