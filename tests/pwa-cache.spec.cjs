const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

test('service worker app shell includes every local app script and uses the registered cache version', () => {
  const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');

  const localScripts = [...index.matchAll(/<script\s+src="([^":]+)"/g)]
    .map(match => './' + match[1].split('?')[0])
    .filter(src => src.startsWith('./js/'));
  const appShellAssets = [...sw.matchAll(/'([^']+)'/g)]
    .map(match => match[1]);

  const missingScripts = localScripts.filter(src => !appShellAssets.includes(src));
  expect(missingScripts).toEqual([]);

  const swVersion = sw.match(/CACHE_VERSION\s*=\s*'([^']+)'/)?.[1];
  const appVersion = app.match(/SOUS_CACHE_VERSION\s*=\s*'([^']+)'/)?.[1];
  expect(swVersion).toBeTruthy();
  expect(appVersion).toBe(swVersion);
});
