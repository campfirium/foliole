import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../shared/localization/testLocalization';

import { CompanionBottomReviewBar } from './CompanionBottomReviewBar';

function renderReviewBar(reviewCardKey: string) {
  return renderWithLocalization(
    <CompanionBottomReviewBar
      isAnswerRevealed={false}
      itemKind="reading"
      onReadReviewTopic={vi.fn()}
      onPostponeReviewTopic={vi.fn()}
      onDismissReviewTopic={vi.fn()}
      onGrade={vi.fn()}
      onRevealAnswer={vi.fn()}
      reviewCardKey={reviewCardKey}
      visible={true}
    />
  );
}

describe('CompanionBottomReviewBar', () => {
  it('clears the previous card action focus when the review card changes', () => {
    const view = renderReviewBar('reading:topic-1');
    const previousDismissButton = screen.getByLabelText('Dismiss');

    previousDismissButton.focus();
    expect(document.activeElement).toBe(previousDismissButton);

    view.rerender(
      <CompanionBottomReviewBar
        isAnswerRevealed={false}
        itemKind="reading"
        onReadReviewTopic={vi.fn()}
        onPostponeReviewTopic={vi.fn()}
        onDismissReviewTopic={vi.fn()}
        onGrade={vi.fn()}
        onRevealAnswer={vi.fn()}
        reviewCardKey="reading:topic-2"
        visible={true}
      />
    );

    expect(document.activeElement).not.toBe(screen.getByLabelText('Dismiss'));
  });

  it('keeps the fixed review footer above Android gesture navigation', () => {
    const { container } = renderReviewBar('reading:topic-1');

    expect(container.querySelector('footer')?.className).toContain('[padding-bottom:calc(0.5rem+env(safe-area-inset-bottom))]');
  });

  it('holds Show Answer while the card cannot be answered yet', () => {
    renderWithLocalization(
      <CompanionBottomReviewBar
        disabled
        isAnswerRevealed={false}
        itemKind="fsrs"
        onReadReviewTopic={vi.fn()}
        onPostponeReviewTopic={vi.fn()}
        onDismissReviewTopic={vi.fn()}
        onGrade={vi.fn()}
        onRevealAnswer={vi.fn()}
        reviewCardKey="fsrs:item-1"
        visible={true}
      />
    );

    expect(screen.getByLabelText('Show Answer')).toBeDisabled();
    expect(screen.queryByLabelText('Again')).not.toBeInTheDocument();
  });
});
