import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { createContentSaveMock } from './companionContentEditingTestSupport';
import { CompanionDraftProvider } from './CompanionDraftProvider';
import { ReadableArticleDocument } from './CompanionReadableArticleDocument';
import { CompanionReadingActivity } from './companionReadingActivity';

vi.mock('@/features/editor/components/MarkdownEditor', () => ({ MarkdownEditor: (props: {
  ariaLabel: string; value: string; readOnly: boolean; onChange(value: string): void;
}) => <textarea aria-label={props.ariaLabel} value={props.value} readOnly={props.readOnly}
  onChange={event => props.onChange(event.currentTarget.value)} /> }));

it.each([null, 'Answer'])('edits both fields before revealing the answer and cancels both with initial answer %s', async reveal => {
  const save = Object.assign(createContentSaveMock({ content: 'Question', reveal, versionId: 'base' }), { retainHold: async () => {} });
  const activity = new CompanionReadingActivity('item', () => {});
  const view = render(<CompanionDraftProvider><ReadableArticleDocument isReviewItem allowContentEditing
    activity={activity} onSaveContent={save} answer={null}
    readableArticle={{ content: 'Question', nodeId: 'item', title: 'Item', textAnchorDecorations: [] }}
    readingTypographySettings={{ contrast: 'default', fontFamily: 'sans', fontSize: 'default', lineHeight: 'default' }} />
  </CompanionDraftProvider>);
  const answer = await screen.findByRole('textbox', { name: 'Answer' });
  const question = screen.getByRole('textbox', { name: 'Question' });
  await waitFor(() => expect(answer).toHaveValue(reveal ?? ''));
  expect(screen.queryByText('Question', { selector: ':not(textarea)' })).not.toBeInTheDocument();
  expect(screen.queryByText('Answer', { selector: ':not(textarea)' })).not.toBeInTheDocument();
  activity.editRound?.begin();
  fireEvent.change(question, { target: { value: 'Edited question' } });
  fireEvent.change(answer, { target: { value: 'Edited answer' } });
  await act(() => activity.flush());
  expect(save).toHaveBeenLastCalledWith('item', 'Edited question', expect.objectContaining({ reveal: 'Edited answer' }));
  await act(async () => { expect(await activity.editRound?.revert()).toBe('reverted'); });
  await waitFor(() => {
    expect(question).toHaveValue('Question');
    expect(answer).toHaveValue(reveal ?? '');
  });
  view.unmount();
});
