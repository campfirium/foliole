// @vitest-environment node
import { promises as fs } from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { applySyncNodesWithDbPort } from '../../lib/core/sync/syncNodeApplyExecutor.js';
import { loadCurrentSyncNodeRecord } from '../../lib/core/sync/syncNodeGraph.js';
import { upsertTextBodyBlob } from '../../lib/core/sync/syncNodeTextBodyBlobs.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';

import { readFixtureInventory, reconnectFixturePeer } from './desktopFramedSyncPublicationRecovery.testSupport.js';
import { createDesktopFramedSyncTwoProcessFixture } from './desktopFramedSyncTwoProcess.testSupport.js';

it('discovers and fills a missing file when the Node identity, hash and resource reference are already equal', async () => {
  const fixture = await createDesktopFramedSyncTwoProcessFixture();
  const bytes = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(128, 1)]);
  const nodeId = 'same-reference-missing-image';
  try {
    const seeded = await fixture.left.seedResource({ bytes, nodeId });
    const sourceDb = new Database(fixture.leftSnapshot.databasePath, { readonly: true });
    const targetDb = new Database(fixture.rightSnapshot.databasePath);
    try {
      const record = await loadCurrentSyncNodeRecord(createBetterSqliteDbPort(sourceDb), nodeId);
      if (!record) throw new Error('source_record_missing');
      await createBetterSqliteDbPort(targetDb).transaction(async (tx) => {
        await upsertTextBodyBlob(tx, record.body_text!, record.updated_at, record.snapshot.body_blob_hash!);
        await applySyncNodesWithDbPort(tx, [record]);
      });
      expect(targetDb.prepare('SELECT resource_references FROM nodes WHERE id = ?').pluck().get(nodeId))
        .toEqual(sourceDb.prepare('SELECT resource_references FROM nodes WHERE id = ?').pluck().get(nodeId));
    } finally { sourceDb.close(); targetDb.close(); }
    const source = (await readFixtureInventory(fixture.left)).find((entry) => entry.objectType === 'node' && entry.globalId === nodeId)!;
    const missing = (await readFixtureInventory(fixture.right)).find((entry) => entry.objectType === 'node' && entry.globalId === nodeId)!;
    expect(source.sharedStateHash).toEqual(missing.sharedStateHash);
    expect(source.resourceHashes.map((hash) => Buffer.from(hash).toString('hex'))).toContain(seeded.hash);
    expect(missing.resourceHashes.map((hash) => Buffer.from(hash).toString('hex'))).not.toContain(seeded.hash);
    expect(await reconnectFixturePeer(fixture.left, fixture.rightSnapshot)).toMatchObject({ complete: true });
    const target = path.join(fixture.rightSnapshot.stateRoot, 'documents', 'Foliole', 'Assets', seeded.storageKey);
    expect(await fs.readFile(target)).toEqual(bytes);
    expect(await readFixtureInventory(fixture.right)).toEqual(await readFixtureInventory(fixture.left));
    expect(await reconnectFixturePeer(fixture.left, fixture.rightSnapshot)).toMatchObject({ complete: true });
  } finally {
    await Promise.allSettled([fixture.left.close(), fixture.right.close()]);
    await fs.rm(fixture.root, { force: true, recursive: true });
  }
}, 60_000);
