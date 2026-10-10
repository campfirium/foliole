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
  registerPlugin: () => ({
    configureFramedSyncPayloadBudget: async () => {},
    closeFramedSyncPayloadBudget: async () => {}
  })
}));

import { toWorkspaceNativeNodeVersion } from '../../lib/core/database/workspaceNodeSyncVersion';
import type { WorkspaceNodeSnapshot } from '../../lib/core/database/workspaceSnapshotHelpers';
import type { NativeCompanionWorkspaceSyncState } from '../../lib/platform/nativeCompanionSyncContract';
import { renderWithLocalization } from '../shared/localization/testLocalization';
import * as workspaceRepository from '../shared/platform/companion/companionWorkspaceRepository';
import { loadCompanionWorkspaceNode } from '../shared/platform/companion/runtime/companionWorkspaceNodeStore';
import {
  closeIosCompanionDatabase, initializeIosCompanionDatabase,
  type IosCompanionDatabaseManager
} from '../shared/platform/companion/runtime/iosCompanionDatabaseBootstrap';
import { createFakeCapacitorConnection } from '../shared/platform/companionSyncNodeVersionsTestSupport';
import { applyCompanionLocalNodeVersions } from '../shared/platform/companionSyncObjects';
import { loadCompanionWorkspaceSyncState } from '../shared/platform/companionWorkspaceSync';

import { ReadingActionsSheet } from './CompanionReadingSheets';
import { restoreCompanionTrashNode } from './companionTrashActions';
import { createCompanionTrashRestoreHandler } from './companionTrashController';
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

async function seed(id: string, changes: Partial<WorkspaceNodeSnapshot> = {}) {
  const node: WorkspaceNodeSnapshot = { id, content: `Body ${id}`, title: id, kind: 'topic', parentNodeId: null,
    createdAt: '2026-10-03', updatedAt: '2026-10-03', deletedAt: '2026-10-03T00:00:00Z',
    hideTitleHeading: false, isTitleManual: true, anchorLink: null, reveal: null, reading: null, review: null, ...changes };
  await applyCompanionLocalNodeVersions([await toWorkspaceNativeNodeVersion(node, 'fixture', `base-${id}`)]);
}
function RestoreSurface({ initial }: { initial: NativeCompanionWorkspaceSyncState }) {
  const [state, setState] = useState(initial);
  const [open, setOpen] = useState(true);
  const actions = createWorkspaceSnapshotActions({ state, setState, setError: () => {}, setStatus: () => {},
    setSyncConflictCount: () => {}, setSyncProgress: () => {} });
  const restore = createCompanionTrashRestoreHandler({ ...actions, state,
    bootstrapState: { device_id: 'fixture' } } as ReturnType<typeof useCompanionWorkspaceSync>);
  return <><button onClick={() => setOpen(false)}>Dismiss</button><button onClick={() => setOpen(true)}>Reopen</button>
    <ReadingActionsSheet open={open} onOpenChange={setOpen} onOpenReadingSheet={() => {}}
      onFindInDocument={() => {}} onRestoreFromTrash={() => restore('topic')} /></>;
}
it('restores a subtree with its bodies and original parent across reopening', async () => {
  await seed('parent', { kind: 'folder', deletedAt: null });
  await seed('folder', { kind: 'folder', parentNodeId: 'parent' });
  await seed('topic', { parentNodeId: 'folder' });
  await restoreCompanionTrashNode({ deviceId: 'fixture', nodeId: 'folder', snapshot: (await loadCompanionWorkspaceSyncState()).workspace_snapshot });
  await closeIosCompanionDatabase(); await openLibrary();
  expect((await loadCompanionWorkspaceSyncState()).workspace_snapshot?.trashedNodeIds).not.toContain('folder');
  expect((await loadCompanionWorkspaceSyncState()).workspace_snapshot?.trashedNodeIds).not.toContain('topic');
  expect(await loadCompanionWorkspaceNode('folder')).toMatchObject({ parentNodeId: 'parent' });
  expect(await loadCompanionWorkspaceNode('topic')).toMatchObject({ parentNodeId: 'folder', content: 'Body topic' });
});
it('keeps a duplicate trashed and preserves the canonical live topic', async () => {
  const fingerprints = { importSourceFingerprint: 'source-fp', importContentFingerprint: 'content-fp' };
  await seed('topic', fingerprints); await seed('live', { ...fingerprints, deletedAt: null });
  const before = await loadCompanionWorkspaceNode('live');
  const result = await restoreCompanionTrashNode({ deviceId: 'fixture', nodeId: 'topic', snapshot: (await loadCompanionWorkspaceSyncState()).workspace_snapshot });
  expect(result?.nodeId).toBe('live');
  expect((await loadCompanionWorkspaceNode('topic'))?.deletedAt).toBeTruthy();
  expect(await loadCompanionWorkspaceNode('live')).toEqual(before);
});
it('rolls back a failed restore and retries through the actions sheet', async () => {
  await seed('topic');
  renderWithLocalization(<RestoreSurface initial={await loadCompanionWorkspaceSyncState()} />);
  database!.exec("CREATE TRIGGER fail_restore BEFORE INSERT ON node_sync_versions BEGIN SELECT RAISE(ABORT, 'disk full'); END");
  fireEvent.click(screen.getByRole('button', { name: 'Restore from Trash' }));
  await screen.findByText('This topic could not be restored on this device.');
  expect((await loadCompanionWorkspaceNode('topic'))?.deletedAt).toBeTruthy();
  database!.exec('DROP TRIGGER fail_restore');
  fireEvent.click(screen.getByRole('button', { name: 'Restore from Trash' }));
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Restore from Trash' })).toBeNull());
  expect((await loadCompanionWorkspaceNode('topic'))?.deletedAt).toBeFalsy();
});
it('recovers a saved restore after refresh failure without another version', async () => {
  await seed('topic');
  renderWithLocalization(<RestoreSurface initial={await loadCompanionWorkspaceSyncState()} />);
  vi.spyOn(workspaceRepository, 'refreshCompanionWorkspaceAfterMutation').mockRejectedValueOnce(new Error('read failed'));
  fireEvent.click(screen.getByRole('button', { name: 'Restore from Trash' }));
  await waitFor(() => expect((database!.prepare("SELECT deleted_at FROM nodes WHERE id='topic'").get() as {deleted_at: string | null}).deleted_at).toBeNull());
  await screen.findByRole('status');
  const versions = database!.prepare('SELECT * FROM node_sync_versions').all();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' })); fireEvent.click(screen.getByRole('button', { name: 'Reopen' }));
  fireEvent.click(screen.queryByRole('button', { name: 'Refresh' }) ?? screen.getByRole('button', { name: 'Restore from Trash' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(database!.prepare('SELECT * FROM node_sync_versions').all()).toEqual(versions);
});

it('retains a committed restore when the reading surface remounts', async () => {
  await seed('topic');
  const initial = await loadCompanionWorkspaceSyncState();
  renderWithLocalization(<RestoreSurface initial={initial} />);
  vi.spyOn(workspaceRepository, 'refreshCompanionWorkspaceAfterMutation').mockRejectedValueOnce(new Error('read failed'));
  fireEvent.click(screen.getByRole('button', { name: 'Restore from Trash' }));
  await screen.findByText('Restored. The page could not be refreshed.');
  const versions = database!.prepare('SELECT * FROM node_sync_versions').all();
  cleanup();
  renderWithLocalization(<RestoreSurface initial={initial} />);
  fireEvent.click(screen.getByRole('button', { name: 'Restore from Trash' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(database!.prepare('SELECT * FROM node_sync_versions').all()).toEqual(versions);
});
it('shares pending restores and leaves a reopened sheet open on late completion', async () => {
  await seed('topic');
  const original = workspaceRepository.refreshCompanionWorkspaceAfterMutation;
  let finish!: () => void;
  const gate = new Promise<void>((resolve) => { finish = resolve; });
  vi.spyOn(workspaceRepository, 'refreshCompanionWorkspaceAfterMutation').mockImplementationOnce(async (snapshot) => {
    await gate; return original(snapshot);
  });
  renderWithLocalization(<RestoreSurface initial={await loadCompanionWorkspaceSyncState()} />);
  const button = screen.getByRole('button', { name: 'Restore from Trash' });
  fireEvent.click(button); fireEvent.click(button);
  expect(button).toBeDisabled();
  await waitFor(() => expect(database!.prepare("SELECT deleted_at FROM nodes WHERE id='topic'").get()).toEqual({ deleted_at: null }));
  const versions = database!.prepare('SELECT * FROM node_sync_versions').all();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  fireEvent.click(screen.getByRole('button', { name: 'Reopen' }));
  await act(async () => { finish(); await gate; });
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  expect(database!.prepare('SELECT * FROM node_sync_versions').all()).toEqual(versions);
});
it('rolls back the whole subtree when a child restore fails', async () => {
  await seed('folder', { kind: 'folder' }); await seed('topic', { parentNodeId: 'folder' });
  const before = database!.prepare('SELECT * FROM node_sync_versions').all();
  database!.exec("CREATE TRIGGER fail_child BEFORE INSERT ON node_sync_versions WHEN NEW.object_id='topic' BEGIN SELECT RAISE(ABORT, 'child write failed'); END");
  await expect(restoreCompanionTrashNode({ deviceId: 'fixture', nodeId: 'folder', snapshot: (await loadCompanionWorkspaceSyncState()).workspace_snapshot })).rejects.toThrow('child write failed');
  expect(database!.prepare('SELECT * FROM node_sync_versions').all()).toEqual(before);
  expect((await loadCompanionWorkspaceNode('folder'))?.deletedAt).toBeTruthy();
  expect((await loadCompanionWorkspaceNode('topic'))?.deletedAt).toBeTruthy();
});
it('rejects an old restore handler after the database is reopened', async () => {
  await seed('topic');
  const handler = createCompanionTrashRestoreHandler({ state: await loadCompanionWorkspaceSyncState(),
    bootstrapState: { device_id: 'fixture' }, refreshAfterMutation: vi.fn() } as unknown as ReturnType<typeof useCompanionWorkspaceSync>);
  await closeIosCompanionDatabase(); await openLibrary();
  await expect(handler('topic')).rejects.toThrow('companion_restore_library_changed');
  expect((await loadCompanionWorkspaceNode('topic'))?.deletedAt).toBeTruthy();
});
