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
import {
  closeIosCompanionDatabase, initializeIosCompanionDatabase,
  type IosCompanionDatabaseManager
} from '../shared/platform/companion/runtime/iosCompanionDatabaseBootstrap';
import { createFakeCapacitorConnection } from '../shared/platform/companionSyncNodeVersionsTestSupport';
import { loadCompanionWorkspaceSyncState } from '../shared/platform/companionWorkspaceSync';

import { CompanionCaptureSheet } from './CompanionCaptureSheet';
import { createCompanionCaptureTextSaveHandler } from './companionCaptureTextController';
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

});

afterEach(async () => {
  cleanup();
  vi.restoreAllMocks();
  await closeIosCompanionDatabase();
  if (database?.open) database.close();
  rmSync(root, { recursive: true, force: true });
});

function CaptureSurface({ initial }: { initial: NativeCompanionWorkspaceSyncState }) {
  const [state, setState] = useState(initial);
  const [open, setOpen] = useState(true);
  const actions = createWorkspaceSnapshotActions({
    state, setState, setError: () => {}, setStatus: () => {},
    setSyncConflictCount: () => {}, setSyncProgress: () => {}
  });
  const save = createCompanionCaptureTextSaveHandler({
    ...actions, state, bootstrapState: { device_id: 'capture-device' }
  } as ReturnType<typeof useCompanionWorkspaceSync>);
  return <>
    <button onClick={() => setOpen(true)}>Open capture</button>
    <CompanionCaptureSheet onOpenChange={setOpen} onSave={save} open={open} />
  </>;
}

function storedTopics() {
  return database!.prepare("SELECT id, title FROM nodes WHERE kind = 'topic'").all();
}

it('does not create another topic when retrying after a committed capture refresh fails', async () => {
  renderWithLocalization(<CaptureSurface initial={await loadCompanionWorkspaceSyncState()} />);
  const refresh = vi.spyOn(workspaceRepository, 'refreshCompanionWorkspaceAfterMutation');
  refresh.mockRejectedValueOnce(new Error('Read unavailable'));
  fireEvent.change(screen.getByLabelText('Capture text'), { target: { value: 'Captured once' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await screen.findByRole('alert');
  const saved = storedTopics();
  expect(saved).toHaveLength(1);
  const versions = database!.prepare('SELECT * FROM node_sync_versions').all();
  expect(screen.getByRole('alert')).toHaveTextContent('Topic saved.');
  expect(screen.getByLabelText('Capture text')).toHaveAttribute('readonly');
  refresh.mockRejectedValueOnce(new Error('Still unavailable'));
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Refresh' })).toBeEnabled());
  expect(storedTopics()).toEqual(saved);
  expect(database!.prepare('SELECT * FROM node_sync_versions').all()).toEqual(versions);
  fireEvent.click(screen.getByRole('button', { name: /^(Save|Refresh)$/ }));
  await waitFor(() => expect(screen.queryByLabelText('Capture text')).toBeNull());
  expect(storedTopics()).toEqual(saved);
  expect(database!.prepare('SELECT * FROM node_sync_versions').all()).toEqual(versions);
  await closeIosCompanionDatabase();
  await openLibrary();
  expect(storedTopics()).toEqual(saved);
});

it('retains an editable draft after a rolled back write and saves the revised text on retry', async () => {
  renderWithLocalization(<CaptureSurface initial={await loadCompanionWorkspaceSyncState()} />);
  database!.exec("CREATE TRIGGER fail_capture BEFORE INSERT ON nodes BEGIN SELECT RAISE(ABORT, 'storage failure'); END");
  fireEvent.change(screen.getByLabelText('Capture text'), { target: { value: 'First draft' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await screen.findByRole('alert');
  expect(storedTopics()).toHaveLength(0);
  fireEvent.change(screen.getByLabelText('Capture text'), { target: { value: 'Revised draft' } });
  database!.exec('DROP TRIGGER fail_capture');
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(screen.queryByLabelText('Capture text')).toBeNull());
  expect(storedTopics()).toEqual([{ id: expect.any(String), title: 'Revised draft' }]);
});

it('keeps a new capture independent when an earlier save finishes after closing and reopening', async () => {
  renderWithLocalization(<CaptureSurface initial={await loadCompanionWorkspaceSyncState()} />);
  const originalRefresh = workspaceRepository.refreshCompanionWorkspaceAfterMutation;
  let finish!: () => void;
  const waiting = new Promise<void>((resolve) => { finish = resolve; });
  vi.spyOn(workspaceRepository, 'refreshCompanionWorkspaceAfterMutation').mockImplementationOnce(async (snapshot) => {
    await waiting;
    return originalRefresh(snapshot);
  });
  fireEvent.change(screen.getByLabelText('Capture text'), { target: { value: 'First topic' } });
  const save = screen.getByRole('button', { name: 'Save' });
  fireEvent.click(save);
  fireEvent.click(save);
  await waitFor(() => expect(storedTopics()).toHaveLength(1));
  expect(screen.getByLabelText('Capture text')).toHaveAttribute('readonly');
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  fireEvent.click(screen.getByRole('button', { name: 'Open capture' }));
  fireEvent.change(screen.getByLabelText('Capture text'), { target: { value: 'Second topic' } });
  await act(async () => { finish(); await waiting; });
  expect(screen.getByLabelText('Capture text')).toHaveValue('Second topic');
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(screen.queryByLabelText('Capture text')).toBeNull());
  expect(storedTopics().map((row) => (row as { title: string }).title)).toEqual(['First topic', 'Second topic']);
});

it('starts a fresh capture after closing an already saved topic with a failed refresh', async () => {
  renderWithLocalization(<CaptureSurface initial={await loadCompanionWorkspaceSyncState()} />);
  vi.spyOn(workspaceRepository, 'refreshCompanionWorkspaceAfterMutation')
    .mockRejectedValueOnce(new Error('Read unavailable'));
  fireEvent.change(screen.getByLabelText('Capture text'), { target: { value: 'Saved topic' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await screen.findByRole('alert');
  fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  fireEvent.click(screen.getByRole('button', { name: 'Open capture' }));
  expect(screen.getByLabelText('Capture text')).toHaveValue('');
  expect(screen.getByLabelText('Capture text')).not.toHaveAttribute('readonly');
  fireEvent.change(screen.getByLabelText('Capture text'), { target: { value: 'New topic' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(screen.queryByLabelText('Capture text')).toBeNull());
  expect(storedTopics().map((row) => (row as { title: string }).title)).toEqual(['Saved topic', 'New topic']);
});
