// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { upsertDesktopSource, resolveDesktopSourceAddress } from '../../../../../electron/database/desktopSources.js';
import { loadExternalSearchFolders } from '../../../../../electron/database/externalSearchFolders.js';
import { completeEligibleRemovals as completeDesktopEligibleRemovals } from '../../../../../electron/database/syncGroupMemberStateReads.js';
import { applyDesktopSyncGroupMemberState, initiateDesktopSyncGroupDeviceRemoval,
  loadDesktopSyncGroupMemberState } from '../../../../../electron/database/syncGroupMemberStateStore.js';
import { createDesktopSyncGroup, leaveDesktopSyncGroupDevice } from '../../../../../electron/database/syncGroupStore.js';
import { closeLibraries, createPeer, joinPeers, root, startLibraries, type Peer } from '../../../../../electron/database/syncLibrary.testSupport.js';
import { ANDROID_COMPANION_DOCUMENT_RESOURCE_QUERY_DEFINITIONS } from '../../../../../lib/core/database/androidCompanionDocumentResourceQueryDefinitions.js';
import { computeSyncContentHash } from '../../../../../lib/core/database/syncState.js';
import { readFramedSyncObjectStateInventory } from '../../../../../lib/core/sync/framedSyncObjectStateInventory.js';
import { applySyncObjectInTransaction } from '../../../../../lib/core/sync/syncObjectApplyExecutor.js';
import { SYNC_OBJECT_PAYLOAD_SQL_BY_TYPE } from '../../../../../lib/core/sync/syncObjectPayloadSql.js';
import type { NativeSyncObjectRecord } from '../../../../../lib/platform/nativeSyncContract.js';
import { createSyncGroupDeviceIdentity } from '../../../../../lib/platform/syncGroupUnifiedContract.js';

import { completeEligibleRemovals as completeCompanionEligibleRemovals } from './syncGroupMemberStateReads';
import { applyCompanionSyncGroupMemberState } from './syncGroupMemberStateStore';


let current: Peer;
let peers: Peer[];
vi.mock('../runtime/iosCompanionDatabaseBootstrap', () => ({
  getIosCompanionDatabaseOwner: () => ({
    read: <T>(work: (port: Peer['port']) => T) => work(current.port),
    runWriter: <T>(work: (port: Peer['port']) => T) => work(current.port)
  })
}));
vi.mock('../../../../../electron/database/connection.js', () => ({ openDatabaseConnection: () => ({ driver: current.driver, sqlite: current.db }) }));
beforeEach(async () => {
  const started = performance.now();
  const mark = (stage: string) => {
    if (process.platform === 'win32' && process.env.CI) {
      console.info(JSON.stringify({ event: 'external_membership_fixture_setup', stage,
        elapsedMs: performance.now() - started, root }));
    }
  };
  mark('start');
  await startLibraries();
  mark('directory');
  peers = ['a', 'b', 'c'].map(id => {
    const peer = createPeer(id);
    mark(`peer-${id}`);
    return peer;
  });
  joinPeers(...peers);
  mark('joined');
  current = peers[0]!;
});
afterEach(closeLibraries);

it.each(['remove', 'leave'] as const)('hides the departed provider library from other peers after %s, deletes it after seven days and keeps it local on the provider', async (action) => {
  const [a, b, c] = peers as [Peer, Peer, Peer];
  const standaloneId = randomUUID();
  c.db.prepare("INSERT INTO settings VALUES ('standalone_device_uuid', ?, 'now')").run(JSON.stringify(standaloneId));
  const folderPath = path.join(root, 'external');
  await mkdir(folderPath);
  await writeFile(path.join(folderPath, 'note.md'), 'Original file');
  current = c;
  const original = seedFolder('provided', folderPath);
  for (const peer of [a, b, c]) {
    if (peer !== c) await peer.port.transaction(tx => applySyncObjectInTransaction(tx, original));
    peer.db.prepare(`INSERT INTO external_documents
      (document_id, folder_id, relative_path, file_name, extension, source_size_bytes,
       source_modified_at, source_modified_ms, content_hash, title, content, indexed_at, created_at, updated_at)
      VALUES ('provided:note.md', 'provided', 'note.md', 'note.md', 'md', 13, 'now', 1, 'hash', 'Note', 'Original file', 'now', 'now', 'now')`).run();
  }
  current = a;
  seedFolder('retained', folderPath);
  expect(loadExternalSearchFolders().find(folder => folder.id === 'provided')?.access_mode).toBe('remote_mirror');
  expect(resolveDesktopSourceAddress('external:provided', 'note.md')).toBeNull();
  if (action === 'remove') {
    initiateDesktopSyncGroupDeviceRemoval(c.id);
    const request = loadDesktopSyncGroupMemberState();
    current = b;
    const confirmation = (await applyCompanionSyncGroupMemberState(request, a.id)).state;
    current = a;
    applyDesktopSyncGroupMemberState(confirmation, b.id);
  } else {
    current = c;
    leaveDesktopSyncGroupDevice(c.id);
    const departure = loadDesktopSyncGroupMemberState({ groupId: 'group', senderDeviceId: c.id });
    for (const peer of [a, b]) {
      current = peer;
      if (peer === b) await applyCompanionSyncGroupMemberState(departure, c.id);
      else applyDesktopSyncGroupMemberState(departure, c.id);
    }
  }
  current = a;
  const completed = loadDesktopSyncGroupMemberState();
  for (const peer of [b, c]) {
    current = peer;
    if (peer === b) await applyCompanionSyncGroupMemberState(completed, a.id);
    else if (action === 'remove') applyDesktopSyncGroupMemberState(completed, a.id);
  }
  current = a;
  expect(loadExternalSearchFolders().map(folder => folder.id)).toEqual(['retained']);
  for (const peer of [a, b]) await expectHiddenDuringGrace(peer);
  const afterGrace = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString();
  current = a;
  completeDesktopEligibleRemovals('group', afterGrace);
  current = b;
  await completeCompanionEligibleRemovals(b.port, 'group', afterGrace);
  for (const peer of [a, b]) await expectRetired(peer, original);
  expectKeptLocally(c, standaloneId, folderPath);
  expect(a.db.prepare("SELECT id FROM external_search_folders WHERE id = 'retained'").get()).toEqual({ id: 'retained' });
  expect(await readFile(path.join(folderPath, 'note.md'), 'utf8')).toBe('Original file');
});

it('rolls back the grace-period purge when External removal fails', async () => {
  const [a, , c] = peers as [Peer, Peer, Peer];
  current = c;
  const original = seedFolder('provided', '/not-read');
  current = a;
  await a.port.transaction(tx => applySyncObjectInTransaction(tx, original));
  leaveDesktopSyncGroupDevice(c.id, new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString());
  const before = a.db.prepare("SELECT * FROM sync_object_state WHERE object_type = 'external_folder'").all();
  expect(before).toHaveLength(1);
  a.db.exec(`CREATE TRIGGER reject_external_retirement BEFORE DELETE ON external_search_folders
    BEGIN SELECT RAISE(ABORT, 'retirement rejected'); END`);
  expect(() => a.driver.transaction(() => completeDesktopEligibleRemovals('group', new Date().toISOString())))
    .toThrow('retirement rejected');
  expect(a.db.prepare("SELECT id FROM external_search_folders WHERE id = 'provided'").get()).toEqual({ id: 'provided' });
  expect(a.db.prepare("SELECT * FROM sync_object_state WHERE object_type = 'external_folder'").all()).toEqual(before);
});

function expectKeptLocally(peer: Peer, standaloneId: string, folderPath: string) {
  current = peer;
  expect(peer.db.prepare('SELECT * FROM sync_group_local_state').all()).toEqual([]);
  expect(loadExternalSearchFolders().find(folder => folder.id === 'provided')?.access_mode).toBe('local');
  expect(resolveDesktopSourceAddress('external:provided', 'note.md')).toBe(path.join(folderPath, 'note.md'));
  const reopened = new Database(peer.file, { readonly: true });
  try {
    const source = reopened.prepare("SELECT type_settings_json FROM desktop_sources WHERE source_ref = 'external:provided'")
      .get() as { type_settings_json: string };
    expect(JSON.parse(source.type_settings_json).ownerDeviceIdentityKey).toBe(standaloneId);
    expect(reopened.prepare("SELECT document_id FROM external_documents WHERE folder_id = 'provided'").all())
      .toEqual([{ document_id: 'provided:note.md' }]);
    expect(reopened.prepare("SELECT deleted_at FROM sync_object_state WHERE object_type = 'external_folder' AND object_id = 'provided'").get())
      .toEqual({ deleted_at: null });
  } finally { reopened.close(); }
}

function expectForgotten(peer: Peer, folderId: string) {
  const reopened = new Database(peer.file, { readonly: true });
  try {
    expect(reopened.prepare('SELECT id FROM external_search_folders WHERE id = ?').get(folderId)).toBeUndefined();
    expect(reopened.prepare('SELECT source_ref FROM desktop_sources WHERE source_ref = ?').get(`external:${folderId}`)).toBeUndefined();
    expect(reopened.prepare('SELECT document_id FROM external_documents WHERE folder_id = ?').all(folderId)).toEqual([]);
    expect(reopened.prepare(`SELECT object_type FROM sync_object_state WHERE (object_type = 'external_folder' AND object_id = ?)
      OR (object_type = 'external_document' AND object_id LIKE ?)`).all(folderId, `${folderId}:%`)).toEqual([]);
  } finally { reopened.close(); }
}

async function expectHiddenDuringGrace(peer: Peer) {
  current = peer;
  const folders = peer.db.prepare(ANDROID_COMPANION_DOCUMENT_RESOURCE_QUERY_DEFINITIONS.externalSearchFolders.sql).all() as Array<{ id: string }>;
  expect(folders.map(folder => folder.id)).not.toContain('provided');
  expect((peer.db.prepare(ANDROID_COMPANION_DOCUMENT_RESOURCE_QUERY_DEFINITIONS.externalDocumentDirectoryEntries.sql).all() as Array<{ folder_id: string }>)
    .map(entry => entry.folder_id)).not.toContain('provided');
  expect(peer.db.prepare(ANDROID_COMPANION_DOCUMENT_RESOURCE_QUERY_DEFINITIONS.externalDocumentById.sql).all('provided:note.md')).toEqual([]);
  expect((await readFramedSyncObjectStateInventory(peer.port)).filter(entry => entry.globalId.startsWith('provided'))).toEqual([]);
  expect(peer.db.prepare("SELECT id FROM external_search_folders WHERE id = 'provided'").get()).toEqual({ id: 'provided' });
  expect(peer.db.prepare(`SELECT object_type, deleted_at FROM sync_object_state
    WHERE object_type = 'external_folder' AND object_id = 'provided'`).all()).toEqual([{ object_type: 'external_folder', deleted_at: null }]);
}

async function expectRetired(peer: Peer, original: NativeSyncObjectRecord) {
  expectForgotten(peer, 'provided');
  await peer.port.transaction(tx => applySyncObjectInTransaction(tx, { ...original, updated_at: '2099-01-01T00:00:00.000Z' }));
  expectForgotten(peer, 'provided');
}

it('drops late payloads of a library whose provider already left without deletion records', async () => {
  current = peers[2]!;
  const original = seedFolder('late', '/not-read');
  current = peers[0]!;
  leaveDesktopSyncGroupDevice(peers[2]!.id);
  const payload = { document_id: 'late:doc', folder_id: 'late', relative_path: 'doc.md',
    file_name: 'doc.md', extension: 'md', title: 'Late', content_hash: 'hash', body_blob_hash: null,
    reference_json: null, reference_kind: 'local_path' };
  await current.port.transaction(tx => applySyncObjectInTransaction(tx, {
    object_type: 'external_document', object_id: 'late:doc', payload_json: JSON.stringify(payload),
    content_hash: computeSyncContentHash('external_document', payload), updated_at: '2099-01-01T00:00:00.000Z', deleted_at: null
  }));
  await current.port.transaction(tx => applySyncObjectInTransaction(tx, original));
  expectForgotten(current, 'late');
});

it('keeps an existing local library owned by the same device when creating a group', () => {
  current = createPeer('standalone');
  current.db.prepare("INSERT INTO settings VALUES ('standalone_device_uuid', ?, 'now')").run(JSON.stringify(current.anchor));
  seedFolder('local', '/local');
  const device = createSyncGroupDeviceIdentity({ device_anchor: current.anchor, group_id: 'new-group',
    library_path: current.file, path_flavor: process.platform === 'win32' ? 'windows' : 'posix' });
  createDesktopSyncGroup({ device, deviceName: 'Renamed computer', platform: 'darwin' });
  expect(resolveDesktopSourceAddress('external:local', 'doc.md', { requireAvailableRoot: false })).toBe('/local/doc.md');
  const row = current.driver.queryOne<{ payload_json: string }>(SYNC_OBJECT_PAYLOAD_SQL_BY_TYPE.external_folder, ['local'])!;
  expect(JSON.parse(row.payload_json)).toMatchObject({ owner_device_identity_key: device.identity_key });
  expect(current.db.prepare("SELECT content_hash FROM sync_object_state WHERE object_type = 'external_folder' AND object_id = 'local'").get())
    .toEqual({ content_hash: computeSyncContentHash('external_folder', JSON.parse(row.payload_json)) });
});

function seedFolder(id: string, folderPath: string): NativeSyncObjectRecord {
  const now = '2026-10-01T00:00:00.000Z';
  const source = upsertDesktopSource({ configRef: id, rootPath: folderPath, sourceType: 'external', updatedAt: now });
  current.db.prepare(`INSERT INTO external_search_folders
    (id, folder_path, attachment_mode, created_at, updated_at, source_ref)
    VALUES (?, ?, 'document_relative', ?, ?, ?)`).run(id, folderPath, now, now, source.source_ref);
  const row = current.driver.queryOne<{ payload_json: string }>(SYNC_OBJECT_PAYLOAD_SQL_BY_TYPE.external_folder, [id])!;
  return { object_type: 'external_folder', object_id: id, payload_json: row.payload_json,
    content_hash: computeSyncContentHash('external_folder', JSON.parse(row.payload_json)), updated_at: now, deleted_at: null };
}
