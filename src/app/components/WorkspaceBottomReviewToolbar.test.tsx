import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import {
  WorkspaceBottomReviewToolbar,
  type WorkspaceBottomReviewToolbarProps
} from './WorkspaceBottomReviewToolbar';

function createProps(overrides: Partial<WorkspaceBottomReviewToolbarProps> = {}): WorkspaceBottomReviewToolbarProps {
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
  };
}

it('collapses the review footer list summary with the left sidebar', () => {
  render(<WorkspaceBottomReviewToolbar {...createProps({ isListCollapsed: true })} />);

  expect(screen.queryByText('2 left · 0 done')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Show Answer' })).toBeInTheDocument();
  expect(screen.getByLabelText('Review mode toolbar')).toHaveClass('col-start-3');
});

it('keeps the review footer list summary when the left sidebar is expanded', () => {
  render(<WorkspaceBottomReviewToolbar {...createProps()} />);

  expect(screen.getByText('2 left · 0 done')).toBeInTheDocument();
  expect(screen.getByLabelText('Review mode toolbar')).toHaveClass('col-start-3');
});
