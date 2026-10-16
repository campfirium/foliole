// @vitest-environment node
import { expect, it } from 'vitest';

import { textBranch, textDevice } from '../../../electron/database/topicTextState.testSupport.js';
import { migrateCompanionDatabase } from '../database/companionDatabaseMigrationExecutor.js';
import { initializeDatabaseSchema } from '../database/migrations.js';

import { flushRequestSyncInventoryDigests, readRequestSyncInventorySummaries } from './framedSyncInventoryDigest.js';
import { readFramedSyncInventory } from './framedSyncInventoryRead.js';
import { framedSyncInventorySummary } from './framedSyncInventorySummary.js';

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
    expect(host.sqlite.pragma('user_version', { simple: true })).toBe(platform === 'desktop' ? 157 : 86);
  } finally { host.sqlite.close(); }
});
