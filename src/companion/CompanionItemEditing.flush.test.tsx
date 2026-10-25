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

it.each(['android', 'ios'] as const)('%s makes a previously revealed answer focusable, flushes both editors and cancels across SQLite reopen', async platform => {
  state.platform = platform;
  const host = await stableEditingHost(platform); hosts.push(host); state.owner = host.owner;
  await host.seed(editableNode({ kind: 'item', content: 'Question', reveal: 'Answer' }), 'base');
  const activity = new CompanionReadingActivity('topic', () => {});
  const document = (editing: boolean) => <MouseGestureSettingsProvider><CompanionDraftProvider><ReadableArticleDocument isReviewItem allowContentEditing={editing}
    activity={activity} onSaveContent={save} answer="Answer"
    readableArticle={{ content: 'Question', nodeId: 'topic', title: 'Item', textAnchorDecorations: [] }}
    readingTypographySettings={{ contrast: 'default', fontFamily: 'sans', fontSize: 'default', lineHeight: 'default' }} />
  </CompanionDraftProvider></MouseGestureSettingsProvider>;
  const view = renderWithLocalization(document(false));
  await screen.findByRole('document', { name: 'Answer' });
  view.rerender(document(true));
  await screen.findByRole('textbox', { name: 'Answer' });
  const question = EditorView.findFromDOM(screen.getByRole('textbox', { name: 'Question' }));
  const answer = EditorView.findFromDOM(screen.getByRole('textbox', { name: 'Answer' }));
  if (!question || !answer) throw new Error('Missing item editor');
  act(() => answer.focus());
  await waitFor(() => expect(window.document.activeElement).toBe(answer.contentDOM));
  activity.editRound?.begin();
  act(() => {
    question.dispatch({ changes: { from: 0, insert: 'New ' } });
    answer.dispatch({ changes: { from: 0, insert: 'New ' } });
  });
  await act(() => activity.flush());
  expect(host.sqlite.prepare("SELECT content, reveal FROM nodes WHERE id = 'topic'").get())
    .toEqual({ content: 'New Question', reveal: 'New Answer' });
  await act(async () => { expect(await activity.editRound?.revert()).toBe('reverted'); });
  await act(async () => {
    view.unmount();
    await activity.flush();
  });
  await waitFor(() => expect(host.sqlite.prepare('SELECT count(*) FROM node_version_local_holds').pluck().get()).toBe(0));
  await host.reopen();
  expect(host.sqlite.prepare("SELECT content, reveal FROM nodes WHERE id = 'topic'").get())
    .toEqual({ content: 'Question', reveal: 'Answer' });
});
