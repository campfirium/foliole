// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';

import entryHtml from './index.html?raw';
import startupScript from './public/android-startup.js?raw';

const installedListeners: Array<Parameters<Window['addEventListener']>> = [];

function start(ua = 'Mozilla/5.0 (Linux; Android 9; wv) Chrome/74.0.0.0') {
  const entry = new DOMParser().parseFromString(entryHtml, 'text/html');
  const startup = entry.getElementById('android-startup')!;
  document.body.replaceChildren(startup);
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(ua);
  vi.spyOn(navigator, 'language', 'get').mockReturnValue('en');
  const addEventListener = window.addEventListener.bind(window);
  vi.spyOn(window, 'addEventListener').mockImplementation((...args) => {
    installedListeners.push(args);
    addEventListener(...args);
  });
  new Function(startupScript)();
  return startup;
}

afterEach(() => {
  for (const listener of installedListeners.splice(0)) window.removeEventListener(...listener);
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

it('keeps offline help reachable before the main module runs and after an unattributed module failure', () => {
  const startup = start();
  expect(startup.hidden).toBe(false);
  expect(startup).toHaveTextContent('Opening Foliole');
  expect(startup).toHaveTextContent('Chromium 74.0.0.0');

  const brokenEntry = document.createElement('script');
  brokenEntry.type = 'module';
  document.body.append(brokenEntry);
  brokenEntry.dispatchEvent(new Event('error'));

  expect(startup).toHaveTextContent('Foliole couldn’t start');
  expect(startup).toHaveTextContent('If the problem persists');
  expect(startup.querySelector('details')?.open).toBe(true);
  expect(startup).toHaveTextContent('free up internal storage');
});

it('clears the startup surface after the app takes over, even below 125', () => {
  const startup = start('Mozilla/5.0 (Linux; Android 13; wv) Chrome/108.0.0.0');
  expect(startup.hidden).toBe(false);
  window.dispatchEvent(new Event('foliole-companion-startup-settled'));
  expect(startup.isConnected).toBe(false);
  const failingPdfModule = document.createElement('script');
  failingPdfModule.type = 'module';
  document.body.append(failingPdfModule);
  failingPdfModule.dispatchEvent(new Event('error'));
  expect(startup).toHaveTextContent('Opening Foliole');
});

it('leaves the startup surface hidden in a browser without the Android WebView', () => {
  expect(start('Mozilla/5.0 (Linux; Android 13) Chrome/138.0.0.0').hidden).toBe(true);
});
