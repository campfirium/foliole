// @vitest-environment node
import { promises as fs } from 'node:fs';

import Database from 'better-sqlite3';
import { expect, it, vi } from 'vitest';
import { z } from 'zod';

import { computeSyncContentHash } from '../../lib/core/database/syncState.js';
import { hashTextBody } from '../../lib/core/database/textBodyHash.js';
import { upsertTextBodyBlob } from '../../lib/core/sync/syncNodeTextBodyBlobs.js';
import { applySyncObjectInTransaction } from '../../lib/core/sync/syncObjectApplyExecutor.js';
import { createBetterSqlite3Driver } from '../database/betterSqlite3Driver.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';
import { removeExternalSearchFolder } from '../database/externalSearchFolderRemoval.js';

import { readFixtureInventory, reconnectFixturePeer } from './desktopFramedSyncPublicationRecovery.testSupport.js';
import { createDesktopFramedSyncTwoProcessFixture } from './desktopFramedSyncTwoProcess.testSupport.js';

let removalDb: Database.Database;
vi.mock('../database/connection.js', () => ({ openDatabaseConnection: () => ({
  sqlite: removalDb, driver: createBetterSqlite3Driver(removalDb)
}) }));

const documentId = 'removed-folder:original.md';
const body = 'Original external document retained independently of folder configuration';
const bodyHash = hashTextBody(body);

it('synchronizes folder deletion over production HTTP and preserves it after both peers reopen', async () => {
  const fixture = await createDesktopFramedSyncTwoProcessFixture();
  let target = fixture.rightSnapshot;
  try {
    await seedFolder(fixture.leftSnapshot.databasePath);
    await fixture.left.seed({ nodeId: 'independent-topic', title: 'Imported topic', content: 'Independent content' });
    expect(await reconnectFixturePeer(fixture.left, fixture.rightSnapshot)).toMatchObject({ complete: true });
    assertDocument(fixture.rightSnapshot.databasePath, true);
    removalDb = new Database(fixture.leftSnapshot.databasePath);
    try { removeExternalSearchFolder('removed-folder'); } finally { removalDb.close(); }
    await reconnectFixturePeer(fixture.left, fixture.rightSnapshot);
    expect(await reconnectFixturePeer(fixture.left, fixture.rightSnapshot)).toMatchObject({ complete: true });
    for (const snapshot of [fixture.leftSnapshot, fixture.rightSnapshot]) assertDocument(snapshot.databasePath, false);
    await fixture.restartLeft();
    target = (await fixture.restartRight()).snapshot;
    expect(await reconnectFixturePeer(fixture.left, target)).toMatchObject({ complete: true });
    expect(await readFixtureInventory(fixture.left)).toEqual(await readFixtureInventory(fixture.right));
    for (const snapshot of [fixture.leftSnapshot, fixture.rightSnapshot]) {
      assertDocument(snapshot.databasePath, false);
      const db = new Database(snapshot.databasePath, { readonly: true });
      try { expect(db.prepare("SELECT title FROM nodes WHERE id = 'independent-topic'").pluck().get()).toBe('Imported topic'); }
      finally { db.close(); }
    }
    await fixture.left.seed({ nodeId: 'later-topic', title: 'Later topic', content: 'Normal sync after removal' });
    await reconnectFixturePeer(fixture.left, target);
    expect(await reconnectFixturePeer(fixture.left, target)).toMatchObject({ complete: true });
    const db = new Database(fixture.rightSnapshot.databasePath, { readonly: true });
    try { expect(db.prepare("SELECT title FROM nodes WHERE id = 'later-topic'").pluck().get()).toBe('Later topic'); }
    finally { db.close(); }
  } finally {
    await Promise.allSettled([fixture.left.close(), fixture.right.close()]);
    await fs.rm(fixture.root, { force: true, recursive: true });
  }
}, 60_000);

async function seedFolder(databasePath: string) {
  const db = new Database(databasePath);
  try {
    const hostName = z.string().parse(JSON.parse(z.string().parse(
      db.prepare("SELECT value FROM settings WHERE key = 'host_name'").pluck().get()
    )));
    const port = createBetterSqliteDbPort(db);
    const folder = { id: 'removed-folder', source_ref: 'external:removed-folder', host_name: hostName,
      host_platform: 'darwin', attachment_mode: 'document_relative', excluded_dirs_json: '[]' };
    const document = { body_blob_hash: bodyHash, content_hash: bodyHash, document_id: documentId,
      extension: 'md', file_name: 'original.md', folder_id: folder.id, reference_json: null,
      reference_kind: 'local_path', relative_path: 'original.md', title: 'Original' };
    await port.transaction(async (tx) => {
      await upsertTextBodyBlob(tx, body, '2026-07-01T00:00:00.000Z', bodyHash);
      for (const [type, id, payload] of [
        ['external_folder', folder.id, folder], ['external_document', documentId, document]
      ] as const) await applySyncObjectInTransaction(tx, { object_type: type, object_id: id,
        content_hash: computeSyncContentHash(type, payload), deleted_at: null,
        payload_json: JSON.stringify(payload), updated_at: '2026-07-01T00:00:00.000Z' });
    });
  } finally { db.close(); }
}

function assertDocument(databasePath: string, present: boolean) {
  const db = new Database(databasePath, { readonly: true });
  try {
    expect(db.prepare('SELECT COUNT(*) FROM external_documents WHERE document_id = ?').pluck().get(documentId))
      .toBe(present ? 1 : 0);
    const deleted = db.prepare(`SELECT deleted_at FROM sync_object_state
      WHERE object_type = 'external_document' AND object_id = ?`).pluck().get(documentId);
    if (present) expect(deleted).toBeNull();
    else expect(deleted).toEqual(expect.any(String));
  } finally { db.close(); }
}
