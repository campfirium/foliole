import { describe, expect, it } from 'vitest';

import { APP_COMMAND_IDS } from '../../shared/commands/ids';

import { buildAppPaletteItems, runReviewModeToggle } from './appCommands';

describe('buildAppPaletteItems', () => {
  it('includes migrated command entries instead of a minimal fallback list', () => {
    const items = buildAppPaletteItems({
      canGoBack: true,
      canGoForward: true,
      canGoParent: true,
      canRevealAnswer: true,
      canToggleReviewMode: true,
      canGradeReview: true,
      isReviewMode: false
    });

    expect(items.length).toBeGreaterThanOrEqual(12);
    expect(items.some((item) => item.id === APP_COMMAND_IDS.toggleList)).toBe(true);
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
      isReviewMode: true
    });
    const reviewModeItem = items.find((item) => item.id === APP_COMMAND_IDS.startStudyMode);
    expect(reviewModeItem?.title).toBe('Exit Review Mode');
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
