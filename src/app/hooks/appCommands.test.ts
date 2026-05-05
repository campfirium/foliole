import { describe, expect, it, vi } from 'vitest';

import { APP_COMMAND_IDS } from '../../shared/commands/ids';

import { buildAppPaletteItems, runAppCommand, runReviewModeToggle } from './appCommands';

describe('buildAppPaletteItems', () => {
  it('includes migrated command entries instead of a minimal fallback list', () => {
    const items = buildAppPaletteItems({
      canGoBack: true,
      canGoForward: true,
      canGoParent: true,
      canRevealAnswer: true,
      canToggleReviewMode: true,
      canGradeReview: true,
      canDeferReadingReview: true,
      canCompleteReadingReview: true,
      canDismissReadingReview: true,
      isReviewMode: false
    });

    expect(items.length).toBeGreaterThanOrEqual(12);
    expect(items.some((item) => item.id === APP_COMMAND_IDS.toggleList)).toBe(true);
    expect(items.some((item) => item.id === APP_COMMAND_IDS.toggleDevTools)).toBe(true);
    expect(items.some((item) => item.id === APP_COMMAND_IDS.goBack)).toBe(true);
    expect(items.some((item) => item.id === APP_COMMAND_IDS.gradeReviewGood)).toBe(true);
  });

  it('shows review-mode command as exit when already in review mode', () => {
    const items = buildAppPaletteItems({
      canGoBack: true,
      canGoForward: true,
      canGoParent: true,
      canRevealAnswer: true,
      canToggleReviewMode: true,
      canGradeReview: true,
      canDeferReadingReview: true,
      canCompleteReadingReview: true,
      canDismissReadingReview: true,
      isReviewMode: true
    });
    const reviewModeItem = items.find((item) => item.id === APP_COMMAND_IDS.startStudyMode);
    expect(reviewModeItem?.title).toBe('Exit Review Mode');
  });
});

describe('runAppCommand', () => {
  it('runs toggle devtools through the shared command handler', () => {
    const toggleDevTools = vi.fn();

    expect(
      runAppCommand(APP_COMMAND_IDS.toggleDevTools, {
        closeSettings: () => undefined,
        goBack: () => undefined,
        goForward: () => undefined,
        goParent: () => undefined,
        openNotes: () => undefined,
        openSettings: () => undefined,
        openTrash: () => undefined,
        revealReviewAnswer: () => undefined,
        toggleReviewMode: () => undefined,
        toggleEditorDisplayMode: () => undefined,
        toggleList: () => undefined,
        gradeReviewAgain: () => undefined,
        gradeReviewHard: () => undefined,
        gradeReviewGood: () => undefined,
        gradeReviewEasy: () => undefined,
        readingReviewLater: () => undefined,
        readingReviewRead: () => undefined,
        readingReviewDismiss: () => undefined,
        toggleDevTools
      })
    ).toBe(true);

    expect(toggleDevTools).toHaveBeenCalledTimes(1);
  });
});

describe('runReviewModeToggle', () => {
  it('enters mode when currently outside review mode', () => {
    let entered = 0;
    let exited = 0;
    runReviewModeToggle(false, {
      enterReviewMode: () => {
        entered += 1;
      },
      exitReviewMode: () => {
        exited += 1;
      }
    });
    expect(entered).toBe(1);
    expect(exited).toBe(0);
  });

  it('exits mode when currently inside review mode', () => {
    let entered = 0;
    let exited = 0;
    runReviewModeToggle(true, {
      enterReviewMode: () => {
        entered += 1;
      },
      exitReviewMode: () => {
        exited += 1;
      }
    });
    expect(entered).toBe(0);
    expect(exited).toBe(1);
  });
});
