import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../shared/localization/testLocalization';

import { CompanionBottomReviewBar } from './CompanionBottomReviewBar';

function renderReviewBar(reviewCardKey: string) {
  return renderWithLocalization(
    <CompanionBottomReviewBar
      hasAnswer={true}
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
        hasAnswer={true}
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

  it('keeps mobile action spacing independent of flex gap support', () => {
    renderReviewBar('reading:topic-1');

    expect(screen.getByRole('group', { name: 'Reading review actions' }).className).toContain('[&>*+*]:ml-2');
  });

  it('keeps the fixed review footer above Android gesture navigation', () => {
    const { container } = renderReviewBar('reading:topic-1');

    expect(container.querySelector('footer')?.className).toContain('[padding-bottom:calc(1.5rem+env(safe-area-inset-bottom))]');
  });

  it('does not show grade actions before a synced answer exists', () => {
    renderWithLocalization(
      <CompanionBottomReviewBar
        hasAnswer={false}
        isAnswerRevealed={true}
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
