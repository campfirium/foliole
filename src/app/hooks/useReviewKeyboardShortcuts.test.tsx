import { cleanup, fireEvent, render } from '@testing-library/react';
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
    deleteCurrentItemShortcuts: { primary: { key: 'Delete' } },
    completeReviewItem: vi.fn(() => true),
    deferReviewItem: vi.fn(() => true),
    deleteCurrentReviewItem: vi.fn(() => true),
    dismissReviewItem: vi.fn(() => true),
    resumeReviewItem: vi.fn(),
    revealReviewAnswer: vi.fn(),
    gradeReviewCard: vi.fn(async () => true),
    ...overrides
  });
  return null;
}

afterEach(() => {
  cleanup();
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

it('resumes the hidden review item with Space', () => {
  const resumeReviewItem = vi.fn();
  render(
    <ReviewShortcutHarness
      isCurrentReviewItemVisible={false}
      readingReadShortcuts={{ primary: { key: 'w' }, secondary: { key: ' ' } }}
      resumeReviewItem={resumeReviewItem}
    />
  );

  fireEvent.keyDown(window, { code: 'Space', key: ' ' });

  expect(resumeReviewItem).toHaveBeenCalledTimes(1);
});

it('deletes the hidden current review item with Delete', () => {
  const deleteCurrentReviewItem = vi.fn(() => true);
  render(
    <ReviewShortcutHarness
      deleteCurrentReviewItem={deleteCurrentReviewItem}
      isCurrentReviewItemVisible={false}
    />
  );

  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' }));

  expect(deleteCurrentReviewItem).toHaveBeenCalledTimes(1);
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

it('deletes the visible review item with Delete', () => {
  const deleteCurrentReviewItem = vi.fn(() => true);
  render(
    <ReviewShortcutHarness
      deleteCurrentReviewItem={deleteCurrentReviewItem}
      isCurrentReviewItemVisible
    />
  );

  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' }));

  expect(deleteCurrentReviewItem).toHaveBeenCalledTimes(1);
});

it('grades the revealed review card as Good with Space', () => {
  const gradeReviewCard = vi.fn(async () => true);
  render(
    <ReviewShortcutHarness
      gradeGoodShortcuts={{ primary: { key: '3' }, secondary: { key: ' ' } }}
      gradeReviewCard={gradeReviewCard}
      isAnswerRevealed
      isCurrentItemGradable
    />
  );

  fireEvent.keyDown(window, { code: 'Space', key: ' ' });

  expect(gradeReviewCard).toHaveBeenCalledWith(3);
});
