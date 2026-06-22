import { expect, it, vi } from 'vitest';

import type { ElectronAPI, NativeKeyboardInputPayload } from './electronApi';
import { onWindowEscape, onWindowKeydown, onWindowPriorityEscape } from './keyboard';

function dispatchKeydown(key: string) {
  window.dispatchEvent(new KeyboardEvent('keydown', { cancelable: true, key }));
}

function dispatchPreventedKeydown(key: string) {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key });
  event.preventDefault();
  window.dispatchEvent(event);
}

function installNativeKeyboardBridge() {
  let handler: ((payload: NativeKeyboardInputPayload) => void) | null = null;
  const unsubscribe = vi.fn();
  window.electronAPI = {
    onNativeKeyboardInput: (nextHandler: (payload: NativeKeyboardInputPayload) => void) => {
      handler = nextHandler;
      return unsubscribe;
    }
  } as unknown as ElectronAPI;
  return {
    dispatch: (payload: NativeKeyboardInputPayload) => handler?.(payload),
    unsubscribe
  };
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

it('falls through when the latest escape handler declines the event', () => {
  const outer = vi.fn();
  const inner = vi.fn(() => false);
  const unlistenOuter = onWindowEscape(outer);
  const unlistenInner = onWindowEscape(inner);

  dispatchKeydown('Escape');

  expect(inner).toHaveBeenCalledTimes(1);
  expect(outer).toHaveBeenCalledTimes(1);

  unlistenInner();
  unlistenOuter();
});

it('dispatches priority escape handlers before ordinary escape handlers', () => {
  const ordinary = vi.fn();
  const priority = vi.fn();
  const unlistenOrdinary = onWindowEscape(ordinary);
  const unlistenPriority = onWindowPriorityEscape(priority);

  dispatchKeydown('Escape');

  expect(priority).toHaveBeenCalledTimes(1);
  expect(ordinary).not.toHaveBeenCalled();

  unlistenPriority();
  unlistenOrdinary();
});

it('falls through to ordinary escape handlers when priority handlers decline', () => {
  const ordinary = vi.fn();
  const priority = vi.fn(() => false);
  const unlistenOrdinary = onWindowEscape(ordinary);
  const unlistenPriority = onWindowPriorityEscape(priority);

  dispatchKeydown('Escape');

  expect(priority).toHaveBeenCalledTimes(1);
  expect(ordinary).toHaveBeenCalledTimes(1);

  unlistenPriority();
  unlistenOrdinary();
});

it('does not consume escape when every escape handler declines it', () => {
  const plain = vi.fn();
  const escape = vi.fn(() => false);
  const unlistenPlain = onWindowKeydown(plain);
  const unlistenEscape = onWindowEscape(escape);

  dispatchKeydown('Escape');

  expect(escape).toHaveBeenCalledTimes(1);
  expect(plain).toHaveBeenCalledTimes(1);

  unlistenEscape();
  unlistenPlain();
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

it('keeps default-prevented keydowns visible to ordinary handlers', () => {
  const escape = vi.fn();
  const plain = vi.fn();
  const unlistenEscape = onWindowEscape(escape);
  const unlistenPlain = onWindowKeydown(plain);

  dispatchPreventedKeydown('Escape');
  dispatchPreventedKeydown('a');

  expect(escape).not.toHaveBeenCalled();
  expect(plain).toHaveBeenCalledTimes(2);
  expect(plain.mock.calls[0]?.[0].defaultPrevented).toBe(true);
  expect(plain.mock.calls[1]?.[0].defaultPrevented).toBe(true);

  unlistenPlain();
  unlistenEscape();
});

it('uses native escape as a fallback when no DOM escape arrives', () => {
  vi.useFakeTimers();
  const native = installNativeKeyboardBridge();
  const escape = vi.fn();
  const unlistenEscape = onWindowEscape(escape);

  native.dispatch({
    altKey: false,
    code: 'Escape',
    controlKey: false,
    key: 'Escape',
    metaKey: false,
    shiftKey: false,
    type: 'keyDown'
  });
  vi.runOnlyPendingTimers();

  expect(escape).toHaveBeenCalledTimes(1);

  unlistenEscape();
  delete window.electronAPI;
  vi.useRealTimers();
});

it('cancels native escape fallback when the DOM escape arrives', () => {
  vi.useFakeTimers();
  const native = installNativeKeyboardBridge();
  const escape = vi.fn();
  const unlistenEscape = onWindowEscape(escape);

  native.dispatch({
    altKey: false,
    code: 'Escape',
    controlKey: false,
    key: 'Escape',
    metaKey: false,
    shiftKey: false,
    type: 'keyDown'
  });
  dispatchKeydown('Escape');
  vi.runOnlyPendingTimers();

  expect(escape).toHaveBeenCalledTimes(1);

  unlistenEscape();
  delete window.electronAPI;
  vi.useRealTimers();
});

it('unsubscribes native keyboard input when the last escape handler is removed', () => {
  const native = installNativeKeyboardBridge();
  const unlistenEscape = onWindowEscape(vi.fn());

  unlistenEscape();

  expect(native.unsubscribe).toHaveBeenCalledTimes(1);

  delete window.electronAPI;
});
