import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import type { ElectronAPI, NativeKeyboardInputPayload } from '../../shared/platform/electronApi';

import { ReviewShortcutHarness } from './useReviewKeyboardShortcuts.testUtils';

afterEach(() => {
  delete window.electronAPI;
  cleanup();
  document.body.innerHTML = '';
});

function installNativeKeyboardBridge() {
  let handler: ((payload: NativeKeyboardInputPayload) => void) | null = null;
  window.electronAPI = {
    onNativeKeyboardInput: (nextHandler: (payload: NativeKeyboardInputPayload) => void) => {
      handler = nextHandler;
      return () => {
        handler = null;
      };
    }
  } as unknown as ElectronAPI;
  return (payload: NativeKeyboardInputPayload) => handler?.(payload);
}

function dispatchNativeEscape(dispatchNativeKeyboard: (payload: NativeKeyboardInputPayload) => void) {
  dispatchNativeKeyboard({
    altKey: false,
    code: 'Escape',
    controlKey: false,
    key: 'Escape',
    metaKey: false,
    shiftKey: false,
    type: 'keyDown'
  });
}

it('leaves review editing when native Escape arrives without a DOM keydown', () => {
  const dispatchNativeKeyboard = installNativeKeyboardBridge();
  const readReviewTopic = vi.fn(async () => true);
  render(<ReviewShortcutHarness readReviewTopic={readReviewTopic} />);
  const editable = document.createElement('div');
  editable.setAttribute('contenteditable', 'true');
  document.body.append(editable);
  editable.focus();
  fireEvent.focusIn(editable);

  dispatchNativeEscape(dispatchNativeKeyboard);
  fireEvent.keyDown(window, { key: 'r' });

  expect(document.activeElement).not.toBe(editable);
  expect(readReviewTopic).toHaveBeenCalledTimes(1);
});
