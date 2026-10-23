// @vitest-environment jsdom
import { act, render, screen, waitFor } from '@testing-library/react';
import Database from 'better-sqlite3';
import { afterEach, expect, it, vi } from 'vitest';

import { toWorkspaceNativeNodeVersion } from '../../lib/core/database/workspaceNodeSyncVersion';
import { applySyncNodesWithDbPort } from '../../lib/core/sync/syncNodeApplyExecutor';
import type { EditorAdapter } from '../features/editor/adapters/EditorAdapter';
import { MouseGestureSettingsProvider } from '../features/settings/context/MouseGestureSettingsProvider';
import { LocalizationProvider } from '../shared/localization/LocalizationProvider';
import { createSearchLibrary } from '../shared/platform/companion/runtime/companionSearchSnapshot.testSupport';
import { writeIosCompanionDatabase } from '../shared/platform/companion/runtime/iosCompanionActiveDatabase';
import { loadCompanionWorkspaceSyncState } from '../shared/platform/companionWorkspaceSync';

import { CompanionDraftProvider } from './CompanionDraftProvider';
import { ReadableArticleDocument } from './CompanionReadableArticleDocument';
import { CompanionReadingActivity } from './companionReadingActivity';
import { createCompanionTopicContentSaveHandler } from './companionTopicEditingController';
import type { useCompanionWorkspaceSync } from './useCompanionWorkspaceSync';

vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../shared/platform/companion/runtime/companionNativeSync.testSupport');
  return {
    Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true },
    registerPlugin: createCompanionNativeSyncStub
  };
});
vi.mock('../shared/platform/appLifecycle', () => ({
  subscribeNativeAppForeground: async () => () => {},
  subscribeNativeAppEnteredBackground: async () => () => {},
  subscribeNativeAppBackground: async () => () => {}
}));

let reader: Database.Database | null = null;
let library: Awaited<ReturnType<typeof createSearchLibrary>> | null = null;
afterEach(async () => { vi.useRealTimers(); reader?.close(); reader = null; await library?.close(); library = null; });

it('persists real editor input after only the shared 1200 ms buffer wait', async () => {
  library = await createSearchLibrary(0);
  reader = new Database(library.database.name, { readonly: true });
  const node = { id: 'topic', content: 'Original body', kind: 'topic' as const, title: 'Topic',
    isTitleManual: true, hideTitleHeading: false, parentNodeId: null, reveal: null, anchorLink: null,
    reading: null, review: null, createdAt: '2026-10-10T00:00:00Z', updatedAt: '2026-10-10T00:00:00Z' };
  const record = await toWorkspaceNativeNodeVersion(node, 'remote', 'base');
  await writeIosCompanionDatabase(db => applySyncNodesWithDbPort(db, [record], { enqueueSearchInvalidations: false }));
  const initial = await loadCompanionWorkspaceSyncState();
  const save = createCompanionTopicContentSaveHandler({ state: initial,
    refreshAfterMutation: async () => (await loadCompanionWorkspaceSyncState()).workspace_snapshot
  } as ReturnType<typeof useCompanionWorkspaceSync>);
  const activity = new CompanionReadingActivity('topic', () => {});
  let editor: EditorAdapter | null = null;
  const document = (content: string, currentVersionId: string) => <LocalizationProvider initialLanguagePreference="en"><MouseGestureSettingsProvider><CompanionDraftProvider>
    <ReadableArticleDocument activity={activity} allowContentEditing onSaveContent={save}
      onEditorReady={value => { editor = value; }}
      readableArticle={{ content, currentVersionId, hideTitleHeading: false,
        nodeId: 'topic', persistedNodeViewState: null, pdfAttachmentId: null,
        textAnchorDecorations: [], title: 'Topic' }}
      readingTypographySettings={{ contrast: 'default', fontFamily: 'sans', fontSize: 'default', lineHeight: 'default' }} />
  </CompanionDraftProvider></MouseGestureSettingsProvider></LocalizationProvider>;
  const view = render(document(node.content, 'base'));
  await waitFor(() => expect(screen.getByRole('textbox', { name: 'Topic body' })).toHaveAttribute('contenteditable', 'true'));
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  act(() => editor!.replaceRange(0, 0, 'Automatic input '));
  await act(async () => { await vi.advanceTimersByTimeAsync(1199); });
  expect(reader!.prepare('SELECT content FROM nodes WHERE id=?').get('topic'))
    .toEqual({ content: 'Original body' });
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  expect(reader!.prepare('SELECT content FROM nodes WHERE id=?').get('topic'))
    .toEqual({ content: 'Automatic input Original body' });
  expect(reader!.prepare('SELECT parent_version_id FROM node_sync_version_parents').all())
    .toEqual([{ parent_version_id: 'base' }]);
  await verifyContinuousInput(editor!);
  view.unmount();
});

async function verifyContinuousInput(editor: EditorAdapter) {
  const read = () => reader!.prepare<[], { content: string; current_version_id: string }>(
    "SELECT content, current_version_id FROM nodes WHERE id='topic'").get()!;
  const first = read();
  for (let index = 0; index < 10; index++) {
    act(() => editor.replaceRange(0, 0, String(index)));
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
  }
  expect(read()).toEqual(first);
  await act(async () => { await vi.advanceTimersByTimeAsync(700); });
  expect(read().content).toBe('9876543210' + first.content);
  for (const prefix of ['short pause A ', 'short pause B ']) {
    const previous = read();
    act(() => editor.replaceRange(0, 0, prefix));
    await act(async () => { await vi.advanceTimersByTimeAsync(1300); });
    expect(read().content).toBe(prefix + previous.content);
    expect(reader!.prepare('SELECT parent_version_id FROM node_sync_version_parents').all())
      .toContainEqual({ parent_version_id: previous.current_version_id });
  }
  expect(reader!.prepare('SELECT COUNT(*) AS count FROM node_sync_version_parents').get()).toEqual({ count: 4 });
}
