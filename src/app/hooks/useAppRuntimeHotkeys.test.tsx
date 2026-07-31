import { render } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { toggleMainWindowDevTools } from '../../shared/platform/windowControls';

import { useWindowHotkeys } from './useAppRuntimeHotkeys';

vi.mock('../../shared/platform/windowControls', () => ({ toggleMainWindowDevTools: vi.fn() }));

function dispatchShortcutFrom(target: HTMLElement, init: KeyboardEventInit) {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
}

function Harness() {
  useWindowHotkeys(true);
  return <input aria-label="editor target" />;
}

it('keeps the DevTools shortcut in the window capture handler', () => {
  render(<Harness />);
  const input = document.querySelector('input')!;
  input.addEventListener('keydown', (event) => event.stopPropagation());

  const event = dispatchShortcutFrom(input, { ctrlKey: true, key: 'i', shiftKey: true });

  expect(event.defaultPrevented).toBe(true);
  expect(toggleMainWindowDevTools).toHaveBeenCalledTimes(1);
});
