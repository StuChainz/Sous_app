const { test, expect } = require('@playwright/test');
const { MISHEARING_CASES } = require('./voice-mishearing-corpus.cjs');

const PROMPT_SCREENS = new Set(['ls-confirm', 'ls-ambiguous', 'ls-multi-confirm', 'ls-quantity', 'ls-food-choice', 'ls-multi-resolve']);
const SAFE_PROMPT_RE = /didn't catch|didnt catch|try again|no match|did you mean|which|what type|how much|tap to choose|create custom|create "/i;

async function bootVoiceHarness(page) {
  await page.route('**/favicon.ico', route => route.fulfill({ status: 204, body: '' }));
  await page.route('**/api/**', route => route.fulfill({ status: 503, body: 'Network calls are disabled in mishearing regression tests.' }));
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('userPlan', 'free');
    localStorage.setItem('sous_onboarding_seen', '1');
    localStorage.setItem('sous_voice_feedback', '0');
    localStorage.setItem('sous_realtime_voice', '0');
    localStorage.setItem('sous_voice_test_harness', '1');
  });
  await page.goto('/?sousVoiceTest=1');
  await page.waitForFunction(() => typeof window.__sousStartVoiceTestSession === 'function');
}

async function startFreshVoiceSession(page) {
  await page.evaluate(() => window.__sousStartVoiceTestSession('breakfast'));
  await expect.poll(() => page.evaluate(() => window.__sousVoiceState().state), { timeout: 6000 }).toBe('listening');
}

async function installAIRepairMock(page, candidates = []) {
  await page.evaluate(candidates => {
    window.__aiRepairCalls = [];
    window.repairTranscriptWithAI = async payload => {
      window.__aiRepairCalls.push(payload);
      return candidates;
    };
  }, candidates);
}

async function sendVoiceInput(page, input) {
  await page.evaluate(input => window.__sousTestVoiceTranscript(input), input);
  await expect.poll(() => page.evaluate(() => window.__sousVoiceState().processing), { timeout: 6000 }).toBe(false);
}

async function getSnapshot(page) {
  return page.evaluate(() => ({
    state: window.__sousVoiceState(),
    events: window.__sousLastVoiceEvents(),
    trace: window.sousVoiceDebug ? window.sousVoiceDebug() : [],
    decisionTrace: window.__sousVoiceDecisionTrace ? window.__sousVoiceDecisionTrace() : [],
    visibleText: document.body.innerText
  }));
}

function lower(value) {
  return String(value || '').toLowerCase();
}

function allVisibleCandidateNames(snapshot) {
  return [
    ...((snapshot.state.meal || []).map(item => item.name)),
    ...((snapshot.state.reviewIngredientNames || []).map(name => String(name).replace(/\s+/g, ' ').trim())),
    snapshot.state.transcriptText,
    snapshot.state.voiceCorrectText,
    snapshot.visibleText
  ].filter(Boolean).map(lower);
}

function hasFoodLike(snapshot, expected) {
  const needle = lower(expected);
  return allVisibleCandidateNames(snapshot).some(text => text.includes(needle));
}

function findMealItem(snapshot, expected) {
  const needle = lower(expected);
  return (snapshot.state.meal || []).find(item => lower(item.name).includes(needle));
}

function countMealItems(snapshot, expected) {
  const needle = lower(expected);
  return (snapshot.state.meal || []).filter(item => lower(item.name).includes(needle)).length;
}

function hasSafePrompt(snapshot) {
  const screen = snapshot.state.activeScreen;
  const promptText = [
    snapshot.state.transcriptText,
    snapshot.state.voiceCorrectText,
    snapshot.visibleText
  ].filter(Boolean).join('\n');
  return PROMPT_SCREENS.has(screen) || SAFE_PROMPT_RE.test(promptText);
}

function assertTraceEvents(snapshot, requiredEvents = []) {
  for (const eventName of requiredEvents) {
    expect(
      snapshot.trace.some(entry => entry.event === eventName) || snapshot.events.some(entry => entry.type === eventName || entry.event === eventName),
      `missing trace/event ${eventName}\n${JSON.stringify(snapshot.trace.slice(-12), null, 2)}`
    ).toBe(true);
  }
}

function assertNoForbiddenFoods(snapshot, forbiddenFoods = []) {
  for (const food of forbiddenFoods || []) {
    expect(
      countMealItems(snapshot, food),
      `forbidden food was auto-added: ${food}\n${JSON.stringify(snapshot.state.meal, null, 2)}`
    ).toBe(0);
  }
}

function assertExpectedWeights(snapshot, expectedWeights = {}) {
  for (const [name, expectedWeight] of Object.entries(expectedWeights || {})) {
    const item = findMealItem(snapshot, name);
    expect(item, `missing weighted item ${name}\n${JSON.stringify(snapshot.state.meal, null, 2)}`).toBeTruthy();
    expect(Number(item.weight), `wrong weight for ${name}`).toBe(Number(expectedWeight));
  }
}

function assertMaxFoodCounts(snapshot, maxFoodCounts = {}) {
  for (const [name, maxCount] of Object.entries(maxFoodCounts || {})) {
    expect(countMealItems(snapshot, name), `too many ${name} rows`).toBeLessThanOrEqual(maxCount);
  }
}

test.describe('voice mishearing matrix', () => {
  test.beforeEach(async ({ page }) => {
    await bootVoiceHarness(page);
  });

  for (const scenario of MISHEARING_CASES) {
    test(scenario.name, async ({ page }) => {
      await installAIRepairMock(page, scenario.aiCandidates || []);
      await startFreshVoiceSession(page);

      for (const seed of scenario.seed || []) {
        await sendVoiceInput(page, seed);
        await expect.poll(() => page.evaluate(() => window.__sousVoiceState().processing), { timeout: 6000 }).toBe(false);
      }

      await sendVoiceInput(page, scenario.input);
      const snapshot = await getSnapshot(page);

      assertTraceEvents(snapshot, scenario.expectTrace || []);
      assertNoForbiddenFoods(snapshot, scenario.forbiddenFoods || []);
      assertNoForbiddenFoods(snapshot, scenario.forbiddenAutoAdd || []);
      assertMaxFoodCounts(snapshot, scenario.maxFoodCounts || {});

      const expectedFoods = scenario.expectFoods || [];
      const hasAllExpected = expectedFoods.every(food => hasFoodLike(snapshot, food));
      const hasAllExpectedMealItems = expectedFoods.every(food => !!findMealItem(snapshot, food));

      if (!scenario.safeIfMissing || hasAllExpectedMealItems) {
        assertExpectedWeights(snapshot, scenario.expectWeights || {});
      }

      if (expectedFoods.length && !scenario.safeIfMissing) {
        expect(hasAllExpected, `missing expected food(s): ${expectedFoods.join(', ')}\n${JSON.stringify(snapshot.state, null, 2)}`).toBe(true);
      }

      if (scenario.safeOnly || scenario.safeIfMissing) {
        expect(
          hasAllExpected || hasSafePrompt(snapshot),
          `expected correct parse or safe prompt/review/fallback\n${JSON.stringify(snapshot.state, null, 2)}`
        ).toBe(true);
      }

      expect(snapshot.decisionTrace, 'decision trace export should be available').toEqual(expect.any(Array));
    });
  }
});
