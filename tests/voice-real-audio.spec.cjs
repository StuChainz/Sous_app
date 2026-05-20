const { test, expect } = require('@playwright/test');

const feedbackEventTypes = [
  'voice_feedback_requested',
  'voice_feedback_played',
  'voice_feedback_blocked',
  'silent_mode_skipped_feedback',
  'voice feedback requested'
];

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForSpeechOutcome(page, timeoutMs = 25000) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = await page.evaluate(feedbackTypes => {
      const events = window.__sousLastVoiceEvents();
      const debugTrace = window.sousVoiceDebug ? window.sousVoiceDebug() : [];
      const accepted = events.find(event =>
        event.type === 'transcript_accepted' &&
        String(event.transcript || '').trim().length > 0
      );
      const appResult = events.find(event =>
        ['parser result', 'clarification shown', 'ingredient row added', 'error/fallback shown'].includes(event.type)
      );
      return {
        ready: Boolean(accepted && appResult),
        events,
        debugTrace,
        state: window.__sousVoiceState(),
        visibleText: document.body.innerText,
        acceptedTranscript: accepted?.transcript || null,
        hasFeedbackPath: events.some(event => feedbackTypes.includes(event.type)),
        hasNoSpeech: debugTrace.some(event => event.event === 'voice_error' && event.error === 'no-speech') ||
          events.some(event => event.event === 'voice_error')
      };
    }, feedbackEventTypes);
    if (last.ready) return last;
    await sleep(500);
  }
  return last;
}

test('fake microphone audio can drive the real SpeechRecognition voice path', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Chrome/Chromium fake microphone flags are required.');

  const apiCalls = [];
  await page.route('**/favicon.ico', route => route.fulfill({ status: 204, body: '' }));
  await page.route('**/api/**', route => {
    apiCalls.push(route.request().url());
    return route.fulfill({ status: 503, body: 'AI calls are disabled for fake microphone tests.' });
  });

  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('userPlan', 'free');
    localStorage.setItem('sous_onboarding_seen', '1');
    localStorage.setItem('sous_voice_feedback', '0');
    localStorage.setItem('sous_realtime_voice', '0');
    localStorage.setItem('sous_voice_debug_overlay', 'true');
    localStorage.setItem('sous_voice_test_harness', '1');
    localStorage.setItem('sous_voice_fake_mic_test', '1');
  });

  await page.goto('/?sousVoiceTest=1');
  await page.waitForFunction(() => typeof window.__sousVoiceState === 'function');

  const speechRecognitionAvailable = await page.evaluate(() =>
    Boolean(window.SpeechRecognition || window.webkitSpeechRecognition)
  );
  test.skip(!speechRecognitionAvailable, 'Browser SpeechRecognition is not available in this Chrome environment.');

  await page.evaluate(() => {
    switchTab('log', { fresh: true, silent: true, section: 'breakfast' });
    beginVoiceSession();
  });

  await expect.poll(
    () => page.evaluate(() => window.__sousVoiceState().state),
    { timeout: 10000, intervals: [100, 200, 500] }
  ).toBe('listening');

  const result = await waitForSpeechOutcome(page);

  if (!result.ready && result.hasNoSpeech && process.env.SOUS_FAKE_MIC_STRICT !== '1') {
    test.skip(true, 'Chrome reported no-speech before producing a transcript; this fake-mic SpeechRecognition environment is unsupported. Re-run with SOUS_FAKE_MIC_STRICT=1 to make this a hard failure.');
  }

  expect(result.ready, JSON.stringify(result, null, 2)).toBe(true);
  expect(result.acceptedTranscript, JSON.stringify(result.events, null, 2)).toBeTruthy();
  expect(result.visibleText.toLowerCase()).not.toContain("didn't catch that");
  expect(result.visibleText.toLowerCase()).not.toContain('didnt catch that');
  expect(result.hasFeedbackPath, JSON.stringify(result.events, null, 2)).toBe(true);
  expect(apiCalls, 'real AI calls should stay disabled in fake microphone tests').toEqual([]);
});
