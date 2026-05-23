const path = require('path');
const { test, expect, chromium } = require('@playwright/test');

test.describe.configure({ mode: 'serial' });
test.setTimeout(90000);

const baseURL = process.env.SOUS_TEST_BASE_URL || 'http://127.0.0.1:8732';
const fixtureRoot = path.resolve(__dirname, 'audio-fixtures');
const strictFakeMic = process.env.SOUS_FAKE_MIC_STRICT === '1';
const recognitionModeSetting = process.env.SOUS_FAKE_MIC_RECOGNITION || 'auto';
const headedRequested = process.env.SOUS_VOICE_HEADED === '1';
const watchMode = process.argv.some(arg => arg === '--watch' || arg === '--ui' || arg.startsWith('--ui='));
const headedWatchEnabled = process.env.SOUS_VOICE_WATCH === '1';
const headedEnabled = headedRequested && (!watchMode || headedWatchEnabled);
const fakeMicHeadless = !headedEnabled;
let fakeMicUnsupported = false;
let nativeFakeSpeechWorks = null;
const scenarioResults = [];
const scenarioMetaByName = new Map();

if (headedRequested && watchMode && !headedWatchEnabled) {
  console.warn('SOUS_VOICE_HEADED=1 ignored in Playwright watch/UI mode. Set SOUS_VOICE_WATCH=1 as well to allow repeated headed fake-mic launches.');
}

class ScenarioFailure extends Error {
  constructor(scenario, invariant, message, snapshot) {
    const report = buildFailureReport(scenario, invariant, message, snapshot);
    super(`${scenario.name}: ${invariant}: ${message}\n${JSON.stringify(report, null, 2)}`);
    this.report = report;
  }
}

const singleTurnScenarios = [
  {
    name: 'A single-turn oats',
    fixture: 'wav/oats.wav',
    utterances: ['oats'],
    done: s => acceptedCount(s) >= 1 && (hasPrompt(s) || hasFood(s, /oats/i)),
    expected: {
      anyEvents: ['transcript_accepted', 'clarification shown', 'ingredient row added'],
      forbiddenUiText: ["didn't catch that"],
      finalStates: ['listening', 'restarting', 'speaking']
    }
  },
  {
    name: 'B single-turn 50 grams oats',
    fixture: 'wav/50-grams-oats.wav',
    utterances: ['50 grams oats'],
    done: s => hasFood(s, /oats/i, 50),
    expected: {
      events: ['transcript_accepted'],
      forbiddenUiText: ["didn't catch", 'how much oats'],
      finalStates: ['listening', 'restarting', 'speaking']
    }
  },
  {
    name: 'C single-turn banana',
    fixture: 'wav/banana.wav',
    utterances: ['banana'],
    done: s => acceptedCount(s) >= 1 && (hasFood(s, /banana/i) || hasQuantityPrompt(s)),
    expected: {
      anyEvents: ['ingredient row added', 'clarification shown', 'ui_updated'],
      forbiddenUiText: ["didn't catch that"],
      maxFoodCount: { pattern: /banana/i, count: 1 },
      finalStates: ['listening', 'restarting', 'speaking']
    }
  },
  {
    name: 'D single-turn greek yoghurt',
    fixture: 'wav/greek-yoghurt.wav',
    utterances: ['greek yoghurt'],
    done: s => acceptedCount(s) >= 1 && (hasPrompt(s) || hasFood(s, /yoghurt|yogurt/i)),
    expected: {
      anyEvents: ['clarification shown', 'voice feedback requested', 'silent_mode_skipped_feedback'],
      forbiddenUiText: ["didn't catch that"],
      finalStates: ['listening', 'restarting', 'speaking']
    }
  },
  {
    name: 'E single-turn chicken and sauce',
    fixture: 'wav/chicken-and-sauce.wav',
    utterances: ['chicken and sauce'],
    done: s => acceptedCount(s) >= 1 && hasOutcome(s),
    validate: s => {
      const meal = s.state.meal || [];
      const hasChicken = meal.some(item => /chicken/i.test(item.name || ''));
      const onlyChicken = meal.length === 1 && hasChicken;
      const hasSauceSignal = allRowsText(s).some(text => /sauce/i.test(text));
      if (onlyChicken && !hasSauceSignal && !hasPrompt(s)) {
        fail(s, 'Chicken and sauce needs review/clarification', 'collapsed to only chicken without preserving sauce');
      }
    },
    expected: {
      anyEvents: ['parser result', 'clarification shown', 'ingredient row added', 'error/fallback shown'],
      forbiddenUiText: ["didn't catch that"],
      finalStates: ['listening', 'restarting', 'speaking']
    }
  },
  {
    name: 'F single-turn black beans and soy sauce',
    fixture: 'wav/black-beans-and-soy-sauce.wav',
    utterances: ['black beans and soy sauce'],
    done: s => acceptedCount(s) >= 1 && hasOutcome(s),
    validate: s => {
      const rowText = allRowsText(s).join('\n');
      const hasBoth = /black beans/i.test(rowText) && /soy sauce/i.test(rowText);
      if (!hasBoth && !hasPrompt(s) && !hasReviewRows(s)) {
        fail(s, 'Black beans and soy sauce needs multi-item handling', 'missing multi-item rows, review, or clarification');
      }
    },
    expected: {
      anyEvents: ['parser result', 'clarification shown', 'ingredient row added', 'error/fallback shown'],
      forbiddenUiText: ["didn't catch that"],
      finalStates: ['listening', 'restarting', 'speaking']
    }
  }
];

const multiTurnScenarios = [
  {
    name: 'A multi-turn cheese clarification',
    fixture: 'sequences/cheese-then-cheddar.wav',
    utterances: ['cheese', 'cheddar'],
    done: s => hasTrace(s, 'clarification_resolved') ||
      hasFood(s, /cheddar/i) ||
      (hasAcceptedTranscript(s, /cheddar/i) && hasTrace(s, 'clarification_partial') && hasQuantityPrompt(s)),
    validate: s => {
      if (hasAcceptedTranscript(s, /cheddar/i) && !hasFood(s, /cheddar/i) && !hasQuantityPrompt(s)) {
        fail(s, 'Cheddar answer resolves cheese type', 'cheddar was accepted but did not resolve to a row or quantity prompt');
      }
    },
    expected: {
      traceEvents: ['clarification_prompt'],
      anyEvents: ['voice feedback requested', 'silent_mode_skipped_feedback'],
      forbiddenUiText: ["didn't catch that"],
      maxCombinedFoodCount: { patterns: [/cheese/i, /cheddar/i], count: 1 },
      finalStates: ['listening', 'restarting', 'speaking']
    }
  },
  {
    name: 'B multi-turn cheese with quantity',
    fixture: 'sequences/cheese-then-cheddar-30-grams.wav',
    utterances: ['cheese', 'cheddar 30 grams'],
    done: s => hasFood(s, /cheddar/i, 30),
    expected: {
      traceEvents: ['clarification_prompt'],
      forbiddenUiText: ["didn't catch that"],
      finalStates: ['listening', 'restarting', 'speaking']
    }
  },
  {
    name: 'C multi-turn oats quantity',
    fixture: 'sequences/oats-then-50-grams.wav',
    utterances: ['oats', '50 grams'],
    done: s => hasFood(s, /oats/i, 50),
    validate: s => {
      if (allRowsText(s).some(text => /50 grams/i.test(text) && /unknown|create|custom/i.test(text))) {
        fail(s, 'Quantity answer must not become food', '50 grams appeared as standalone unknown/custom food');
      }
    },
    expected: {
      anyEvents: ['clarification shown', 'voice feedback requested', 'silent_mode_skipped_feedback', 'ingredient row added'],
      forbiddenUiText: ["didn't catch that"],
      finalStates: ['listening', 'restarting', 'speaking']
    }
  },
  {
    name: 'D multi-turn greek yoghurt clarification',
    fixture: 'sequences/greek-yoghurt-then-full-fat-50-grams.wav',
    utterances: ['greek yoghurt', 'full fat 50 grams'],
    done: s => hasFood(s, /full fat greek yoghurt|greek yoghurt|yoghurt/i, 50),
    validate: s => {
      const yoghurt = findFood(s, /yoghurt|yogurt/i);
      if (yoghurt && Number(yoghurt.weight) !== 50) {
        fail(s, 'Greek yoghurt quantity must be preserved', `expected 50g, got ${yoghurt.weight || 'no weight'}`);
      }
    },
    expected: {
      traceEvents: ['clarification_prompt'],
      forbiddenUiText: ["didn't catch that"],
      finalStates: ['listening', 'restarting', 'speaking']
    }
  },
  {
    name: 'E multi-turn correction flow',
    fixture: 'sequences/oats-100-then-make-that-150-grams.wav',
    utterances: ['oats 100 grams', 'make that 150 grams'],
    done: s => hasFood(s, /oats/i, 150),
    expected: {
      traceEvents: ['final_action'],
      maxFoodCount: { pattern: /oats/i, count: 1 },
      forbiddenUiText: ["didn't catch that"],
      finalStates: ['listening', 'restarting', 'speaking']
    }
  },
  {
    name: 'F multi-turn delete flow',
    fixture: 'sequences/oats-50-then-delete-oats.wav',
    utterances: ['oats 50 grams', 'delete oats'],
    done: s => hasTrace(s, 'final_action', entry => entry.command === 'remove' || entry.command === 'delete') && !hasFood(s, /oats/i),
    expected: {
      traceEvents: ['final_action'],
      forbiddenUiText: ['how much oats'],
      finalStates: ['listening', 'restarting', 'speaking']
    }
  },
  {
    name: 'G multi-turn fast repeated input',
    fixture: 'sequences/oats-then-50-grams-then-banana.wav',
    utterances: ['oats', '50 grams', 'banana'],
    done: s => hasFood(s, /oats/i, 50) && (hasFood(s, /banana/i) || hasQuantityPrompt(s)),
    validate: s => {
      const oats = findFood(s, /oats/i);
      const banana = findFood(s, /banana/i);
      if (oats && banana && Number(banana.weight) === Number(oats.weight)) {
        fail(s, 'Banana must not inherit oats prompt state', `banana inherited ${banana.weight}g`);
      }
      const acceptedTurnIds = acceptedTranscripts(s).map(event => event.turnId).filter(Boolean);
      if (new Set(acceptedTurnIds).size !== acceptedTurnIds.length) {
        fail(s, 'Turn ids remain separate', `duplicate accepted turn ids: ${acceptedTurnIds.join(', ')}`);
      }
    },
    expected: {
      forbiddenUiText: ["didn't catch that"],
      finalStates: ['listening', 'restarting', 'speaking']
    }
  },
  {
    name: 'H multi-turn failed clarification',
    fixture: 'sequences/cheese-then-banana.wav',
    utterances: ['cheese', 'banana'],
    done: s => hasTrace(s, 'clarification_listen_result') || hasFood(s, /banana/i) || hasPrompt(s),
    validate: s => {
      const rows = allRowsText(s).join('\n');
      if (/cheddar|mozzarella|parmesan/i.test(rows) && !/banana/i.test(rows)) {
        fail(s, 'Banana must not be treated as cheese type', 'banana clarification produced a cheese type');
      }
    },
    expected: {
      traceEvents: ['clarification_prompt'],
      forbiddenUiText: ["didn't catch that"],
      finalStates: ['listening', 'restarting', 'speaking']
    }
  }
];

const additionalScenarioGroups = [
  {
    group: 'single ingredient',
    scenarios: [
      {
        name: 'single ingredient cheddar',
        fixture: 'wav/cheddar.wav',
        utterances: ['cheddar'],
        done: s => hasFood(s, /cheddar/i) || hasQuantityPrompt(s),
        expected: {
          forbiddenUiText: ["didn't catch that"],
          maxFoodCount: { pattern: /cheddar/i, count: 1 },
          finalStates: ['listening', 'restarting', 'speaking']
        }
      },
      {
        name: 'single ingredient cheese asks for clarification',
        fixture: 'wav/cheese.wav',
        utterances: ['cheese'],
        done: s => acceptedCount(s) >= 1 && hasPrompt(s),
        expected: {
          traceEvents: ['clarification_prompt'],
          forbiddenUiText: ["didn't catch that"],
          finalStates: ['listening', 'restarting', 'speaking']
        }
      },
      {
        name: 'single ingredient two eggs',
        fixture: 'wav/two-eggs.wav',
        utterances: ['two eggs'],
        done: s => hasFood(s, /egg/i) || hasReviewRows(s),
        expected: {
          forbiddenUiText: ["didn't catch that"],
          maxFoodCount: { pattern: /egg/i, count: 1 },
          finalStates: ['listening', 'restarting', 'speaking']
        }
      }
    ]
  },
  {
    group: 'quantity parsing',
    scenarios: [
      {
        name: 'quantity oats 100 grams',
        fixture: 'wav/oats-100-grams.wav',
        utterances: ['oats 100 grams'],
        done: s => hasFood(s, /oats/i, 100),
        expected: {
          forbiddenUiText: ["didn't catch that", 'how much oats'],
          maxFoodCount: { pattern: /oats/i, count: 1 },
          finalStates: ['listening', 'restarting', 'speaking']
        }
      },
      {
        name: 'quantity porridge oats 50 grams',
        fixture: 'wav/porridge-oats-50-grams.wav',
        utterances: ['porridge oats 50 grams'],
        done: s => hasFood(s, /oats/i, 50) || hasFood(s, /porridge/i, 50),
        expected: {
          forbiddenUiText: ["didn't catch that", 'how much oats'],
          maxFoodCount: { pattern: /oats|porridge/i, count: 1 },
          finalStates: ['listening', 'restarting', 'speaking']
        }
      },
      {
        name: 'quantity rice 100 grams',
        fixture: 'wav/rice-100-grams.wav',
        utterances: ['rice 100 grams'],
        done: s => acceptedCount(s) >= 1 && (hasFood(s, /rice/i, 100) || hasPrompt(s) || hasReviewRows(s)),
        expected: {
          forbiddenUiText: ["didn't catch that"],
          maxFoodCount: { pattern: /rice/i, count: 1 },
          finalStates: ['listening', 'restarting', 'speaking']
        }
      },
      {
        name: 'quantity chicken breast 200 grams',
        fixture: 'wav/chicken-breast-200-grams.wav',
        utterances: ['chicken breast 200 grams'],
        done: s => hasFood(s, /chicken breast/i, 200) || hasFood(s, /chicken/i, 200) || hasPrompt(s),
        expected: {
          forbiddenUiText: ["didn't catch that"],
          maxFoodCount: { pattern: /chicken/i, count: 1 },
          finalStates: ['listening', 'restarting', 'speaking']
        }
      },
      {
        name: 'quantity chicken thighs 200 grams',
        fixture: 'wav/chicken-thighs-200-grams.wav',
        utterances: ['chicken thighs 200 grams'],
        done: s => hasFood(s, /chicken thigh|chicken/i, 200) || hasPrompt(s),
        expected: {
          forbiddenUiText: ["didn't catch that"],
          maxFoodCount: { pattern: /chicken/i, count: 1 },
          finalStates: ['listening', 'restarting', 'speaking']
        }
      },
      {
        name: 'quantity greek yoghurt 50 grams',
        fixture: 'wav/greek-yoghurt-50-grams.wav',
        utterances: ['greek yoghurt 50 grams'],
        done: s => hasFood(s, /greek yoghurt|greek yogurt|yoghurt|yogurt/i, 50) || hasPrompt(s),
        expected: {
          forbiddenUiText: ["didn't catch that"],
          maxCombinedFoodCount: { patterns: [/greek yoghurt/i, /greek yogurt/i, /yoghurt/i, /yogurt/i], count: 1 },
          finalStates: ['listening', 'restarting', 'speaking']
        }
      },
      {
        name: 'quantity full fat greek yoghurt 50 grams',
        fixture: 'wav/full-fat-greek-yoghurt-50-grams.wav',
        utterances: ['full fat greek yoghurt 50 grams'],
        done: s => hasFood(s, /full fat greek yoghurt|full fat greek yogurt|greek yoghurt|greek yogurt/i, 50),
        expected: {
          forbiddenUiText: ["didn't catch that"],
          maxCombinedFoodCount: { patterns: [/full fat greek/i, /greek yoghurt/i, /greek yogurt/i], count: 1 },
          finalStates: ['listening', 'restarting', 'speaking']
        }
      },
      {
        name: 'quantity skimmed milk 200 millilitres',
        fixture: 'wav/skimmed-milk-200-millilitres.wav',
        utterances: ['skimmed milk 200 millilitres'],
        done: s => hasFood(s, /skimmed milk|milk/i, 200) || hasPrompt(s),
        expected: {
          forbiddenUiText: ["didn't catch that"],
          maxFoodCount: { pattern: /milk/i, count: 1 },
          finalStates: ['listening', 'restarting', 'speaking']
        }
      },
      {
        name: 'quantity olive oil one tablespoon',
        fixture: 'wav/olive-oil-one-tablespoon.wav',
        utterances: ['olive oil one tablespoon'],
        done: s => hasFood(s, /olive oil/i, 15) || hasFood(s, /olive oil/i),
        validate: s => {
          const oil = findFood(s, /olive oil/i);
          if (oil && Number(oil.weight) !== 15) {
            fail(s, 'Tablespoon quantity converts to ml/grams', `expected 15, got ${oil.weight || 'no weight'}`);
          }
        },
        expected: {
          forbiddenUiText: ["didn't catch that"],
          maxFoodCount: { pattern: /olive oil/i, count: 1 },
          finalStates: ['listening', 'restarting', 'speaking']
        }
      },
      {
        name: 'quantity peanut butter 20 grams',
        fixture: 'wav/peanut-butter-20-grams.wav',
        utterances: ['peanut butter 20 grams'],
        done: s => hasFood(s, /peanut butter/i, 20),
        expected: {
          forbiddenUiText: ["didn't catch that"],
          maxFoodCount: { pattern: /peanut butter/i, count: 1 },
          finalStates: ['listening', 'restarting', 'speaking']
        }
      }
    ]
  },
  {
    group: 'multi-ingredient',
    scenarios: [
      {
        name: 'multi ingredient banana and whey',
        fixture: 'wav/banana-and-whey.wav',
        utterances: ['banana and whey'],
        done: s => acceptedCount(s) >= 1 && hasOutcome(s),
        validate: s => {
          const text = allRowsText(s).join('\n');
          if (!/banana/i.test(text) || !/whey|protein/i.test(text)) {
            fail(s, 'Banana and whey preserve both items', 'missing banana or whey/protein signal');
          }
        },
        expected: {
          forbiddenUiText: ["didn't catch that"],
          finalStates: ['listening', 'restarting', 'speaking']
        }
      },
      {
        name: 'multi ingredient two eggs and toast',
        fixture: 'wav/two-eggs-and-toast.wav',
        utterances: ['two eggs and toast'],
        done: s => acceptedCount(s) >= 1 && hasOutcome(s),
        validate: s => {
          const text = allRowsText(s).join('\n');
          if (!/egg/i.test(text) || !/toast|bread/i.test(text)) {
            fail(s, 'Eggs and toast preserve both items', 'missing egg or toast/bread signal');
          }
        },
        expected: {
          forbiddenUiText: ["didn't catch that"],
          finalStates: ['listening', 'restarting', 'speaking']
        }
      },
      {
        name: 'multi ingredient oats banana whey',
        fixture: 'wav/oats-banana-whey.wav',
        utterances: ['oats banana whey'],
        done: s => acceptedCount(s) >= 1 && hasOutcome(s),
        validate: s => {
          const text = allRowsText(s).join('\n');
          for (const pattern of [/oats/i, /banana/i, /whey|protein/i]) {
            if (!pattern.test(text)) fail(s, 'Oats banana whey preserve all items', `missing ${pattern}`);
          }
        },
        expected: {
          forbiddenUiText: ["didn't catch that"],
          finalStates: ['listening', 'restarting', 'speaking']
        }
      },
      {
        name: 'multi ingredient bread yoghurt',
        fixture: 'wav/bread-yoghurt.wav',
        utterances: ['bread yoghurt'],
        done: s => acceptedCount(s) >= 1 && hasOutcome(s),
        validate: s => {
          const text = allRowsText(s).join('\n');
          if (!/bread/i.test(text) || !/yoghurt|yogurt/i.test(text)) {
            fail(s, 'Bread yoghurt keeps both intended foods visible', 'missing bread or yoghurt signal');
          }
        },
        expected: {
          forbiddenUiText: ["didn't catch that"],
          finalStates: ['listening', 'restarting', 'speaking']
        }
      },
      {
        name: 'multi ingredient chicken and unknown sauce',
        fixture: 'wav/chicken-and-unknown-sauce.wav',
        utterances: ['chicken and unknown sauce'],
        done: s => acceptedCount(s) >= 1 && hasOutcome(s),
        validate: s => {
          const text = allRowsText(s).join('\n');
          if (!/chicken/i.test(text) && !hasPrompt(s) && !hasReviewRows(s)) {
            fail(s, 'Chicken and unknown sauce keeps a recoverable path', 'missing chicken, review, or clarification');
          }
        },
        expected: {
          forbiddenUiText: ["didn't catch that"],
          finalStates: ['listening', 'restarting', 'speaking']
        }
      }
    ]
  },
  {
    group: 'mishearing repairs',
    scenarios: [
      {
        name: 'mishearing soy source repairs to soy sauce',
        fixture: 'wav/soy-source.wav',
        utterances: ['soy source'],
        done: s => hasFood(s, /soy sauce/i) || hasReviewRows(s) || hasPrompt(s),
        expected: {
          forbiddenUiText: ["didn't catch that"],
          maxFoodCount: { pattern: /soy sauce/i, count: 1 },
          finalStates: ['listening', 'restarting', 'speaking']
        }
      },
      {
        name: 'mishearing 30 grams way repairs to whey',
        fixture: 'wav/30-grams-way.wav',
        utterances: ['30 grams way'],
        done: s => hasFood(s, /protein powder|whey/i, 30) || hasReviewRows(s) || hasPrompt(s),
        validate: s => {
          const protein = findFood(s, /protein powder|whey/i);
          if (protein && Number(protein.weight) !== 30) {
            fail(s, 'Whey mishearing keeps quantity', `expected 30g, got ${protein.weight || 'no weight'}`);
          }
        },
        expected: {
          forbiddenUiText: ["didn't catch that"],
          maxFoodCount: { pattern: /protein powder|whey/i, count: 1 },
          finalStates: ['listening', 'restarting', 'speaking']
        }
      }
    ]
  },
  {
    group: 'clarification',
    scenarios: [
      {
        name: 'clarification chicken sauce then soy sauce',
        fixture: 'sequences/chicken-and-unknown-sauce-then-soy-sauce.wav',
        utterances: ['chicken and unknown sauce', 'soy sauce'],
        done: s => acceptedCount(s) >= 1 && (hasFood(s, /soy sauce/i) || hasReviewRows(s) || hasPrompt(s)),
        validate: s => {
          const text = allRowsText(s).join('\n');
          if (/unknown sauce/i.test(text) && !/soy sauce/i.test(text) && !hasReviewRows(s)) {
            fail(s, 'Sauce follow-up should resolve or stay reviewable', 'unknown sauce remained without soy sauce/review');
          }
        },
        expected: {
          forbiddenUiText: ["didn't catch that"],
          finalStates: ['listening', 'restarting', 'speaking']
        }
      },
      {
        name: 'clarification black beans soy sauce selection safe',
        fixture: 'wav/black-beans-and-soy-sauce.wav',
        utterances: ['black beans and soy sauce'],
        done: s => acceptedCount(s) >= 1 && hasOutcome(s),
        validate: s => {
          const text = allRowsText(s).join('\n');
          const beanMatches = (text.match(/black beans?/gi) || []).length;
          const soyMatches = (text.match(/soy sauce/gi) || []).length;
          if (!hasReviewRows(s) && (beanMatches > 1 || soyMatches > 1)) {
            fail(s, 'Selection does not duplicate intended items', `black beans ${beanMatches}, soy sauce ${soyMatches}`);
          }
        },
        expected: {
          forbiddenUiText: ["didn't catch that"],
          finalStates: ['listening', 'restarting', 'speaking']
        }
      }
    ]
  },
  {
    group: 'quantity follow-up',
    scenarios: [
      {
        name: 'quantity follow-up oats then 50 grams then banana',
        fixture: 'sequences/oats-then-50-grams-then-banana.wav',
        utterances: ['oats', '50 grams', 'banana'],
        done: s => hasFood(s, /oats/i, 50) && (hasFood(s, /banana/i) || hasQuantityPrompt(s)),
        expected: {
          forbiddenUiText: ["didn't catch that"],
          maxFoodCount: { pattern: /oats/i, count: 1 },
          quantityOnlyMustNotBeFood: true,
          finalStates: ['listening', 'restarting', 'speaking']
        }
      }
    ]
  },
  {
    group: 'correction/edit',
    scenarios: [
      {
        name: 'correction change oats to 150 grams',
        fixture: 'sequences/oats-100-then-change-oats-to-150-grams.wav',
        utterances: ['oats 100 grams', 'change oats to 150 grams'],
        done: s => hasFood(s, /oats/i, 150),
        expected: {
          traceEvents: ['final_action'],
          forbiddenUiText: ["didn't catch that"],
          maxFoodCount: { pattern: /oats/i, count: 1 },
          finalStates: ['listening', 'restarting', 'speaking']
        }
      }
    ]
  },
  {
    group: 'delete/remove',
    scenarios: [
      {
        name: 'delete remove banana',
        fixture: 'sequences/banana-then-remove-banana.wav',
        utterances: ['banana', 'remove banana'],
        done: s => hasTrace(s, 'final_action', entry => entry.command === 'remove') && !hasFood(s, /banana/i),
        expected: {
          traceEvents: ['final_action'],
          forbiddenUiText: ["didn't catch that", 'how much banana'],
          noStalePrompt: true,
          finalStates: ['listening', 'restarting', 'speaking']
        }
      }
    ]
  },
  {
    group: 'finish/save meal',
    scenarios: [
      {
        name: 'finish meal command opens summary',
        fixture: 'sequences/oats-100-then-finish-meal.wav',
        utterances: ['oats 100 grams', 'finish meal'],
        done: s => hasFood(s, /oats/i, 100) && s.state.activeScreen === 'ls-summary',
        expected: {
          traceEvents: ['final_action'],
          forbiddenUiText: ["didn't catch that"],
          finalStates: ['idle', 'listening', 'restarting', 'speaking']
        }
      },
      {
        name: 'save meal phrase is contained without API',
        fixture: 'wav/save-meal.wav',
        utterances: ['save meal'],
        done: s => acceptedCount(s) >= 1 && hasOutcome(s),
        expected: {
          forbiddenUiText: ["didn't catch that"],
          finalStates: ['listening', 'restarting', 'speaking']
        }
      }
    ]
  },
  {
    group: 'bad/unclear input',
    scenarios: [
      {
        name: 'unclear red something safe fallback',
        fixture: 'wav/red-something.wav',
        utterances: ['red something'],
        done: s => acceptedCount(s) >= 1 && hasOutcome(s),
        expected: {
          forbiddenUiText: ["didn't catch that"],
          finalStates: ['listening', 'restarting', 'speaking']
        }
      },
      {
        name: 'standalone actually no does not mutate meal',
        fixture: 'wav/actually-no.wav',
        utterances: ['actually no'],
        done: s => acceptedCount(s) >= 1 && hasOutcome(s),
        validate: s => {
          if ((s.state.meal || []).length) fail(s, 'Standalone cancel does not add food', 'meal was mutated');
        },
        expected: {
          forbiddenUiText: ["didn't catch that"],
          noStalePrompt: true,
          finalStates: ['listening', 'restarting', 'speaking']
        }
      },
      {
        name: 'standalone cancel that does not mutate meal',
        fixture: 'wav/cancel-that.wav',
        utterances: ['cancel that'],
        done: s => acceptedCount(s) >= 1 && hasOutcome(s),
        validate: s => {
          if ((s.state.meal || []).length) fail(s, 'Standalone cancel does not add food', 'meal was mutated');
        },
        expected: {
          forbiddenUiText: ["didn't catch that"],
          noStalePrompt: true,
          finalStates: ['listening', 'restarting', 'speaking']
        }
      },
      {
        name: 'cancel after quantity clears pending prompt',
        fixture: 'sequences/oats-50-then-cancel-that.wav',
        utterances: ['oats 50 grams', 'cancel that'],
        done: s => acceptedCount(s) >= 2 && !s.state.processing,
        validate: s => {
          if (hasFood(s, /cancel/i)) fail(s, 'Cancel command is not food', 'cancel appeared as a food row');
        },
        expected: {
          forbiddenUiText: ["didn't catch that", 'how much oats'],
          noStalePrompt: true,
          finalStates: ['listening', 'restarting', 'speaking']
        }
      },
      {
        name: 'actually no after quantity does not create food',
        fixture: 'sequences/oats-50-then-actually-no.wav',
        utterances: ['oats 50 grams', 'actually no'],
        done: s => acceptedCount(s) >= 2 && !s.state.processing,
        validate: s => {
          if (hasFood(s, /actually|no/i)) fail(s, 'Actually no is not food', 'actually/no appeared as a food row');
        },
        expected: {
          forbiddenUiText: ["didn't catch that", 'how much oats'],
          noStalePrompt: true,
          finalStates: ['listening', 'restarting', 'speaking']
        }
      }
    ]
  },
  {
    group: 'repeated/fast input',
    scenarios: [
      {
        name: 'repeated same utterance twice creates two deliberate rows',
        fixture: 'sequences/oats-100-then-oats-100.wav',
        utterances: ['oats 100 grams', 'oats 100 grams'],
        done: s => foodMatches(s, /oats/i).length === 2,
        expected: {
          forbiddenUiText: ["didn't catch that"],
          finalStates: ['listening', 'restarting', 'speaking']
        }
      },
      {
        name: 'add another banana creates a second banana only after second turn',
        fixture: 'sequences/banana-120-then-add-another-banana.wav',
        utterances: ['banana 120 grams', 'add another banana'],
        done: s => foodMatches(s, /banana/i).length >= 2 || (foodMatches(s, /banana/i).length === 1 && hasQuantityPrompt(s)),
        validate: s => {
          const count = foodMatches(s, /banana/i).length;
          if (count > 2) fail(s, 'Add another banana has no extra duplicates', `got ${count} banana rows`);
        },
        expected: {
          forbiddenUiText: ["didn't catch that"],
          finalStates: ['listening', 'restarting', 'speaking']
        }
      }
    ]
  },
  {
    group: 'session lifecycle',
    scenarios: [
      {
        name: 'session start stop start again',
        fixture: 'sequences/oats-100-then-oats-100.wav',
        utterances: ['oats 100 grams', 'oats 100 grams'],
        beforeWait: async page => {
          await page.evaluate(() => {
            stopAllVoiceActivity('fake-mic lifecycle stop');
            beginVoiceSession();
          });
          await expect.poll(
            () => page.evaluate(() => window.__sousVoiceState().state),
            { timeout: 12000, intervals: [100, 200, 500] }
          ).toBe('listening');
        },
        done: s => hasFood(s, /oats/i, 100),
        expected: {
          forbiddenUiText: ["didn't catch that"],
          maxFoodCount: { pattern: /oats/i, count: 1 },
          finalStates: ['listening', 'restarting', 'speaking']
        }
      },
      {
        name: 'no speech after valid transcript stays quiet',
        fixture: 'wav/oats-100-grams.wav',
        utterances: ['oats 100 grams'],
        done: s => hasFood(s, /oats/i, 100) && hasNoSpeech(s),
        expected: {
          forbiddenUiText: ["didn't catch that"],
          maxFoodCount: { pattern: /oats/i, count: 1 },
          finalStates: ['listening', 'restarting', 'speaking']
        }
      }
    ]
  }
];

const fakeMicScenarios = [
  ...singleTurnScenarios.map(scenario => ({ group: 'current single-turn', ...scenario })),
  ...multiTurnScenarios.map(scenario => ({ group: 'current multi-turn', ...scenario })),
  ...additionalScenarioGroups.flatMap(group =>
    group.scenarios.map(scenario => ({ group: group.group, ...scenario }))
  )
];

for (const scenario of fakeMicScenarios) {
  scenarioMetaByName.set(scenario.name, scenario);

  test(scenario.name, async () => {
    if (fakeMicUnsupported && !strictFakeMic) {
      test.skip(true, 'Previous fake-mic scenario showed this Chrome speech environment does not accept fake microphone audio.');
    }

    const snapshot = await runScenario(scenario);
    validateScenario(scenario, snapshot);
  });
}

test.afterEach(async ({}, testInfo) => {
  const scenario = scenarioMetaByName.get(testInfo.title);
  if (!scenario) return;
  scenarioResults.push({
    name: testInfo.title,
    group: scenario.group || 'ungrouped',
    status: testInfo.status,
    durationMs: testInfo.duration,
    failureExcerpt: testInfo.error ? failureExcerpt(testInfo.error) : ''
  });
});

test.afterAll(async () => {
  console.log(formatScenarioSummary(scenarioResults));
});

async function runScenario(scenario) {
  const fixturePath = path.resolve(fixtureRoot, scenario.fixture);
  const recognitionMode = await resolveRecognitionMode(fixturePath, scenario);
  const browser = await launchFakeMicBrowser(chromium, fixturePath, scenario);
  const context = await browser.newContext({ baseURL, permissions: ['microphone'] });
  const page = await context.newPage();
  const consoleErrors = [];
  const apiCalls = [];

  try {
    page.on('console', message => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', error => consoleErrors.push(error.message));
    await page.route('**/favicon.ico', route => route.fulfill({ status: 204, body: '' }));
    await page.route('**/api/**', route => {
      apiCalls.push(route.request().url());
      return route.fulfill({ status: 503, body: 'AI calls are disabled in fake-mic tests.' });
    });
    await context.addInitScript(({ silentMode, useShim, utterances }) => {
      localStorage.clear();
      localStorage.setItem('userPlan', 'free');
      localStorage.setItem('sous_onboarding_seen', '1');
      localStorage.setItem('sous_voice_feedback', silentMode ? '0' : '1');
      localStorage.setItem('sous_realtime_voice', '0');
      localStorage.setItem('sous_voice_input_mode', 'continuous');
      localStorage.setItem('sous_voice_debug_overlay', 'true');
      localStorage.setItem('sous_voice_test_harness', '1');
      localStorage.setItem('sous_voice_fake_mic_test', '1');
      localStorage.setItem('sous_voice_fake_mic_recognition_mode', useShim ? 'shim' : 'native');
      if (useShim) installFakeMicSpeechRecognitionShim(utterances);

      function installFakeMicSpeechRecognitionShim(scriptedUtterances) {
        const utteranceQueue = scriptedUtterances.slice();
        window.__sousFakeMicShim = { starts: 0, delivered: [] };
        class FakeMicSpeechRecognition {
          constructor() {
            this.lang = 'en-GB';
            this.interimResults = false;
            this.continuous = false;
            this.maxAlternatives = 1;
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
            this._timers = [];
          }
          start() {
            if (this._active) {
              throw new DOMException('Recognition has already started', 'InvalidStateError');
            }
            this._active = true;
            this._ended = false;
            window.__sousFakeMicShim.starts += 1;
            this._queue(() => this.onstart && this.onstart(), 0);
            const transcript = utteranceQueue.shift();
            if (!transcript) {
              this._queue(() => {
                if (!this._active) return;
                this.onerror && this.onerror({ error: 'no-speech', message: '' });
                this._finish();
              }, 1800);
              return;
            }
            this._queue(() => this.onsoundstart && this.onsoundstart(), 450);
            this._queue(() => this.onspeechstart && this.onspeechstart(), 650);
            if (this.interimResults && transcript.length > 2) {
              this._queue(() => this._emitResult(transcript.slice(0, Math.max(2, Math.floor(transcript.length / 2))), false), 1000);
            }
            this._queue(() => {
              this._emitResult(transcript, true);
              window.__sousFakeMicShim.delivered.push(transcript);
            }, 1500);
            this._queue(() => this.onspeechend && this.onspeechend(), 1750);
            this._queue(() => this.onsoundend && this.onsoundend(), 1850);
            this._queue(() => this._finish(), 2100);
          }
          stop() {
            this._finish();
          }
          abort() {
            this._finish();
          }
          _emitResult(transcript, isFinal) {
            if (!this._active || !this.onresult) return;
            const alternative = { transcript, confidence: isFinal ? 0.96 : 0.5 };
            const result = [alternative];
            result.isFinal = isFinal;
            const results = [result];
            this.onresult({ resultIndex: 0, results });
          }
          _queue(fn, delay) {
            const timer = setTimeout(fn, delay);
            this._timers.push(timer);
          }
          _finish() {
            if (this._ended) return;
            this._active = false;
            this._ended = true;
            this._timers.forEach(timer => clearTimeout(timer));
            this._timers = [];
            setTimeout(() => this.onend && this.onend(), 0);
          }
        }
        window.SpeechRecognition = FakeMicSpeechRecognition;
        window.webkitSpeechRecognition = FakeMicSpeechRecognition;
      }
    }, {
      silentMode: scenario.silentMode !== false,
      useShim: recognitionMode === 'shim',
      utterances: scenario.utterances
    });

    await page.goto('/?sousVoiceTest=1');
    await page.waitForFunction(() => typeof window.__sousVoiceState === 'function');
    await page.evaluate(() => {
      window.__sousVoiceTrace = () => window.sousVoiceDebug ? window.sousVoiceDebug() : [];
    });

    const hasSpeechRecognition = await page.evaluate(() => Boolean(window.SpeechRecognition || window.webkitSpeechRecognition));
    if (!hasSpeechRecognition) {
      fakeMicUnsupported = true;
      test.skip(!strictFakeMic, 'Browser SpeechRecognition is unavailable in this Chrome environment.');
    }

    await page.evaluate(() => {
      switchTab('log', { fresh: true, silent: true, section: 'breakfast' });
      beginVoiceSession();
    });

    await expect.poll(
      () => page.evaluate(() => window.__sousVoiceState().state),
      { timeout: 12000, intervals: [100, 200, 500] }
    ).toBe('listening');

    if (scenario.beforeWait) {
      await scenario.beforeWait(page);
    }

    const snapshot = await waitForScenario(page, scenario, consoleErrors, apiCalls);
    snapshot.consoleErrors = consoleErrors;
    snapshot.apiCalls = apiCalls;
    snapshot.recognitionMode = recognitionMode;
    return snapshot;
  } finally {
    await browser.close().catch(() => {});
  }
}

async function resolveRecognitionMode(fixturePath, scenario) {
  if (recognitionModeSetting === 'shim') return 'shim';
  if (recognitionModeSetting === 'native') return 'native';
  if (nativeFakeSpeechWorks === null) {
    nativeFakeSpeechWorks = await probeNativeFakeSpeech(fixturePath, scenario.utterances[0]).catch(() => false);
  }
  return nativeFakeSpeechWorks ? 'native' : 'shim';
}

async function probeNativeFakeSpeech(fixturePath, expectedTranscript) {
  const browser = await launchFakeMicBrowser(chromium, fixturePath, { name: 'native fake-mic probe' });
  const context = await browser.newContext({ permissions: ['microphone'] });
  const page = await context.newPage();
  try {
    await page.goto(baseURL + '/?sousFakeMicProbe=1');
    const result = await page.evaluate(async () => {
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SR) return { ok: false, reason: 'SpeechRecognition unavailable' };
      const rec = new SR();
      rec.lang = 'en-GB';
      rec.interimResults = true;
      rec.continuous = true;
      return new Promise(resolve => {
        let settled = false;
        const finish = value => {
          if (settled) return;
          settled = true;
          try { rec.stop(); } catch (e) {}
          resolve(value);
        };
        rec.onresult = event => {
          const text = event.results?.[event.resultIndex]?.[0]?.transcript || '';
          finish({ ok: !!text, transcript: text });
        };
        rec.onerror = event => finish({ ok: false, reason: event.error || 'recognition error' });
        setTimeout(() => finish({ ok: false, reason: 'timeout' }), 9000);
        rec.start();
      });
    });
    return !!result.ok && transcriptMatchesExpected(result.transcript, expectedTranscript);
  } finally {
    await browser.close().catch(() => {});
  }
}

async function launchFakeMicBrowser(chromium, fixturePath, scenario) {
  const channel = process.env.SOUS_FAKE_MIC_CHANNEL || 'chrome';
  const launchOptions = {
    headless: fakeMicHeadless,
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      `--use-file-for-fake-audio-capture=${fixturePath}%noloop`
    ]
  };
  if (channel !== 'bundled') launchOptions.channel = channel;

  try {
    return await chromium.launch(launchOptions);
  } catch (error) {
    fakeMicUnsupported = true;
    if (!strictFakeMic) {
      test.skip(true, `Could not launch ${channel} for fake-mic scenario ${scenario.name}: ${error.message}`);
    }
    throw error;
  }
}

async function waitForScenario(page, scenario, consoleErrors, apiCalls) {
  const timeoutMs = Number(process.env.SOUS_FAKE_MIC_TIMEOUT_MS || 45000);
  const deadline = Date.now() + timeoutMs;
  let last = null;

  while (Date.now() < deadline) {
    last = await snapshot(page, scenario, consoleErrors, apiCalls);
    if (scenario.done(last)) return last;
    await page.waitForTimeout(500);
  }

  if (last && !acceptedCount(last) && hasNoSpeech(last) && !strictFakeMic) {
    fakeMicUnsupported = true;
    test.skip(true, 'Chrome reported no-speech before producing a transcript; this fake-mic SpeechRecognition environment is unsupported.');
  }

  throw new ScenarioFailure(scenario, 'Scenario reached expected result', `timed out after ${timeoutMs}ms`, last);
}

async function snapshot(page, scenario, consoleErrors, apiCalls) {
  return page.evaluate(() => {
    const reviewRows = Array.from(document.querySelectorAll('#mc-list > div')).map(card => ({
      text: card.innerText,
      selected: card.querySelector('select option:checked')?.textContent || '',
      values: Array.from(card.querySelectorAll('input')).map(input => input.value)
    }));
    return {
      state: window.__sousVoiceState(),
      events: window.__sousLastVoiceEvents(),
      trace: window.__sousVoiceTrace ? window.__sousVoiceTrace() : (window.sousVoiceDebug ? window.sousVoiceDebug() : []),
      visibleText: document.body.innerText,
      reviewRows
    };
  }).then(result => ({
    ...result,
    scenarioName: scenario.name,
    fixture: scenario.fixture,
    utterances: scenario.utterances,
    consoleErrors: consoleErrors.slice(),
    apiCalls: apiCalls.slice()
  }));
}

function validateScenario(scenario, s) {
  assertNoConsoleErrors(s);
  assertNoApiCalls(s);
  assertVoiceInvariants(scenario, s);
  assertExpectedEvents(scenario, s);
  assertForbiddenTextAndEvents(scenario, s);
  assertExpectedFoods(scenario, s);
  assertNoStalePendingPrompt(scenario, s);
  assertQuantityOnlyDidNotBecomeFood(scenario, s);
  assertFinalState(scenario, s);
  if (scenario.validate) scenario.validate(s);
}

function assertNoConsoleErrors(s) {
  if (s.consoleErrors.length) fail(s, 'No console errors', s.consoleErrors.join('\n'));
}

function assertNoApiCalls(s) {
  if (s.apiCalls.length) fail(s, 'No real AI/API calls', s.apiCalls.join('\n'));
}

function assertExpectedEvents(scenario, s) {
  for (const eventName of scenario.expected?.events || []) {
    if (!hasEvent(s, eventName) && !hasTrace(s, eventName)) {
      fail(s, `Expected event ${eventName}`, 'event was missing');
    }
  }
  for (const eventName of scenario.expected?.traceEvents || []) {
    if (!hasTrace(s, eventName)) fail(s, `Expected trace event ${eventName}`, 'trace event was missing');
  }
  const anyEvents = scenario.expected?.anyEvents || [];
  if (anyEvents.length && !anyEvents.some(eventName => hasEvent(s, eventName) || hasTrace(s, eventName))) {
    fail(s, `Expected one of ${anyEvents.join(', ')}`, 'none were recorded');
  }
}

function assertForbiddenTextAndEvents(scenario, s) {
  const visible = normalize(s.visibleText);
  for (const text of scenario.expected?.forbiddenUiText || []) {
    if (visible.includes(normalize(text))) fail(s, `Forbidden UI text ${text}`, 'text was visible');
  }
  const forbidden = new Set(['test_helper_bypasses_recognizer', ...(scenario.expected?.forbiddenTraceEvents || [])]);
  for (const eventName of forbidden) {
    if (hasTrace(s, eventName) || hasEvent(s, eventName)) fail(s, `Forbidden trace event ${eventName}`, 'event was recorded');
  }
}

function assertExpectedFoods(scenario, s) {
  const maxFood = scenario.expected?.maxFoodCount;
  if (maxFood) {
    const count = foodMatches(s, maxFood.pattern).length;
    if (count > maxFood.count) fail(s, `Max food count ${maxFood.pattern}`, `expected <= ${maxFood.count}, got ${count}`);
  }
  const maxCombined = scenario.expected?.maxCombinedFoodCount;
  if (maxCombined) {
    const count = (s.state.meal || []).filter(item =>
      maxCombined.patterns.some(pattern => pattern.test(item.name || ''))
    ).length;
    if (count > maxCombined.count) {
      fail(s, 'No duplicate clarification rows', `expected <= ${maxCombined.count}, got ${count}`);
    }
  }
}

function assertNoStalePendingPrompt(scenario, s) {
  if (!scenario.expected?.noStalePrompt) return;
  if (s.state.activeScreen === 'ls-quantity') {
    fail(s, 'No stale pending prompt', 'quantity screen remained active');
  }
  if (s.state.clarificationActive || s.state.clarification?.active) {
    fail(s, 'No stale pending prompt', 'clarification remained active');
  }
  const visible = normalize(s.visibleText);
  if (/how much|what type|what kind/.test(visible)) {
    fail(s, 'No stale pending prompt', 'prompt text remained visible');
  }
}

function assertQuantityOnlyDidNotBecomeFood(scenario, s) {
  const quantityOnlyUtterance = (scenario.utterances || []).some(utterance =>
    /^(?:\d+(?:\.\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|half|quarter)\s*(?:g|grams?|kg|ml|millilitres?|milliliters?|tbsp|tablespoons?|tsp|teaspoons?|cups?)$/i.test(String(utterance || '').trim())
  );
  if (!quantityOnlyUtterance && !scenario.expected?.quantityOnlyMustNotBeFood) return;
  const badRows = (s.state.meal || []).filter(item =>
    /^(?:\d+(?:\.\d+)?\s*(?:g|grams?|kg|ml|millilitres?|milliliters?|tbsp|tablespoons?|tsp|teaspoons?|cups?)?|grams?|millilitres?|milliliters?)$/i.test(String(item.name || '').trim())
  );
  if (badRows.length) {
    fail(s, 'Quantity-only utterance is not standalone food', badRows.map(item => item.name).join(', '));
  }
}

function assertFinalState(scenario, s) {
  const expected = scenario.expected?.finalStates;
  if (expected && !expected.includes(s.state.state)) {
    fail(s, 'Final voice state', `expected ${expected.join(' or ')}, got ${s.state.state}`);
  }
  if (s.state.processing && (s.state.recognizerActive || s.state.voiceCurrentlyListening || s.state.isRecording)) {
    fail(s, 'No processing/listening conflict', 'processing and listening flags are both active');
  }
  if (s.state.processing) {
    fail(s, 'No stuck processing state', 'scenario settled while still processing');
  }
  if (s.state.tapRecStarting && s.state.tapRecStopping) {
    fail(s, 'No duplicate recogniser/session states', 'tap recognizer is both starting and stopping');
  }
}

function assertVoiceInvariants(scenario, s) {
  const accepted = acceptedTranscripts(s);
  const feedbackTypes = new Set([
    'voice_feedback_requested',
    'voice_feedback_played',
    'voice_feedback_blocked',
    'silent_mode_skipped_feedback'
  ]);

  for (const turn of accepted) {
    const turnEvents = s.events.filter(event => event.turnId === turn.turnId);
    const outcomes = turnEvents.filter(event => event.type === 'outcome_decided');
    if (turn.turnId && outcomes.length !== 1) {
      fail(s, 'Every accepted transcript has exactly one outcome', `turn ${turn.turnId} had ${outcomes.length}`);
    }

    const sameTurnCatch = turnEvents.some(event =>
      ['error/fallback shown', 'ui_updated'].includes(event.type) && /didn'?t catch/i.test(eventText(event))
    );
    if (sameTurnCatch && normalize(s.visibleText).includes(normalize(turn.transcript || ''))) {
      fail(s, 'No accepted transcript later shows generic fallback', `turn ${turn.turnId} transcript ${turn.transcript}`);
    }

    const promptLike = turnEvents.some(event =>
      ['clarification shown', 'error/fallback shown'].includes(event.type) ||
      /clarification|quantity|fallback|didn'?t catch|how much|what type|what kind/i.test(eventText(event))
    );
    const feedbackIndex = turnEvents.findIndex(event => feedbackTypes.has(event.type));
    if (promptLike && feedbackIndex < 0) {
      fail(s, 'Prompts record voice or silent feedback', `turn ${turn.turnId} missing feedback path`);
    }

    const restartIndex = turnEvents.findIndex(event => event.type === 'session_restart_requested' || event.type === 'session_restart_completed');
    if (restartIndex >= 0 && feedbackIndex >= 0 && restartIndex < feedbackIndex) {
      fail(s, 'Listening does not restart before feedback path', `turn ${turn.turnId} restarted before feedback`);
    }

    const added = turnEvents.filter(event => event.type === 'ingredient row added');
    const keys = added.map(event => `${event.item?.name || event.prompt || 'unknown'}:${event.item?.weight || ''}`);
    const duplicate = keys.find((key, index) => keys.indexOf(key) !== index);
    if (duplicate) fail(s, 'No duplicate ingredient rows from one transcript turn', duplicate);
  }

  const promptIndexes = s.trace
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => ['clarification_prompt', 'ui_updated'].includes(entry.event) &&
      /clarification|quantity|fallback|didn'?t catch|how much/i.test(eventText(entry)));
  for (const { index, entry } of promptIndexes) {
    const window = s.trace.slice(index, index + 10);
    if (!window.some(event => feedbackTypes.has(event.event))) {
      fail(s, 'Prompts record voice or silent feedback', `${entry.event} lacked feedback path`);
    }
  }

  const staleFallbacks = s.events.filter(event => event.type === 'fallback_timer_ignored_stale_turn');
  for (const stale of staleFallbacks) {
    const staleIndex = s.events.indexOf(stale);
    const nextUi = s.events.slice(staleIndex + 1).find(event => event.type === 'ui_updated' && event.turnId === stale.turnId);
    if (nextUi && /didn'?t catch|recovery/i.test(eventText(nextUi))) {
      fail(s, 'Stale fallback timers do not update UI', `stale turn ${stale.turnId} updated UI`);
    }
  }

  const completed = s.events.filter(event => event.type === 'session_restart_completed');
  for (let i = 1; i < completed.length; i++) {
    const prev = completed[i - 1];
    const current = completed[i];
    if (prev.turnId && current.turnId && prev.turnId === current.turnId && Math.abs(new Date(current.t || 0) - new Date(prev.t || 0)) < 20) {
      fail(s, 'No duplicate recogniser/session states', `duplicate restart for turn ${current.turnId || 'unknown'}`);
    }
  }

  if (accepted.length && !scenario.expected?.allowGenericCatchAfterAccepted) {
    const visible = normalize(s.visibleText);
    if (/didn'?t catch that/.test(visible)) {
      fail(s, 'No generic fallback after accepted transcript', 'generic fallback was visible after a transcript was accepted');
    }
  }
}

function buildFailureReport(scenario, invariant, message, s) {
  return {
    scenario: scenario.name,
    fixture: scenario.fixture,
    utterances: scenario.utterances,
    expectedInvariant: invariant,
    message,
    actualTraceEvents: (s?.trace || []).map(compactTraceEvent),
    voiceEvents: (s?.events || []).map(compactTraceEvent),
    visibleUiText: s?.visibleText || '',
    mealRows: s?.state?.meal || [],
    reviewRows: s?.reviewRows || [],
    voiceState: s?.state || null,
    consoleErrors: s?.consoleErrors || []
  };
}

function fail(s, invariant, message) {
  const scenario = { name: s.scenarioName, fixture: s.fixture, utterances: s.utterances };
  throw new ScenarioFailure(scenario, invariant, message, s);
}

function compactTraceEvent(event) {
  return {
    t: event.t,
    type: event.type,
    event: event.event,
    turnId: event.turnId,
    transcript: event.transcript,
    key: event.key,
    route: event.route,
    reason: event.reason || event.issue,
    action: event.action,
    command: event.command,
    outcome: event.outcome,
    screen: event.screen,
    item: event.item
  };
}

function formatScenarioSummary(results) {
  const total = results.length;
  const passed = results.filter(result => result.status === 'passed').length;
  const failed = results.filter(result => result.status === 'failed').length;
  const skipped = results.filter(result => result.status === 'skipped').length;
  const averageDuration = total
    ? `${(results.reduce((sum, result) => sum + (result.durationMs || 0), 0) / total / 1000).toFixed(1)}s`
    : '0.0s';
  const lines = [
    '',
    'Voice fake-mic scenario summary',
    '',
    '| total scenarios | passed | failed | skipped | average duration |',
    '| ---: | ---: | ---: | ---: | ---: |',
    `| ${total} | ${passed} | ${failed} | ${skipped} | ${averageDuration} |`,
    '',
    '| group | scenarios | passed | failed | skipped |',
    '| --- | ---: | ---: | ---: | ---: |'
  ];
  for (const group of [...new Set(results.map(result => result.group))]) {
    const groupRows = results.filter(result => result.group === group);
    lines.push(`| ${group} | ${groupRows.length} | ${groupRows.filter(result => result.status === 'passed').length} | ${groupRows.filter(result => result.status === 'failed').length} | ${groupRows.filter(result => result.status === 'skipped').length} |`);
  }
  const failures = results.filter(result => result.status === 'failed');
  lines.push('', 'Failures with trace excerpts:');
  if (!failures.length) {
    lines.push('- none');
  } else {
    for (const failure of failures) {
      lines.push(`- ${failure.name}: ${failure.failureExcerpt || 'no excerpt available'}`);
    }
  }
  return lines.join('\n');
}

function failureExcerpt(error) {
  const text = String(error?.message || error || '').replace(/\s+/g, ' ').trim();
  return text.length > 600 ? `${text.slice(0, 600)}...` : text;
}

function acceptedTranscripts(s) {
  return s.events.filter(event => event.type === 'transcript_accepted');
}

function acceptedCount(s) {
  return acceptedTranscripts(s).length;
}

function hasAcceptedTranscript(s, pattern) {
  return acceptedTranscripts(s).some(event => pattern.test(event.transcript || ''));
}

function hasOutcome(s) {
  return hasEvent(s, 'outcome_decided') || hasEvent(s, 'parser result') || hasEvent(s, 'ingredient row added') || hasPrompt(s);
}

function hasPrompt(s) {
  return hasEvent(s, 'clarification shown') ||
    hasTrace(s, 'clarification_prompt') ||
    hasQuantityPrompt(s) ||
    /how much|what type|what kind|choose/i.test(s.visibleText || '');
}

function hasQuantityPrompt(s) {
  return s.state.activeScreen === 'ls-quantity' ||
    (s.trace || []).some(event => /quantity|how much/i.test(eventText(event))) ||
    /how much/i.test(s.visibleText || '');
}

function hasReviewRows(s) {
  return (s.reviewRows || []).length > 0 || s.state.activeScreen === 'ls-multi-confirm';
}

function findFood(s, pattern) {
  return foodMatches(s, pattern)[0] || null;
}

function foodMatches(s, pattern) {
  return (s.state.meal || []).filter(item => pattern.test(item.name || ''));
}

function hasFood(s, pattern, grams = null) {
  const direct = foodMatches(s, pattern).some(item => grams === null || Number(item.weight) === grams);
  if (direct) return true;
  return (s.reviewRows || []).some(row => {
    const text = `${row.text || ''} ${row.selected || ''} ${(row.values || []).join(' ')}`;
    return pattern.test(text) && (grams === null || text.includes(String(grams)));
  });
}

function allRowsText(s) {
  return [
    ...(s.state.meal || []).map(item => `${item.name || ''} ${item.weight || ''}g`),
    ...(s.reviewRows || []).map(row => `${row.text || ''} ${row.selected || ''} ${(row.values || []).join(' ')}`)
  ];
}

function hasEvent(s, eventName) {
  return (s.events || []).some(event => event.type === eventName || event.event === eventName);
}

function hasTrace(s, eventName, predicate = null) {
  return (s.trace || []).some(event => event.event === eventName && (!predicate || predicate(event)));
}

function hasNoSpeech(s) {
  return (s.trace || []).some(event => event.event === 'voice_error' && event.error === 'no-speech') ||
    (s.events || []).some(event => event.event === 'voice_error' && event.reason === 'no-speech');
}

function eventText(event) {
  return [
    event.type,
    event.event,
    event.transcript,
    event.prompt,
    event.key,
    event.reason,
    event.issue,
    event.action,
    event.command,
    event.outcome,
    event.screen
  ].filter(Boolean).join(' ').toLowerCase();
}

function normalize(text) {
  return String(text || '').toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, ' ').trim();
}

function transcriptMatchesExpected(actual, expected) {
  const actualText = normalize(actual);
  const expectedWords = normalize(expected)
    .split(' ')
    .filter(word => word.length > 2 && !['and', 'the'].includes(word));
  return expectedWords.length > 0 && expectedWords.some(word => actualText.includes(word));
}
