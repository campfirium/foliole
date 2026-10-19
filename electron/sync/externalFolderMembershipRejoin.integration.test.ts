// @vitest-environment node
import { promises as fs } from 'node:fs';

import Database from 'better-sqlite3';
import { expect, it, vi } from 'vitest';
import { z } from 'zod';

import { computeSyncContentHash } from '../../lib/core/database/syncState.js';
import { hashTextBody } from '../../lib/core/database/textBodyHash.js';
import { applySyncObjectInTransaction } from '../../lib/core/sync/syncObjectApplyExecutor.js';
import { createSyncGroupDeviceIdentity } from '../../lib/platform/syncGroupUnifiedContract.js';
import { createBetterSqlite3Driver } from '../database/betterSqlite3Driver.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';
import { leaveDesktopSyncGroupDevice, registerSyncGroupDevice } from '../database/syncGroupStore.js';

import { reconnectFixturePeer } from './desktopFramedSyncPublicationRecovery.testSupport.js';
import { createDesktopFramedSyncTwoProcessFixture } from './desktopFramedSyncTwoProcess.testSupport.js';

let memberDb: Database.Database;
vi.mock('../database/connection.js', () => ({ openDatabaseConnection: () => ({
  sqlite: memberDb, driver: createBetterSqlite3Driver(memberDb)
}) }));

const folderId = 'provided-folder';
const documentId = `${folderId}:note.md`;
const body = 'External document provided by a group member';

it('drops a departed member library from peers without deletion records and restores it on rejoin', async () => {
  const fixture = await createDesktopFramedSyncTwoProcessFixture(undefined, true, true);
  try {
    const provider = fixture.leftSnapshot.deviceId;
    await seedFolder(fixture.leftSnapshot.databasePath, provider);
    expect(await reconnectFixturePeer(fixture.left, fixture.rightSnapshot)).toMatchObject({ complete: true });
    expectLibrary(fixture.rightSnapshot.databasePath, 'present');

    const departed = withMemberDb(fixture.rightSnapshot.databasePath, () => {
      const row = memberDb.prepare(`SELECT group_id, device_anchor, canonical_library_path, device_name, platform
        FROM sync_group_devices WHERE device_identity_key = ?`).get(provider) as Record<string, string>;
      leaveDesktopSyncGroupDevice(provider);
      return row;
    });
    expectLibrary(fixture.rightSnapshot.databasePath, 'forgotten');
    await reconnectFixturePeer(fixture.left, fixture.rightSnapshot).catch(() => undefined);
    expectLibrary(fixture.rightSnapshot.databasePath, 'forgotten');
    expectLibrary(fixture.leftSnapshot.databasePath, 'present');

    withMemberDb(fixture.rightSnapshot.databasePath, () => registerSyncGroupDevice({
      device: createSyncGroupDeviceIdentity({ device_anchor: departed.device_anchor!, group_id: departed.group_id!,
        library_path: departed.canonical_library_path!, path_flavor: 'posix' }),
      deviceName: departed.device_name!, platform: departed.platform!
    }));
    await reconnectFixturePeer(fixture.left, fixture.rightSnapshot);
    expect(await reconnectFixturePeer(fixture.left, fixture.rightSnapshot)).toMatchObject({ complete: true });
    expectLibrary(fixture.rightSnapshot.databasePath, 'present');
  } finally {
    await Promise.allSettled([fixture.left.close(), fixture.right.close()]);
    await fs.rm(fixture.root, { force: true, recursive: true });
  }
}, 90_000);

function withMemberDb<T>(databasePath: string, task: () => T) {
  memberDb = new Database(databasePath);
  try { return task(); } finally { memberDb.close(); }
}

async function seedFolder(databasePath: string, ownerDeviceIdentityKey: string) {
  const db = new Database(databasePath);
  try {
    const hostName = z.string().parse(JSON.parse(z.string().parse(
      db.prepare("SELECT value FROM settings WHERE key = 'host_name'").pluck().get())));
    const folder = { id: folderId, source_ref: `external:${folderId}`, host_name: hostName,
      owner_device_identity_key: ownerDeviceIdentityKey, host_platform: process.platform,
      attachment_mode: 'document_relative', excluded_dirs_json: '[]' };
    const document = { body_blob_hash: hashTextBody(body), content_hash: hashTextBody(body), document_id: documentId,
      extension: 'md', file_name: 'note.md', folder_id: folderId, reference_json: null,
      reference_kind: 'local_path', relative_path: 'note.md', title: 'Note' };
    await createBetterSqliteDbPort(db).transaction(async (tx) => {
      for (const [type, id, payload] of [
        ['external_folder', folderId, folder], ['external_document', documentId, document]
      ] as const) await applySyncObjectInTransaction(tx, { object_type: type, object_id: id,
        content_hash: computeSyncContentHash(type, payload), deleted_at: null, updated_at: '2026-07-01T00:00:00.000Z',
        payload_json: JSON.stringify({ ...payload, ...(type === 'external_document' ? { content: body } : {}) }) });
    });
  } finally { db.close(); }
}

function expectLibrary(databasePath: string, expected: 'present' | 'forgotten') {
  const db = new Database(databasePath, { readonly: true });
  try {
    const count = (sql: string, id: string) => db.prepare(sql).pluck().get(id);
    const present = expected === 'present' ? 1 : 0;
    expect(count('SELECT COUNT(*) FROM external_search_folders WHERE id = ?', folderId)).toBe(present);
    expect(count('SELECT COUNT(*) FROM external_documents WHERE document_id = ?', documentId)).toBe(present);
    const states = db.prepare(`SELECT object_type, deleted_at FROM sync_object_state
      WHERE (object_type = 'external_folder' AND object_id = ?) OR (object_type = 'external_document' AND object_id = ?)
      ORDER BY object_type`).all(folderId, documentId);
    expect(states).toEqual(expected === 'present'
      ? [{ object_type: 'external_document', deleted_at: null }, { object_type: 'external_folder', deleted_at: null }]
      : []);
  } finally { db.close(); }
}
