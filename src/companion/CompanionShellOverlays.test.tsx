import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CompanionShellOverlays } from './CompanionShellOverlays';
import type { useCompanionArticleSurface } from './useCompanionArticleSurface';

function createSurface() {
  return {
    activeAction: 'review',
    handleCompleteReviewItem: vi.fn(),
    handleDeferReviewItem: vi.fn(),
    handleDismissReviewItem: vi.fn(),
    handleGradeReview: vi.fn(),
    handleRevealAnswer: vi.fn(),
    handleTabAction: vi.fn(),
    isAnswerRevealed: false,
    reviewSession: {
      currentCard: null
    }
  } as unknown as ReturnType<typeof useCompanionArticleSurface>;
}

describe('CompanionShellOverlays', () => {
  it('does not block the shell with sync onboarding', () => {
    render(
      <CompanionShellOverlays
        isBottomBarDisabled={false}
        isCaptureSheetOpen={false}
        isNavigationVisible={false}
        onCaptureSheetOpenChange={vi.fn()}
        onNavigationAction={vi.fn()}
        surface={createSurface()}
      />
    );

    expect(screen.queryByText('Bring your content to this device?')).not.toBeInTheDocument();
  });

  it('keeps navigation available when visible', () => {
    render(
      <CompanionShellOverlays
        isBottomBarDisabled={false}
        isCaptureSheetOpen={false}
        isNavigationVisible
        onCaptureSheetOpenChange={vi.fn()}
        onNavigationAction={vi.fn()}
        surface={createSurface()}
      />
    );

    expect(screen.getByRole('button', { name: 'Review' })).toBeInTheDocument();
  });
});
