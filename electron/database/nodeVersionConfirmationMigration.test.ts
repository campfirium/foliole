// @vitest-environment node
import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { migrateCompanionDatabase } from '../../lib/core/database/companionDatabaseMigrationExecutor.js';
import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import { confirmOutboundNodeVersionPack } from '../../lib/core/sync/nodeVersionDeliveryProof.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import { createPeer, closeLibraries, edit, joinPeers, startLibraries, sync } from './syncEmptyLibraryTestSupport.js';

it.each(['desktop', 'companion'])('retires completed %s receipts while preserving pending transport and duplicate replies', async (host) => {
  await startLibraries();
  try {
    const a = createPeer('a');
    const b = createPeer('b');
    joinPeers(a, b);
    edit(a, 'preserved body');
    const pack = await sync(a, b);
    const receipt = b.db.prepare('SELECT * FROM node_version_inbound_receipts').get() as { results_json: string };
    const results = JSON.parse(receipt.results_json);
    a.db.prepare(`INSERT INTO node_version_pack_receipts VALUES
      (?, 'topic', 'group', ?, ?, 'applied', ?, ?, ?, 'now')`).run(pack.packId, b.id,
    results[0].sentVersionId, results[0].baseVersionId,
    b.db.prepare('SELECT library_epoch FROM node_version_local_proof_state').pluck().get(), 1);
    a.db.exec(`DELETE FROM node_version_confirmation_state;
      INSERT INTO node_version_inbound_receipts VALUES
        ('delivered', 'group', 'source', 'target', 'epoch', 2, '[]', 'now', 'now'),
        ('pending', 'group', 'source', 'target', 'epoch', 3, '[]', 'now', NULL);
      DROP TABLE node_version_confirmation_state;`);
    const original = a.db.serialize();
    const copy = new Database(original);
    try {
      if (host === 'desktop') {
        copy.pragma('user_version = 125');
        initializeDatabaseSchema(copy);
      } else {
        await createBetterSqliteDbPort(copy).transaction((tx) => migrateCompanionDatabase(tx, 60, 61));
      }
      expect(copy.prepare('SELECT pack_id FROM node_version_inbound_receipts').all()).toEqual([{ pack_id: 'pending' }]);
      expect(copy.prepare('SELECT COUNT(*) FROM node_version_pack_receipts').pluck().get()).toBe(0);
      const proof = b.db.prepare('SELECT library_epoch FROM node_version_local_proof_state').pluck().get() as string;
      await confirmOutboundNodeVersionPack(createBetterSqliteDbPort(copy), { groupId: 'group', deviceId: b.id,
        libraryEpoch: proof, proofRevision: 1, packId: pack.packId, results, confirmedAt: 'retry' });
      expect(copy.prepare('SELECT COUNT(*) FROM node_version_confirmation_state').pluck().get()).toBe(1);
      expect(copy.prepare('SELECT receipt_digest FROM node_version_confirmation_state').pluck().get()).toMatch(/^[a-f0-9]{64}$/);
      expect(copy.prepare('SELECT version_id, body_text FROM node_sync_versions').all())
        .toEqual(a.db.prepare('SELECT version_id, body_text FROM node_sync_versions').all());
    } finally { copy.close(); }
  } finally { await closeLibraries(); }
});
