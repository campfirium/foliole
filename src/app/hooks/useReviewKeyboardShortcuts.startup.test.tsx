import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { ReviewShortcutHarness } from './useReviewKeyboardShortcuts.testUtils';

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

it('leaves review editing when review mode is restored after editor focus already exists', () => {
  const readReviewTopic = vi.fn(async () => true);
  const editable = document.createElement('div');
  editable.setAttribute('contenteditable', 'true');
  document.body.append(editable);
  editable.focus();

  render(<ReviewShortcutHarness readReviewTopic={readReviewTopic} />);

  fireEvent.keyDown(editable, { key: 'Escape' });
  fireEvent.keyDown(window, { key: 'r' });

  expect(document.activeElement).not.toBe(editable);
  expect(readReviewTopic).toHaveBeenCalledTimes(1);
});
