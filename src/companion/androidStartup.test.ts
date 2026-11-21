// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';

import entryHtml from './index.html?raw';
import startupScript from './public/android-startup.js?raw';

const installedListeners: Array<Parameters<Window['addEventListener']>> = [];

function start(ua = 'Mozilla/5.0 (Linux; Android 9; wv) Chrome/74.0.0.0') {
  const entry = new DOMParser().parseFromString(entryHtml.replace('__FOLIOLE_ANDROID_WEBVIEW_MINIMUM__', '125'), 'text/html');
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

function failModuleLoad() {
  const brokenEntry = document.createElement('script');
  brokenEntry.type = 'module';
  document.body.append(brokenEntry);
  brokenEntry.dispatchEvent(new Event('error'));
}

it('stays hidden during a normal start and disappears once the main module runs', () => {
  const startup = start('Mozilla/5.0 (Linux; Android 13; wv) Chrome/138.0.0.0');
  expect(startup.hidden).toBe(true);
  window.dispatchEvent(new Event('foliole-companion-startup-settled'));
  expect(startup.isConnected).toBe(false);
  failModuleLoad();
  expect(startup.hidden).toBe(true);
});

it('names the outdated component and both versions', () => {
  const startup = start();
  failModuleLoad();
  expect(startup.hidden).toBe(false);
  expect(startup.querySelector('h1')).toHaveTextContent('Component update required');
  expect(startup.querySelector('p')).toHaveTextContent('Android System WebView is version 74; 125 or later is required.');
  expect(startup.querySelector('button')).toHaveTextContent('Copy error details');
});

it('shows the original startup error on a current engine', () => {
  const startup = start('Mozilla/5.0 (Linux; Android 13; wv) Chrome/138.0.0.0');
  const error = new SyntaxError("Unexpected token '?'");
  window.dispatchEvent(new ErrorEvent('error', { error, filename: `${location.origin}/assets/index.js` }));
  expect(startup.querySelector('h1')).toHaveTextContent('Can’t start');
  expect(startup.querySelector('p')).toHaveTextContent("SyntaxError: Unexpected token '?'");
});

it('copies the error with the user agent', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  const startup = start('Mozilla/5.0 (Linux; Android 13; wv) Chrome/138.0.0.0');
  failModuleLoad();
  startup.querySelector('button')!.click();
  await Promise.resolve();
  expect(writeText).toHaveBeenCalledWith(expect.stringContaining('Failed to load'));
  expect(writeText).toHaveBeenCalledWith(expect.stringContaining('Chrome/138.0.0.0'));
  await Promise.resolve();
  expect(startup.querySelector('button')).toHaveTextContent('Copied');
});

it('leaves the startup surface hidden in a browser without the Android WebView', () => {
  expect(start('Mozilla/5.0 (Linux; Android 13) Chrome/138.0.0.0').hidden).toBe(true);
});
