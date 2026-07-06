import { render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { CompanionShellOverlays } from './CompanionShellOverlays';
import { DEFAULT_COMPANION_TAB_CONFIG } from './CompanionTabsConfig';

function createOverlayProps() {
  return {
    activeAction: 'review',
    activeSecondaryDestinationId: null,
    companionTabConfig: DEFAULT_COMPANION_TAB_CONFIG,
    currentReviewCard: null,
    isBottomBarDisabled: false,
    isCaptureSheetOpen: false,
    isNavigationVisible: false,
    isReadableArticleImmersive: false,
    isReviewAnswerRevealed: false,
    onCaptureSave: vi.fn(async () => ({ nodeId: 'captured' })),
    onCaptureSheetOpenChange: vi.fn(),
    onDismissReviewTopic: vi.fn(),
    onGradeReview: vi.fn(),
    onNavigationAction: vi.fn(),
    onPostponeReviewTopic: vi.fn(),
    onReadReviewTopic: vi.fn(),
    onRevealAnswer: vi.fn(),
    onSecondaryDestination: vi.fn()
  } satisfies ComponentProps<typeof CompanionShellOverlays>;
}

describe('CompanionShellOverlays', () => {
  it('does not block the shell with sync onboarding', () => {
    render(
      <CompanionShellOverlays
        {...createOverlayProps()}
      />
    );

    expect(screen.queryByText('Bring your content to this device?')).not.toBeInTheDocument();
  });

  it('keeps navigation available when visible', () => {
    render(
      <CompanionShellOverlays
        {...createOverlayProps()}
        isNavigationVisible
      />
    );

    expect(screen.getByRole('button', { name: 'Flow' })).toBeInTheDocument();
  });

  it('enables the reveal action when a review card has an answer without synced body text', () => {
    render(
      <CompanionShellOverlays
        {...createOverlayProps()}
        currentReviewCard={{
          content: 'Prompt',
          due: '2026-04-22T08:00:00.000Z',
          hasAnswer: true,
          hideTitleHeading: false,
          itemKind: 'fsrs',
          nodeId: 'item-1',
          queuePosition: 1,
          remainingCount: 1,
          reveal: null,
          title: 'Prompt',
          totalCount: 1
        }}
      />
    );

    expect(screen.getByLabelText('Show Answer')).not.toBeDisabled();
    expect(screen.queryByLabelText('Again')).not.toBeInTheDocument();
  });
});

