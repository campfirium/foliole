import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useMemo, useReducer, useState } from 'react';
import { expect, it, vi } from 'vitest';

import { ContentSavedRefreshError } from '../shared/platform/companion/editing/contentSavedRefreshError';

import { CompanionBottomReviewBar } from './CompanionBottomReviewBar';
import { createContentSaveMock, deferred } from './companionContentEditingTestSupport';
import { CompanionDraftProvider } from './CompanionDraftProvider';
import { ImmersiveReadableArticle } from './CompanionReadableArticleSurface';
import { CompanionReadingActivity } from './companionReadingActivity';

vi.mock('@/features/editor/components/MarkdownEditor', () => ({
  MarkdownEditor: (props: { value: string; readOnly: boolean; onChange(value: string): void; onBlurCapture(): void }) => (
    <textarea aria-label={props.value === 'Answer' ? 'Answer body' : 'Topic body'} value={props.value}
      readOnly={props.readOnly} onChange={(event) => props.onChange(event.target.value)} onBlur={props.onBlurCapture} />
  )
}));

const article = { nodeId: 'topic', content: 'Original body', title: 'Topic', hideTitleHeading: false,
  textAnchorDecorations: [], persistedNodeViewState: null, pdfAttachmentId: null, currentVersionId: 'base' };

function FlowReader({ save }: { save: ReturnType<typeof createContentSaveMock> }) {
  const [, changed] = useReducer((value: number) => value + 1, 0);
  const activity = useMemo(() => new CompanionReadingActivity('topic', changed), []);
  const [revealed, setRevealed] = useState(false);
  return <CompanionDraftProvider>
    <ImmersiveReadableArticle flow activity={activity} readableArticle={article} snapshot={null}
      onExit={() => {}} onSaveArticleContent={save} answer={revealed ? 'Answer' : null}
      footer={<CompanionBottomReviewBar visible={!activity.editing} itemKind="fsrs" hasAnswer
        isAnswerRevealed={revealed} reviewCardKey="topic" onRevealAnswer={() => setRevealed(true)}
        onGrade={() => {}} onReadReviewTopic={() => {}} onPostponeReviewTopic={() => {}} onDismissReviewTopic={() => {}} />} />
  </CompanionDraftProvider>;
}

it('reveals the answer through the common reader and keeps it after a confirmed edit', async () => {
  const save = createContentSaveMock();
  const view = render(<FlowReader save={save} />);
  expect(screen.queryByLabelText('Answer body')).not.toBeInTheDocument();
  fireEvent.click(screen.getByLabelText('Show Answer'));
  expect(screen.getByLabelText('Answer body')).toHaveValue('Answer');
  fireEvent.click(view.container.querySelector('section')!);
  fireEvent.click(screen.getByTestId('companion-reading-edit'));
  expect(screen.queryByLabelText('Again')).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Topic body'), { target: { value: 'Edited body' } });
  const gate = deferred<void>();
  const refresh = vi.fn(() => gate.promise);
  save.mockImplementationOnce(async (_id, content, edit) => {
    save.setSource({ content, versionId: edit!.versionId });
    throw new ContentSavedRefreshError({ content, currentVersionId: edit!.versionId, submittedVersionId: edit!.versionId }, refresh);
  });
  fireEvent.click(screen.getByTestId('companion-reading-edit-done'));
  await screen.findByText('The topic was saved, but could not be refreshed.');
  expect(screen.getByLabelText('Topic body')).not.toHaveAttribute('readonly');
  expect(screen.queryByLabelText('Again')).not.toBeInTheDocument();
  fireEvent.click(screen.getByTestId('companion-reading-edit-done'));
  expect(screen.queryByLabelText('Again')).not.toBeInTheDocument();
  await act(async () => gate.resolve());
  await waitFor(() => expect(screen.getByLabelText('Again')).toBeInTheDocument());
  expect(screen.getByLabelText('Topic body')).toHaveValue('Edited body');
  expect(screen.getByLabelText('Topic body')).toHaveAttribute('readonly');
  expect(screen.getByLabelText('Answer body')).toHaveValue('Answer');
  expect(save).toHaveBeenCalledTimes(1);
  expect(refresh).toHaveBeenCalledTimes(1);
});
