// @vitest-environment jsdom
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { act, fireEvent, screen, waitFor, cleanup } from '@testing-library/react';
import Database from 'better-sqlite3';
import { useState } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true },
  registerPlugin: () => ({})
}));

import type { NativeCompanionWorkspaceSyncState } from '../../lib/platform/nativeCompanionSyncContract';
import { renderWithLocalization } from '../shared/localization/testLocalization';
import * as workspaceRepository from '../shared/platform/companion/companionWorkspaceRepository';
import { invalidateCompanionReadingScope } from '../shared/platform/companion/reading/companionReadingScope';
import { loadCompanionWorkspaceNode } from '../shared/platform/companion/runtime/companionWorkspaceNodeStore';
import {
  closeIosCompanionDatabase, initializeIosCompanionDatabase,
  type IosCompanionDatabaseManager
} from '../shared/platform/companion/runtime/iosCompanionDatabaseBootstrap';
import { createFakeCapacitorConnection } from '../shared/platform/companionSyncNodeVersionsTestSupport';
import { loadCompanionWorkspaceSyncState } from '../shared/platform/companionWorkspaceSync';
import type { SelectionCommandPayload } from '../shared/selectionCommandPayload';

import { CompanionDraftProvider } from './CompanionDraftProvider';
import { SelectionAnnotationToolbarLayer } from './CompanionReadableArticleSelectionToolbarLayer';
import { persistCompanionSelectionAnnotation } from './companionSelectionAnnotationActions';
import { createCompanionExistingHighlightNoteHandler, createCompanionExistingHighlightDeleteHandler } from './companionSelectionAnnotationController';
import { createWorkspaceSnapshotActions } from './companionWorkspaceSyncActions';
import type { useCompanionWorkspaceSync } from './useCompanionWorkspaceSync';

let root = '';
let database: Database.Database | null = null;

async function openLibrary() {
  const file = path.join(root, 'companion.db');
  const existed = existsSync(file);
  const sqlite = new Database(file);
  database = sqlite;
  const connection = { ...createFakeCapacitorConnection(sqlite), getUrl: async () => ({ url: file }) };
  const manager = {
    closeConnection: async () => { sqlite.close(); database = null; },
    createConnection: async () => connection,
    isConnection: async () => ({ result: false }),
    isDatabase: async () => ({ result: existed }),
    retrieveConnection: async () => connection
  } as unknown as IosCompanionDatabaseManager;
  await initializeIosCompanionDatabase({
    booted_at: '2026-10-03T00:00:00Z', database_path: null, database_ready: false,
    host_name: 'Android mutation fixture', runtime_kind: 'android-capacitor'
  }, manager);
}

beforeEach(async () => {
  root = mkdtempSync(path.join(os.tmpdir(), 'companion-capture-recovery-'));
  await openLibrary();
  database!.exec("INSERT INTO nodes (id, title, kind, created_at, updated_at) VALUES ('source', 'Source', 'topic', '2026-10-03', '2026-10-03')");
});

afterEach(async () => {
  cleanup();
  vi.restoreAllMocks();
  await closeIosCompanionDatabase();
  if (database?.open) database.close();
  rmSync(root, { recursive: true, force: true });
});

const payload: SelectionCommandPayload = {
  parentNodeId: 'source', anchorId: 'anchor-beta', selectionText: 'Beta', clozeContent: 'Alpha [...] Gamma',
  entries: [{ anchorId: 'anchor-beta', selectionText: 'Beta', clozeContent: 'Alpha [...] Gamma',
    range: { from: 6, to: 10 }, locator: { from: 6, to: 10, originalText: 'Beta' } }]
};

function HighlightSurface({ initial, nodeId, cloze }: { initial: NativeCompanionWorkspaceSyncState; nodeId: string; cloze: boolean }) {
  const [state, setState] = useState(initial);
  const [open, setOpen] = useState(true);
  const actions = createWorkspaceSnapshotActions({ state, setState, setError: () => {}, setStatus: () => {},
    setSyncConflictCount: () => {}, setSyncProgress: () => {} });
  const sync = { ...actions, state, bootstrapState: { device_id: 'annotation-device' } } as ReturnType<typeof useCompanionWorkspaceSync>;
  return <CompanionDraftProvider>
    <button onClick={() => setOpen(false)}>Dismiss</button>
    <button onClick={() => setOpen(true)}>Reopen</button>
    <SelectionAnnotationToolbarLayer onAddExistingHighlightNote={createCompanionExistingHighlightNoteHandler(sync)}
      onDeleteExistingHighlight={createCompanionExistingHighlightDeleteHandler(sync)}
      onClose={() => setOpen(false)} snapshot={state.workspace_snapshot} resolveSelectionPayload={() => null}
      state={open ? { left: 0, top: 0, noteLeft: 0, noteTop: 0, payload: null,
        existingHighlight: { nodeId, originalText: 'Beta', kind: cloze ? 'cloze' : 'highlight' } } : null} />
  </CompanionDraftProvider>;
}

async function openHighlight(kind = 'highlight') {
  const initial = await loadCompanionWorkspaceSyncState();
  const saved = await persistCompanionSelectionAnnotation({ deviceId: 'fixture', kind: kind === 'cloze' ? 'cloze' : 'highlight', payload,
    snapshot: initial.workspace_snapshot });
  renderWithLocalization(<HighlightSurface initial={await loadCompanionWorkspaceSyncState()} nodeId={saved!.nodeId} cloze={kind === 'cloze'} />);
  await waitFor(() => expect(screen.getByRole('button', { name: kind === 'cloze' ? 'Delete cloze' : 'Add Comment' })).toBeEnabled());
  return saved!.nodeId;
}

function submit(kind: string) {
  if (kind === 'note') {
    fireEvent.click(screen.getByRole('button', { name: 'Add Comment' }));
    fireEvent.change(screen.getByPlaceholderText('Add annotation...'), { target: { value: 'Reader note' } });
  }
  fireEvent.click(screen.getByRole('button', { name: kind === 'note' ? 'Save' : kind === 'cloze' ? 'Delete cloze' : 'Close Highlight' }));
}

it.each(['note', 'delete', 'cloze'])('recovers saved %s without another write, including reopening', async (kind) => {
  const nodeId = await openHighlight(kind);
  const refresh = vi.spyOn(workspaceRepository, 'refreshCompanionWorkspaceAfterMutation')
    .mockRejectedValueOnce(new Error('Read unavailable'));
  submit(kind);
  await screen.findByRole('alert');
  const saved = await loadCompanionWorkspaceNode(nodeId);
  if (kind === 'note') expect(saved?.content).toBe('Beta\n※ Reader note');
  else expect(saved?.deletedAt).toBeTruthy();
  const versions = database!.prepare('SELECT * FROM node_sync_versions').all();
  fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
  fireEvent.click(screen.getByRole('button', { name: 'Reopen' }));
  expect(screen.getByRole('button', { name: kind === 'cloze' ? 'Delete cloze' : 'Add Comment' })).toBeDisabled();
  refresh.mockRejectedValueOnce(new Error('Still unavailable'));
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Refresh' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
  await waitFor(() => expect(screen.queryByRole('toolbar')).toBeNull());
  expect(database!.prepare('SELECT * FROM node_sync_versions').all()).toEqual(versions);
  await closeIosCompanionDatabase();
  await openLibrary();
  expect(await loadCompanionWorkspaceNode(nodeId)).toEqual(saved);
});

it.each(['note', 'delete', 'cloze'])('closes after a successful %s', async (kind) => {
  const nodeId = await openHighlight(kind);
  submit(kind);
  await waitFor(() => expect(screen.queryByRole('toolbar')).toBeNull());
  const saved = await loadCompanionWorkspaceNode(nodeId);
  if (kind === 'note') expect(saved?.content).toBe('Beta\n※ Reader note');
  else expect(saved?.deletedAt).toBeTruthy();
});

it.each(['note', 'delete', 'cloze'])('keeps an actual failed %s editable and retries the write', async (kind) => {
  const nodeId = await openHighlight(kind);
  const before = await loadCompanionWorkspaceNode(nodeId);
  database!.exec("CREATE TRIGGER fail_change BEFORE INSERT ON node_sync_versions BEGIN SELECT RAISE(ABORT, 'storage failure'); END");
  submit(kind);
  await screen.findByRole('alert');
  expect(await loadCompanionWorkspaceNode(nodeId)).toEqual(before);
  expect(screen.queryByRole('button', { name: 'Refresh' })).toBeNull();
  database!.exec('DROP TRIGGER fail_change');
  if (kind === 'note') {
    fireEvent.change(screen.getByPlaceholderText('Add annotation...'), { target: { value: 'Revised' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  } else fireEvent.click(screen.getByRole('button', { name: kind === 'cloze' ? 'Delete cloze' : 'Close Highlight' }));
  await waitFor(() => expect(screen.queryByRole('toolbar')).toBeNull());
  const after = await loadCompanionWorkspaceNode(nodeId);
  if (kind === 'note') expect(after?.content).toBe('Beta\n※ Revised');
  else expect(after?.deletedAt).toBeTruthy();
});

it.each(['note', 'cloze'])('blocks a saved %s refresh after changing libraries', async (kind) => {
  await openHighlight(kind);
  const refresh = vi.spyOn(workspaceRepository, 'refreshCompanionWorkspaceAfterMutation')
    .mockRejectedValueOnce(new Error('Read unavailable'));
  submit(kind);
  await screen.findByRole('alert');
  act(() => invalidateCompanionReadingScope());
  expect(screen.getByRole('button', { name: 'Refresh' })).toBeDisabled();
  expect(refresh).toHaveBeenCalledTimes(1);
});

it('does not close a reopened toolbar when the original save completes', async () => {
  const nodeId = await openHighlight();
  const original = workspaceRepository.refreshCompanionWorkspaceAfterMutation;
  let finish!: () => void;
  const waiting = new Promise<void>((resolve) => { finish = resolve; });
  vi.spyOn(workspaceRepository, 'refreshCompanionWorkspaceAfterMutation').mockImplementationOnce(async (snapshot) => {
    await waiting;
    return original(snapshot);
  });
  submit('note');
  await waitFor(async () => expect((await loadCompanionWorkspaceNode(nodeId))?.content).toBe('Beta\n※ Reader note'));
  fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
  fireEvent.click(screen.getByRole('button', { name: 'Reopen' }));
  expect(screen.getByRole('button', { name: 'Add Comment' })).toBeDisabled();
  await act(async () => { finish(); await waiting; });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Add Comment' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'Add Comment' }));
  expect(screen.getByPlaceholderText('Add annotation...')).toHaveValue('Reader note');
});
