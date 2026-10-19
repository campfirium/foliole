// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useEffect, useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';

import { toWorkspaceNativeNodeVersion } from '../../lib/core/database/workspaceNodeSyncVersion';
import { applySyncNodesWithDbPort } from '../../lib/core/sync/syncNodeApplyExecutor';
import type { NativeCompanionWorkspaceSyncState } from '../../lib/platform/nativeCompanionSyncContract';
import type { EditorAdapter } from '../features/editor/adapters/EditorAdapter';
import { MouseGestureSettingsProvider } from '../features/settings/context/MouseGestureSettingsProvider';
import { LocalizationProvider } from '../shared/localization/LocalizationProvider';
import type { CompanionContentSaveHandler } from '../shared/platform/companion/editing/companionContentEditContract';
import { createSearchLibrary } from '../shared/platform/companion/runtime/companionSearchSnapshot.testSupport';
import { writeIosCompanionDatabase } from '../shared/platform/companion/runtime/iosCompanionActiveDatabase';
import { loadCompanionWorkspaceSyncState } from '../shared/platform/companionWorkspaceSync';

import { CompanionDraftProvider } from './CompanionDraftProvider';
import { ReadableArticleDocument } from './CompanionReadableArticleDocument';
import { CompanionReadingActivity } from './companionReadingActivity';
import { createCompanionTopicContentSaveHandler } from './companionTopicEditingController';
import { useCompanionTopicEditAutosave } from './useCompanionTopicEditAutosave';
import { useCompanionWorkspaceLoaders } from './useCompanionWorkspaceLoaders';
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

it.each([
  { remoteChange: false, finish: 'done' },
  { remoteChange: true, finish: 'done' },
  { remoteChange: false, finish: 'autosave' },
  { remoteChange: true, finish: 'autosave' }
])('persists buffered input with concurrent remote change=$remoteChange via $finish', async ({ remoteChange, finish }) => {
  library = await createSearchLibrary(0);
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
  act(() => editor!.replaceRange(0, 0, 'Immediate input '));
  if (remoteChange) {
    const remote = await toWorkspaceNativeNodeVersion({ ...node, content: node.content + '\nRemote suffix',
      currentVersionId: 'base', updatedAt: '2026-10-11T00:00:00Z' }, 'remote', 'remote-edit');
    if (!remote.version_id || typeof remote.body_text !== 'string') throw new Error('Expected a complete remote version');
    const remoteVersionId = remote.version_id;
    const remoteBody = remote.body_text;
    await writeIosCompanionDatabase(db => applySyncNodesWithDbPort(db, [remote], { enqueueSearchInvalidations: false }));
    await act(async () => { view.rerender(document(remoteBody, remoteVersionId)); });
    expect(editor!.getContent()).toBe('Immediate input Original body');
  }
  if (finish === 'done') await act(() => activity.flush());
  const readBodies = () => library!.database.prepare(`SELECT n.content FROM nodes n WHERE n.id=?
    UNION SELECT json_extract(body.value, '$.text') AS content FROM nodes n
    JOIN node_sync_versions v ON v.version_id=n.current_version_id,
    json_each(v.snapshot_json, '$.text_alternative_bodies') body WHERE n.id=?`).all('topic', 'topic');
  await waitFor(() => expect(readBodies()).toContainEqual({ content: 'Immediate input Original body' }), { timeout: 3000 });
  const bodies = readBodies();
  if (remoteChange) expect(bodies).toContainEqual({ content: 'Original body\nRemote suffix' });
  expect(library.database.prepare('SELECT parent_version_id FROM node_sync_version_parents').all())
    .toContainEqual({ parent_version_id: 'base' });
});
