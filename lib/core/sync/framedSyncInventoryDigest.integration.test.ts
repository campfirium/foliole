// @vitest-environment node
import { expect, it } from 'vitest';

import { textBranch, textDevice } from '../../../electron/database/topicTextState.testSupport.js';
import { migrateCompanionDatabase } from '../database/companionDatabaseMigrationExecutor.js';
import { DATABASE_SCHEMA_VERSION, initializeDatabaseSchema } from '../database/migrations.js';

import type { DbPort } from './dbPort.js';
import { expandRequestSyncNodeSummaries, flushRequestSyncInventoryDigests, readRequestSyncInventorySummaries } from './framedSyncInventoryDigest.js';
import { readFramedSyncInventory } from './framedSyncInventoryRead.js';
import { framedSyncInventorySummary } from './framedSyncInventorySummary.js';
import { applyConvergentSyncNodesWithDbPort } from './syncNodeConvergence.js';

it('keeps narrow digests equal to full summaries after edits, invalidation and rebuilding', async () => {
  const host = textDevice();
  try {
    const first = await host.receive([textBranch('first', 'First body')]);
    await host.db.transaction(flushRequestSyncInventoryDigests);
    expect(await readRequestSyncInventorySummaries(host.db)).toEqual(framedSyncInventorySummary(await readFramedSyncInventory(host.db)));
    expect(host.sqlite.prepare('SELECT count(*) FROM framed_sync_node_digest').pluck().get()).toBe(1);
    await host.receive([textBranch('second', 'Second body', first)]);
    expect(host.sqlite.prepare('SELECT count(*) FROM framed_sync_node_digest').pluck().get()).toBe(0);
    // A writer may invalidate between the flush and opening the read snapshot.
    const accurate = framedSyncInventorySummary(await readFramedSyncInventory(host.db));
    expect(await readRequestSyncInventorySummaries(host.db)).toEqual(accurate);
    await host.db.transaction(flushRequestSyncInventoryDigests);
    expect(await readRequestSyncInventorySummaries(host.db)).toEqual(accurate);
    host.sqlite.exec('DELETE FROM framed_sync_node_digest');
    await host.db.transaction(flushRequestSyncInventoryDigests);
    expect(await readRequestSyncInventorySummaries(host.db)).toEqual(accurate);
  } finally { host.sqlite.close(); }
});

it.each(['desktop', 'companion'] as const)('upgrades the %s digest projection without changing stored facts', async platform => {
  const host = textDevice();
  try {
    await host.receive([textBranch('original', 'Preserved body')]);
    const before = await readFramedSyncInventory(host.db);
    const names = host.sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'trg_framed_digest_%'").pluck().all();
    for (const name of names) {
      if (typeof name !== 'string' || !/^trg_framed_digest_[a-z_]+$/u.test(name)) throw new Error('invalid_trigger');
      host.sqlite.exec(`DROP TRIGGER ${name}`);
    }
    host.sqlite.exec('DROP TABLE framed_sync_node_digest');
    if (platform === 'desktop') {
      host.sqlite.pragma('user_version = 156');
      initializeDatabaseSchema(host.sqlite);
    } else await host.db.transaction(db => migrateCompanionDatabase(db, 85, 86));
    expect(await readFramedSyncInventory(host.db)).toEqual(before);
    await host.db.transaction(flushRequestSyncInventoryDigests);
    expect(await readRequestSyncInventorySummaries(host.db)).toEqual(framedSyncInventorySummary(before));
    expect(host.sqlite.pragma('user_version', { simple: true })).toBe(platform === 'desktop' ? DATABASE_SCHEMA_VERSION : 86);
  } finally { host.sqlite.close(); }
});


it('rejects a corrupt digest within the same read snapshot', async () => {
  const host = textDevice();
  try {
    await host.receive([textBranch('version', 'Body')]);
    await host.db.transaction(flushRequestSyncInventoryDigests);
    host.sqlite.prepare('UPDATE framed_sync_node_digest SET shared_state_hash = ?').run('0'.repeat(64));
    await expect(host.db.transaction(async db => {
      const summaries = await readRequestSyncInventorySummaries(db);
      return expandRequestSyncNodeSummaries(db, summaries, ['topic']);
    })).rejects.toThrow('framed_sync_source_changed');
  } finally { host.sqlite.close(); }
});


it('expands 500 requested details with one query in the caller transaction', async () => {
  const host = textDevice();
  try {
    const records = Array.from({ length: 500 }, (_, index) => {
      const id = `node-${index}`;
      const record = textBranch(`version-${index}`, `Body ${index}`);
      return { ...record, object_id: id, snapshot: { ...record.snapshot, id } };
    });
    await applyConvergentSyncNodesWithDbPort(host.db, records);
    const full = await readFramedSyncInventory(host.db);
    const summaries = framedSyncInventorySummary(full);
    const ids = records.map(record => record.object_id);
    await host.db.transaction(async db => {
      let queries = 0;
      const counted = (port: DbPort): DbPort => ({
        run: (sql, params) => port.run(sql, params),
        query: (sql, params) => { queries += 1; return port.query(sql, params); },
        transaction: execute => port.transaction(tx => execute(counted(tx)))
      });
      const expanded = await expandRequestSyncNodeSummaries(counted(db), summaries, [...ids, ids[0]!]);
      expect(expanded).toEqual(full);
      expect(queries).toBe(1);
      queries = 0;
      expect(await expandRequestSyncNodeSummaries(counted(db), summaries, [])).toEqual(summaries);
      expect(queries).toBe(0);
    });
  } finally { host.sqlite.close(); }
});

it.each(['hash', 'unready', 'missing'] as const)('rejects %s detail changes in the caller snapshot', async change => {
  const host = textDevice();
  try {
    await host.receive([textBranch('version', 'Body')]);
    const summaries = framedSyncInventorySummary(await readFramedSyncInventory(host.db));
    if (change === 'hash') summaries[0] = { ...summaries[0]!, sharedStateHash: new Uint8Array(32) };
    if (change === 'unready') summaries[0] = { ...summaries[0]!, unready: !summaries[0]!.unready };
    if (change === 'missing') host.sqlite.exec('DELETE FROM framed_sync_inventory');
    await expect(host.db.transaction(db => expandRequestSyncNodeSummaries(db, summaries, ['topic'])))
      .rejects.toThrow('framed_sync_source_changed');
  } finally { host.sqlite.close(); }
});
