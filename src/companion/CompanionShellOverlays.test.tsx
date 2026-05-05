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
    handleDismissSyncOnboarding: vi.fn(),
    handleGradeReview: vi.fn(),
    handleRevealAnswer: vi.fn(),
    handleStartSyncOnboarding: vi.fn(),
    isAnswerRevealed: false,
    reviewSession: {
      currentCard: null
    }
  } as unknown as ReturnType<typeof useCompanionArticleSurface>;
}

describe('CompanionShellOverlays sync onboarding', () => {
  it('shows onboarding only while the user has not decided', () => {
    render(
      <CompanionShellOverlays
        isBottomBarDisabled={false}
        isSyncPaired={false}
        surface={createSurface()}
        syncOnboardingStatus="pending"
      />
    );

    expect(screen.getByText('Bring your content to this device?')).toBeInTheDocument();
    expect(screen.getByText('Bring content from another device')).toBeInTheDocument();
  });

  it('keeps onboarding dismissed when the user opted out', () => {
    render(
      <CompanionShellOverlays
        isBottomBarDisabled={false}
        isSyncPaired={false}
        surface={createSurface()}
        syncOnboardingStatus="dismissed"
      />
    );

    expect(screen.queryByText('Bring your content to this device?')).not.toBeInTheDocument();
  });

  it('hides onboarding after the user starts setup', () => {
    render(
      <CompanionShellOverlays
        isBottomBarDisabled={false}
        isSyncPaired={false}
        surface={createSurface()}
        syncOnboardingStatus="accepted"
      />
    );

    expect(screen.queryByText('Bring your content to this device?')).not.toBeInTheDocument();
  });
});
