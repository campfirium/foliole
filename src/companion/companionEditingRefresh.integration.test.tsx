// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useEffect, useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';

import { toWorkspaceNativeNodeVersion } from '../../lib/core/database/workspaceNodeSyncVersion';
import { applySyncNodesWithDbPort } from '../../lib/core/sync/syncNodeApplyExecutor';
import type { NativeCompanionWorkspaceSyncState } from '../../lib/platform/nativeCompanionSyncContract';
import type { CompanionContentSaveHandler } from '../shared/platform/companion/editing/companionContentEditContract';
import { createSearchLibrary } from '../shared/platform/companion/runtime/companionSearchSnapshot.testSupport';
import { writeIosCompanionDatabase } from '../shared/platform/companion/runtime/iosCompanionActiveDatabase';
import { loadCompanionWorkspaceSyncState } from '../shared/platform/companionWorkspaceSync';

import { CompanionDraftProvider } from './CompanionDraftProvider';
import { createCompanionTopicContentSaveHandler } from './companionTopicEditingController';
import { useCompanionTopicEditAutosave } from './useCompanionTopicEditAutosave';
import { useCompanionWorkspaceLoaders } from './useCompanionWorkspaceLoaders';
import type { useCompanionWorkspaceSync } from './useCompanionWorkspaceSync';

vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true },
  registerPlugin: () => ({ configureFramedSyncPayloadBudget: async () => {},
    closeFramedSyncPayloadBudget: async () => {} })
}));
vi.mock('../shared/platform/appLifecycle', () => ({
  subscribeNativeAppForeground: async () => () => {},
  subscribeNativeAppBackground: async () => () => {}
}));

let library: Awaited<ReturnType<typeof createSearchLibrary>> | null = null;
afterEach(async () => { await library?.close(); library = null; });

function EditorProbe(props: { content: string; versionId: string; save: CompanionContentSaveHandler }) {
  const [editing, setEditing] = useState(false);
  const draft = useCompanionTopicEditAutosave({ canEdit: true, initialContent: props.content,
    initialVersionId: props.versionId, nodeId: 'topic', onSaveContent: props.save, saveDelayMs: 20 });
  return editing ? <input aria-label="Body" value={draft.value}
    onChange={(event) => draft.handleChange(event.target.value)} />
    : <button disabled={!draft.ready} onClick={() => setEditing(true)}>Edit</button>;
}

function ReadingProbe({ initial }: { initial: NativeCompanionWorkspaceSyncState }) {
  const [state, setState] = useState(initial);
  const [, setArticle] = useState<unknown>(null);
  const loaders = useCompanionWorkspaceLoaders({ state, setState, setReadableArticle: setArticle,
    setError: (error) => { if (error) throw new Error(error); } });
  useEffect(() => { void loaders.openReadableArticle('topic'); }, [loaders.openReadableArticle]);
  const save = createCompanionTopicContentSaveHandler({ state,
    refreshAfterMutation: async () => {
      const next = await loadCompanionWorkspaceSyncState();
      setState(next);
      return next.workspace_snapshot;
    }
  } as ReturnType<typeof useCompanionWorkspaceSync>);
  const article = loaders.readableArticle;
  return <CompanionDraftProvider>{article ? <EditorProbe content={article.content}
    versionId={article.currentVersionId!} save={save} /> : <span>Loading</span>}</CompanionDraftProvider>;
}

it('keeps editing mounted across actual SQLite autosave refreshes and persists continued input', async () => {
  library = await createSearchLibrary(0);
  const baseline = 'Original 中文 😀 body';
  const node = { id: 'topic', content: baseline, kind: 'topic' as const, title: 'Topic',
    isTitleManual: true, hideTitleHeading: false, parentNodeId: null, reveal: null, anchorLink: null,
    reading: null, review: null, createdAt: '2026-10-10T00:00:00Z', updatedAt: '2026-10-10T00:00:00Z' };
  const record = await toWorkspaceNativeNodeVersion(node, 'remote', 'base');
  await writeIosCompanionDatabase((db) => applySyncNodesWithDbPort(db, [record], { enqueueSearchInvalidations: false }));
  const view = render(<ReadingProbe initial={await loadCompanionWorkspaceSyncState()} />);
  const edit = await screen.findByRole('button', { name: 'Edit' });
  await waitFor(() => expect(edit).toBeEnabled());
  fireEvent.click(edit);
  const input = screen.getByRole('textbox', { name: 'Body' });
  input.focus();
  fireEvent.change(input, { target: { value: baseline + ' first' } });
  await waitFor(() => expect(library!.database.prepare('SELECT content FROM nodes WHERE id=?').get('topic'))
    .toEqual({ content: baseline + ' first' }));
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 50)); });
  expect(screen.getByRole('textbox', { name: 'Body' })).toBe(input);
  expect(input).toHaveFocus();
  fireEvent.change(input, { target: { value: baseline + ' first continued' } });
  await waitFor(() => expect(library!.database.prepare('SELECT content FROM nodes WHERE id=?').get('topic'))
    .toEqual({ content: baseline + ' first continued' }));
  expect(screen.getByRole('textbox', { name: 'Body' })).toBe(input);
  const parents = library.database.prepare('SELECT parent_version_id FROM node_sync_version_parents').all();
  expect(parents).toHaveLength(2);
  expect(parents).toContainEqual({ parent_version_id: 'base' });
  view.unmount();
});
