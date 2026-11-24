import { webcrypto } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';

import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { textDevice } from '../../electron/database/topicTextState.testSupport';
import { createDesktopFramedSyncFiles } from '../../electron/sync/desktopFramedSyncFiles';
import { computeSyncContentHash } from '../../lib/core/database/syncState';
import { buildCanonicalSettingSyncPayload } from '../../lib/core/sync/canonicalPrivateStatePayload';
import { encodeFramedSyncStream } from '../../lib/core/sync/framedSyncBinaryStream';
import { FRAMED_SYNC_PROTOCOL_VERSION } from '../../lib/core/sync/framedSyncContract';
import { compareFramedSyncDatabaseInventories } from '../../lib/core/sync/framedSyncDatabaseDifference';
import { readRequestSyncInventorySnapshot } from '../../lib/core/sync/framedSyncInventoryRead';
import { sendRequestSyncObject } from '../../lib/core/sync/requestSyncObjectEndpoint';
import { applySyncObjectInTransaction } from '../../lib/core/sync/syncObjectApplyExecutor';
import { FOLDER_LIST_SORT_MEMORY_SETTING_KEY } from '../../lib/platform/folderListSortMemoryContract';
import { companionFramedFileOwner } from '../shared/platform/companion/runtime/companionFramedPayloadBudget';
import { mutateCompanionWorkspace } from '../shared/platform/companion/runtime/companionWorkspaceMutations';
import { getIosCompanionDatabaseOwner } from '../shared/platform/companion/runtime/iosCompanionDatabaseBootstrap';
import { resetCompanionFolderListSortMemoryForTests } from '../shared/platform/companion/settings/companionFolderListSortMemoryStore';
import { rememberCompanionRequestSyncPeerState } from '../shared/platform/companion/sync/framed/companionRequestSyncPeerState';
import { respondCompanionRequestSync } from '../shared/platform/companion/sync/framed/companionRequestSyncResponse';
import { createResumeLibrary, renderResumeSurface } from '../test/companionNavigationResume.testSupport';

import { useCompanionSyncAppliedRefresh } from './useCompanionSyncAppliedRefresh';

const native = vi.hoisted(() => ({ files: undefined as ReturnType<typeof createDesktopFramedSyncFiles> | undefined }));
vi.mock('../shared/platform/companion/sync/framed/companionFramedSyncFiles', () => ({
  currentCompanionFramedSyncFiles: () => native.files!
}));
vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../shared/platform/companion/runtime/companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true, isPluginAvailable: () => false },
    registerPlugin: createCompanionNativeSyncStub };
});
vi.mock('../shared/platform/appLifecycle', () => ({
  readNativeAppActiveState: async () => true, subscribeNativeAppEnteredBackground: async () => () => {},
  subscribeNativeAppBackground: async () => () => {}, subscribeNativeAppForeground: async () => () => {}
}));

const groupKey = new Uint8Array(32).fill(7);
const context = { groupId: 'group', protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION, initiatorDeviceId: 'peer',
  initiatorLibraryEpoch: 'peer-epoch', responderDeviceId: 'local', responderLibraryEpoch: 'local-epoch' } as const;
const settingKey = FOLDER_LIST_SORT_MEMORY_SETTING_KEY;
const settingId = `user_space:android:phone:*:${settingKey}`;
const folderSort = { direction: 'asc', key: 'name' };
const homeSort = { direction: 'desc', key: 'dateSaved' };
let root: string;
let library: Awaited<ReturnType<typeof createResumeLibrary>>;

beforeEach(async () => {
  vi.stubGlobal('crypto', webcrypto);
  vi.stubGlobal('Uint8Array', Object.getPrototypeOf(Buffer.prototype).constructor);
  mkdirSync('.tmp/artifacts/T858-4', { recursive: true });
  root = mkdtempSync(path.resolve('.tmp/artifacts/T858-4/mobile-sort-'));
  native.files = createDesktopFramedSyncFiles(path.join(root, 'receiver'));
  library = await createResumeLibrary();
  const db = library.database;
  db.prepare("INSERT INTO sync_groups VALUES ('group', 'Group', ?, 'now', 'now')").run(Buffer.from(groupKey).toString('base64url'));
  db.exec(`INSERT INTO nodes (id, parent_id, title, kind, content, created_at, updated_at)
    VALUES ('new', 'folder', 'New topic', 'topic', 'Body', '2026-10-25T01:00:00Z', '2026-10-25T01:00:00Z');
    INSERT INTO sync_group_local_state VALUES (1, 'group', 'local', 'active', 'now');
    UPDATE node_version_local_proof_state SET library_epoch = 'local-epoch';
    INSERT INTO sync_group_devices (group_id, device_identity_key, device_anchor, canonical_library_path, device_name,
      platform, state, joined_at, updated_at) VALUES
      ('group','peer','peer','/peer','Peer','android','active','now','now'),
      ('group','local','local','/local','Local','android','active','now','now');`);
  rememberCompanionRequestSyncPeerState({ contract_version: 3, group_id: 'group', sender_device_identity_key: 'peer',
    library_epoch: 'peer-epoch', proof_revision: 0, source_proof_revisions: {}, devices: [], removals: [], restore: null }, true);
});

afterEach(async () => {
  cleanup();
  await library?.close();
  resetCompanionFolderListSortMemoryForTests();
  rmSync(root, { recursive: true, force: true });
  vi.unstubAllGlobals();
});

async function sendFolderSort(acknowledge?: () => Promise<void>, folderId = 'folder') {
  const choices = { [folderId]: folderSort };
  const source = textDevice();
  try {
    const payload = buildCanonicalSettingSyncPayload({ form_factor: 'phone', host_name: '*',
      key: settingKey, platform: 'android', scope: 'user_space', value_json: JSON.stringify({
        sortByListId: choices, version: 1
      }) });
    await applySyncObjectInTransaction(source.db, { object_type: 'setting', object_id: settingId,
      content_hash: computeSyncContentHash('setting', payload), deleted_at: null,
      payload_json: JSON.stringify(payload), updated_at: '2026-10-25T01:00:00.000Z' });
    const inventory = await readRequestSyncInventorySnapshot(source.db);
    const difference = compareFramedSyncDatabaseInventories({ local: inventory, remote: [] })
      .find(item => item.globalId === settingId);
    if (!difference) throw new Error('Missing outbound phone sort setting.');

    await sendRequestSyncObject({ files: createDesktopFramedSyncFiles(path.join(root, 'sender')),
      readSnapshot: read => read(source.db), write: write => write(source.db) }, { context, groupKey, difference }, async stream => {
      const chunks = [];
      for await (const chunk of encodeFramedSyncStream(stream)) chunks.push(chunk);
      const bytes = Buffer.concat(chunks);
      const directory = `requests/${crypto.randomUUID()}`;
      await native.files!.write(`${directory}/http-in-0`, bytes);
      await respondCompanionRequestSync({ ...companionFramedFileOwner(getIosCompanionDatabaseOwner()),
        mode: 'object', directory, peer_round_id: crypto.randomUUID(), peer_round_mode: 'single',
        group_id: 'group', initiator_device_id: 'peer', initiator_library_epoch: 'peer-epoch',
        responder_device_id: 'local', responder_library_epoch: 'local-epoch',
        object_type: 'setting', global_id: settingId, request_chunk_count: 1, request_byte_length: bytes.length
      }, acknowledge);
    });
    expect(readSorts(source.sqlite)).toEqual(choices);
  } finally { source.sqlite.close(); }
}

function readSorts(db = library.database) {
  const json = db.prepare("SELECT value_json FROM setting_records WHERE key = ? AND form_factor = 'phone'").pluck().get(settingKey);
  return json ? JSON.parse(String(json)).sortByListId : {};
}

async function openBrowse() {
  const callbacks = { setState: vi.fn(), setConflictCount: vi.fn(), setError: vi.fn() };
  renderHook(() => useCompanionSyncAppliedRefresh(callbacks.setState, callbacks.setConflictCount, callbacks.setError));
  const { result } = renderResumeSurface(await library.snapshot());
  await waitFor(() => expect(result.current).not.toBeNull());
  act(() => result.current.actions.handleNavigationAction('recent'));
  return { result, callbacks };
}

it('updates the sort of a folder already open when a peer pushes its phone setting', async () => {
  const { result, callbacks } = await openBrowse();
  act(() => result.current.surface.handleSelectBrowseNode('folder'));
  const visibleOrder = () => result.current.surface.browsedFolder?.items.map(item => item.nodeId);
  expect(result.current.sort.browseSortKey).toBe('dateSaved');
  expect(visibleOrder()).toEqual(['new', 'article']);
  await act(() => sendFolderSort());
  await waitFor(() => expect(result.current.sort).toMatchObject({ browseSortKey: 'name', browseSortDirection: 'asc' }));
  expect(visibleOrder()).toEqual(['article', 'new']);
  expect(readSorts()).toEqual({ folder: folderSort });
  expect(callbacks.setError).not.toHaveBeenCalled();
});

it('preserves the received folder sort when edited at home before the incoming refresh is delivered', async () => {
  const { result, callbacks } = await openBrowse();
  expect(result.current.sort.browseSortKey).toBe('dateLastOpened');
  await act(() => sendFolderSort(async () => {
    expect(readSorts()).toEqual({ folder: folderSort });
    result.current.actions.handleNavigationAction('recent');
    await waitFor(() => expect(readSorts()).toEqual({ folder: folderSort, 'special-home': homeSort }));
  }));
  act(() => result.current.surface.handleSelectBrowseNode('folder'));
  await waitFor(() => expect(result.current.sort.browseSortKey).toBe('name'));
  expect(callbacks.setError).not.toHaveBeenCalled();
});

it('keeps an incoming choice for a folder committed before the displayed directory catches up', async () => {
  const { result } = await openBrowse();
  await mutateCompanionWorkspace({ type: 'create', nodeId: 'added', kind: 'folder', parentNodeId: null, title: 'Added' });

  await act(() => sendFolderSort(async () => {
    expect(readSorts()).toEqual({ added: folderSort });
    result.current.actions.handleNavigationAction('recent');
    await waitFor(() => expect(readSorts()).toEqual({ added: folderSort, 'special-home': homeSort }));
  }, 'added'));
});
