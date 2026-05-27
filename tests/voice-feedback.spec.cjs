const { test, expect } = require('@playwright/test');

async function bootFeedbackPage(page, { feedbackMode } = {}) {
  await page.addInitScript(mode => {
    localStorage.clear();
    localStorage.setItem('userPlan', 'free');
    localStorage.setItem('sous_onboarding_seen', '1');
    localStorage.setItem('sous_voice_input_mode', 'continuous');
    localStorage.setItem('sous_voice_test_harness', '1');
    if (mode) {
      localStorage.setItem('sous_voice_feedback_mode', mode);
      localStorage.setItem('sous_voice_feedback', mode === 'voice' ? '1' : '0');
    }
    window.__spokenFeedback = [];
    window.__audioFeedback = [];
    window.__vibrations = [];
    Object.defineProperty(navigator, 'vibrate', {
      configurable: true,
      value: pattern => {
        window.__vibrations.push(pattern);
        return true;
      }
    });
    window.SpeechSynthesisUtterance = function SpeechSynthesisUtterance(text) {
      this.text = text;
    };
    window.speechSynthesis = {
      speaking: false,
      cancel() {},
      getVoices() { return []; },
      speak(utterance) {
        window.__spokenFeedback.push(utterance.text);
        this.speaking = true;
        setTimeout(() => {
          if (utterance.onstart) utterance.onstart();
          this.speaking = false;
          if (utterance.onend) utterance.onend();
        }, 0);
      }
    };
    class MockAudio {
      constructor(src) {
        this.src = src;
        this.onended = null;
        this.onplaying = null;
        this.onerror = null;
      }
      play() {
        window.__audioFeedback.push(this.src);
        setTimeout(() => {
          if (this.onplaying) this.onplaying();
          if (this.onended) this.onended();
        }, 0);
        return Promise.resolve();
      }
      pause() {}
    }
    window.Audio = MockAudio;
  }, feedbackMode || null);
  await page.goto('/?sousVoiceTest=1');
  await page.waitForFunction(() => typeof window.getVoiceFeedbackMode === 'function');
  await page.evaluate(() => {
    window.getCachedAudioUrlAsync = async () => null;
    window.getCachedResponseAsync = async key => ({
      got_it: 'Got it.',
      added_that: 'Added that.',
      logged: 'Logged.',
      done: 'Done.'
    })[key] || '';
  });
}

test('default feedback mode is silent when no localStorage setting exists', async ({ page }) => {
  await bootFeedbackPage(page);

  const mode = await page.evaluate(() => ({
    current: window.getVoiceFeedbackMode(),
    storedMode: localStorage.getItem('sous_voice_feedback_mode'),
    legacy: localStorage.getItem('sous_voice_feedback')
  }));

  expect(mode).toEqual({
    current: 'silent',
    storedMode: 'silent',
    legacy: '0'
  });
});

test('silent mode suppresses success speech and uses haptics when available', async ({ page }) => {
  await bootFeedbackPage(page, { feedbackMode: 'silent' });

  await page.evaluate(() => speakSuccessCue());
  await page.waitForTimeout(100);

  const result = await page.evaluate(() => ({
    spoken: window.__spokenFeedback,
    vibrations: window.__vibrations,
    trace: window.sousVoiceDebug().filter(event => event.event === 'silent_mode_skipped_feedback')
  }));

  expect(result.spoken).toEqual([]);
  expect(result.vibrations).toEqual([20]);
  expect(result.trace.some(event =>
    ['got_it', 'added_that', 'logged'].includes(event.key) &&
    event.reason === 'feedback_mode_silent'
  )).toBe(true);
});

test('voice mode speaks one rotating short confirmation', async ({ page }) => {
  await bootFeedbackPage(page, { feedbackMode: 'voice' });

  await page.evaluate(() => speakSuccessCue());
  await expect.poll(
    () => page.evaluate(() => window.sousVoiceDebug().filter(event =>
      event.event === 'voice_feedback_requested' &&
      ['got_it', 'added_that', 'logged'].includes(event.key) &&
      !['silent', 'skipped_debounce'].includes(event.route)
    ).length),
    { timeout: 3000 }
  ).toBe(1);

  const requested = await page.evaluate(() => window.sousVoiceDebug().filter(event =>
    event.event === 'voice_feedback_requested' &&
    ['got_it', 'added_that', 'logged'].includes(event.key)
  ));
  expect(requested).toHaveLength(1);
});

test('summary and save do not speak duplicate Done and Logged confirmations', async ({ page }) => {
  await bootFeedbackPage(page, { feedbackMode: 'voice' });

  await page.evaluate(() => {
    switchTab('log', { fresh: true, silent: true, section: 'breakfast' });
    addIngredientToMeal({
      name: 'Oats',
      weight: 75,
      kcal: 292,
      protein: 12.8,
      carbs: 49.5,
      fat: 5.3,
      rawFood: { name: 'Oats', w: 100, kcal: 389, p: 17, c: 66, f: 7, fi: 10 }
    }, { source: 'test' });
    showSummary(true);
    document.getElementById('save-meal-btn').click();
  });

  await expect.poll(
    () => page.evaluate(() => window.sousVoiceDebug().filter(event =>
      event.event === 'voice_feedback_requested' &&
      event.key === 'logged' &&
      !['silent', 'skipped_debounce'].includes(event.route)
    ).length),
    { timeout: 3000 }
  ).toBe(1);

  const result = await page.evaluate(() => ({
    requested: window.sousVoiceDebug().filter(event => event.event === 'voice_feedback_requested').map(event => event.key),
    suppressedDone: window.sousVoiceDebug().some(event =>
      event.event === 'voice_success_feedback_suppressed' &&
      event.key === 'done' &&
      event.reason === 'summary_review_waits_for_save'
    )
  }));

  expect(result.requested).toEqual(['logged']);
  expect(result.suppressedDone).toBe(true);
});
