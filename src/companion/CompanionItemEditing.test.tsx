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

it.each([false, true])('keeps the answer visibility while editing and cancelling when revealed is %s', async revealed => {
  const reveal = 'Answer';
  const save = Object.assign(createContentSaveMock({ content: 'Question', reveal, versionId: 'base' }), { retainHold: async () => {} });
  const activity = new CompanionReadingActivity('item', () => {});
  const view = render(<CompanionDraftProvider><ReadableArticleDocument isReviewItem allowContentEditing
    activity={activity} onSaveContent={save} answer={revealed ? reveal : null}
    readableArticle={{ content: 'Question', nodeId: 'item', title: 'Item', textAnchorDecorations: [] }}
    readingTypographySettings={{ contrast: 'default', fontFamily: 'sans', fontSize: 'default', lineHeight: 'default' }} />
  </CompanionDraftProvider>);
  await waitFor(() => expect(screen.getByRole('textbox', { name: 'Question' })).not.toHaveAttribute('readonly'));
  const question = screen.getByRole('textbox', { name: 'Question' });
  const answer = screen.queryByRole('textbox', { name: 'Answer' });
  if (revealed) expect(answer).toHaveValue(reveal);
  else expect(answer).not.toBeInTheDocument();
  expect(screen.queryByText('Question', { selector: ':not(textarea)' })).not.toBeInTheDocument();
  expect(screen.queryByText('Answer', { selector: ':not(textarea)' })).not.toBeInTheDocument();
  activity.editRound?.begin();
  fireEvent.change(question, { target: { value: 'Edited question' } });
  if (answer) fireEvent.change(answer, { target: { value: 'Edited answer' } });
  await act(() => activity.flush());
  expect(save).toHaveBeenLastCalledWith('item', 'Edited question', expect.objectContaining({ reveal: revealed ? 'Edited answer' : reveal }));
  await act(async () => { expect(await activity.editRound?.revert()).toBe('reverted'); });
  await waitFor(() => {
    expect(question).toHaveValue('Question');
    if (revealed) expect(answer).toHaveValue(reveal);
    else expect(screen.queryByRole('textbox', { name: 'Answer' })).not.toBeInTheDocument();
  });
  view.unmount();
});
