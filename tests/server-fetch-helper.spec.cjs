const { test, expect } = require('@playwright/test');

test('fetchUpstream returns status, raw text, and parsed JSON for valid JSON', async () => {
  const { _test } = require('../server.js');

  const result = await _test.fetchUpstream(
    'https://example.test/valid',
    { method: 'POST' },
    100,
    async () => new Response(JSON.stringify({ ok: true, value: 42 }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' }
    })
  );

  expect(result.status).toBe(201);
  expect(result.ok).toBe(true);
  expect(result.text).toBe('{"ok":true,"value":42}');
  expect(result.json).toEqual({ ok: true, value: 42 });
  expect(result.jsonError).toBe(null);
});

test('fetchUpstream keeps invalid JSON as raw text without throwing', async () => {
  const { _test } = require('../server.js');

  const result = await _test.fetchUpstream(
    'https://example.test/invalid',
    {},
    100,
    async () => new Response('not-json', { status: 502 })
  );

  expect(result.status).toBe(502);
  expect(result.ok).toBe(false);
  expect(result.text).toBe('not-json');
  expect(result.json).toBe(null);
  expect(result.jsonError).toBeTruthy();
});

test('fetchUpstream aborts when the timeout expires', async () => {
  const { _test } = require('../server.js');

  const slowFetch = async (_url, options = {}) => new Promise((resolve, reject) => {
    options.signal?.addEventListener('abort', () => {
      const err = new Error('aborted');
      err.name = 'AbortError';
      reject(err);
    }, { once: true });
  });

  await expect(_test.fetchUpstream('https://example.test/slow', {}, 5, slowFetch))
    .rejects.toMatchObject({
      name: 'UpstreamTimeoutError',
      code: 'UPSTREAM_TIMEOUT',
      timeoutMs: 5
    });
});
