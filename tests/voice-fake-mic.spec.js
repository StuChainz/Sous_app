const path = require('path');
const { test, expect, chromium } = require('@playwright/test');

test.describe.configure({ mode: 'serial' });
test.setTimeout(90000);

const baseURL = process.env.SOUS_TEST_BASE_URL || 'http://127.0.0.1:8732';
const fixtureRoot = path.resolve(__dirname, 'audio-fixtures');
const strictFakeMic = process.env.SOUS_FAKE_MIC_STRICT === '1';
const recognitionModeSetting = process.env.SOUS_FAKE_MIC_RECOGNITION || 'auto';
let fakeMicUnsupported = false;
let nativeFakeSpeechWorks = null;

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

for (const scenario of [...singleTurnScenarios, ...multiTurnScenarios]) {
  test(scenario.name, async () => {
    if (fakeMicUnsupported && !strictFakeMic) {
      test.skip(true, 'Previous fake-mic scenario showed this Chrome speech environment does not accept fake microphone audio.');
    }

    const snapshot = await runScenario(scenario);
    validateScenario(scenario, snapshot);
  });
}

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
      localStorage.setItem('sous_voice_feedback', silentMode ? '0' : '1');
      localStorage.setItem('sous_realtime_voice', '0');
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
    headless: process.env.SOUS_FAKE_MIC_HEADLESS === '1',
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
    if (prev.turnId === current.turnId && Math.abs(new Date(current.t || 0) - new Date(prev.t || 0)) < 20) {
      fail(s, 'No duplicate recogniser/session states', `duplicate restart for turn ${current.turnId || 'unknown'}`);
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
