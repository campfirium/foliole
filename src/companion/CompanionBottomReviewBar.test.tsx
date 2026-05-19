import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CompanionBottomReviewBar } from './CompanionBottomReviewBar';

function renderReviewBar(reviewCardKey: string) {
  return render(
    <CompanionBottomReviewBar
      isAnswerRevealed={false}
      itemKind="reading"
      onCompleteReviewItem={vi.fn()}
      onDeferReviewItem={vi.fn()}
      onDismissReviewItem={vi.fn()}
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
        onCompleteReviewItem={vi.fn()}
        onDeferReviewItem={vi.fn()}
        onDismissReviewItem={vi.fn()}
        onGrade={vi.fn()}
        onRevealAnswer={vi.fn()}
        reviewCardKey="reading:topic-2"
        visible={true}
      />
    );

    expect(document.activeElement).not.toBe(screen.getByLabelText('Dismiss'));
  });
});
