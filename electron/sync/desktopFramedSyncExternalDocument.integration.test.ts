// @vitest-environment node
import { promises as fs } from 'node:fs';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { computeSyncContentHash } from '../../lib/core/database/syncState.js';
import { hashTextBody } from '../../lib/core/database/textBodyHash.js';
import { upsertTextBodyBlob } from '../../lib/core/sync/syncNodeTextBodyBlobs.js';
import { applySyncObjectInTransaction } from '../../lib/core/sync/syncObjectApplyExecutor.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';

import { readFixtureInventory, reconnectFixturePeer } from './desktopFramedSyncPublicationRecovery.testSupport.js';
import { createDesktopFramedSyncTwoProcessFixture } from './desktopFramedSyncTwoProcess.testSupport.js';

it('fills missing external document bytes through a normal round with unchanged original identity and hash', async () => {
  const fixture = await createDesktopFramedSyncTwoProcessFixture();
  const body = 'External original article with nonempty bytes';
  const hash = hashTextBody(body);
  const payload = { body_blob_hash: hash, content_hash: hash, document_id: 'external-original',
    extension: 'md', file_name: 'original.md', folder_id: 'original-folder', reference_json: null,
    reference_kind: 'local_path', relative_path: 'original.md', title: 'Original external document' };
  const record = { object_type: 'external_document' as const, object_id: payload.document_id,
    content_hash: computeSyncContentHash('external_document', payload), deleted_at: null,
    payload_json: JSON.stringify(payload), updated_at: '2026-10-06T00:00:00.000Z' };
  try {
    for (const snapshot of [fixture.leftSnapshot, fixture.rightSnapshot]) {
      const db = new Database(snapshot.databasePath);
      try {
        const port = createBetterSqliteDbPort(db);
        await port.transaction(async (tx) => {
          if (snapshot === fixture.leftSnapshot) await upsertTextBodyBlob(tx, body, record.updated_at, hash);
          await applySyncObjectInTransaction(tx, record);
        });
      } finally { db.close(); }
    }
    const source = (await readFixtureInventory(fixture.left)).find((entry) => entry.objectType === 'external_document')!;
    const missing = (await readFixtureInventory(fixture.right)).find((entry) => entry.objectType === 'external_document')!;
    expect(source.sharedStateHash).toEqual(missing.sharedStateHash);
    expect(source.resourceHashes).toHaveLength(1);
    expect(missing.resourceHashes).toEqual([]);
    expect(await reconnectFixturePeer(fixture.left, fixture.rightSnapshot)).toMatchObject({ complete: true });
    const db = new Database(fixture.rightSnapshot.databasePath, { readonly: true });
    try {
      expect(db.prepare('SELECT CAST(data AS TEXT) FROM content_blob_data WHERE hash = ?').pluck().get(hash)).toBe(body);
      expect(db.prepare("SELECT object_id, content_hash FROM sync_object_state WHERE object_type = 'external_document'").get())
        .toEqual({ object_id: record.object_id, content_hash: record.content_hash });
      expect(db.prepare('SELECT body_blob_hash FROM external_documents WHERE document_id = ?').pluck().get(record.object_id)).toBe(hash);
    } finally { db.close(); }
    expect(await readFixtureInventory(fixture.right)).toEqual(await readFixtureInventory(fixture.left));
  } finally {
    await Promise.allSettled([fixture.left.close(), fixture.right.close()]);
    await fs.rm(fixture.root, { force: true, recursive: true });
  }
}, 60_000);
