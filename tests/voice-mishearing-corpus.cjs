const MISHEARING_CASES = [
  {
    name: 'oops 50 grams -> oats 50 grams',
    input: 'oops 50 grams',
    expectFoods: ['Oats'],
    expectWeights: { Oats: 50 },
    expectTrace: ['transcript_repaired']
  },
  {
    name: '30 grams way protein -> protein powder',
    input: '30 grams way protein',
    expectFoods: ['Protein powder'],
    expectWeights: { 'Protein powder': 30 }
  },
  {
    name: '30 grams way -> protein powder',
    input: '30 grams way',
    expectFoods: ['Protein powder'],
    expectWeights: { 'Protein powder': 30 },
    expectTrace: ['transcript_repaired']
  },
  {
    name: '30 grams weigh protein -> protein powder',
    input: '30 grams weigh protein',
    expectFoods: ['Protein powder'],
    expectWeights: { 'Protein powder': 30 }
  },
  {
    name: '200 ml all milk -> oat milk',
    input: '200 ml all milk',
    expectFoods: ['Oat milk'],
    expectWeights: { 'Oat milk': 200 },
    expectTrace: ['transcript_repaired']
  },
  {
    name: '15g soy source -> soy sauce',
    input: '15g soy source',
    expectFoods: ['Soy sauce'],
    expectWeights: { 'Soy sauce': 15 }
  },
  {
    name: '15g soy sore -> soy sauce',
    input: '15g soy sore',
    expectFoods: ['Soy sauce'],
    expectWeights: { 'Soy sauce': 15 }
  },
  {
    name: 'two slices bred -> bread',
    input: 'two slices bred',
    expectFoods: ['Bread']
  },
  {
    name: '30 grams flower -> flour',
    input: '30 grams flower',
    expectFoods: ['Flour'],
    safeIfMissing: true
  },
  {
    name: 'serial with milk should not become one wrong food',
    input: 'serial with milk',
    expectFoods: ['Cereal'],
    safeIfMissing: true
  },
  {
    name: 'peace -> peas',
    input: '100 grams peace',
    expectFoods: ['Garden peas'],
    safeIfMissing: true
  },
  {
    name: 'piece -> peas',
    input: '100 grams piece',
    expectFoods: ['Garden peas'],
    safeIfMissing: true
  },
  {
    name: 'stake 180g -> steak',
    input: 'stake 180g',
    expectFoods: ['Beef steak'],
    expectWeights: { 'Beef steak': 180 },
    safeIfMissing: true
  },
  {
    name: 'chilly sauce remains safe',
    input: 'chilly sauce',
    safeOnly: true,
    forbiddenFoods: ['Chicken breast', 'Chicken thigh']
  },
  {
    name: 'semi skim milk 200 mills -> milk',
    input: 'semi skim milk 200 mills',
    expectFoods: ['Milk'],
    expectWeights: { Milk: 200 },
    safeIfMissing: true
  },
  {
    name: 'olive oil one table spoon',
    input: 'olive oil one table spoon',
    expectFoods: ['Olive oil']
  },
  {
    name: 'honey one tea spoon',
    input: 'honey one tea spoon',
    expectFoods: ['Honey']
  },
  {
    name: 'uses alternatives: jeans -> cheese',
    input: {
      transcript: '30g jeans',
      alternatives: [
        { text: '30g cheese', confidence: 0.91 },
        { text: '30g beans', confidence: 0.63 }
      ],
      confidence: 0.42
    },
    expectFoods: ['Cheddar'],
    expectWeights: { Cheddar: 30 }
  },
  {
    name: 'uses alternatives: source -> sauce',
    input: {
      transcript: 'soy source',
      alternatives: [{ text: 'soy sauce', confidence: 0.89 }],
      confidence: 0.5
    },
    expectFoods: ['Soy sauce']
  },
  {
    name: 'accepts bounded AI repair: awl mlk -> oat milk',
    input: '200 ml awl mlk',
    aiCandidates: [{ transcript: '200 ml oat milk', score: 0.93, reason: 'awl mlk sounds like oat milk' }],
    expectFoods: ['Oat milk'],
    expectWeights: { 'Oat milk': 200 },
    expectTrace: ['ai_repair_requested', 'ai_repair_accepted']
  },
  {
    name: 'rejects aggressive AI expansion',
    input: 'sorse tostie',
    aiCandidates: [{ transcript: 'sauce on toast', score: 0.95, reason: 'too aggressive: adds structure' }],
    safeOnly: true,
    forbiddenFoods: ['Bread', 'Toast', 'Soy sauce'],
    expectTrace: ['ai_repair_requested', 'ai_repair_rejected']
  },
  {
    name: 'rejects AI command invention',
    input: 'under that',
    aiCandidates: [{ transcript: 'undo that', score: 0.99, reason: 'command-like repair' }],
    safeOnly: true,
    expectTrace: ['ai_repair_requested', 'ai_repair_rejected']
  },
  {
    name: 'bare milk asks instead of guessing',
    input: 'milk',
    safeOnly: true,
    forbiddenAutoAdd: ['Milk', 'Whole milk', 'Oat milk', 'Almond milk']
  },
  {
    name: 'bare rice asks instead of guessing',
    input: 'rice',
    safeOnly: true,
    forbiddenAutoAdd: ['White rice', 'Brown rice']
  },
  {
    name: 'chicken and source asks or repairs safely',
    input: 'chicken and source',
    safeOnly: true,
    forbiddenAutoAdd: ['Chicken breast', 'Chicken thigh']
  },
  {
    name: 'trailing connector does not auto-add partial meal',
    input: 'oats and',
    safeOnly: true,
    forbiddenAutoAdd: ['Oats']
  },
  {
    name: 'change that quantity after misheard flow',
    seed: ['oats 100 grams'],
    input: 'make that 150 grams',
    expectFoods: ['Oats'],
    expectWeights: { Oats: 150 },
    maxFoodCounts: { Oats: 1 }
  },
  {
    name: 'delete seeded banana',
    seed: ['banana 100 grams'],
    input: 'remove banana',
    forbiddenFoods: ['Banana'],
    expectTrace: ['final_action']
  }
];

module.exports = { MISHEARING_CASES };
