import { expect, it, vi } from 'vitest';

import { onWindowEscape, onWindowKeydown } from './keyboard';

function dispatchKeydown(key: string) {
  window.dispatchEvent(new KeyboardEvent('keydown', { cancelable: true, key }));
}

it('dispatches escape to the latest escape handler before outer handlers', () => {
  const outer = vi.fn();
  const inner = vi.fn();
  const plain = vi.fn();
  const unlistenPlain = onWindowKeydown(plain);
  const unlistenOuter = onWindowEscape(outer);
  const unlistenInner = onWindowEscape(inner);

  dispatchKeydown('Escape');

  expect(inner).toHaveBeenCalledTimes(1);
  expect(outer).not.toHaveBeenCalled();
  expect(plain).not.toHaveBeenCalled();

  unlistenInner();
  unlistenOuter();
  unlistenPlain();
});

it('falls back to the next escape handler after unregistering the latest handler', () => {
  const outer = vi.fn();
  const inner = vi.fn();
  const unlistenOuter = onWindowEscape(outer);
  const unlistenInner = onWindowEscape(inner);

  unlistenInner();
  unlistenInner();
  dispatchKeydown('Escape');

  expect(inner).not.toHaveBeenCalled();
  expect(outer).toHaveBeenCalledTimes(1);

  unlistenOuter();
});

it('continues dispatching non-escape keys to ordinary window keydown handlers', () => {
  const escape = vi.fn();
  const plain = vi.fn();
  const unlistenEscape = onWindowEscape(escape);
  const unlistenPlain = onWindowKeydown(plain);

  dispatchKeydown('a');

  expect(escape).not.toHaveBeenCalled();
  expect(plain).toHaveBeenCalledTimes(1);

  unlistenPlain();
  unlistenEscape();
});
