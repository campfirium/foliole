import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../shared/localization/testLocalization';

import { CompanionBottomReviewBar } from './CompanionBottomReviewBar';

function createProps() {
  return {
    hasAnswer: true,
    isAnswerRevealed: true,
    itemKind: 'fsrs' as 'fsrs' | 'reading',
    onSoonReviewTopic: vi.fn(),
    onReadReviewTopic: vi.fn(),
    onPostponeReviewTopic: vi.fn(),
    onDismissReviewTopic: vi.fn(),
    onGrade: vi.fn(),
    onRevealAnswer: vi.fn(),
    reviewCardKey: 'item:1',
    visible: true
  };
}

describe('Companion Flow actions', () => {
  it('keeps each text grade accessible and submits its corresponding grade', () => {
    const props = createProps();
    renderWithLocalization(<CompanionBottomReviewBar {...props} />);

    ['Again', 'Hard', 'Good', 'Easy'].forEach((label, index) => {
      const action = screen.getByRole('button', { name: label });
      expect(action).toHaveTextContent(label);
      expect(action.querySelector('svg')).toBeNull();
      fireEvent.click(action);
      expect(props.onGrade).toHaveBeenNthCalledWith(index + 1, index + 1);
    });
  });

  it('prevents every grade action while submitting', () => {
    const props = createProps();
    renderWithLocalization(<CompanionBottomReviewBar {...props} disabled />);

    ['Again', 'Hard', 'Good', 'Easy'].forEach(label => {
      const action = screen.getByRole('button', { name: label });
      expect(action).toBeDisabled();
      fireEvent.click(action);
    });
    expect(props.onGrade).not.toHaveBeenCalled();
  });

  it('keeps all reading actions wired to their existing handlers', () => {
    const props = createProps();
    renderWithLocalization(<CompanionBottomReviewBar {...props} itemKind="reading" />);

    const handlers = [props.onSoonReviewTopic, props.onPostponeReviewTopic,
      props.onReadReviewTopic, props.onDismissReviewTopic];
    ['Soon', 'Later', 'Read', 'Dismiss'].forEach((label, index) => {
      const action = screen.getByRole('button', { name: label });
      expect(action).toHaveTextContent(label);
      expect(action.querySelector('svg')).toBeNull();
      fireEvent.click(action);
      expect(handlers[index]).toHaveBeenCalledOnce();
    });
  });

  it('keeps reveal separate from grades until the answer is shown', () => {
    const props = createProps();
    renderWithLocalization(<CompanionBottomReviewBar {...props} isAnswerRevealed={false} />);

    expect(screen.queryByRole('button', { name: 'Again' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show Answer' }));
    expect(props.onRevealAnswer).toHaveBeenCalledOnce();
    expect(props.onGrade).not.toHaveBeenCalled();
  });
});
