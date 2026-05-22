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
      silentMode: true,
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

function dateOffset(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function testIngredient(name, weight = 100) {
  return {
    name,
    weight,
    kcal: Math.round(weight),
    protein: Math.round(weight / 10),
    carbs: Math.round(weight / 8),
    fat: Math.round(weight / 20),
    fibre: 0
  };
}

class VoiceInvariantError extends Error {
  constructor(invariant, message, details = {}) {
    super(`${invariant}: ${message}`);
    this.invariant = invariant;
    this.details = details;
  }
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

const recognitionRepairScenarios = [
  makeScenario({
    name: 'speech repair: soy source',
    utterances: ['soy source'],
    expectedMealIngredients: { contains: ['Soy sauce'], minCount: 1 },
    expectedVoicePromptResult: { requiredEventTypes: ['transcript received', 'parser result', 'ingredient row added'] }
  }),
  makeScenario({
    name: 'speech repair: 30 grams way',
    utterances: ['30 grams way'],
    expectedMealIngredients: { contains: ['Protein powder'], minCount: 1 },
    expectedVoicePromptResult: { requiredEventTypes: ['transcript received', 'parser result', 'ingredient row added'] }
  }),
  makeScenario({
    name: 'review clarification: chicken rice and weigh then typed spoken details',
    utterances: ['chicken rice and weigh', 'chicken thighs 75g and white rice 100g'],
    interactions: { quantity: 'none', review: 'none' },
    expectedUiResult: { allowedScreens: ['ls-multi-confirm'] },
    expectedReviewIngredients: { contains: ['Chicken thigh', 'White rice'], minRows: 2 },
    expectedVoicePromptResult: {
      requiredEventTypes: ['transcript received', 'parser result', 'clarification shown'],
      anyEventTypes: ['voice feedback requested', 'silent_mode_skipped_feedback'],
      promptIncludesAny: ['What type and how much?']
    }
  }),
  makeScenario({
    name: 'speech repair: semi skimmed milk 200 millilitres',
    utterances: ['semi skimmed milk 200 millilitres'],
    expectedMealIngredients: { contains: ['Milk'], minCount: 1 },
    expectedVoicePromptResult: { requiredEventTypes: ['transcript received', 'parser result', 'ingredient row added'] }
  }),
  makeScenario({
    name: 'connector tail: oats and',
    utterances: ['oats and'],
    interactions: { quantity: 'none', review: 'none' },
    expectedUiResult: { allowedScreens: ['ls-listening', 'ls-quantity', 'ls-food-choice', 'ls-confirm'] },
    expectedMealIngredients: { maxCount: 0 },
    expectedVoicePromptResult: {
      requiredEventTypes: ['transcript received', 'parser result'],
      anyEventTypes: ['clarification shown', 'voice feedback requested', 'silent_mode_skipped_feedback']
    }
  }),
  makeScenario({
    name: 'connector phrase: oats with banana',
    utterances: ['oats with banana'],
    expectedMealIngredients: { contains: ['Oats', 'Banana'], minCount: 2 },
    expectedVoicePromptResult: { requiredEventTypes: ['transcript received', 'parser result', 'ingredient row added'] }
  }),
  makeScenario({
    name: 'multi ingredient exact: two eggs and toast',
    utterances: ['two eggs and toast'],
    expectedMealIngredients: { contains: ['Egg', 'Bread'], minCount: 2 },
    expectedVoicePromptResult: { requiredEventTypes: ['transcript received', 'parser result', 'ingredient row added'] }
  })
];

const promptAndClarificationScenarios = [
  makeScenario({
    name: 'A fresh voice meal oats prompt ownership',
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
    name: 'B oats repeated quickly stays separate turns',
    utterances: ['oats', 'oats'],
    interactions: { quantity: 'none', review: 'none' },
    expectedUiResult: { allowedScreens: ['ls-quantity', 'ls-food-choice', 'ls-confirm', 'ls-listening'] },
    expectedVoicePromptResult: {
      requiredEventTypes: ['transcript received', 'transcript_turn_started', 'transcript_accepted', 'outcome_decided'],
      anyEventTypes: ['clarification shown', 'voice feedback requested', 'silent_mode_skipped_feedback']
    },
    forbiddenStates: [
      'recognizedTranscriptWithDidntCatch',
      'processingListeningConflict',
      'stuckProcessing',
      'duplicateRecognizerState'
    ]
  }),
  makeScenario({
    name: 'D cheese clarification to cheddar',
    utterances: ['cheese', 'cheddar 30g'],
    expectedMealIngredients: { contains: ['Cheddar'], minCount: 1 },
    expectedVoicePromptResult: { requiredEventTypes: ['transcript received', 'clarification shown', 'parser result', 'ingredient row added'] }
  }),
  makeScenario({
    name: 'E oats quantity answer resolves pending item',
    utterances: ['oats', '50g'],
    interactions: { quantity: 'none', review: 'commit' },
    expectedMealIngredients: { contains: ['Oats'], minCount: 1 },
    expectedVoicePromptResult: {
      requiredEventTypes: ['transcript received', 'transcript_turn_started', 'transcript_accepted', 'outcome_decided'],
      anyEventTypes: ['clarification shown', 'voice feedback requested', 'silent_mode_skipped_feedback', 'ingredient row added']
    },
    forbiddenStates: [
      'recognizedTranscriptWithDidntCatch',
      'processingListeningConflict',
      'stuckProcessing',
      'duplicateRecognizerState',
      'silentScreenMove'
    ]
  }),
  makeScenario({
    name: 'F silent mode oats records skipped feedback',
    startingState: { silentMode: true },
    utterances: ['oats'],
    interactions: { quantity: 'none', review: 'none' },
    expectedUiResult: { allowedScreens: ['ls-quantity', 'ls-food-choice', 'ls-confirm', 'ls-listening'] },
    expectedVoicePromptResult: {
      requiredEventTypes: ['transcript received', 'transcript_accepted', 'silent_mode_skipped_feedback'],
      anyEventTypes: ['clarification shown', 'silent_mode_skipped_feedback']
    },
    forbiddenStates: [
      'recognizedTranscriptWithDidntCatch',
      'processingListeningConflict',
      'stuckProcessing',
      'duplicateRecognizerState'
    ]
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
    name: 'remove the milk removes seeded milk',
    startingState: { seedUtterances: ['200ml milk'] },
    utterances: ['remove the milk'],
    expectedMealIngredients: { maxCount: 0 },
    expectedVoicePromptResult: { requiredEventTypes: ['transcript received'], anyEventTypes: ['voice feedback requested', 'silent_mode_skipped_feedback'] }
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
    name: 'change that to 150 grams updates last ingredient',
    startingState: { seedUtterances: ['50g oats'] },
    utterances: ['change that to 150 grams'],
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
    name: 'actually make that 50 grams updates last ingredient',
    startingState: { seedUtterances: ['30g cheddar'] },
    utterances: ['actually make that 50 grams'],
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
    expectedVoicePromptResult: { requiredEventTypes: ['transcript received'], anyEventTypes: ['error/fallback shown', 'voice feedback requested', 'silent_mode_skipped_feedback'] },
    forbiddenStates: ['processingListeningConflict', 'stuckProcessing', 'duplicateRecognizerState']
  }),
  makeScenario({
    name: 'repeated same utterance twice quickly',
    utterances: ['cheddar 30g', 'cheddar 30g'],
    expectedMealIngredients: { exactCounts: { Cheddar: 2 }, minCount: 2 },
    expectedVoicePromptResult: { requiredEventTypes: ['transcript received', 'parser result', 'ingredient row added'] }
  })
];

const memoryScenarios = [
  makeScenario({
    name: 'memory repeat same lunch uses last local meal',
    startingState: {
      section: 'lunch',
      log: {
        [dateOffset(-2)]: {
          meals: [{
            id: 'history_lunch_1',
            name: 'Rice lunch',
            section: 'lunch',
            time: `${dateOffset(-2)}T12:30:00.000Z`,
            ingredients: [testIngredient('White rice', 150), testIngredient('Chicken breast', 120)]
          }]
        }
      }
    },
    utterances: ['same lunch'],
    expectedMealIngredients: { contains: ['White rice', 'Chicken breast'], minCount: 2 },
    expectedVoicePromptResult: { requiredEventTypes: ['transcript received', 'parser result', 'ingredient row added'] }
  }),
  makeScenario({
    name: 'memory usual breakfast uses local usual meal',
    startingState: {
      section: 'breakfast',
      usualMeals: {
        breakfast: [{
          id: 'usual_breakfast_1',
          name: 'Usual oats',
          section: 'breakfast',
          useCount: 4,
          lastUsed: Date.now(),
          ingredients: [testIngredient('Oats', 50), testIngredient('Banana', 100)]
        }]
      }
    },
    utterances: ['usual breakfast'],
    expectedMealIngredients: { contains: ['Oats', 'Banana'], minCount: 2 },
    expectedVoicePromptResult: { requiredEventTypes: ['transcript received', 'parser result', 'ingredient row added'] }
  }),
  makeScenario({
    name: 'memory same as yesterday with one meal copies local history',
    startingState: {
      section: 'dinner',
      log: {
        [dateOffset(-1)]: {
          meals: [{
            id: 'history_yesterday_1',
            name: 'Yesterday dinner',
            section: 'dinner',
            time: `${dateOffset(-1)}T19:00:00.000Z`,
            ingredients: [testIngredient('Cheddar', 30)]
          }]
        }
      }
    },
    utterances: ['same as yesterday'],
    expectedMealIngredients: { contains: ['Cheddar'], minCount: 1 },
    expectedVoicePromptResult: { requiredEventTypes: ['transcript received', 'parser result', 'ingredient row added'] }
  }),
  makeScenario({
    name: 'memory no usual match stays no-op',
    startingState: { section: 'breakfast', usualMeals: { breakfast: [] } },
    utterances: ['usual breakfast'],
    expectedMealIngredients: { maxCount: 0 },
    expectedVoicePromptResult: { requiredEventTypes: ['transcript received', 'parser result'], anyEventTypes: ['voice feedback requested', 'error/fallback shown', 'silent_mode_skipped_feedback'] },
    forbiddenStates: ['processingListeningConflict', 'stuckProcessing', 'duplicateRecognizerState']
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
  ...recognitionRepairScenarios,
  ...promptAndClarificationScenarios,
  ...correctionScenarios,
  ...memoryScenarios,
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

function eventText(event) {
  return [
    event.type,
    event.event,
    event.transcript,
    event.prompt,
    event.key,
    event.reason,
    event.outcome,
    event.screen
  ].filter(Boolean).join(' ').toLowerCase();
}

function compactEvents(events) {
  return events.map(event => ({
    type: event.type,
    event: event.event,
    turnId: event.turnId,
    transcript: event.transcript,
    key: event.key,
    route: event.route,
    reason: event.reason,
    outcome: event.outcome,
    screen: event.screen,
    item: event.item
  }));
}

function failInvariant(name, message, scenario, result, turnId = null, utterance = null, events = result.events) {
  throw new VoiceInvariantError(name, message, {
    scenario: scenario.name,
    turnId,
    utterance,
    expectedInvariant: name,
    actualTraceEvents: compactEvents(events),
    visibleUiText: result.visibleText,
    mealRows: namesFromMeal(result.state.meal),
    reviewRows: result.reviewRows,
    voiceState: result.state
  });
}

function assertVoiceInvariants(scenario, result) {
  const { events, visibleText, state } = result;
  const acceptedTurns = events.filter(event => event.type === 'transcript_accepted');
  const lowerVisible = visibleText.toLowerCase();
  const feedbackTypes = new Set([
    'voice_feedback_requested',
    'voice_feedback_played',
    'voice_feedback_blocked',
    'silent_mode_skipped_feedback'
  ]);

  for (const accepted of acceptedTurns) {
    const turnId = accepted.turnId;
    const utterance = accepted.transcript;
    const turnEvents = events.filter(event => event.turnId === turnId);
    const outcomes = turnEvents.filter(event => event.type === 'outcome_decided');
    if (outcomes.length !== 1) {
      failInvariant('Every accepted transcript has exactly one outcome', `expected 1 outcome, got ${outcomes.length}`, scenario, result, turnId, utterance, turnEvents);
    }

    const sameTurnCatch = turnEvents.some(event =>
      ['error/fallback shown', 'ui_updated'].includes(event.type) &&
      /didn'?t catch/.test(eventText(event))
    );
    if (sameTurnCatch && lowerVisible.includes(String(utterance || '').toLowerCase())) {
      failInvariant('No accepted transcript may later show generic did not catch for same turn', 'recognized transcript and generic fallback co-exist', scenario, result, turnId, utterance, turnEvents);
    }

    const feedbackPathIndex = turnEvents.findIndex(event => feedbackTypes.has(event.type));
    if (feedbackPathIndex < 0) {
      failInvariant('Accepted transcript records feedback path', 'missing requested/played/blocked/silent feedback event', scenario, result, turnId, utterance, turnEvents);
    }

    const promptEvent = turnEvents.find(event =>
      event.type === 'clarification shown' ||
      /clarify|quantity|fallback|recovery|didn'?t catch|how much/.test(eventText(event))
    );
    if (promptEvent && feedbackPathIndex < 0) {
      failInvariant('Prompts record voice or silent feedback', 'prompt appeared without feedback path', scenario, result, turnId, utterance, turnEvents);
    }

    const restartIndex = turnEvents.findIndex(event => event.type === 'session_restart_requested' || event.type === 'session_restart_completed');
    if (restartIndex >= 0 && feedbackPathIndex >= 0 && restartIndex < feedbackPathIndex) {
      failInvariant('Listening does not restart before feedback path', 'restart was recorded before feedback was requested/played/skipped', scenario, result, turnId, utterance, turnEvents);
    }

    const added = turnEvents.filter(event => event.type === 'ingredient row added');
    const addedKeys = added.map(event => {
      const item = event.item || {};
      return `${item.name || event.prompt || 'unknown'}:${item.weight || ''}`;
    });
    const duplicateAdded = addedKeys.find((key, index) => addedKeys.indexOf(key) !== index);
    if (duplicateAdded) {
      failInvariant('No duplicate ingredient rows from one transcript turn', `duplicate added row ${duplicateAdded}`, scenario, result, turnId, utterance, turnEvents);
    }
  }

  const staleFallbacks = events.filter(event => event.type === 'fallback_timer_ignored_stale_turn');
  for (const stale of staleFallbacks) {
    const staleIndex = events.indexOf(stale);
    const nextUi = events.slice(staleIndex + 1).find(event => event.type === 'ui_updated' && event.turnId === stale.turnId);
    if (nextUi && /didn'?t catch|recovery/.test(eventText(nextUi))) {
      failInvariant('Stale fallback timers do not update UI', 'stale fallback produced recovery UI', scenario, result, stale.turnId, stale.transcript, events.slice(staleIndex, staleIndex + 8));
    }
  }

  if (state.processing && (state.recognizerActive || state.voiceCurrentlyListening || state.isRecording)) {
    failInvariant('No processing/listening conflict', 'processing and listening flags are both active', scenario, result);
  }
  if (state.tapRecStarting && state.tapRecStopping) {
    failInvariant('No duplicate recogniser/session states', 'tap recognizer is both starting and stopping', scenario, result);
  }

  const completed = events.filter(event => event.type === 'session_restart_completed');
  for (let i = 1; i < completed.length; i++) {
    const prev = completed[i - 1];
    const current = completed[i];
    if (prev.turnId === current.turnId && Math.abs(new Date(current.t || 0) - new Date(prev.t || 0)) < 20) {
      failInvariant('No duplicate recogniser/session states', 'duplicate restart completion for one turn', scenario, result, current.turnId, current.transcript, [prev, current]);
    }
  }
}

async function resetAppForScenario(page, scenario) {
  await page.goto('/?sousVoiceTest=1');
  await page.waitForFunction(() => typeof window.__sousStartVoiceTestSession === 'function');
  await page.evaluate(({ silentMode, log, usualMeals }) => {
    localStorage.removeItem('sous_log');
    localStorage.removeItem('sous_usual_meals');
    if (log) localStorage.setItem('sous_log', JSON.stringify(log));
    if (usualMeals) localStorage.setItem('sous_usual_meals', JSON.stringify(usualMeals));
    localStorage.setItem('sous_voice_feedback', silentMode ? '0' : '1');
  }, {
    silentMode: scenario.startingState.silentMode !== false,
    log: scenario.startingState.log || null,
    usualMeals: scenario.startingState.usualMeals || null
  });
  await page.evaluate(section => window.__sousStartVoiceTestSession(section), scenario.startingState.section);
  await page.waitForFunction(() => window.__sousVoiceState().state === 'listening');
  for (const seed of scenario.startingState.seedUtterances) {
    await sendAndSettle(page, seed, { quantity: 'default', review: 'commit' });
  }
  return page.evaluate(() => window.__sousLastVoiceEvents().length);
}

async function snapshot(page, eventOffset = 0) {
  return page.evaluate(() => ({
    state: window.__sousVoiceState(),
    events: window.__sousLastVoiceEvents(),
    debugTrace: window.sousVoiceDebug ? window.sousVoiceDebug() : [],
    visibleText: document.body.innerText,
    reviewRows: Array.from(document.querySelectorAll('#mc-list > div')).map(card => card.innerText),
    savedMealCount: Object.values(JSON.parse(localStorage.getItem('sous_log') || '{}')).flatMap(day => day.meals || []).length
  })).then(result => ({
    ...result,
    events: result.events.slice(eventOffset)
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

async function assertVoiceLoopSane(page) {
  await assertNoProcessingConflict(page);
  const state = await page.evaluate(() => window.__sousVoiceState());
  expect(['listening', 'restarting', 'speaking'].includes(state.state), `voice state: ${JSON.stringify(state)}`).toBe(true);
  const activeMockRecognizers = await page.evaluate(() => window.__mockVoiceStats?.active || 0);
  expect(activeMockRecognizers).toBeLessThanOrEqual(1);
}

async function waitForVoiceLoopToRecover(page) {
  await expect.poll(
    () => page.evaluate(() => {
      const state = window.__sousVoiceState();
      return !state.processing && ['listening', 'restarting'].includes(state.state);
    }),
    { timeout: 5000, intervals: [50, 100, 200, 350] }
  ).toBe(true);
  await expect.poll(
    () => page.evaluate(() => window.__mockVoiceStats?.active || 0),
    { timeout: 3000, intervals: [50, 100, 200] }
  ).toBeLessThanOrEqual(1);
  await assertVoiceLoopSane(page);
}

async function waitForNextMockRecognizer(page, previousCount) {
  await expect.poll(
    () => page.evaluate(() => (window.__mockRecognizers || []).length),
    { timeout: 5000, intervals: [50, 100, 200] }
  ).toBeGreaterThan(previousCount);
  await expect.poll(
    () => page.evaluate(() => window.__sousVoiceState().state),
    { timeout: 5000, intervals: [50, 100, 200] }
  ).toBe('listening');
}

async function setupMockVoiceLifecyclePage(page, { silentMode = true } = {}) {
  await page.route('**/favicon.ico', route => route.fulfill({ status: 204, body: '' }));
  await page.addInitScript(({ silentMode }) => {
    localStorage.clear();
    localStorage.setItem('userPlan', 'free');
    localStorage.setItem('sous_onboarding_seen', '1');
    localStorage.setItem('sous_voice_feedback', silentMode ? '0' : '1');
    localStorage.setItem('sous_voice_test_harness', '1');
    navigator.mediaDevices = {
      getUserMedia: async () => ({
        getTracks: () => [{ stop() {} }]
      })
    };
    window.__mockVoiceStats = { active: 0, starts: 0, ends: 0, stops: 0, aborts: 0, audioPlays: 0, tts: 0 };
    class MockAudio {
      constructor() {
        this.onended = null;
        this.onplaying = null;
        this.onerror = null;
        this.src = '';
      }
      play() {
        window.__mockVoiceStats.audioPlays += 1;
        setTimeout(() => {
          if (this.onplaying) this.onplaying();
          if (this.onended) this.onended();
        }, 0);
        return Promise.resolve();
      }
      pause() {}
    }
    window.Audio = MockAudio;
    window.SpeechSynthesisUtterance = function SpeechSynthesisUtterance(text) {
      this.text = text;
    };
    window.speechSynthesis = {
      speaking: false,
      cancel() {},
      getVoices() { return []; },
      speak(utterance) {
        window.__mockVoiceStats.tts += 1;
        this.speaking = true;
        setTimeout(() => {
          if (utterance.onstart) utterance.onstart();
          this.speaking = false;
          if (utterance.onend) utterance.onend();
        }, 0);
      }
    };
    class MockSpeechRecognition {
      constructor() {
        this.onstart = null;
        this.onend = null;
        this.onerror = null;
        this.onresult = null;
        this.onsoundstart = null;
        this.onspeechstart = null;
        this.onspeechend = null;
        this.onsoundend = null;
        this.onnomatch = null;
        this._active = false;
        this._ended = false;
        window.__mockRecognizers = window.__mockRecognizers || [];
        window.__mockRecognizers.push(this);
      }
      start() {
        if (this._active) throw new DOMException('Recognition already started', 'InvalidStateError');
        this._active = true;
        this._ended = false;
        window.__mockVoiceStats.active += 1;
        window.__mockVoiceStats.starts += 1;
        setTimeout(() => this.onstart && this.onstart(), 0);
      }
      __finish() {
        if (this._ended) return;
        this._ended = true;
        if (this._active) {
          this._active = false;
          window.__mockVoiceStats.active = Math.max(0, window.__mockVoiceStats.active - 1);
        }
        window.__mockVoiceStats.ends += 1;
        setTimeout(() => this.onend && this.onend(), 0);
      }
      stop() {
        window.__mockVoiceStats.stops += 1;
        this.__finish();
      }
      abort() {
        window.__mockVoiceStats.aborts += 1;
        this.__finish();
      }
    }
    window.SpeechRecognition = MockSpeechRecognition;
    window.webkitSpeechRecognition = MockSpeechRecognition;
  }, { silentMode });

  await page.goto('/?sousVoiceTest=1');
  await page.waitForFunction(() => typeof window.__sousStartVoiceTestSession === 'function');
  await page.evaluate(() => {
    switchTab('log', { fresh: true, silent: true, section: 'breakfast' });
    beginVoiceSession();
  });
  await page.waitForFunction(() => (window.__mockRecognizers || []).length > 0);
  await expect.poll(
    () => page.evaluate(() => window.__sousVoiceState().state),
    { timeout: 5000, intervals: [50, 100, 200] }
  ).toBe('listening');
  return page.evaluate(() => window.sousVoiceDebug().length);
}

async function emitMockRecognitionMiss(page, phases = []) {
  await page.evaluate(phases => {
    const rec = window.__mockRecognizers[window.__mockRecognizers.length - 1];
    for (const phase of phases) {
      if (phase === 'soundstart' && rec.onsoundstart) rec.onsoundstart();
      if (phase === 'speechstart' && rec.onspeechstart) rec.onspeechstart();
      if (phase === 'speechend' && rec.onspeechend) rec.onspeechend();
      if (phase === 'soundend' && rec.onsoundend) rec.onsoundend();
      if (phase === 'nomatch' && rec.onnomatch) rec.onnomatch();
      if (phase === 'interim' && rec.onresult) {
        const interim = [{ transcript: 'oa', confidence: 0.35 }];
        interim.isFinal = false;
        rec.onresult({ resultIndex: 0, results: [interim] });
      }
    }
    rec.onerror && rec.onerror({ error: 'no-speech' });
    rec.__finish();
  }, phases);
}

async function emitMockFinalThenNoSpeech(page, transcript) {
  await page.evaluate(transcript => {
    const rec = window.__mockRecognizers[window.__mockRecognizers.length - 1];
    const primary = { transcript, confidence: 0.96 };
    const result = [primary];
    result.isFinal = true;
    rec.onresult({ resultIndex: 0, results: [result] });
    rec.onerror && rec.onerror({ error: 'no-speech' });
    rec.__finish();
  }, transcript);
}

async function emitMockFinal(page, transcript, confidence = 0.96) {
  await page.evaluate(({ transcript, confidence }) => {
    const rec = window.__mockRecognizers[window.__mockRecognizers.length - 1];
    const primary = { transcript, confidence };
    const result = [primary];
    result.isFinal = true;
    rec.onresult({ resultIndex: 0, results: [result] });
    rec.__finish();
  }, { transcript, confidence });
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
  assertVoiceInvariants(scenario, result);
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
    localStorage.setItem('sous_onboarding_seen', '1');
    localStorage.setItem('sous_voice_feedback', '0');
    localStorage.setItem('sous_voice_test_harness', '1');
  });
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  const results = [];
  for (const scenario of scenarios) {
    const started = Date.now();
    let eventOffset = 0;
    try {
      eventOffset = await resetAppForScenario(page, scenario);
      for (const utterance of scenario.utterances) {
        await sendAndSettle(page, utterance, scenario.interactions);
      }
      const result = await snapshot(page, eventOffset);
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
      const result = await snapshot(page, eventOffset).catch(() => null);
      const invariantDetails = error instanceof VoiceInvariantError ? error.details : null;
      results.push({
        name: scenario.name,
        ok: false,
        ms: Date.now() - started,
        error: error.message,
        invariant: error.invariant || null,
        turnId: invariantDetails?.turnId ?? null,
        utterance: invariantDetails?.utterance ?? null,
        expectedInvariant: invariantDetails?.expectedInvariant || null,
        actualTraceEvents: invariantDetails?.actualTraceEvents || null,
        screen: result?.state?.activeScreen || null,
        state: result?.state || null,
        meal: result?.state ? namesFromMeal(result.state.meal) : [],
        reviewRows: result?.reviewRows || [],
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

test('C simulated SpeechRecognition interim then final transcript follows turn invariants', async ({ page }) => {
  await page.route('**/favicon.ico', route => route.fulfill({ status: 204, body: '' }));
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('userPlan', 'free');
    localStorage.setItem('sous_onboarding_seen', '1');
    localStorage.setItem('sous_voice_feedback', '0');
    localStorage.setItem('sous_voice_test_harness', '1');
    navigator.mediaDevices = {
      getUserMedia: async () => ({
        getTracks: () => [{ stop() {} }]
      })
    };
    class MockAudio {
      constructor() {
        this.onended = null;
        this.onplaying = null;
        this.onerror = null;
        this.src = '';
      }
      play() {
        setTimeout(() => {
          if (this.onplaying) this.onplaying();
          if (this.onended) this.onended();
        }, 0);
        return Promise.resolve();
      }
      pause() {}
    }
    window.Audio = MockAudio;
    window.SpeechSynthesisUtterance = function SpeechSynthesisUtterance(text) {
      this.text = text;
    };
    window.speechSynthesis = {
      speaking: false,
      cancel() {},
      getVoices() { return []; },
      speak(utterance) {
        this.speaking = true;
        setTimeout(() => {
          if (utterance.onstart) utterance.onstart();
          this.speaking = false;
          if (utterance.onend) utterance.onend();
        }, 0);
      }
    };
    class MockSpeechRecognition {
      constructor() {
        this.onstart = null;
        this.onend = null;
        this.onerror = null;
        this.onresult = null;
        window.__mockRecognizers = window.__mockRecognizers || [];
        window.__mockRecognizers.push(this);
      }
      start() {
        setTimeout(() => this.onstart && this.onstart(), 0);
      }
      stop() {
        setTimeout(() => this.onend && this.onend(), 0);
      }
      abort() {
        this.stop();
      }
    }
    window.SpeechRecognition = MockSpeechRecognition;
    window.webkitSpeechRecognition = MockSpeechRecognition;
  });

  await page.goto('/?sousVoiceTest=1');
  await page.waitForFunction(() => typeof window.__sousStartVoiceTestSession === 'function');
  await page.evaluate(() => {
    switchTab('log', { fresh: true, silent: true, section: 'breakfast' });
    beginVoiceSession();
  });
  await page.waitForFunction(() => (window.__mockRecognizers || []).length > 0);
  const eventOffset = await page.evaluate(() => window.__sousLastVoiceEvents().length);
  await page.evaluate(() => {
    const rec = window.__mockRecognizers[window.__mockRecognizers.length - 1];
    const interim = [{ transcript: 'oa', confidence: 0.4 }];
    interim.isFinal = false;
    rec.onresult({ resultIndex: 0, results: [interim] });
    const final = [{ transcript: 'oats', confidence: 0.96 }];
    final.isFinal = true;
    rec.onresult({ resultIndex: 0, results: [final] });
  });
  await waitUntilNotProcessing(page);
  await expect.poll(
    () => page.evaluate(() => window.__sousLastVoiceEvents().some(event => event.type === 'transcript_accepted' && event.transcript === 'oats')),
    { timeout: 3000, intervals: [50, 100, 200] }
  ).toBe(true);
  const result = await snapshot(page, eventOffset);
  const scenario = makeScenario({
    name: 'C SpeechRecognition interim partial then final oats',
    utterances: ['oa', 'oats'],
    interactions: { quantity: 'none', review: 'none' },
    expectedUiResult: { allowedScreens: ['ls-quantity', 'ls-food-choice', 'ls-confirm', 'ls-listening'] },
    expectedVoicePromptResult: {
      requiredEventTypes: ['transcript_accepted', 'outcome_decided'],
      anyEventTypes: ['silent_mode_skipped_feedback', 'clarification shown']
    }
  });
  validateScenarioResult(scenario, result);
  expect(result.visibleText.toLowerCase()).not.toContain('"oa"\ndidn\'t catch');
});

test('tap recognizer start stall hard resets and accepts the next run', async ({ page }) => {
  await page.route('**/favicon.ico', route => route.fulfill({ status: 204, body: '' }));
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('userPlan', 'free');
    localStorage.setItem('sous_onboarding_seen', '1');
    localStorage.setItem('sous_voice_feedback', '0');
    localStorage.setItem('sous_voice_test_harness', '1');
    navigator.mediaDevices = {
      getUserMedia: async () => ({
        getTracks: () => [{ stop() {} }]
      })
    };
    class MockAudio {
      constructor() {
        this.onended = null;
        this.onplaying = null;
        this.onerror = null;
        this.src = '';
      }
      play() {
        setTimeout(() => {
          if (this.onplaying) this.onplaying();
          if (this.onended) this.onended();
        }, 0);
        return Promise.resolve();
      }
      pause() {}
    }
    window.Audio = MockAudio;
    window.SpeechSynthesisUtterance = function SpeechSynthesisUtterance(text) {
      this.text = text;
    };
    window.speechSynthesis = {
      speaking: false,
      cancel() {},
      getVoices() { return []; },
      speak(utterance) {
        this.speaking = true;
        setTimeout(() => {
          if (utterance.onstart) utterance.onstart();
          this.speaking = false;
          if (utterance.onend) utterance.onend();
        }, 0);
      }
    };
    class MockSpeechRecognition {
      constructor() {
        this.onstart = null;
        this.onend = null;
        this.onerror = null;
        this.onresult = null;
        window.__mockRecognizers = window.__mockRecognizers || [];
        this.index = window.__mockRecognizers.length;
        window.__mockRecognizers.push(this);
      }
      start() {
        if (this.index === 0) return;
        setTimeout(() => this.onstart && this.onstart(), 0);
      }
      stop() {
        setTimeout(() => this.onend && this.onend(), 0);
      }
      abort() {
        this.stop();
      }
    }
    window.SpeechRecognition = MockSpeechRecognition;
    window.webkitSpeechRecognition = MockSpeechRecognition;
  });

  await page.goto('/?sousVoiceTest=1');
  await page.waitForFunction(() => typeof window.__sousStartVoiceTestSession === 'function');
  await page.evaluate(() => {
    switchTab('log', { fresh: true, silent: true, section: 'breakfast' });
    beginVoiceSession();
  });

  await page.waitForFunction(() => (window.__mockRecognizers || []).length >= 1);
  await expect.poll(
    () => page.evaluate(() => (window.__mockRecognizers || []).length),
    { timeout: 7000, intervals: [100, 250, 500] }
  ).toBeGreaterThanOrEqual(2);
  await expect.poll(
    () => page.evaluate(() => window.__sousVoiceState().state),
    { timeout: 3000, intervals: [50, 100, 200] }
  ).toBe('listening');

  await page.evaluate(() => {
    const rec = window.__mockRecognizers[window.__mockRecognizers.length - 1];
    const final = [{ transcript: 'oats', confidence: 0.96 }];
    final.isFinal = true;
    rec.onresult({ resultIndex: 0, results: [final] });
  });
  await waitUntilNotProcessing(page);

  await expect.poll(
    () => page.evaluate(() => window.__sousLastVoiceEvents().some(event => event.type === 'transcript_accepted' && event.transcript === 'oats')),
    { timeout: 3000, intervals: [50, 100, 200] }
  ).toBe(true);
  const state = await page.evaluate(() => window.__sousVoiceState());
  const trace = await page.evaluate(() => window.sousVoiceDebug());
  expect(state.tapHardResetCount).toBeGreaterThanOrEqual(1);
  expect(trace.some(event => event.event === 'tap_recognizer_hard_reset' && event.reason === 'recognition_start_stalled')).toBe(true);
});

test('pure silence no-speech quietly keeps tap voice session alive', async ({ page }) => {
  const offset = await setupMockVoiceLifecyclePage(page, { silentMode: true });

  for (let i = 0; i < 3; i++) {
    await emitMockRecognitionMiss(page);
    await waitForVoiceLoopToRecover(page);
    await expect.poll(
      () => page.evaluate(() => window.__sousVoiceState().state),
      { timeout: 5000, intervals: [50, 100, 200] }
    ).toBe('listening');
  }

  const result = await snapshot(page);
  const trace = await page.evaluate(offset => window.sousVoiceDebug().slice(offset), offset);
  expect(result.state.sessionActive).toBe(true);
  expect(result.visibleText.toLowerCase()).not.toContain("didn't catch");
  expect(trace.filter(event => event.event === 'recognition_recovery' && event.reason === 'pure_silence').length).toBeGreaterThanOrEqual(3);
  expect(trace.some(event => event.event === 'voice_feedback_requested' && event.key === 'recovery')).toBe(false);
  await assertVoiceLoopSane(page);
});

test('speech without transcript cues once and restarts from recognizer end', async ({ page }) => {
  const offset = await setupMockVoiceLifecyclePage(page, { silentMode: false });

  await emitMockRecognitionMiss(page, ['soundstart', 'speechstart', 'speechend', 'soundend']);
  await waitForVoiceLoopToRecover(page);
  await expect.poll(
    () => page.evaluate(() => window.__sousVoiceState().state),
    { timeout: 5000, intervals: [50, 100, 200] }
  ).toBe('listening');

  const state = await page.evaluate(() => window.__sousVoiceState());
  const trace = await page.evaluate(offset => window.sousVoiceDebug().slice(offset), offset);
  expect(state.sessionActive).toBe(true);
  expect(state.restartCount).toBe(1);
  expect(trace.some(event => event.event === 'recognition_recovery' && event.reason === 'speech_without_transcript')).toBe(true);
  expect(trace.some(event => event.event === 'voice_feedback_requested' && event.key === 'recovery')).toBe(true);
  const recoveryIndex = trace.findIndex(event => event.event === 'recognition_recovery' && event.reason === 'speech_without_transcript');
  const endIndex = trace.findIndex(event => event.event === 'recognizer_end');
  const restartIndex = trace.findIndex(event => event.event === 'session_restart_requested');
  expect(recoveryIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(recoveryIndex);
  expect(restartIndex).toBeGreaterThan(endIndex);
  await assertVoiceLoopSane(page);
});

test('speech-without-transcript recovery cue is throttled', async ({ page }) => {
  const offset = await setupMockVoiceLifecyclePage(page, { silentMode: false });

  for (let i = 0; i < 3; i++) {
    await emitMockRecognitionMiss(page, ['speechstart', 'speechend']);
    await waitForVoiceLoopToRecover(page);
    await expect.poll(
      () => page.evaluate(() => window.__sousVoiceState().state),
      { timeout: 5000, intervals: [50, 100, 200] }
    ).toBe('listening');
  }

  const trace = await page.evaluate(offset => window.sousVoiceDebug().slice(offset), offset);
  const recoveryRequests = trace.filter(event => event.event === 'voice_feedback_requested' && event.key === 'recovery');
  expect(recoveryRequests.length).toBeLessThanOrEqual(1);
  expect(trace.filter(event => event.event === 'recognition_recovery_cue_suppressed').length).toBeGreaterThanOrEqual(1);
  expect(trace.filter(event => event.event === 'recognition_recovery' && event.reason === 'speech_without_transcript').length).toBeGreaterThanOrEqual(3);
  await assertVoiceLoopSane(page);
});

test('silent mode speech-without-transcript traces recovery without audio', async ({ page }) => {
  const offset = await setupMockVoiceLifecyclePage(page, { silentMode: true });

  await emitMockRecognitionMiss(page, ['speechstart', 'speechend']);
  await waitForVoiceLoopToRecover(page);

  const trace = await page.evaluate(offset => window.sousVoiceDebug().slice(offset), offset);
  const stats = await page.evaluate(() => window.__mockVoiceStats);
  expect(trace.some(event => event.event === 'recognition_recovery' && event.reason === 'speech_without_transcript')).toBe(true);
  expect(trace.some(event => event.event === 'silent_mode_skipped_feedback' && event.key === 'recovery')).toBe(true);
  expect(trace.some(event => event.event === 'voice_feedback_requested' && event.key === 'recovery')).toBe(false);
  expect(stats.audioPlays).toBe(0);
  expect(stats.tts).toBe(0);
  await assertVoiceLoopSane(page);
});

test('duplicate final result in one recognizer run logs one ingredient', async ({ page }) => {
  const offset = await setupMockVoiceLifecyclePage(page, { silentMode: true });

  await page.evaluate(() => {
    const rec = window.__mockRecognizers[window.__mockRecognizers.length - 1];
    const final = [{ transcript: 'oats 100 grams', confidence: 0.96 }];
    final.isFinal = true;
    rec.onresult({ resultIndex: 0, results: [final] });
    rec.onresult({ resultIndex: 0, results: [final] });
    rec.__finish();
  });
  await waitUntilNotProcessing(page);
  await expect.poll(
    () => page.evaluate(() => window.__sousVoiceState().meal.filter(item => /oats/i.test(item.name || '')).length),
    { timeout: 5000, intervals: [50, 100, 200] }
  ).toBe(1);

  const trace = await page.evaluate(offset => window.sousVoiceDebug().slice(offset), offset);
  expect(trace.filter(event => event.event === 'transcript_accepted' && event.transcript === 'oats 100 grams').length).toBe(1);
  expect(trace.some(event => event.event === 'duplicate_transcript_ignored')).toBe(true);
});

test('same phrase in separate recognizer runs logs two deliberate ingredients', async ({ page }) => {
  await setupMockVoiceLifecyclePage(page, { silentMode: true });

  await emitMockFinalThenNoSpeech(page, 'oats 100 grams');
  await expect.poll(
    () => page.evaluate(() => window.__sousVoiceState().meal.filter(item => /oats/i.test(item.name || '')).length),
    { timeout: 5000, intervals: [50, 100, 200] }
  ).toBe(1);
  const recognizerCount = await page.evaluate(() => (window.__mockRecognizers || []).length);
  await waitForVoiceLoopToRecover(page);
  await waitForNextMockRecognizer(page, recognizerCount);

  await emitMockFinalThenNoSpeech(page, 'oats 100 grams');
  await waitUntilNotProcessing(page);
  await expect.poll(
    () => page.evaluate(() => window.__sousVoiceState().meal.filter(item => /oats/i.test(item.name || '')).length),
    { timeout: 5000, intervals: [50, 100, 200] }
  ).toBe(2);
});

test('late final from replaced recognizer is ignored as stale', async ({ page }) => {
  const offset = await setupMockVoiceLifecyclePage(page, { silentMode: true });

  const recognizerCount = await page.evaluate(() => {
    window.__oldRecognizer = window.__mockRecognizers[window.__mockRecognizers.length - 1];
    return window.__mockRecognizers.length;
  });
  await emitMockRecognitionMiss(page);
  await waitForVoiceLoopToRecover(page);
  await waitForNextMockRecognizer(page, recognizerCount);

  await page.evaluate(() => {
    const rec = window.__oldRecognizer;
    const final = [{ transcript: 'banana 100 grams', confidence: 0.96 }];
    final.isFinal = true;
    rec.onresult({ resultIndex: 0, results: [final] });
    rec.__finish();
  });

  await expect.poll(
    () => page.evaluate(offset => window.sousVoiceDebug().slice(offset).some(event => event.event === 'stale_callback_ignored' && event.source === 'tap' && event.owner?.recognizerRunId === -1), offset),
    { timeout: 3000, intervals: [50, 100, 200] }
  ).toBe(true);
  expect(await page.evaluate(() => window.__sousVoiceState().meal.filter(item => /banana/i.test(item.name || '')).length)).toBe(0);
});

test('accepted final transcript survives recognizer restart while AI repair is pending', async ({ page }) => {
  await setupMockVoiceLifecyclePage(page, { silentMode: true });
  await page.evaluate(() => {
    window.__repairCalls = 0;
    window.__resolveRepair = null;
    window.repairTranscriptWithAI = () => new Promise(resolve => {
      window.__repairCalls += 1;
      window.__resolveRepair = () => resolve([{ transcript: 'oats 100 grams', score: 0.99, reason: 'test repair' }]);
    });
  });

  await emitMockFinal(page, 'xylophone 100 grams', 0.96);
  await expect.poll(
    () => page.evaluate(() => window.__repairCalls || 0),
    { timeout: 5000, intervals: [50, 100, 200] }
  ).toBe(1);

  await page.evaluate(() => scheduleVoiceSessionRestart(10));
  await expect.poll(
    () => page.evaluate(() => (window.__mockRecognizers || []).length),
    { timeout: 5000, intervals: [50, 100, 200] }
  ).toBeGreaterThanOrEqual(2);

  await page.evaluate(() => window.__resolveRepair && window.__resolveRepair());
  await expect.poll(
    () => page.evaluate(() => window.__sousVoiceState().meal.filter(item => /oats/i.test(item.name || '')).length),
    { timeout: 5000, intervals: [50, 100, 200] }
  ).toBe(1);
});

test('cancelled voice turn resolving late does not mutate meal or UI', async ({ page }) => {
  const offset = await setupMockVoiceLifecyclePage(page, { silentMode: true });
  await page.evaluate(() => {
    window.__repairCalls = 0;
    window.__resolveRepair = null;
    window.repairTranscriptWithAI = () => new Promise(resolve => {
      window.__repairCalls += 1;
      window.__resolveRepair = () => resolve([{ transcript: 'oats 100 grams', score: 0.99, reason: 'test repair' }]);
    });
  });

  await emitMockFinal(page, 'xylophone 100 grams', 0.96);
  await expect.poll(
    () => page.evaluate(() => window.__repairCalls || 0),
    { timeout: 5000, intervals: [50, 100, 200] }
  ).toBe(1);

  await page.evaluate(() => endVoiceSession('Stopped'));
  await page.evaluate(() => window.__resolveRepair && window.__resolveRepair());
  await expect.poll(
    () => page.evaluate(offset => window.sousVoiceDebug().slice(offset).some(event => event.event === 'stale_callback_ignored' && event.reason === 'voice_turn_invalid'), offset),
    { timeout: 3000, intervals: [50, 100, 200] }
  ).toBe(true);
  expect(await page.evaluate(() => window.__sousVoiceState().meal.length)).toBe(0);
  expect(await page.evaluate(() => window.__sousVoiceState().activeScreen)).toBe('ls-listening');
});

test('duplicate ingredient claim is scoped to one voice turn', async ({ page }) => {
  const offset = await setupMockVoiceLifecyclePage(page, { silentMode: true });

  const mealNames = await page.evaluate(() => {
    const owner = voiceOwnerSnapshot({ source: 'voice' });
    const turnId = beginVoiceTranscriptTurn('oats and cheddar', owner);
    const voiceContext = { source: 'voice', sessionId: owner.sessionId, recognizerRunId: owner.recognizerRunId, turnId };
    const makeItem = (name, grams) => {
      const food = findFoodByText(name);
      return { ...foodScale(food, grams), rawFood: food, weightSpecified: true, confidence: 'high', needsConfirm: false };
    };
    const oats = makeItem('oats', 100);
    const cheddar = makeItem('cheddar', 50);
    addIngredientToMeal({ ...oats }, { source: 'voice', applyOverride: true, voiceContext });
    addIngredientToMeal({ ...oats }, { source: 'voice', applyOverride: true, voiceContext });
    addIngredientToMeal({ ...cheddar }, { source: 'voice', applyOverride: true, voiceContext });
    return meal.map(item => item.name);
  });

  expect(mealNames.filter(name => /oats/i.test(name)).length).toBe(1);
  expect(mealNames.filter(name => /cheddar/i.test(name)).length).toBe(1);
  const trace = await page.evaluate(offset => window.sousVoiceDebug().slice(offset), offset);
  expect(trace.some(event => event.event === 'duplicate_ingredient_ignored')).toBe(true);
});

test('final transcript followed by no-speech logs once and avoids fallback', async ({ page }) => {
  const offset = await setupMockVoiceLifecyclePage(page, { silentMode: true });

  await emitMockFinalThenNoSpeech(page, 'oats 100 grams');
  await waitUntilNotProcessing(page);
  await expect.poll(
    () => page.evaluate(() => window.__sousVoiceState().meal.filter(item => /oats/i.test(item.name || '')).length),
    { timeout: 5000, intervals: [50, 100, 200] }
  ).toBe(1);
  await waitForVoiceLoopToRecover(page);

  const result = await snapshot(page);
  const trace = await page.evaluate(offset => window.sousVoiceDebug().slice(offset), offset);
  expect(result.state.meal.filter(item => /oats/i.test(item.name || '')).length).toBe(1);
  expect(result.visibleText.toLowerCase()).not.toContain("didn't catch");
  expect(trace.some(event => event.event === 'recognition_recovery' && event.reason === 'trailing_no_speech_ignored')).toBe(true);
  expect(trace.some(event => event.event === 'ui_updated' && event.reason === 'recognition_recovery')).toBe(false);
  expect(trace.some(event => event.event === 'voice_recovery' && event.reason === 'trailing_no_speech_ignored')).toBe(false);
  await assertVoiceLoopSane(page);
});

test('quantity success feedback owns restart when iOS audio fallback is blocked', async ({ page }) => {
  await page.route('**/favicon.ico', route => route.fulfill({ status: 204, body: '' }));
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('userPlan', 'free');
    localStorage.setItem('sous_onboarding_seen', '1');
    localStorage.setItem('sous_voice_feedback', '0');
    localStorage.setItem('sous_voice_test_harness', '1');
    navigator.mediaDevices = {
      getUserMedia: async () => ({
        getTracks: () => [{ stop() {} }]
      })
    };
    class MockAudio {
      constructor() {
        this.onended = null;
        this.onplaying = null;
        this.onerror = null;
        this.src = '';
      }
      play() {
        return Promise.reject(new Error('blocked'));
      }
      pause() {}
    }
    window.Audio = MockAudio;
    window.SpeechSynthesisUtterance = function SpeechSynthesisUtterance(text) {
      this.text = text;
    };
    window.speechSynthesis = {
      speaking: false,
      cancel() {},
      getVoices() { return []; },
      speak() {}
    };
    class MockSpeechRecognition {
      constructor() {
        this.onstart = null;
        this.onend = null;
        this.onerror = null;
        this.onresult = null;
        window.__mockRecognizers = window.__mockRecognizers || [];
        window.__mockRecognizers.push(this);
      }
      start() {
        setTimeout(() => this.onstart && this.onstart(), 0);
      }
      stop() {
        setTimeout(() => this.onend && this.onend(), 0);
      }
      abort() {
        this.stop();
      }
    }
    window.SpeechRecognition = MockSpeechRecognition;
    window.webkitSpeechRecognition = MockSpeechRecognition;
  });

  await page.goto('/?sousVoiceTest=1');
  await page.waitForFunction(() => typeof window.__sousStartVoiceTestSession === 'function');
  await page.evaluate(() => {
    switchTab('log', { fresh: true, silent: true, section: 'breakfast' });
    beginVoiceSession();
  });
  await page.waitForFunction(() => window.__sousVoiceState().state === 'listening');

  const eventOffset = await page.evaluate(() => {
    const oats = { name: 'Oats', w: 100, kcal: 389, p: 17, c: 66, f: 7, fi: 10, icon: '', type: 'solid' };
    askQuantity({ name: 'Oats', weight: 100, rawFood: oats, weightSpecified: false, confidence: 'high' });
    localStorage.setItem('sous_voice_feedback', '1');
    window.getCachedResponseAsync = async key => (key === 'added' ? 'Added.' : '');
    window.getCachedAudioUrlAsync = async key => (key === 'added' ? 'mock://added.mp3' : null);
    const offset = window.sousVoiceDebug().length;
    commitQuantity(75);
    return offset;
  });

  await expect.poll(
    () => page.evaluate(() => window.sousVoiceDebug().some(event => event.event === 'voice_feedback_blocked' && event.route === 'cached_audio_play_failed')),
    { timeout: 3000, intervals: [50, 100, 200] }
  ).toBe(true);
  await expect.poll(
    () => page.evaluate(() => window.__sousVoiceState().state),
    { timeout: 4000, intervals: [50, 100, 200] }
  ).toBe('listening');

  const trace = await page.evaluate(offset => window.sousVoiceDebug().slice(offset), eventOffset);
  const resolvedIndex = trace.findIndex(event => event.event === 'prompt_owner_cleared' && event.reason === 'quantity_resolved');
  const feedbackIndex = trace.findIndex(event => event.event === 'voice_feedback_requested' && event.key === 'added');
  const restartBeforeFeedbackIndex = trace.findIndex((event, index) =>
    index > resolvedIndex &&
    index < feedbackIndex &&
    event.event === 'session_restart_requested'
  );
  const restartAfterFeedbackIndex = trace.findIndex((event, index) =>
    index > feedbackIndex &&
    event.event === 'session_restart_requested'
  );
  expect(resolvedIndex).toBeGreaterThanOrEqual(0);
  expect(feedbackIndex).toBeGreaterThanOrEqual(0);
  expect(restartBeforeFeedbackIndex).toBe(-1);
  expect(restartAfterFeedbackIndex).toBeGreaterThan(feedbackIndex);
  expect(trace.some(event =>
    (event.event === 'voice_error' && event.error === 'speech_start_timeout') ||
    (event.event === 'voice_feedback_ended' && event.reason === 'speech failed')
  )).toBe(true);
});

test('AI memory intent guardrails require confidence and local refs', async ({ page }) => {
  await page.route('**/favicon.ico', route => route.fulfill({ status: 204, body: '' }));
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('userPlan', 'pro');
    localStorage.setItem('sous_onboarding_seen', '1');
    localStorage.setItem('sous_voice_feedback', '0');
    localStorage.setItem('sous_voice_test_harness', '1');
  });
  await page.goto('/?sousVoiceTest=1');
  await page.waitForFunction(() => typeof window.__sousStartVoiceTestSession === 'function');
  await page.evaluate(({ date, ingredient }) => {
    localStorage.setItem('sous_log', JSON.stringify({
      [date]: {
        meals: [{
          id: 'history_lunch_guard',
          name: 'Lunch',
          section: 'lunch',
          time: `${date}T12:30:00.000Z`,
          ingredients: [ingredient]
        }]
      }
    }));
    window.__sousStartVoiceTestSession('lunch');
  }, { date: dateOffset(-1), ingredient: testIngredient('White rice', 150) });
  await page.waitForFunction(() => window.__sousVoiceState().state === 'listening');

  await page.evaluate(() => {
    window.interpretMealActionWithAI = async () => ({
      type: 'modify_meal_copy',
      confidence: 'low',
      source: { kind: 'history_meal', dateOffset: -1, section: 'lunch' },
      changes: [{ op: 'replace', from: 'White rice', to: 'Potato' }]
    });
  });
  await sendAndSettle(page, 'replace yesterday rice with potato', { quantity: 'none', review: 'none' });
  await expect.poll(
    () => page.evaluate(() => window.sousVoiceDebug().some(event => event.event === 'ai_action_rejected' && event.reason === 'low_confidence')),
    { timeout: 3000, intervals: [50, 100, 200] }
  ).toBe(true);
  expect(await page.evaluate(() => window.__sousVoiceState().meal.length)).toBe(0);

  await page.evaluate(() => {
    window.interpretMealActionWithAI = async () => ({
      type: 'modify_meal_copy',
      confidence: 'high',
      source: null,
      changes: [{ op: 'replace', from: 'White rice', to: 'Potato' }]
    });
  });
  await sendAndSettle(page, 'swap yesterday rice for potato', { quantity: 'none', review: 'none' });
  await expect.poll(
    () => page.evaluate(() => window.sousVoiceDebug().some(event => event.event === 'ai_action_rejected' && event.reason === 'missing_source')),
    { timeout: 3000, intervals: [50, 100, 200] }
  ).toBe(true);
  expect(await page.evaluate(() => window.__sousVoiceState().meal.length)).toBe(0);

  await page.evaluate(() => {
    window.interpretMealActionWithAI = async () => ({
      type: 'modify_meal_copy',
      confidence: 'high',
      source: { kind: 'history_meal', dateOffset: -1, section: 'lunch' },
      changes: [{ op: 'replace', from: 'White rice', to: 'Potato' }]
    });
  });
  await sendAndSettle(page, 'change yesterday rice to potato', { quantity: 'none', review: 'none' });
  const names = await page.evaluate(() => window.__sousVoiceState().meal.map(item => item.name));
  expect(names).toContain('Potato');
  expect(names).not.toContain('White rice');
});

test.fail('warning: direct transcript helper bypasses browser SpeechRecognition lifecycle', async ({ page }) => {
  await page.route('**/favicon.ico', route => route.fulfill({ status: 204, body: '' }));
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('userPlan', 'free');
    localStorage.setItem('sous_onboarding_seen', '1');
    localStorage.setItem('sous_voice_feedback', '0');
    localStorage.setItem('sous_voice_test_harness', '1');
  });
  await page.goto('/?sousVoiceTest=1');
  await page.waitForFunction(() => typeof window.__sousStartVoiceTestSession === 'function');
  await page.evaluate(() => window.__sousStartVoiceTestSession('breakfast'));
  await page.evaluate(() => window.__sousTestVoiceTranscript('oats'));
  await waitUntilNotProcessing(page);
  const bypassed = await page.evaluate(() => window.sousVoiceDebug().some(event => event.event === 'test_helper_bypasses_recognizer'));
  expect(bypassed).toBe(false);
});

test('non-silent voice prompts request audible feedback', async ({ page }) => {
  await page.route('**/favicon.ico', route => route.fulfill({ status: 204, body: '' }));
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('userPlan', 'free');
    localStorage.setItem('sous_onboarding_seen', '1');
    localStorage.setItem('sous_voice_feedback', '1');
    localStorage.setItem('sous_voice_test_harness', '1');
    navigator.mediaDevices = {
      getUserMedia: async () => ({
        getTracks: () => [{ stop() {} }]
      })
    };
    class MockAudio {
      constructor() {
        this.onended = null;
        this.onplaying = null;
        this.onerror = null;
        this.src = '';
      }
      play() {
        setTimeout(() => {
          if (this.onplaying) this.onplaying();
          if (this.onended) this.onended();
        }, 0);
        return Promise.resolve();
      }
      pause() {}
    }
    window.Audio = MockAudio;
    window.SpeechSynthesisUtterance = function SpeechSynthesisUtterance(text) {
      this.text = text;
    };
    window.speechSynthesis = {
      speaking: false,
      cancel() {},
      getVoices() { return []; },
      speak(utterance) {
        this.speaking = true;
        setTimeout(() => {
          if (utterance.onstart) utterance.onstart();
          this.speaking = false;
          if (utterance.onend) utterance.onend();
        }, 0);
      }
    };
    class MockSpeechRecognition {
      constructor() {
        this.onstart = null;
        this.onend = null;
        this.onerror = null;
        this.onresult = null;
        window.__mockRecognizers = window.__mockRecognizers || [];
        window.__mockRecognizers.push(this);
      }
      start() {
        setTimeout(() => this.onstart && this.onstart(), 0);
      }
      stop() {
        setTimeout(() => this.onend && this.onend(), 0);
      }
      abort() {
        this.stop();
      }
    }
    window.SpeechRecognition = MockSpeechRecognition;
    window.webkitSpeechRecognition = MockSpeechRecognition;
  });

  await page.goto('/?sousVoiceTest=1');
  await page.waitForFunction(() => typeof window.__sousStartVoiceTestSession === 'function');

  await page.evaluate(() => {
    switchTab('log', { fresh: true, silent: true, section: 'breakfast' });
    beginVoiceSession();
  });
  await expect.poll(
    () => page.evaluate(() => window.sousVoiceDebug().some(event =>
      event.event === 'feedback_audio' &&
      event.key === 'session_ready' &&
      !['silent', 'skipped_debounce'].includes(event.route)
    )),
    { timeout: 3000, intervals: [50, 100, 200] }
  ).toBe(true);
  await page.waitForFunction(() => (window.__mockRecognizers || []).length > 0);
  await page.evaluate(() => {
    const recognizers = window.__mockRecognizers || [];
    const rec = recognizers[recognizers.length - 1];
    const primary = { transcript: 'oats', confidence: 0.96 };
    const result = [primary];
    result.isFinal = true;
    const results = [result];
    rec.onresult({ resultIndex: 0, results });
    rec.onerror({ error: 'no-speech' });
  });
  await waitUntilNotProcessing(page);
  await expect.poll(
    () => page.evaluate(() => {
      const visible = document.body.innerText.toLowerCase();
      const hasAcceptedOats = window.sousVoiceDebug().some(event => event.event === 'transcript_heard' && event.transcript === 'oats');
      return hasAcceptedOats && !visible.includes("didn't catch");
    }),
    { timeout: 3000, intervals: [50, 100, 200] }
  ).toBe(true);

  await page.evaluate(() => window.__sousStartVoiceTestSession('breakfast'));
  await page.waitForFunction(() => window.__sousVoiceState().state === 'listening');
  await page.evaluate(() => window.__sousTestVoiceTranscript('oats'));
  await waitUntilNotProcessing(page);
  const result = await snapshot(page);
  const promptFeedback = result.events.find(event =>
    event.type === 'voice feedback requested' &&
    ['clarify_confirm_food', 'clarify_quantity', 'clarification_needed'].includes(event.key) &&
    !['silent', 'skipped_debounce'].includes(event.route)
  );
  expect(promptFeedback, `events: ${JSON.stringify(result.events, null, 2)}`).toBeTruthy();
  expect(result.visibleText.toLowerCase()).not.toContain('"oats"\ndidn\'t catch');
});
