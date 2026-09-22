import { act, fireEvent, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import type { ReviewGrade } from '../../features/review/model/reviewTypes';
import { renderWithLocalization } from '../../shared/localization/testLocalization';
import { createPaletteReviewActions } from '../hooks/appControllerPaletteReviewActions';
import { ReviewShortcutHarness } from '../hooks/useReviewKeyboardShortcuts.testUtils';

import { ReviewModeToolbar } from './ReviewModeToolbar';

const NOW = '2026-09-22T16:00:00.000Z';
vi.mock('../../shared/platform/runtime/demoRuntime', () => ({ getDemoRuntimeNowIso: () => NOW }));
type Save = (grade: ReviewGrade, now?: string) => Promise<boolean>;

function paletteGrade(save: Save, nodeId: string) {
  return createPaletteReviewActions({
    ws: { activeNodeId: null, nodeOrder: [], nodesById: {}, trashedNodeIds: [],
      reviewSession: { currentNodeId: nodeId }, gradeReviewCard: save },
    nav: {}, runtime: {}, requestDeleteSourceTopic: () => false
  } as unknown as Parameters<typeof createPaletteReviewActions>[0]).gradeReviewCard;
}

function renderGradeToolbar(save: Save, nodeId = 'grade-1', revealed = true) {
  return renderWithLocalization(<>
    <ReviewShortcutHarness reviewCurrentNodeId={nodeId} isCurrentItemGradable
      isAnswerRevealed={revealed} gradeReviewCard={save} />
    <ReviewModeToolbar isAnswerRevealed={revealed} isCurrentItemGradable isCurrentReviewItemVisible
      isReviewEditing={false} isStudyMode reviewCurrentNodeId={nodeId} reviewCurrentTitle={undefined}
      reviewCompletedCount={0} reviewQueueCount={2} reviewPreview={null} reviewStatus="answer-revealed"
      reviewSessionMode="recommended" onGrade={save}
      onReadReviewTopic={async () => true} onPostponeReviewTopic={async () => true}
      onDismissReviewTopic={async () => true} onRevisitReviewTopicSoon={async () => true}
      onContinueReading={() => undefined} onRevealAnswer={() => undefined} onExitReviewMode={() => undefined}
      onResumeReviewItem={() => undefined} onSetReviewSessionMode={() => undefined} />
  </>);
}

for (const [index, label] of ['Again', 'Hard', 'Good', 'Easy'].entries()) {
  const grade = (index + 1) as ReviewGrade;
  for (const entry of ['button', 'keyboard', 'palette'] as const) {
    it.each(['false', 'throw'])(`${label} ${entry} shares failure (%s), retry and pending feedback`, async (failure) => {
      let complete: ((value: boolean) => void) | undefined;
      const save = vi.fn<Save>().mockImplementationOnce(async () => {
        if (failure === 'throw') throw new Error('grade save failed');
        return false;
      }).mockImplementationOnce(() => new Promise<boolean>((resolve) => { complete = resolve; }));
      renderGradeToolbar(save);
      const command = paletteGrade(save, 'grade-1');
      await act(async () => {
        if (entry === 'button') fireEvent.click(screen.getByRole('button', { name: label }));
        else if (entry === 'keyboard') fireEvent.keyDown(window, { key: String(grade) });
        else await command(grade);
      });
      expect(screen.getByText('Failed to save grade. Please retry.')).toBeVisible();
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
        fireEvent.keyDown(window, { key: '1' });
        void command(4);
      });
      expect(save).toHaveBeenCalledTimes(2);
      expect(save.mock.calls).toEqual(entry === 'palette' ? [[grade, NOW], [grade, NOW]] : [[grade], [grade]]);
      for (const name of ['Again', 'Hard', 'Good', 'Easy']) expect(screen.getByRole('button', { name })).toBeDisabled();
      await act(async () => { complete?.(true); });
      expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Good' })).toBeEnabled();
    });
  }
}

it('drops the failed grade when its topic is left', async () => {
  const save = vi.fn<Save>(async () => false);
  const view = renderGradeToolbar(save);
  await act(async () => { await paletteGrade(save, 'grade-1')(2); });
  expect(screen.getByRole('button', { name: 'Retry' })).toBeVisible();
  view.unmount();
  renderGradeToolbar(save, 'grade-2');
  expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
});

it('does not publish a late grade failure into another topic', async () => {
  let complete: ((value: boolean) => void) | undefined;
  const save = vi.fn<Save>(() => new Promise<boolean>((resolve) => { complete = resolve; }));
  const view = renderGradeToolbar(save);
  await act(async () => { void paletteGrade(save, 'grade-1')(3); });
  view.unmount();
  renderGradeToolbar(save, 'grade-2');
  await act(async () => { complete?.(false); });
  expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
});
