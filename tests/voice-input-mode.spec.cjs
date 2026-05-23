const { test, expect } = require('@playwright/test');

async function installHoldModePage(page, options = 'hold') {
  const expectedMode = typeof options === 'string' ? options : (options.mode || 'hold');
  await page.addInitScript(initialOptions => {
    const opts = typeof initialOptions === 'string'
      ? { mode: initialOptions }
      : (initialOptions || {});
    const mode = opts.mode || 'hold';
    const startDelay = Number(opts.startDelay || 0);
    localStorage.clear();
    localStorage.setItem('userPlan', 'free');
    localStorage.setItem('sous_onboarding_seen', '1');
    localStorage.setItem('sous_voice_feedback', '0');
    localStorage.setItem('sous_realtime_voice', '0');
    localStorage.setItem('sous_voice_test_harness', '1');
    localStorage.setItem('sous_voice_input_mode', mode);
    window.__mockVoiceStats = { starts: 0, stops: 0, ends: 0, active: 0 };
    window.__mockRecognizers = [];
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
        window.__mockRecognizers.push(this);
      }
      start() {
        if (this._active) throw new DOMException('Recognition already started', 'InvalidStateError');
        this._active = true;
        this._ended = false;
        window.__mockVoiceStats.starts += 1;
        window.__mockVoiceStats.active += 1;
        setTimeout(() => this.onstart && this.onstart(), startDelay);
      }
      stop() {
        window.__mockVoiceStats.stops += 1;
        this.__finish();
      }
      abort() {
        this.__finish();
      }
      __emitFinal(transcript, confidence = 0.96) {
        const result = [{ transcript, confidence }];
        result.isFinal = true;
        this.onresult && this.onresult({ resultIndex: 0, results: [result] });
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
    }
    window.SpeechRecognition = MockSpeechRecognition;
    window.webkitSpeechRecognition = MockSpeechRecognition;
  }, options);
  await page.goto('/?sousVoiceTest=1');
  await page.waitForFunction(() => typeof window.__sousVoiceState === 'function');
  await page.evaluate(() => switchTab('log', { fresh: true, silent: true, section: 'breakfast' }));
  await expect.poll(() => page.evaluate(() => window.__sousVoiceState().voiceInputMode)).toBe(expectedMode);
}

async function holdStart(page) {
  await page.locator('#mic-btn').dispatchEvent('pointerdown', { pointerId: 1, pointerType: 'mouse', bubbles: true });
  await expect.poll(() => page.evaluate(() => window.__sousVoiceState().state), { timeout: 3000 }).toBe('listening');
}

async function holdStop(page) {
  await page.locator('#mic-btn').dispatchEvent('pointerup', { pointerId: 1, pointerType: 'mouse', bubbles: true });
}

async function emitFinal(page, transcript) {
  await page.evaluate(text => {
    window.__mockRecognizers[window.__mockRecognizers.length - 1].__emitFinal(text);
  }, transcript);
}

test('hold-to-talk adds one final transcript and does not auto-restart', async ({ page }) => {
  await installHoldModePage(page);

  await holdStart(page);
  await emitFinal(page, 'oats 75');
  await holdStop(page);
  await holdStop(page);

  await expect.poll(() => page.evaluate(() => window.__sousVoiceState().processing), { timeout: 5000 }).toBe(false);
  await expect.poll(() => page.evaluate(() => window.__sousVoiceState().meal.map(item => [item.name, item.weight]))).toEqual([
    ['Oats', 75]
  ]);
  await page.waitForTimeout(900);

  const state = await page.evaluate(() => window.__sousVoiceState());
  const stats = await page.evaluate(() => window.__mockVoiceStats);
  expect(state.sessionActive).toBe(false);
  expect(state.state).toBe('idle');
  expect(state.restartCount).toBe(0);
  expect(stats.starts).toBe(1);
  expect(state.meal).toHaveLength(1);
});

test('hold-to-talk silence returns to idle without a recovery loop', async ({ page }) => {
  await installHoldModePage(page);

  await holdStart(page);
  await holdStop(page);
  await page.waitForTimeout(900);

  const state = await page.evaluate(() => window.__sousVoiceState());
  const stats = await page.evaluate(() => window.__mockVoiceStats);
  const trace = await page.evaluate(() => window.sousVoiceDebug());
  expect(state.state).toBe('idle');
  expect(state.listenStatus).toMatch(/Hold (and speak|to speak)/);
  expect(state.meal).toHaveLength(0);
  expect(stats.starts).toBe(1);
  expect(trace.some(event => event.event === 'session_restart_requested')).toBe(false);
});

test('very short hold release cannot leave a delayed recognizer listening', async ({ page }) => {
  await installHoldModePage(page, { mode: 'hold', startDelay: 80 });

  await page.locator('#mic-btn').dispatchEvent('pointerdown', { pointerId: 1, pointerType: 'mouse', bubbles: true });
  await page.locator('#mic-btn').dispatchEvent('pointerup', { pointerId: 1, pointerType: 'mouse', bubbles: true });
  await page.waitForTimeout(180);

  const state = await page.evaluate(() => window.__sousVoiceState());
  const stats = await page.evaluate(() => window.__mockVoiceStats);
  const trace = await page.evaluate(() => window.sousVoiceDebug());
  expect(state.state).toBe('idle');
  expect(state.recognizerActive).toBe(false);
  expect(state.voiceHoldActive).toBe(false);
  expect(state.meal).toHaveLength(0);
  expect(stats.active).toBe(0);
  expect(trace.some(event => event.event === 'recognizer_start_blocked' && event.reason === 'hold_released_before_start')).toBe(true);
});

test('touchcancel stops an active hold-to-talk recognizer', async ({ page }) => {
  await installHoldModePage(page);

  await holdStart(page);
  await page.locator('#mic-btn').dispatchEvent('touchcancel', { bubbles: true, cancelable: true });
  await page.waitForTimeout(250);

  const state = await page.evaluate(() => window.__sousVoiceState());
  const stats = await page.evaluate(() => window.__mockVoiceStats);
  const trace = await page.evaluate(() => window.sousVoiceDebug());
  expect(state.state).toBe('idle');
  expect(state.recognizerActive).toBe(false);
  expect(state.voiceHoldActive).toBe(false);
  expect(stats.active).toBe(0);
  expect(trace.some(event => event.event === 'hold_to_talk_stop' && event.reason === 'touch cancel')).toBe(true);
});

test('pagehide during hold finalizes a pending final transcript and does not restart', async ({ page }) => {
  await installHoldModePage(page);

  await holdStart(page);
  await emitFinal(page, 'oats 75');
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));

  await expect.poll(() => page.evaluate(() => window.__sousVoiceState().processing), { timeout: 5000 }).toBe(false);
  await expect.poll(() => page.evaluate(() => window.__sousVoiceState().meal.map(item => [item.name, item.weight]))).toEqual([
    ['Oats', 75]
  ]);

  const state = await page.evaluate(() => window.__sousVoiceState());
  const stats = await page.evaluate(() => window.__mockVoiceStats);
  const trace = await page.evaluate(() => window.sousVoiceDebug());
  expect(state.sessionActive).toBe(false);
  expect(state.state).toBe('idle');
  expect(state.restartCount).toBe(0);
  expect(stats.active).toBe(0);
  expect(trace.some(event => event.event === 'voice_lifecycle_pause' && event.reason === 'pagehide' && event.inputMode === 'hold')).toBe(true);
});

test('visibility loss during hold stops cleanly without adding a silent ingredient', async ({ page }) => {
  await installHoldModePage(page);

  await holdStart(page);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(250);

  const state = await page.evaluate(() => window.__sousVoiceState());
  const stats = await page.evaluate(() => window.__mockVoiceStats);
  const trace = await page.evaluate(() => window.sousVoiceDebug());
  expect(state.state).toBe('idle');
  expect(state.recognizerActive).toBe(false);
  expect(state.voiceHoldActive).toBe(false);
  expect(state.meal).toHaveLength(0);
  expect(stats.active).toBe(0);
  expect(trace.some(event => event.event === 'voice_lifecycle_pause' && event.reason === 'page hidden' && event.inputMode === 'hold')).toBe(true);
  expect(trace.some(event => event.event === 'session_restart_requested')).toBe(false);
});

test('hold mode review screens use tap/type copy and do not start prompt listeners', async ({ page }) => {
  await installHoldModePage(page);

  await page.evaluate(() => {
    const oats = parseText('oats 75')[0];
    showConfirm(oats);
  });
  await expect.poll(() => page.evaluate(() => window.__sousVoiceState().activeScreen)).toBe('ls-confirm');
  await expect.poll(() => page.evaluate(() => window.__sousVoiceState().confirmVoiceHint)).toBe('Review and tap to confirm');
  await page.waitForTimeout(350);
  expect(await page.evaluate(() => window.__mockVoiceStats.starts)).toBe(0);

  await page.evaluate(() => {
    const oats = parseText('oats')[0];
    askQuantity(oats);
  });
  await expect.poll(() => page.evaluate(() => window.__sousVoiceState().activeScreen)).toBe('ls-quantity');
  await expect.poll(() => page.evaluate(() => window.__sousVoiceState().quantityVoiceHint)).toBe('Enter the amount or go back and hold mic again');
  await page.waitForTimeout(350);
  expect(await page.evaluate(() => window.__mockVoiceStats.starts)).toBe(0);

  await page.evaluate(() => {
    showAmbiguous([findFoodByText('cheddar'), findFoodByText('mozzarella')].filter(Boolean), 30, 'cheese', 'Which cheese?');
  });
  await expect.poll(() => page.evaluate(() => window.__sousVoiceState().activeScreen)).toBe('ls-ambiguous');
  await expect.poll(() => page.evaluate(() => window.__sousVoiceState().ambiguousVoiceHint)).toBe('Hold mode is off while reviewing. Tap to choose');
  await page.waitForTimeout(350);
  expect(await page.evaluate(() => window.__mockVoiceStats.starts)).toBe(0);

  await page.evaluate(() => {
    showMultiConfirm([parseText('oats')[0], parseText('banana')[0]].filter(Boolean));
  });
  await expect.poll(() => page.evaluate(() => window.__sousVoiceState().activeScreen)).toBe('ls-multi-confirm');
  await expect.poll(() => page.evaluate(() => window.__sousVoiceState().multiConfirmVoiceHint)).toBe('Hold mode is off while reviewing. Edit below or add to meal');
  await page.waitForTimeout(350);
  expect(await page.evaluate(() => window.__mockVoiceStats.starts)).toBe(0);
});

test('hold-to-talk ignores stale callbacks from an old recognizer run', async ({ page }) => {
  await installHoldModePage(page);

  await holdStart(page);
  await emitFinal(page, 'oats 75');
  await holdStop(page);
  await expect.poll(() => page.evaluate(() => window.__sousVoiceState().meal.length), { timeout: 5000 }).toBe(1);

  await holdStart(page);
  await page.evaluate(() => {
    window.__mockRecognizers[0].__emitFinal('banana 2');
    window.__mockRecognizers[0].__finish();
  });
  await holdStop(page);
  await page.waitForTimeout(900);

  const state = await page.evaluate(() => window.__sousVoiceState());
  const trace = await page.evaluate(() => window.sousVoiceDebug());
  expect(state.meal.map(item => item.name)).toEqual(['Oats']);
  expect(trace.some(event => event.event === 'stale_callback_ignored')).toBe(true);
});

test('switching continuous to hold invalidates in-flight recognizer callbacks', async ({ page }) => {
  await installHoldModePage(page, 'continuous');

  await page.evaluate(() => beginVoiceSession());
  await expect.poll(() => page.evaluate(() => window.__sousVoiceState().state), { timeout: 3000 }).toBe('listening');

  await page.evaluate(() => setVoiceInputMode('hold'));
  await page.evaluate(() => {
    window.__mockRecognizers[window.__mockRecognizers.length - 1].__emitFinal('banana 2');
    window.__mockRecognizers[window.__mockRecognizers.length - 1].__finish();
  });
  await page.waitForTimeout(900);

  const state = await page.evaluate(() => window.__sousVoiceState());
  const trace = await page.evaluate(() => window.sousVoiceDebug());
  expect(state.voiceInputMode).toBe('hold');
  expect(state.sessionActive).toBe(false);
  expect(state.meal).toHaveLength(0);
  expect(trace.some(event => event.event === 'stale_callback_ignored')).toBe(true);
  expect(trace.some(event => event.event === 'session_restart_requested')).toBe(false);
});

test('switching hold to continuous invalidates held recognizer callbacks', async ({ page }) => {
  await installHoldModePage(page);

  await holdStart(page);
  const holdRecognizerIndex = await page.evaluate(() => window.__mockRecognizers.length - 1);
  await page.evaluate(() => setVoiceInputMode('continuous'));
  await page.evaluate(index => {
    window.__mockRecognizers[index].__emitFinal('oats 75');
    window.__mockRecognizers[index].__finish();
  }, holdRecognizerIndex);
  await page.waitForTimeout(900);

  const state = await page.evaluate(() => window.__sousVoiceState());
  const trace = await page.evaluate(() => window.sousVoiceDebug());
  expect(state.voiceInputMode).toBe('continuous');
  expect(state.meal).toHaveLength(0);
  expect(state.state).toBe('idle');
  expect(trace.some(event => event.event === 'stale_callback_ignored')).toBe(true);
});

test('continuous voice mode still restarts after a transcript', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('userPlan', 'free');
    localStorage.setItem('sous_onboarding_seen', '1');
    localStorage.setItem('sous_voice_feedback', '0');
    localStorage.setItem('sous_voice_test_harness', '1');
    localStorage.setItem('sous_voice_input_mode', 'continuous');
  });
  await page.goto('/?sousVoiceTest=1');
  await page.waitForFunction(() => typeof window.__sousStartVoiceTestSession === 'function');
  await page.evaluate(() => window.__sousStartVoiceTestSession('breakfast'));
  await expect.poll(() => page.evaluate(() => window.__sousVoiceState().state)).toBe('listening');

  await page.evaluate(() => window.__sousTestVoiceTranscript('oats 75'));
  await expect.poll(() => page.evaluate(() => window.__sousVoiceState().processing), { timeout: 5000 }).toBe(false);
  await expect.poll(() => page.evaluate(() => window.__sousVoiceState().state), { timeout: 5000 }).toBe('listening');
  expect(await page.evaluate(() => window.__sousVoiceState().restartCount)).toBeGreaterThan(0);
});
