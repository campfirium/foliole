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
import { loadCompanionWorkspaceNode } from '../shared/platform/companion/runtime/companionWorkspaceNodeStore';
import {
  closeIosCompanionDatabase, initializeIosCompanionDatabase,
  type IosCompanionDatabaseManager
} from '../shared/platform/companion/runtime/iosCompanionDatabaseBootstrap';
import { createFakeCapacitorConnection } from '../shared/platform/companionSyncNodeVersionsTestSupport';
import { loadCompanionWorkspaceSyncState } from '../shared/platform/companionWorkspaceSync';
import type { SelectionCommandPayload } from '../shared/selectionCommandPayload';

import { SelectionAnnotationToolbarLayer } from './CompanionReadableArticleSelectionToolbarLayer';
import { createCompanionSelectionAnnotationHandler } from './companionSelectionAnnotationController';
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

function AnnotationSurface({ initial }: { initial: NativeCompanionWorkspaceSyncState }) {
  const [state, setState] = useState(initial);
  const [open, setOpen] = useState(true);
  const [selection, setSelection] = useState(payload);
  const actions = createWorkspaceSnapshotActions({
    state, setState, setError: () => {}, setStatus: () => {},
    setSyncConflictCount: () => {}, setSyncProgress: () => {}
  });
  const save = createCompanionSelectionAnnotationHandler({
    ...actions, state, bootstrapState: { device_id: 'annotation-device' }
  } as ReturnType<typeof useCompanionWorkspaceSync>);
  return <>
    <button onClick={() => setOpen(false)}>Dismiss</button>
    <button onClick={() => setOpen(true)}>Open selection</button>
    <button onClick={() => setSelection({ ...payload, anchorId: 'another-anchor' })}>Change selection</button>
    <SelectionAnnotationToolbarLayer onCreateSelectionAnnotation={save}
    onClose={() => setOpen(false)} snapshot={state.workspace_snapshot}
    resolveSelectionPayload={() => selection}
    state={open ? { left: 0, top: 0, noteLeft: 0, noteTop: 0, payload: selection } : null} /></>;
}

function savedAnnotations() {
  return database!.prepare("SELECT * FROM nodes WHERE parent_id = 'source'").all();
}

it.each(['Highlight', 'Cloze', 'note'])('retries only the refresh after saving %s', async (kind) => {
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
  renderWithLocalization(<AnnotationSurface initial={await loadCompanionWorkspaceSyncState()} />);
  const refresh = vi.spyOn(workspaceRepository, 'refreshCompanionWorkspaceAfterMutation')
    .mockRejectedValueOnce(new Error('Read unavailable'));
  if (kind === 'note') {
    fireEvent.click(screen.getByRole('button', { name: 'Add Comment' }));
    fireEvent.change(screen.getByPlaceholderText('Add annotation...'), { target: { value: 'Reader note' } });
  }
  fireEvent.click(screen.getByRole('button', { name: kind === 'note' ? 'Save' : kind }));
  await waitFor(() => expect(errors).toHaveBeenCalled());
  const saved = savedAnnotations();
  expect(saved).toHaveLength(1);
  const versions = database!.prepare('SELECT * FROM node_sync_versions').all();
  expect(screen.getByRole('alert')).toHaveTextContent('Annotation saved.');
  expect(screen.getByRole('button', { name: 'Highlight' })).toBeDisabled();
  if (kind === 'note') expect(screen.getByPlaceholderText('Add annotation...')).toBeDisabled();
  refresh.mockRejectedValueOnce(new Error('Still unavailable'));
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Refresh' })).toBeEnabled());
  expect(savedAnnotations()).toEqual(saved);

  fireEvent.click(screen.queryByRole('button', { name: 'Refresh' })
    ? screen.getByRole('button', { name: 'Refresh' })
    : screen.getByRole('button', { name: kind === 'note' ? 'Save' : kind }));
  await waitFor(() => expect(screen.queryByRole('toolbar')).toBeNull());
  expect(savedAnnotations()).toEqual(saved);
  expect(database!.prepare('SELECT * FROM node_sync_versions').all()).toEqual(versions);
  await closeIosCompanionDatabase();
  await openLibrary();
  expect(savedAnnotations()).toEqual(saved);
});

it('keeps a failed write editable and saves the revised comment', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  renderWithLocalization(<AnnotationSurface initial={await loadCompanionWorkspaceSyncState()} />);
  database!.exec("CREATE TRIGGER fail_annotation BEFORE INSERT ON nodes BEGIN SELECT RAISE(ABORT, 'storage failure'); END");
  fireEvent.click(screen.getByRole('button', { name: 'Add Comment' }));
  fireEvent.change(screen.getByPlaceholderText('Add annotation...'), { target: { value: 'First draft' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await screen.findByRole('alert');
  expect(savedAnnotations()).toHaveLength(0);
  expect(screen.getByPlaceholderText('Add annotation...')).toBeEnabled();
  fireEvent.change(screen.getByPlaceholderText('Add annotation...'), { target: { value: 'Revised' } });
  database!.exec('DROP TRIGGER fail_annotation');
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(screen.queryByRole('toolbar')).toBeNull());
  expect(savedAnnotations()).toHaveLength(1);
  const saved = savedAnnotations()[0] as { id: string };
  expect(await loadCompanionWorkspaceNode(saved.id)).toMatchObject({ content: 'Beta\n※ Revised' });
});

it.each(['reopen', 'replace'])('isolates the previous pending save when selections %s', async (mode) => {
  renderWithLocalization(<AnnotationSurface initial={await loadCompanionWorkspaceSyncState()} />);
  const original = workspaceRepository.refreshCompanionWorkspaceAfterMutation;
  let finish!: () => void;
  const waiting = new Promise<void>((resolve) => { finish = resolve; });
  vi.spyOn(workspaceRepository, 'refreshCompanionWorkspaceAfterMutation').mockImplementationOnce(async (snapshot) => {
    await waiting;
    return original(snapshot);
  });
  fireEvent.click(screen.getByRole('button', { name: 'Highlight' }));
  fireEvent.click(screen.getByRole('button', { name: 'Cloze' }));
  await waitFor(() => expect(savedAnnotations()).toHaveLength(1));
  if (mode === 'reopen') {
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open selection' }));
  } else fireEvent.click(screen.getByRole('button', { name: 'Change selection' }));
  fireEvent.click(screen.getByRole('button', { name: 'Add Comment' }));
  fireEvent.change(screen.getByPlaceholderText('Add annotation...'), { target: { value: 'New draft' } });
  await act(async () => { finish(); await waiting; });
  expect(screen.getByPlaceholderText('Add annotation...')).toHaveValue('New draft');
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(screen.queryByRole('toolbar')).toBeNull());
  expect(savedAnnotations()).toHaveLength(2);
});

it('starts a fresh selection after dismissing a saved annotation with a failed refresh', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  renderWithLocalization(<AnnotationSurface initial={await loadCompanionWorkspaceSyncState()} />);
  vi.spyOn(workspaceRepository, 'refreshCompanionWorkspaceAfterMutation')
    .mockRejectedValueOnce(new Error('Read unavailable'));
  fireEvent.click(screen.getByRole('button', { name: 'Highlight' }));
  await screen.findByRole('alert');
  fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
  fireEvent.click(screen.getByRole('button', { name: 'Open selection' }));
  expect(screen.queryByRole('alert')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Cloze' }));
  await waitFor(() => expect(screen.queryByRole('toolbar')).toBeNull());
  expect(savedAnnotations()).toHaveLength(2);
  expect(savedAnnotations()[1]).toMatchObject({ kind: 'item' });
});
