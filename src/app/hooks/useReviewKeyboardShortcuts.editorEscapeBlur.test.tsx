import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { dispatchReviewEditorEscapeBlur } from '../../shared/platform/reviewEditorEscape';

import { ReviewShortcutHarness } from './useReviewKeyboardShortcuts.testUtils';

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

it('leaves review editing when editor Escape blur stops the original Escape event', () => {
  const readReviewTopic = vi.fn(async () => true);
  const editable = document.createElement('div');
  editable.setAttribute('contenteditable', 'true');
  document.body.append(editable);
  const stopEditorEscape = (event: KeyboardEvent) => {
    editable.blur();
    dispatchReviewEditorEscapeBlur();
    event.stopImmediatePropagation();
  };
  window.addEventListener('keydown', stopEditorEscape, { capture: true, once: true });
  render(<ReviewShortcutHarness readReviewTopic={readReviewTopic} />);
  editable.focus();
  fireEvent.focusIn(editable);

  fireEvent.keyDown(editable, { key: 'Escape' });
  fireEvent.keyDown(window, { key: 'r' });

  expect(document.activeElement).not.toBe(editable);
  expect(readReviewTopic).toHaveBeenCalledTimes(1);
});
