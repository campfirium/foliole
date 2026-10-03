import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import { renderWithLocalization } from '../shared/localization/testLocalization';

import { CompanionDraftProvider } from './CompanionDraftProvider';
import { ImmersiveReadableArticle } from './CompanionReadableArticleSurface';
import { CompanionReadingActivity } from './companionReadingActivity';

vi.mock('@/features/editor/components/MarkdownEditor', () => ({ MarkdownEditor: () => <p>Question body</p> }));
const node = { id: 'cloze', kind: 'item' as const, content: 'Alpha [...] Gamma', reveal: 'Beta', title: 'Cloze',
  parentNodeId: 'source', anchorLink: { id: 'mark', kind: 'cloze' as const, locator: { from: 6, to: 10, originalText: 'Beta' } },
  createdAt: 'now', updatedAt: 'now', currentVersionId: 'base', reading: null, review: null, hideTitleHeading: false, isTitleManual: false };
const snapshot: WorkspaceSnapshot = { activeNodeId: 'cloze', nodeOrder: ['source', 'cloze'],
  nodesById: { cloze: node }, trashedNodeIds: [], untitledSequenceByParent: {} };
beforeEach(() => { vi.spyOn(window, 'getSelection').mockReturnValue(null); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
it.each([false, true])('removes the opened cloze from the common reading menu, flow=%s', async (flow) => {
  const remove = vi.fn(async (id: string) => id);
  const view = renderWithLocalization(<CompanionDraftProvider><ImmersiveReadableArticle flow={flow}
    readableArticle={{ ...node, nodeId: node.id, textAnchorDecorations: [], persistedNodeViewState: null, pdfAttachmentId: null }}
    snapshot={snapshot} onExit={() => {}} onDeleteExistingHighlight={remove} /></CompanionDraftProvider>);
  fireEvent.click(view.container.querySelector('section')!);
  fireEvent.click(screen.getByRole('button', { name: 'More reading actions' }));
  fireEvent.click(screen.getByRole('button', { name: 'Delete cloze' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Delete cloze' })).toBeEnabled());
  expect(screen.queryByRole('button', { name: 'Add Comment' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Delete cloze' }));
  await waitFor(() => expect(remove).toHaveBeenCalledTimes(1));
  expect(remove.mock.calls[0]?.[0]).toBe('cloze');
});
it('waits for the draft before retrying deletion, without bypassing other failed actions', async () => {
  const activity = new CompanionReadingActivity('source', () => {});
  await expect(activity.run('delete', async () => { throw new Error('failed'); })).rejects.toThrow();
  const draft = vi.fn(async () => {});
  activity.flushDraft = draft;
  await activity.flush('delete');
  expect(draft).toHaveBeenCalledTimes(1);
  await expect(activity.run('note', async () => { throw new Error('unsaved note'); })).rejects.toThrow();
  await expect(activity.flush('delete')).rejects.toThrow('unsaved note');
});
