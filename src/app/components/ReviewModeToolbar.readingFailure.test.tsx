import { act, fireEvent, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../../shared/localization/testLocalization';
import { ReviewShortcutHarness } from '../hooks/useReviewKeyboardShortcuts.testUtils';

import { ReviewModeToolbar } from './ReviewModeToolbar';

function renderReadingToolbar(overrides: Partial<Parameters<typeof ReviewModeToolbar>[0]> = {}, shortcutRead?: () => Promise<boolean>) {
  return renderWithLocalization(
    <>
    {shortcutRead && <ReviewShortcutHarness reviewCurrentNodeId="reading-1" readingReadShortcuts={{ primary: { key: 'f' } }} readReviewTopic={shortcutRead} />}
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
      onRevealAnswer={vi.fn()}
      onResumeReviewItem={vi.fn()}
      onRevisitReviewTopicSoon={vi.fn(async () => true)}
      onSetReviewSessionMode={vi.fn()}
      reviewCompletedCount={0}
      reviewCurrentNodeId="reading-1"
      reviewCurrentTitle={undefined}
      reviewPreview={null}
      reviewQueueCount={3}
      reviewSessionMode="recommended"
      reviewStatus="awaiting-answer"
      {...overrides}
    />
    </>
  );
}

it.each([
  ['Soon', 'onRevisitReviewTopicSoon'],
  ['Later', 'onPostponeReviewTopic'],
  ['Read', 'onReadReviewTopic'],
  ['Dismiss', 'onDismissReviewTopic']
] as const)('shows retry feedback when %s fails to save', async (label, actionProp) => {
  const action = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
  renderReadingToolbar({ [actionProp]: action });

  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: label }));
  });

  expect(screen.getByText('Failed to save. Please retry.')).toBeInTheDocument();

  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  });

  expect(action).toHaveBeenCalledTimes(2);
});

it('disables reading actions while a save is pending', async () => {
  let completeSave: ((value: boolean) => void) | undefined;
  const onReadReviewTopic = vi.fn(() => new Promise<boolean>((resolve) => {
    completeSave = resolve;
  }));
  renderReadingToolbar({ onReadReviewTopic });

  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Read' }));
  });

  expect(screen.getByRole('button', { name: 'Later' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Read' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Dismiss' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Soon' })).toBeDisabled();

  await act(async () => {
    completeSave?.(true);
  });

  expect(screen.getByRole('button', { name: 'Read' })).not.toBeDisabled();
});

it.each(['false', 'throw'])('shows a retry for an F save returning %s without submitting twice', async (failure) => {
  let completeSave: ((value: boolean) => void) | undefined;
  const shortcutRead = vi.fn().mockImplementationOnce(async () => {
    if (failure === 'throw') throw new Error('save failed');
    return false;
  }).mockImplementationOnce(() => new Promise<boolean>((resolve) => { completeSave = resolve; }));
  const buttonRead = vi.fn(async () => true);
  renderReadingToolbar({ onReadReviewTopic: buttonRead }, shortcutRead);
  await act(async () => { fireEvent.keyDown(window, { key: 'f' }); });
  expect(screen.getByText('Failed to save. Please retry.')).toBeVisible();
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    fireEvent.keyDown(window, { key: 'f' });
    fireEvent.keyDown(window, { key: 'f' });
  });
  expect(shortcutRead).toHaveBeenCalledTimes(2);
  expect(buttonRead).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Read' })).toBeDisabled();
  await act(async () => { completeSave?.(true); });
  expect(screen.queryByText('Failed to save. Please retry.')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
});

it('clears a failed shortcut when the toolbar leaves the reading topic', async () => {
  const shortcutRead = vi.fn(async () => false);
  const view = renderReadingToolbar({}, shortcutRead);
  await act(async () => { fireEvent.keyDown(window, { key: 'f' }); });
  expect(screen.getByRole('button', { name: 'Retry' })).toBeVisible();
  view.unmount();
  renderReadingToolbar({ reviewCurrentNodeId: 'reading-2' });
  expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
});

it('ignores a late failure after leaving its reading topic', async () => {
  let completeSave: ((value: boolean) => void) | undefined;
  const shortcutRead = vi.fn(() => new Promise<boolean>((resolve) => { completeSave = resolve; }));
  const view = renderReadingToolbar({}, shortcutRead);
  await act(async () => { fireEvent.keyDown(window, { key: 'f' }); });
  view.unmount();
  renderReadingToolbar({ reviewCurrentNodeId: 'reading-2' });
  await act(async () => { completeSave?.(false); });
  expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
});
