import { vi } from 'vitest';

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
  revealAnswerShortcuts: { primary: { key: 'f' } },
  gradeAgainShortcuts: { primary: { key: '1' } },
  gradeHardShortcuts: { primary: { key: '2' } },
  gradeGoodShortcuts: { primary: { key: '3' } },
  gradeEasyShortcuts: { primary: { key: '4' } },
  readingSoonShortcuts: { primary: { key: 'o' } },
  readingLaterShortcuts: { primary: { key: 'l' } },
  readingReadShortcuts: { primary: { key: 'r' } },
  readingDismissShortcuts: { primary: { key: 'd' } },
  scrollReadingDownShortcuts: { primary: { key: ' ' } },
  scrollReadingUpShortcuts: { primary: { key: ' ', shiftKey: true } },
  deleteCurrentItemShortcuts: { primary: { key: 'Delete' } },
  navigateParentShortcuts: { primary: { key: 'w' } },
  navigateBackShortcuts: { primary: { key: 'a' } },
  navigateForwardShortcuts: { primary: { key: 'd' } },
  navigateDownShortcuts: { primary: { key: 's' } },
  navigatePreviousSiblingShortcuts: { primary: { key: 'q' } },
  navigateNextSiblingShortcuts: { primary: { key: 'e' } },
  deleteSourceTopicShortcuts: { primary: { key: 't', altKey: true } }
} as const;

export function ReviewShortcutHarness(
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
    scrollReviewReadingDown: vi.fn(() => true),
    scrollReviewReadingUp: vi.fn(() => true),
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
