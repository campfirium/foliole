import { render } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { useWindowHotkeys } from './useAppRuntimeHotkeys';

function dispatchShortcutFrom(target: HTMLElement, init: KeyboardEventInit) {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
}

function Harness(props: {
  setIsCommandPaletteOpen?: (update: (open: boolean) => boolean) => void;
  setIsSearchPaletteOpen?: (update: (open: boolean) => boolean) => void;
}) {
  useWindowHotkeys({
    setIsCommandPaletteOpen: props.setIsCommandPaletteOpen ?? vi.fn(),
    setIsGoToNodePaletteOpen: vi.fn(),
    setIsMoveToNodePaletteOpen: vi.fn(),
    setIsSearchPaletteOpen: props.setIsSearchPaletteOpen ?? vi.fn()
  });
  return <input aria-label="editor target" />;
}

it('opens the command palette before an editor target can stop shortcut bubbling', () => {
  const setIsCommandPaletteOpen = vi.fn();
  render(<Harness setIsCommandPaletteOpen={setIsCommandPaletteOpen} />);
  const input = document.querySelector('input')!;
  input.addEventListener('keydown', (event) => event.stopPropagation());

  const event = dispatchShortcutFrom(input, { ctrlKey: true, key: 'p' });

  expect(event.defaultPrevented).toBe(true);
  expect(setIsCommandPaletteOpen).toHaveBeenCalledTimes(1);
});

it('opens workspace search before an editor target can stop shortcut bubbling', () => {
  const setIsSearchPaletteOpen = vi.fn();
  render(<Harness setIsSearchPaletteOpen={setIsSearchPaletteOpen} />);
  const input = document.querySelector('input')!;
  input.addEventListener('keydown', (event) => event.stopPropagation());

  const event = dispatchShortcutFrom(input, { ctrlKey: true, key: 'k' });

  expect(event.defaultPrevented).toBe(true);
  expect(setIsSearchPaletteOpen).toHaveBeenCalledTimes(1);
});
