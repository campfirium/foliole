// @vitest-environment node
import { afterEach, expect, it } from 'vitest';

import { NEXT_SYNC_STATE_SEQ_SQL } from '../../../../../../lib/core/database/syncStateSequenceSchemaStatements.js';
import type { DbPort } from '../../../../../../lib/core/sync/dbPort.js';
import { beginSyncGroupLocalAdoption, loadSyncGroupLocalAdoption } from '../../../../../../lib/core/sync/syncGroupLocalAdoption.js';
import { createCompanionRequestFixture, native } from '../../../../../test/companionRequestSync.testSupport.js';

let host: Awaited<ReturnType<typeof createCompanionRequestFixture>> | undefined;
afterEach(async () => { await host?.close(); host = undefined; });

const learningPrunes = [
  /^DELETE FROM node_(reading_host_state|reading|review)\s+WHERE node_id NOT IN \(SELECT id FROM nodes\)/u,
  /^DELETE FROM sync_object_state\s+WHERE object_type = 'node_reading' AND object_id IN \(WITH RECURSIVE visible_nodes/u,
  /^DELETE FROM sync_object_state INDEXED BY idx_sync_object_state_type_seq\s+WHERE object_type IN \('node_reading', 'node_review'\)/u
];

async function adopt() {
  host = await createCompanionRequestFixture();
  const { fixture } = host;
  await fixture.right.invoke('seed_complete_inventory', { count: 60, bodyBytes: 400 });
  await beginSyncGroupLocalAdoption(host.db, { endpointUrl: fixture.rightSnapshot.origin,
    groupId: 't326-group', libraryEpoch: `${fixture.leftSnapshot.deviceId}-epoch`,
    providerDeviceId: fixture.rightSnapshot.deviceId, providerDeviceName: 'Provider', providerPlatform: 'darwin' });
  return host;
}

function observePruning(port: DbPort, changes: number[]): DbPort {
  return {
    query: port.query.bind(port),
    async run(sql, params) {
      const result = await port.run(sql, params);
      if (learningPrunes.some(pattern => pattern.test(sql))) {
        changes.push(result.changes);
      }
      return result;
    },
    transaction: execute => port.transaction(tx => execute(observePruning(tx, changes)))
  };
}

async function syncWithPruneEvidence(receiver: NonNullable<typeof host>) {
  const changes: number[] = [];
  const original = native.db!;
  native.db = observePruning(original, changes);
  try { await receiver.sync(); }
  finally { native.db = original; }
  return changes;
}

async function seedNewNodes(receiver: NonNullable<typeof host>) {
  for (const nodeId of ['new-topic-a', 'new-topic-b']) {
    await receiver.fixture.right.seed({ nodeId, title: nodeId, content: 'Body' });
  }
}

it('receives new nodes without scanning for orphans in empty learning tables', async () => {
  const receiver = await adopt();
  expect(await syncWithPruneEvidence(receiver)).toEqual([]);
  expect(await loadSyncGroupLocalAdoption(receiver.db)).toBeNull();
  expect(receiver.sqlite.prepare("SELECT count(*) FROM nodes WHERE id LIKE 't326-complete-%'").pluck().get()).toBe(60);
  await seedNewNodes(receiver);
  expect(await syncWithPruneEvidence(receiver)).toEqual([]);
  await receiver.restart();
  expect(receiver.sqlite.prepare("SELECT id FROM nodes WHERE id LIKE 'new-topic-%' ORDER BY id").pluck().all())
    .toEqual(['new-topic-a', 'new-topic-b']);
});

it('repairs an existing orphaned reading position during ordinary node reception', async () => {
  const receiver = await adopt();
  await receiver.sync();
  expect(await loadSyncGroupLocalAdoption(receiver.db)).toBeNull();
  await seedNewNodes(receiver);
  receiver.sqlite.pragma('foreign_keys = OFF');
  receiver.sqlite.exec(`INSERT INTO node_reading_host_state (node_id, host_name, updated_at)
    VALUES ('legacy-absent', 'Mobile', '2026-10-07T00:00:00.000Z')`);
  receiver.sqlite.pragma('foreign_keys = ON');
  expect(await syncWithPruneEvidence(receiver)).toContain(1);
  await receiver.restart();
  expect(receiver.sqlite.prepare("SELECT node_id FROM node_reading_host_state WHERE node_id = 'legacy-absent'").get()).toBeUndefined();
});

it('repairs an orphaned sync fact without learning rows and preserves its neighboring deletion fact', async () => {
  const receiver = await adopt();
  await receiver.sync();
  await seedNewNodes(receiver);
  const insertFact = receiver.sqlite.prepare(`INSERT INTO sync_object_state
    (object_type, object_id, state_seq, content_hash, last_modified_by_host_name, updated_at, sync_dirty, deleted_at)
    VALUES ('node_reading', ?, ${NEXT_SYNC_STATE_SEQ_SQL}, lower(hex(zeroblob(32))), 'Mobile',
      '2026-10-07T00:00:00.000Z', 0, ?)`);
  insertFact.run('legacy-absent', null);
  insertFact.run('legacy-deleted', '2026-10-07T00:00:00.000Z');

  expect(await syncWithPruneEvidence(receiver)).toContain(1);
  await receiver.restart();
  expect(receiver.sqlite.prepare("SELECT object_id FROM sync_object_state WHERE object_id = 'legacy-absent'").get()).toBeUndefined();
  expect(receiver.sqlite.prepare("SELECT deleted_at FROM sync_object_state WHERE object_id = 'legacy-deleted'").pluck().get())
    .toBe('2026-10-07T00:00:00.000Z');
});
