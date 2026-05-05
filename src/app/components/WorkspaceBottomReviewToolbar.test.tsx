import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { WorkspaceBottomReviewToolbar } from './WorkspaceBottomReviewToolbar';
import type { WorkspaceLayoutProps } from './WorkspaceLayout';

function createProps(overrides: Partial<WorkspaceLayoutProps> = {}): WorkspaceLayoutProps {
  return {
    canStartStudyMode: true,
    isAnswerRevealed: false,
    isCurrentReviewItemGradable: true,
    isImmersiveMode: false,
    isListCollapsed: false,
    isReviewEditing: false,
    isStudyMode: true,
    reviewCompletedCount: 0,
    reviewCurrentNodeId: 'node-1',
    reviewDueCount: 2,
    reviewQueueCount: 2,
    onCompleteReviewItem: vi.fn(() => true),
    onDeferReviewItem: vi.fn(() => true),
    onDismissReviewItem: vi.fn(() => true),
    onExitReviewMode: vi.fn(),
    onGradeReview: vi.fn(async () => true),
    onRevealAnswer: vi.fn(),
    onToggleReviewSession: vi.fn(),
    ...overrides
  } as WorkspaceLayoutProps;
}

it('collapses the review footer list summary with the left sidebar', () => {
  render(<WorkspaceBottomReviewToolbar props={createProps({ isListCollapsed: true })} />);

  expect(screen.queryByText('2 left · 0 done')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Show Answer' })).toBeInTheDocument();
  expect(screen.getByLabelText('Review mode toolbar')).toHaveClass('col-start-3');
});

it('keeps the review footer list summary when the left sidebar is expanded', () => {
  render(<WorkspaceBottomReviewToolbar props={createProps()} />);

  expect(screen.getByText('2 left · 0 done')).toBeInTheDocument();
  expect(screen.getByLabelText('Review mode toolbar')).toHaveClass('col-start-3');
});
