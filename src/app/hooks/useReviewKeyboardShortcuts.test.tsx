import { render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { useReviewKeyboardShortcuts } from './useReviewKeyboardShortcuts';

function ReviewShortcutHarness(
  overrides: Partial<Parameters<typeof useReviewKeyboardShortcuts>[0]>
) {
  useReviewKeyboardShortcuts({
    isStudyMode: true,
    isCommandPaletteOpen: false,
    isSearchPaletteOpen: false,
    isSettingsOpen: false,
    reviewCurrentNodeId: 'topic-1',
    isCurrentReviewItemVisible: true,
    isAnswerRevealed: false,
    isCurrentItemGradable: false,
    revealAnswerShortcuts: { primary: { key: ' ' } },
    gradeAgainShortcuts: { primary: { key: '1' } },
    gradeHardShortcuts: { primary: { key: '2' } },
    gradeGoodShortcuts: { primary: { key: '3' } },
    gradeEasyShortcuts: { primary: { key: '4' } },
    readingLaterShortcuts: { primary: { key: 'l' } },
    readingReadShortcuts: { primary: { key: 'r' } },
    readingDismissShortcuts: { primary: { key: 'd' } },
    completeReviewItem: vi.fn(() => true),
    deferReviewItem: vi.fn(() => true),
    dismissReviewItem: vi.fn(() => true),
    revealReviewAnswer: vi.fn(),
    gradeReviewCard: vi.fn(async () => true),
    ...overrides
  });
  return null;
}

afterEach(() => {
  document.body.innerHTML = '';
});

it('ignores review action shortcuts while the current review item is not visible', () => {
  const completeReviewItem = vi.fn(() => true);
  render(
    <ReviewShortcutHarness
      completeReviewItem={completeReviewItem}
      isCurrentReviewItemVisible={false}
    />
  );

  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'r' }));

  expect(completeReviewItem).not.toHaveBeenCalled();
});

it('runs review action shortcuts when the current review item is visible', () => {
  const completeReviewItem = vi.fn(() => true);
  render(
    <ReviewShortcutHarness
      completeReviewItem={completeReviewItem}
      isCurrentReviewItemVisible
    />
  );

  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'r' }));

  expect(completeReviewItem).toHaveBeenCalledTimes(1);
});
