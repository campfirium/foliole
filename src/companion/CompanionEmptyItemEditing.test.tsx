import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../shared/localization/testLocalization';

import { createContentSaveMock } from './companionContentEditingTestSupport';
import { CompanionDraftProvider } from './CompanionDraftProvider';
import { ReadableArticleDocument } from './CompanionReadableArticleDocument';
import { CompanionReadingActivity } from './companionReadingActivity';
import { createBreadcrumbSnapshot, createItemReviewSurface } from './CompanionShellBreadcrumbTestSupport';
import { CompanionShellReadableArticle } from './CompanionShellReadableArticle';

vi.mock('../shared/platform/companionWorkspaceRuntimeRepository', async importOriginal => ({
  ...await importOriginal<typeof import('../shared/platform/companionWorkspaceRuntimeRepository')>(),
  supportsCompanionNodeMutationSurface: (surface: string) => surface === 'topic-content-edit'
}));
vi.mock('@/features/editor/components/MarkdownEditor', () => ({ MarkdownEditor: (props: {
  ariaLabel?: string; value: string; readOnly: boolean; onChange?(value: string): void;
}) => <textarea aria-label={props.ariaLabel ?? 'Body'} value={props.value} readOnly={props.readOnly}
  onChange={event => props.onChange?.(event.currentTarget.value)} /> }));

const typography = { contrast: 'default', fontFamily: 'sans', fontSize: 'default', lineHeight: 'default',
  paragraphSpacing: 0.35, fontWeight: 400, textWidth: 100 } as const;

function article(bodyStatus: 'empty' | 'missing', content = '') {
  return { bodyStatus, content, nodeId: 'item', title: 'Item', hideTitleHeading: false,
    persistedNodeViewState: null, pdfAttachmentId: null, textAnchorDecorations: [] };
}

function renderDocument(props: Partial<ComponentProps<typeof ReadableArticleDocument>>) {
  const save = Object.assign(createContentSaveMock({ content: '', reveal: null, versionId: 'base' }), { retainHold: async () => {} });
  const activity = new CompanionReadingActivity('item', () => {});
  renderWithLocalization(<CompanionDraftProvider><ReadableArticleDocument activity={activity} onSaveContent={save}
    readableArticle={article('empty')} readingTypographySettings={typography} {...props} /></CompanionDraftProvider>);
  return { activity, save };
}

it('lets an empty Item receive its first question and answer', async () => {
  const { activity, save } = renderDocument({ allowContentEditing: true, isReviewItem: true, answer: '' });
  const question = await screen.findByRole('textbox', { name: 'Question' });
  await waitFor(() => expect(question).not.toHaveAttribute('readonly'));
  fireEvent.change(question, { target: { value: 'First question' } });
  fireEvent.change(screen.getByRole('textbox', { name: 'Answer' }), { target: { value: 'First answer' } });
  await act(() => activity.flush());
  expect(save).toHaveBeenLastCalledWith('item', 'First question', expect.objectContaining({ reveal: 'First answer' }));
});

it('keeps a body that has not reached this device read-only', () => {
  renderDocument({ allowContentEditing: true, readableArticle: article('missing') });
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
});

it('shows the answer of an Item whose question is empty', () => {
  renderDocument({ isReviewItem: true, answer: 'Only the answer' });
  expect(screen.getByRole('textbox', { name: 'Answer' })).toHaveValue('Only the answer');
});

it('offers the answer field when an Item without an answer is edited', async () => {
  const snapshot = createBreadcrumbSnapshot();
  const node = snapshot.nodesById['item-1']!;
  node.content = '';
  node.reveal = null;
  node.currentVersionId = 'base';
  const surface = { ...createItemReviewSurface(), isFlowBrowsing: false, selectedBrowseNodeId: node.id,
    readableArticle: { ...article('empty'), nodeId: node.id, currentVersionId: 'base', reveal: null } };
  renderWithLocalization(<CompanionDraftProvider><CompanionShellReadableArticle onExit={vi.fn()}
    surface={surface as unknown as ComponentProps<typeof CompanionShellReadableArticle>['surface']}
    workspaceSync={{ state: { workspace_snapshot: snapshot, remembered_targets: [] }, refreshAfterMutation: vi.fn() } as unknown as ComponentProps<typeof CompanionShellReadableArticle>['workspaceSync']} />
  </CompanionDraftProvider>);
  fireEvent.click(screen.getByRole('heading', { name: 'Item' }));
  fireEvent.click(screen.getByRole('button', { name: 'Edit content' }));
  expect(await screen.findByRole('textbox', { name: 'Answer' })).toBeInTheDocument();
});
