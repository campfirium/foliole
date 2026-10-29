// @vitest-environment node
import { afterEach, expect, it } from 'vitest';

import { createBetterSqliteDbPort } from '../../../electron/database/betterSqliteDbPort.js';
import { restoreEmptyLegacyDailyFlowSchema } from '../../../electron/database/historicalMigration.test-support.js';
import { textBranch, textDevice } from '../../../electron/database/topicTextState.testSupport.js';
import { applyConvergentSyncNodesWithDbPort } from '../sync/syncNodeConvergence.js';
import { loadRetainedSyncNodeVersionFact } from '../sync/syncNodeGraph.js';

import { DATABASE_SCHEMA_VERSION } from './databaseSchemaVersion.js';
import { initializeDatabaseSchema } from './migrations.js';
import { migrateCompanionTopicHistoryRetirement } from './topicHistoryRetirementMigration.js';

const devices: ReturnType<typeof textDevice>[] = [];
afterEach(() => devices.splice(0).forEach(device => device.sqlite.close()));
async function legacy() {
  const host = textDevice();
  restoreEmptyLegacyDailyFlowSchema(host.sqlite);
  devices.push(host);
  const base = textBranch('base', 'Original');
  const middle = textBranch('middle', 'Intermediate', base);
  const head = textBranch('head', 'Current', middle);
  await applyConvergentSyncNodesWithDbPort(host.db, [base, middle, head], { collectVersionPayloads: false });
  host.sqlite.exec(`UPDATE node_sync_versions SET body_text = NULL,
    snapshot_json = json_remove(json_set(snapshot_json, '$.content', NULL), '$.body_blob_hash')
    WHERE version_id = 'base'; PRAGMA user_version = 153`);
  return host;
}
function facts(host: Awaited<ReturnType<typeof legacy>>) {
  return host.sqlite.prepare('SELECT version_id, object_id, content_hash, parent_version_id FROM node_sync_versions ORDER BY version_id').all();
}
function payloads(host: Awaited<ReturnType<typeof legacy>>) {
  return host.sqlite.prepare(`SELECT version_id, body_text,
    json_extract(snapshot_json, '$.body_deleted') AS retired FROM node_sync_versions ORDER BY version_id`).all();
}

it('upgrades empty and complete old history atomically without altering identities or parents', async () => {
  const host = await legacy();
  const before = facts(host);
  const edges = host.sqlite.prepare('SELECT * FROM node_sync_version_parents ORDER BY version_id').all();
  initializeDatabaseSchema(host.sqlite);
  expect(payloads(host)).toEqual([{ version_id: 'base', body_text: null, retired: 1 },
    { version_id: 'head', body_text: 'Current', retired: null },
    { version_id: 'middle', body_text: null, retired: 1 }]);
  expect(facts(host)).toEqual(before);
  expect(host.sqlite.prepare('SELECT * FROM node_sync_version_parents ORDER BY version_id').all()).toEqual(edges);
  initializeDatabaseSchema(host.sqlite);
  expect(facts(host)).toEqual(before);
  expect(host.sqlite.pragma('user_version', { simple: true })).toBe(DATABASE_SCHEMA_VERSION);
});

it('rolls back migration payloads, inventory and schema version when the owner fails', async () => {
  const host = await legacy();
  const before = payloads(host);
  const inventory = host.sqlite.prepare('SELECT * FROM framed_sync_inventory').all();
  expect(() => initializeDatabaseSchema(host.sqlite, { beforeVersionCommit: () => { throw new Error('interrupted'); } }))
    .toThrow('interrupted');
  expect(payloads(host)).toEqual(before);
  expect(host.sqlite.prepare('SELECT * FROM framed_sync_inventory').all()).toEqual(inventory);
  expect(host.sqlite.pragma('user_version', { simple: true })).toBe(153);
  initializeDatabaseSchema(host.sqlite);
  expect((await loadRetainedSyncNodeVersionFact(host.db, 'base'))!.snapshot.body_deleted).toBe(true);
});

it('preserves persistent dirty current input and its version baseline during upgrade', async () => {
  const host = await legacy();
  host.sqlite.prepare("UPDATE nodes SET content = 'Unsaved persistent input', sync_dirty = 1 WHERE id = 'topic'").run();
  initializeDatabaseSchema(host.sqlite);
  expect(host.sqlite.prepare("SELECT content, sync_dirty, current_version_id FROM nodes WHERE id = 'topic'").get())
    .toEqual({ content: 'Unsaved persistent input', sync_dirty: 1, current_version_id: 'head' });
  expect((await loadRetainedSyncNodeVersionFact(host.db, 'head'))!.body_text).toBe('Current');
  expect((await loadRetainedSyncNodeVersionFact(host.db, 'base'))!.snapshot.body_deleted).toBe(true);
});

it.each(['folder', 'item'])('does not apply topic retirement to %s during upgrade', async kind => {
  const host = await legacy();
  host.sqlite.prepare('UPDATE nodes SET kind = ?').run(kind);
  const before = payloads(host);
  initializeDatabaseSchema(host.sqlite);
  expect(payloads(host)).toEqual(before);
});

it('uses the same reclamation rule through the companion migration adapter', async () => {
  const host = await legacy();
  const port = createBetterSqliteDbPort(host.sqlite);
  await port.transaction(tx => migrateCompanionTopicHistoryRetirement(tx));
  expect((await loadRetainedSyncNodeVersionFact(port, 'base'))!.snapshot.body_deleted).toBe(true);
  expect((await loadRetainedSyncNodeVersionFact(port, 'middle'))!.body_text).toBeNull();
  expect((await loadRetainedSyncNodeVersionFact(port, 'head'))!.body_text).toBe('Current');
});
