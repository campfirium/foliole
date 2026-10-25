import { EditorView } from '@codemirror/view';
import { act, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { MouseGestureSettingsProvider } from '../features/settings/context/MouseGestureSettingsProvider';
import { renderWithLocalization } from '../shared/localization/testLocalization';
import { readCompanionContentSource, releaseCompanionContentBase, retainCompanionContentBase,
  saveCompanionContentEdit } from '../shared/platform/companion/editing/companionContentEditing';
import { editableNode, stableEditingHost } from '../shared/platform/companion/editing/companionContentEditingStable.testSupport';

import { CompanionDraftProvider } from './CompanionDraftProvider';
import { ReadableArticleDocument } from './CompanionReadableArticleDocument';
import { CompanionReadingActivity } from './companionReadingActivity';

const state = vi.hoisted(() => ({ platform: 'android', owner: null as Awaited<ReturnType<typeof stableEditingHost>>['owner'] | null }));
vi.mock('@capacitor/core', () => ({ Capacitor: { getPlatform: () => state.platform, isNativePlatform: () => true }, registerPlugin: vi.fn(() => ({})) }));
vi.mock('../shared/platform/companion/runtime/iosCompanionDatabaseBootstrap', () => ({ getIosCompanionDatabaseOwner: () => state.owner }));
const hosts: Awaited<ReturnType<typeof stableEditingHost>>[] = [];
afterEach(async () => { for (const host of hosts.splice(0)) await host.close(); state.owner = null; });
const save = Object.assign(async (_id: string, _content: string, edit?: Parameters<typeof saveCompanionContentEdit>[0]) => {
  if (!edit) throw new Error('missing_edit');
  return saveCompanionContentEdit(edit);
}, { readSource: readCompanionContentSource, retainHold: retainCompanionContentBase, releaseHold: releaseCompanionContentBase });

it.each([['android', false], ['android', true], ['ios', false], ['ios', true]] as const)(
  '%s preserves answer visibility %s while editing, saving and cancelling across SQLite reopen', async (platform, revealed) => {
  state.platform = platform;
  const host = await stableEditingHost(platform); hosts.push(host); state.owner = host.owner;
  await host.seed(editableNode({ kind: 'item', content: 'Question', reveal: 'Answer' }), 'base');
  const activity = new CompanionReadingActivity('topic', () => {});
  const document = (editing: boolean) => <MouseGestureSettingsProvider><CompanionDraftProvider><ReadableArticleDocument isReviewItem allowContentEditing={editing}
    activity={activity} onSaveContent={save} answer={revealed ? 'Answer' : null}
    readableArticle={{ content: 'Question', nodeId: 'topic', title: 'Item', hideTitleHeading: false,
      persistedNodeViewState: null, pdfAttachmentId: null, textAnchorDecorations: [] }}
    readingTypographySettings={{ contrast: 'default', fontFamily: 'sans', fontSize: 'default', lineHeight: 'default' }} />
  </CompanionDraftProvider></MouseGestureSettingsProvider>;
  const view = renderWithLocalization(document(false));
  if (revealed) await screen.findByRole('document', { name: 'Answer' });
  view.rerender(document(true));
  await screen.findByRole('textbox', { name: 'Question' });
  if (revealed) await screen.findByRole('textbox', { name: 'Answer' });
  else expect(screen.queryByRole('textbox', { name: 'Answer' })).not.toBeInTheDocument();
  const question = EditorView.findFromDOM(screen.getByRole('textbox', { name: 'Question' }));
  const answer = revealed ? EditorView.findFromDOM(screen.getByRole('textbox', { name: 'Answer' })) : null;
  if (!question || (revealed && !answer)) throw new Error('Missing item editor');
  const focused = answer ?? question;
  act(() => focused.focus());
  await waitFor(() => expect(window.document.activeElement).toBe(focused.contentDOM));
  activity.editRound?.begin();
  act(() => {
    question.dispatch({ changes: { from: 0, insert: 'New ' } });
    answer?.dispatch({ changes: { from: 0, insert: 'New ' } });
  });
  await act(() => activity.flush());
  expect(host.sqlite.prepare("SELECT content, reveal FROM nodes WHERE id = 'topic'").get())
    .toEqual({ content: 'New Question', reveal: revealed ? 'New Answer' : 'Answer' });
  await act(async () => { expect(await activity.editRound?.revert()).toBe('reverted'); });
  view.rerender(document(false));
  if (revealed) expect(await screen.findByRole('document', { name: 'Answer' })).toHaveTextContent('Answer');
  else expect(screen.queryByRole('document', { name: 'Answer' })).not.toBeInTheDocument();
  await act(async () => {
    view.unmount();
    await activity.flush();
  });
  await waitFor(() => expect(host.sqlite.prepare("SELECT count(*) FROM node_version_local_holds WHERE hold_id LIKE 'companion:%'")
    .pluck().get()).toBe(0));
  await host.reopen();
  expect(host.sqlite.prepare("SELECT content, reveal FROM nodes WHERE id = 'topic'").get())
    .toEqual({ content: 'Question', reveal: 'Answer' });
});
