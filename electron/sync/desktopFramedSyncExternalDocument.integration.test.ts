// @vitest-environment node
import { promises as fs } from 'node:fs';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { computeSyncContentHash } from '../../lib/core/database/syncState.js';
import { hashTextBody } from '../../lib/core/database/textBodyHash.js';
import { compareFramedSyncDatabaseInventories } from '../../lib/core/sync/framedSyncDatabaseDifference.js';
import { applySyncObjectInTransaction } from '../../lib/core/sync/syncObjectApplyExecutor.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';

import { readFixtureInventory, reconnectFixturePeer } from './desktopFramedSyncPublicationRecovery.testSupport.js';
import { createDesktopFramedSyncTwoProcessFixture } from './desktopFramedSyncTwoProcess.testSupport.js';
import { requestProcessFaultProxy } from './requestSyncProcessRecovery.testSupport.js';

it.each([false, true])('fills missing external document bytes with original identity and hash, receiver restart=%s', async (recovery) => {
  const fixture = await createDesktopFramedSyncTwoProcessFixture(undefined, true, true);
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
          await applySyncObjectInTransaction(tx, { ...record, payload_json: JSON.stringify({ ...payload,
            ...(snapshot === fixture.leftSnapshot ? { content: body } : {}) }) });
        });
      } finally { db.close(); }
    }
    const source = (await readFixtureInventory(fixture.left)).find((entry) => entry.objectType === 'external_document')!;
    const missing = (await readFixtureInventory(fixture.right)).find((entry) => entry.objectType === 'external_document')!;
    expect(source.sharedStateHash).toEqual(missing.sharedStateHash);
    expect(source.resourceHashes).toHaveLength(1);
    expect(missing.resourceHashes).toEqual([]);
    let receiver = fixture.rightSnapshot;
    if (recovery) {
      const proxy = await requestProcessFaultProxy(receiver.origin, 'corrupt_body');
      try {
        await expect(fixture.left.synchronize(proxy.origin)).rejects.toThrow();
        expect(proxy.injected()).toBeGreaterThan(0);
      } finally { await proxy.close(); }
      const pending = new Database(receiver.databasePath, { readonly: true });
      try {
        expect(pending.prepare("SELECT name FROM sqlite_master WHERE name IN ('framed_sync_inbound_transfers', 'framed_sync_receipts')").all()).toEqual([]);
        expect(pending.prepare('SELECT COUNT(*) FROM content_blob_data WHERE hash = ?').pluck().get(hash)).toBe(0);
      } finally { pending.close(); }
      receiver = (await fixture.restartRight()).snapshot;
    }
    expect(await reconnectFixturePeer(fixture.left, receiver)).toMatchObject({ complete: true });
    const db = new Database(fixture.rightSnapshot.databasePath, { readonly: true });
    try {
      expect(db.prepare('SELECT content FROM external_documents WHERE body_blob_hash = ?').pluck().get(hash)).toBe(body);
      expect(db.prepare("SELECT object_id, content_hash FROM sync_object_state WHERE object_type = 'external_document'").get())
        .toEqual({ object_id: record.object_id, content_hash: record.content_hash });
      expect(db.prepare('SELECT body_blob_hash FROM external_documents WHERE document_id = ?').pluck().get(record.object_id)).toBe(hash);
    } finally { db.close(); }
    // History detail is not compared since sync history became per-device; current shared state must match.
    expect(compareFramedSyncDatabaseInventories({ local: await readFixtureInventory(fixture.left),
      remote: await readFixtureInventory(fixture.right) })).toEqual([]);
    expect(readCurrentNodes(receiver.databasePath)).toEqual(readCurrentNodes(fixture.leftSnapshot.databasePath));
  } finally {
    await Promise.allSettled([fixture.left.close(), fixture.right.close()]);
    await fs.rm(fixture.root, { force: true, recursive: true });
  }
}, 60_000);

function readCurrentNodes(databasePath: string) {
  const database = new Database(databasePath, { readonly: true });
  try {
    return database.prepare('SELECT id, current_version_id, content, parent_id, deleted_at FROM nodes ORDER BY id').all();
  } finally { database.close(); }
}
