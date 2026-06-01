const { test, expect } = require('@playwright/test');

test.describe('server fetch helper', () => {
  test('returns status, ok, text, and parsed JSON when possible', async () => {
    const { _test } = require('../server.js');

    const result = await _test.fetchWithTimeout('https://example.test/json', {
      method: 'POST'
    }, 100, async (url, options) => {
      expect(url).toBe('https://example.test/json');
      expect(options.method).toBe('POST');
      expect(options.signal).toBeTruthy();
      return {
        status: 201,
        ok: true,
        text: async () => '{"hello":"world"}'
      };
    });

    expect(result).toEqual({
      status: 201,
      ok: true,
      text: '{"hello":"world"}',
      json: { hello: 'world' }
    });
  });

  test('keeps non-JSON response text without throwing', async () => {
    const { _test } = require('../server.js');

    const result = await _test.fetchWithTimeout('https://example.test/text', {}, 100, async () => ({
      status: 502,
      ok: false,
      text: async () => 'upstream failed'
    }));

    expect(result).toEqual({
      status: 502,
      ok: false,
      text: 'upstream failed',
      json: null
    });
  });

  test('aborts when the timeout expires', async () => {
    const { _test } = require('../server.js');

    await expect(_test.fetchWithTimeout('https://example.test/slow', {}, 5, async (url, options) => {
      return new Promise((resolve, reject) => {
        options.signal.addEventListener('abort', () => {
          const err = new Error('aborted');
          err.name = 'AbortError';
          reject(err);
        });
      });
    })).rejects.toThrow('Request timed out after 5ms.');
  });
});
