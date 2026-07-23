import { afterEach, expect, it, vi } from 'vitest';

import { DEFAULT_THEME_SCRIPT } from './foliolePublishDefaultScript.js';

function installActivity(reducedMotion = false) {
  document.body.innerHTML = `<div data-empty-publish-activity>
    <span data-empty-publish-word>Reading...</span>
  </div>`;
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn(() => ({ matches: reducedMotion }))
  });
  Function(DEFAULT_THEME_SCRIPT)();
  return document.querySelector<HTMLElement>('[data-empty-publish-word]')!;
}

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

it('types one activity word before revealing all three dots together', async () => {
  vi.useFakeTimers();
  const word = installActivity();

  await vi.advanceTimersByTimeAsync(1600);
  expect(word.textContent).toBe('Readin');

  await vi.advanceTimersByTimeAsync(100);
  expect(word.textContent).toBe('Reading...');

  await vi.advanceTimersByTimeAsync(2600);
  expect(word.textContent).toBe('');

  await vi.advanceTimersByTimeAsync(700);
  expect(word.textContent).toBe('T');
});

it('uses a static activity word when reduced motion is preferred', () => {
  vi.useFakeTimers();
  const word = installActivity(true);

  expect(word.textContent).toBe('Reading...');
  expect(vi.getTimerCount()).toBe(0);
});
