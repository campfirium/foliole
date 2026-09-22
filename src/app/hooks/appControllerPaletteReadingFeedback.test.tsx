import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../../shared/localization/testLocalization';
import { ReadingReviewActions } from '../../shared/ui/ReadingReviewActions';

import { createPaletteReviewActions } from './appControllerPaletteReviewActions';
import { resetReadingReviewFeedback, useReadingReviewFeedbackState } from './readingReviewFeedbackState';

const NOW = '2026-09-22T16:00:00.000Z';
vi.mock('../../shared/platform/runtime/demoRuntime', () => ({ getDemoRuntimeNowIso: () => NOW }));
beforeEach(resetReadingReviewFeedback);
afterEach(cleanup);

function FeedbackSurface() {
  const feedback = useReadingReviewFeedbackState('reading-1');
  return <ReadingReviewActions
    errorMessage={feedback.errorMessage}
    isSubmitting={feedback.isSubmitting}
    onReadReviewTopic={() => undefined}
    onPostponeReviewTopic={() => undefined}
    onDismissReviewTopic={() => undefined}
    {...(feedback.retryReadingAction ? { onRetry: feedback.retryReadingAction } : {})}
  />;
}

type ReadingAction = 'readReviewTopic' | 'postponeReviewTopic' | 'dismissReviewTopic';

function createActions(save: () => Promise<boolean>, name: ReadingAction) {
  const otherSave = vi.fn(async () => true);
  const actions = createPaletteReviewActions({
    ws: {
      activeNodeId: null, nodeOrder: [], nodesById: {}, trashedNodeIds: [],
      reviewSession: { currentNodeId: 'reading-1' },
      readReviewTopic: otherSave, postponeReviewTopic: otherSave, dismissReviewTopic: otherSave, [name]: save
    },
    nav: {}, runtime: { editorRef: { current: null } }, isStudyMode: false, requestDeleteSourceTopic: () => false
  } as unknown as Parameters<typeof createPaletteReviewActions>[0]);
  return { actions, otherSave };
}

for (const name of ['readReviewTopic', 'postponeReviewTopic', 'dismissReviewTopic'] as const) {
  it.each(['false', 'throw'])(`${name} reports palette save failure (%s) and retries with its original arguments`, async (failure) => {
    let complete: ((value: boolean) => void) | undefined;
    const save = vi.fn().mockImplementationOnce(async () => {
      if (failure === 'throw') throw new Error('save failed');
      return false;
    }).mockImplementationOnce(() => new Promise<boolean>((resolve) => { complete = resolve; }));
    const { actions, otherSave } = createActions(save, name);
    renderWithLocalization(<FeedbackSurface />);
    await act(async () => { await actions[name](); });
    expect(screen.getByText('Failed to save. Please retry.')).toBeVisible();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
      void actions[name]();
      void actions.readReviewTopic();
    });
    expect(save).toHaveBeenCalledTimes(2);
    expect(otherSave).not.toHaveBeenCalled();
    const expected = name === 'readReviewTopic' ? [NOW, { releaseSequentialReading: false }] : [NOW];
    expect(save.mock.calls).toEqual([expected, expected]);
    expect(screen.getByRole('button', { name: 'Read' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Later' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeDisabled();
    await act(async () => { complete?.(true); });
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Read' })).toBeEnabled();
  });
}
