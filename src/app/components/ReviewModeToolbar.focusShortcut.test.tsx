import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { ReviewModeToolbar } from './ReviewModeToolbar';

function renderResumeToolbar(onResumeReviewItem = vi.fn()) {
  render(
    <ReviewModeToolbar
      isAnswerRevealed={false}
      isCurrentItemGradable={false}
      isCurrentReviewItemVisible
      isReviewEditing={false}
      isStudyMode
      onContinueReading={vi.fn()}
      onDismissReviewTopic={vi.fn(async () => true)}
      onExitReviewMode={vi.fn()}
      onGrade={vi.fn(async () => true)}
      onPostponeReviewTopic={vi.fn(async () => true)}
      onReadReviewTopic={vi.fn(async () => true)}
      onResumeReviewItem={onResumeReviewItem}
      onRevealAnswer={vi.fn()}
      onRevisitReviewTopicSoon={vi.fn(async () => true)}
      onSetReviewSessionMode={vi.fn()}
      reviewCompletedCount={0}
      reviewCurrentNodeId={null}
      reviewCurrentTitle={undefined}
      reviewQueueCount={3}
      reviewSessionMode="recommended"
      reviewStatus="idle"
    />
  );
  return onResumeReviewItem;
}

it('resumes from a button-focused toolbar with the Read shortcut', () => {
  const onResumeReviewItem = renderResumeToolbar();
  const resumeButton = screen.getByRole('button', { name: 'Resume review' });

  resumeButton.focus();
  fireEvent.keyDown(resumeButton, { key: 'f' });

  expect(onResumeReviewItem).toHaveBeenCalledTimes(1);
});

it('does not resume while text is being edited', () => {
  const onResumeReviewItem = renderResumeToolbar();
  const input = document.createElement('input');
  document.body.append(input);

  input.focus();
  fireEvent.keyDown(input, { key: 'f' });

  expect(onResumeReviewItem).not.toHaveBeenCalled();
});

it('does not resume while contenteditable text is being edited', () => {
  const onResumeReviewItem = renderResumeToolbar();
  const editable = document.createElement('div');
  editable.setAttribute('contenteditable', 'true');
  document.body.append(editable);

  editable.focus();
  fireEvent.keyDown(editable, { key: 'f' });

  expect(onResumeReviewItem).not.toHaveBeenCalled();
});
