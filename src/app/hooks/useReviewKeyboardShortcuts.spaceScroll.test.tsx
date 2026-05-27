import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { ReviewShortcutHarness } from './useReviewKeyboardShortcuts.testUtils';

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

it('leaves Space on a focused button for the button itself', () => {
  const resumeReviewItem = vi.fn();
  const scrollReviewReadingDown = vi.fn(() => true);
  render(
    <ReviewShortcutHarness
      isCurrentItemGradable
      isCurrentReviewItemVisible={false}
      readingReadShortcuts={{ primary: { key: ' ' } }}
      resumeReviewItem={resumeReviewItem}
      scrollReviewReadingDown={scrollReviewReadingDown}
    />
  );
  const button = document.createElement('button');
  document.body.append(button);
  button.focus();

  fireEvent.keyDown(button, { code: 'Space', key: ' ' });

  expect(resumeReviewItem).not.toHaveBeenCalled();
  expect(scrollReviewReadingDown).not.toHaveBeenCalled();
});

it('scrolls the visible reading topic with Space and Shift+Space from body focus', () => {
  const scrollReviewReadingDown = vi.fn(() => true);
  const scrollReviewReadingUp = vi.fn(() => true);
  render(
    <ReviewShortcutHarness
      isCurrentReviewItemVisible
      scrollReviewReadingDown={scrollReviewReadingDown}
      scrollReviewReadingUp={scrollReviewReadingUp}
    />
  );

  fireEvent.keyDown(window, { code: 'Space', key: ' ' });
  fireEvent.keyDown(window, { code: 'Space', key: ' ', shiftKey: true });

  expect(scrollReviewReadingDown).toHaveBeenCalledTimes(1);
  expect(scrollReviewReadingUp).toHaveBeenCalledTimes(1);
});

it('leaves Space to immersive reading while review mode stays active', () => {
  const scrollReviewReadingDown = vi.fn(() => true);
  const scrollReviewReadingUp = vi.fn(() => true);
  render(
    <ReviewShortcutHarness
      isCurrentReviewItemVisible
      isImmersiveMode
      scrollReviewReadingDown={scrollReviewReadingDown}
      scrollReviewReadingUp={scrollReviewReadingUp}
    />
  );

  fireEvent.keyDown(window, { code: 'Space', key: ' ' });
  fireEvent.keyDown(window, { code: 'Space', key: ' ', shiftKey: true });

  expect(scrollReviewReadingDown).not.toHaveBeenCalled();
  expect(scrollReviewReadingUp).not.toHaveBeenCalled();
});
