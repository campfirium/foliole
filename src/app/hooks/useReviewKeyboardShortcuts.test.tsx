import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { useReviewKeyboardShortcuts } from './useReviewKeyboardShortcuts';

const TEST_NODE = {
  id: 'topic-1',
  parentNodeId: null,
  kind: 'topic',
  title: 'Topic 1',
  content: '',
  reveal: null,
  reading: null,
  review: null,
  createdAt: '2026-02-25T00:00:00.000Z',
  updatedAt: '2026-02-25T00:00:00.000Z'
} as const;

const REVIEW_SHORTCUT_DEFAULTS = {
  revealAnswerShortcuts: { primary: { key: ' ' } },
  gradeAgainShortcuts: { primary: { key: '1' } },
  gradeHardShortcuts: { primary: { key: '2' } },
  gradeGoodShortcuts: { primary: { key: '3' } },
  gradeEasyShortcuts: { primary: { key: '4' } },
  readingSoonShortcuts: { primary: { key: 'o' } },
  readingLaterShortcuts: { primary: { key: 'l' } },
  readingReadShortcuts: { primary: { key: 'r' } },
  readingDismissShortcuts: { primary: { key: 'd' } },
  deleteCurrentItemShortcuts: { primary: { key: 'Delete' } },
  navigateParentShortcuts: { primary: { key: 'w' } },
  navigateBackShortcuts: { primary: { key: 'a' } },
  navigateForwardShortcuts: { primary: { key: 'f' } },
  navigateDownShortcuts: { primary: { key: 's' } },
  navigatePreviousSiblingShortcuts: { primary: { key: 'q' } },
  navigateNextSiblingShortcuts: { primary: { key: 'e' } },
  deleteSourceTopicShortcuts: { primary: { key: 't', altKey: true } }
} as const;

function ReviewShortcutHarness(
  overrides: Partial<Parameters<typeof useReviewKeyboardShortcuts>[0]>
) {
  const args: Parameters<typeof useReviewKeyboardShortcuts>[0] = {
    isStudyMode: true,
    isCommandPaletteOpen: false,
    isSearchPaletteOpen: false,
    isSettingsOpen: false,
    activeNodeId: 'topic-1',
    nodeOrder: ['topic-1'],
    nodesById: { 'topic-1': TEST_NODE },
    trashedNodeIds: [],
    reviewCurrentNodeId: 'topic-1',
    isCurrentReviewItemVisible: true,
    isAnswerRevealed: false,
    isCurrentItemGradable: false,
    ...REVIEW_SHORTCUT_DEFAULTS,
    isSourceTopicDeleteDialogOpen: false,
    readReviewTopic: vi.fn(async () => true),
    postponeReviewTopic: vi.fn(async () => true),
    deleteCurrentReviewItem: vi.fn(() => true),
    deleteReviewSourceTopic: vi.fn(() => true),
    dismissReviewTopic: vi.fn(async () => true),
    revisitReviewTopicSoon: vi.fn(async () => true),
    goBack: vi.fn(),
    goForward: vi.fn(),
    goParent: vi.fn(),
    resumeReviewItem: vi.fn(),
    revealReviewAnswer: vi.fn(),
    selectNode: vi.fn(),
    gradeReviewCard: vi.fn(async () => true),
    ...overrides
  };
  useReviewKeyboardShortcuts(args);
  return null;
}

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

it('ignores review action shortcuts while the current review item is not visible', () => {
  const readReviewTopic = vi.fn(async () => true);
  render(
    <ReviewShortcutHarness
      readReviewTopic={readReviewTopic}
      isCurrentReviewItemVisible={false}
    />
  );

  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'r' }));

  expect(readReviewTopic).not.toHaveBeenCalled();
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
  const readReviewTopic = vi.fn(async () => true);
  render(
    <ReviewShortcutHarness
      readReviewTopic={readReviewTopic}
      isCurrentReviewItemVisible
    />
  );

  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'r' }));

  expect(readReviewTopic).toHaveBeenCalledTimes(1);
});

it('runs the visible reading soon shortcut before later/read choices', () => {
  const revisitReviewTopicSoon = vi.fn(async () => true);
  render(
    <ReviewShortcutHarness
      isCurrentReviewItemVisible
      revisitReviewTopicSoon={revisitReviewTopicSoon}
    />
  );

  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'o' }));

  expect(revisitReviewTopicSoon).toHaveBeenCalledTimes(1);
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
