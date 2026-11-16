// @vitest-environment node
import { afterEach, expect, it } from 'vitest';

import { computeSyncContentHash } from '../../lib/core/database/syncState.js';
import { compareFramedSyncInventories } from '../../lib/core/sync/framedSyncInventory.js';
import { readFramedSyncInventory } from '../../lib/core/sync/framedSyncInventoryRead.js';
import { receiveRequestSyncBatch } from '../../lib/core/sync/requestSyncBatchReceiver.js';
import { requestSyncBatchMessages, withRequestSyncBatchSnapshot } from '../../lib/core/sync/requestSyncBatchSnapshot.js';
import { runRequestSyncDatabaseRound } from '../../lib/core/sync/requestSyncDatabaseRound.js';
import { REQUEST_SYNC_WRITE_REJECTED } from '../../lib/core/sync/requestSyncObjectWriteIsolation.js';
import { prepareRequestSyncWire } from '../../lib/core/sync/requestSyncWire.js';
import { applySyncObjectInTransaction } from '../../lib/core/sync/syncObjectApplyExecutor.js';

import { activateBatchReceiver, batchFixture, batchId, batchRecord, context, groupKey, peerState, transferReceivedBatch } from './requestSyncBatch.testSupport.js';
import { firstAt, secondAt, score } from './reviewProjection.testSupport.js';

const fixtures: Awaited<ReturnType<typeof batchFixture>>[] = [];
afterEach(async () => { for (const fixture of fixtures.splice(0)) await fixture.close(); });

async function receiver() {
  const fixture = await batchFixture(); fixtures.push(fixture); activateBatchReceiver(fixture); return fixture;
}

async function publishReviewSettings(source: Awaited<ReturnType<typeof batchFixture>>) {
  const payload = { key: 'review_scheduler_settings', scope: 'user_space', platform: 'mac',
    form_factor: 'desktop', host_name: '*', value_json: '{"desiredRetention":0.99}' };
  await source.device.db.transaction(tx => applySyncObjectInTransaction(tx, {
    object_type: 'setting', object_id: 'user_space:mac:desktop:*:review_scheduler_settings',
    content_hash: computeSyncContentHash('setting', payload), payload_json: JSON.stringify(payload),
    updated_at: secondAt, deleted_at: null
  }));
}

it.each(['none', 'generic', 'object'] as const)('publishes committed review schedules and isolates projection failures (%s)', async fault => {
  const reject = fault !== 'none';
  const source = await batchFixture(); fixtures.push(source);
  const target = await receiver();
  const records = ['card-a', 'card-b'].map(id => {
    const record = batchRecord(id, id);
    record.snapshot.kind = 'item';
    return record;
  });
  await source.device.receive(records);
  for (const { object_id } of records) {
    score({ id: 'peer', sqlite: source.device.sqlite }, `${object_id}-first`, firstAt, 3, object_id);
    score({ id: 'peer', sqlite: source.device.sqlite }, `${object_id}-second`, secondAt, 4, object_id);
  }
  if (!reject) await publishReviewSettings(source);
  const differences = compareFramedSyncInventories({
    local: (await readFramedSyncInventory(source.device.db))
      .filter(entry => entry.objectType === 'node' || entry.globalId.endsWith(':review_scheduler_settings')), remote: []
  });
  const expected = differences.map((difference, index) => ({ globalId: difference.globalId, objectType: difference.objectType,
    requestId: new Uint8Array(16).fill(index + 1), resolve: async () => difference }));
  const rejected = fault === 'object' ? 'sync_node_apply_blocked:card-b' : 'injected_review_failure';
  const progress = observeReviewProjectionWrites(target, reject ? rejected : null);
  const schedules = () => target.device.sqlite.prepare('SELECT * FROM node_review ORDER BY node_id').all();
  const published: unknown[] = [];
  target.host.objectApplied = object => { if (object.objectType === 'node') published.push(schedules()); };
  const result = await withRequestSyncBatchSnapshot(source.host, expected, undefined, async objects => {
    const wire = await prepareRequestSyncWire({ context, groupKey,
      messages: contextId => requestSyncBatchMessages(objects, contextId, batchId) });
    return receiveRequestSyncBatch(target.host, { ...wire, context, groupKey, peerState,
      author: 'initiator', requestId: batchId, expected });
  });
  const acceptedIds = reject ? ['card-a'] : ['card-a', 'card-b'];
  expect(result.results.map(entry => entry.error)).toEqual(reject
    ? ['', fault === 'generic' ? `${REQUEST_SYNC_WRITE_REJECTED}${rejected}` : rejected] : ['', '', '']);
  expect(schedules()).toEqual(source.device.sqlite.prepare('SELECT * FROM node_review ORDER BY node_id').all()
    .filter(row => acceptedIds.includes((row as { node_id: string }).node_id)));
  expect(await target.device.db.query('SELECT node_id, COUNT(*) AS count FROM review_log GROUP BY node_id ORDER BY node_id'))
    .toEqual(acceptedIds.map(node_id => ({ node_id, count: 2 })));
  expect(published).toEqual(acceptedIds.map(() => schedules()));
  if (reject) expect([...progress].sort()).toEqual(['card-a', 'card-b']);
  if (!reject) expect(await target.device.db.query("SELECT value_json FROM setting_records WHERE key = 'review_scheduler_settings'"))
    .toEqual([{ value_json: '{"desiredRetention":0.99}' }]);
});

function observeReviewProjectionWrites(target: Awaited<ReturnType<typeof batchFixture>>, rejection: string | null) {
  const writes: string[] = [];
  target.device.sqlite.function('observe_received_card', (id: string) => { writes.push(id); return null; });
  target.device.sqlite.exec(`CREATE TRIGGER observe_received_card BEFORE INSERT ON nodes
    WHEN NEW.id IN ('card-a', 'card-b') BEGIN SELECT observe_received_card(NEW.id); END`);
  if (rejection) target.device.sqlite.exec(`CREATE TRIGGER reject_schedule BEFORE INSERT ON node_review
    WHEN NEW.node_id = 'card-b' BEGIN SELECT RAISE(ABORT, '${rejection}'); END`);
  return writes;
}

it.each(['missing', 'extra', 'duplicate', 'exact'] as const)('commits only the exact requested fact set: %s', async selection => {
  const fixture = await receiver();
  const result = transferReceivedBatch(fixture, [batchRecord('selected', 'Body')], { selection });
  if (selection === 'exact') await expect(result).resolves.toMatchObject({ results: [{ error: '' }] });
  else await expect(result).rejects.toThrow();
  expect(await fixture.device.db.query('SELECT id FROM nodes')).toEqual(selection === 'exact' ? [{ id: 'selected' }] : []);
  expect(await fixture.device.db.query('SELECT version_id FROM node_sync_versions'))
    .toEqual(selection === 'exact' ? [{ version_id: 'version-selected' }] : []);
});

it('rejects framed 25 before applying any business facts', async () => {
  const fixture = await receiver();
  await expect(transferReceivedBatch(fixture, [batchRecord('old', 'Body')], { legacy: true }))
    .rejects.toThrow('framed_sync_protocol_version_unsupported');
  expect(await fixture.device.db.query('SELECT id FROM nodes')).toEqual([]);
  expect(await fixture.device.db.query('SELECT version_id FROM node_sync_versions')).toEqual([]);
});

it('rolls back a bad graph object while committing the following valid object and its version', async () => {
  const fixture = await receiver();
  // A reclaimed parent is a valid gap; a version that is its own ancestor is not.
  const cyclic = { ...batchRecord('bad', 'bad'), parent_version_id: 'version-bad', parent_version_ids: ['version-bad'] };
  const result = await transferReceivedBatch(fixture, [cyclic, batchRecord('good', 'good')]);
  expect(result.results).toMatchObject([{ globalId: 'bad', error: 'node_version_graph_cycle' },
    { globalId: 'good', error: '' }]);
  expect(await fixture.device.db.query('SELECT id FROM nodes')).toEqual([{ id: 'good' }]);
  expect(await fixture.device.db.query('SELECT object_id, version_id FROM node_sync_versions'))
    .toEqual([{ object_id: 'good', version_id: 'version-good' }]);
  expect(await fixture.device.db.query('SELECT version_id FROM node_sync_versions'))
    .toEqual([{ version_id: 'version-good' }]);
});

it('defers cyclic structural parents and keeps the independent content', async () => {
  const fixture = await receiver();
  const a = batchRecord('a', 'A');
  const b = batchRecord('b', 'B');
  a.snapshot.parent_id = 'b';
  b.snapshot.parent_id = 'a';
  const result = await transferReceivedBatch(fixture, [a, b, batchRecord('good', 'Good')]);
  expect(result.results.map(value => value.error)).toEqual(['framed_sync_node_parent_cycle', 'framed_sync_node_parent_cycle', '']);
  expect(await fixture.device.db.query('SELECT id FROM nodes')).toEqual([{ id: 'good' }]);
});

it('leaves a cross-object version edge unapplied and keeps its legitimate owner', async () => {
  const fixture = await receiver();
  const wrong = { ...batchRecord('wrong', 'Wrong'), parent_version_id: 'version-good', parent_version_ids: ['version-good'] };
  const result = await transferReceivedBatch(fixture, [wrong, batchRecord('good', 'Good')]);
  expect(result.results.map(value => value.error)).toEqual(['node_version_cross_object_parent:version-good', '']);
  expect(await fixture.device.db.query('SELECT object_id FROM node_sync_versions')).toEqual([{ object_id: 'good' }]);
});

it('keeps earlier object commits when a later object transaction fails', async () => {
  const fixture = await receiver();
  fixture.device.sqlite.exec(`CREATE TRIGGER reject_bad_version BEFORE INSERT ON node_sync_versions
    WHEN NEW.version_id = 'version-bad' BEGIN SELECT RAISE(ABORT, 'injected_version_failure'); END`);
  const result = await transferReceivedBatch(fixture, [batchRecord('good', 'good'), batchRecord('bad', 'bad'), batchRecord('last', 'last')]);
  expect(result.results.map(result => result.error)).toEqual(['', `${REQUEST_SYNC_WRITE_REJECTED}injected_version_failure`, '']);
  expect(await fixture.device.db.query('SELECT id FROM nodes ORDER BY id')).toEqual([{ id: 'good' }, { id: 'last' }]);
  expect(await fixture.device.db.query('SELECT version_id FROM node_sync_versions ORDER BY version_id'))
    .toEqual([{ version_id: 'version-good' }, { version_id: 'version-last' }]);
});

it('keeps two siblings and their original versions when their parent already exists', async () => {
  const fixture = await receiver();
  const parent = batchRecord('parent', 'Parent original');
  expect((await transferReceivedBatch(fixture, [parent])).results.map(result => result.error)).toEqual(['']);
  const children = ['child-a', 'child-b'].map(id => {
    const record = batchRecord(id, `Original ${id}`);
    record.snapshot.parent_id = 'parent';
    return record;
  });
  expect((await transferReceivedBatch(fixture, children)).results.map(result => result.error)).toEqual(['', '']);
  const saved = await fixture.device.db.query('SELECT * FROM node_sync_versions ORDER BY version_id');
  await transferReceivedBatch(fixture, children);
  expect(await fixture.device.db.query('SELECT * FROM node_sync_versions ORDER BY version_id')).toEqual(saved);
  expect(await fixture.device.db.query('SELECT id, parent_id, content FROM nodes ORDER BY id')).toEqual([
    { id: 'child-a', parent_id: 'parent', content: 'Original child-a' },
    { id: 'child-b', parent_id: 'parent', content: 'Original child-b' },
    { id: 'parent', parent_id: null, content: 'Parent original' }
  ]);
  expect(saved.map(row => row.version_id)).toEqual(['version-child-a', 'version-child-b', 'version-parent']);
});

it.each([
  { options: { truncate: true }, error: 'request_sync_batch_end_missing' },
  { options: { wrongId: true }, error: 'request_sync_batch_end_invalid' },
  { options: { duplicate: true }, error: 'request_sync_batch_identity_duplicate' }
])('rejects $error even after a complete object, preserving that object commit', async ({ options, error }) => {
  const fixture = await receiver();
  await expect(transferReceivedBatch(fixture, [batchRecord('good', 'good')], options)).rejects.toThrow(error);
  expect(await fixture.device.db.query('SELECT id FROM nodes')).toEqual([{ id: 'good' }]);
});

it.each(['wrongObjectId', 'wrongGlobalId'] as const)('rejects mismatched %s before applying any facts', async fault => {
  const fixture = await receiver();
  await expect(transferReceivedBatch(fixture, [batchRecord('good', 'good')], { [fault]: true }))
    .rejects.toThrow('request_sync_batch_identity_mismatch');
  expect(await fixture.device.db.query('SELECT id FROM nodes')).toEqual([]);
});


it('applies a child whose structural parent arrives in the same real SQLite round', async () => {
  const fixture = await receiver();
  const source = await batchFixture(); fixtures.push(source);
  const child = batchRecord('a-child', 'Child完整正文');
  child.snapshot.parent_id = 'z-parent';
  const records = [child, batchRecord('m-neighbor', 'Independent😀'), batchRecord('z-parent', 'Parent正文')];
  await source.device.receive([records[2]!, records[1]!, records[0]!]);
  const attempts: string[][] = [];
  const result = await runRequestSyncDatabaseRound({
    exchangeInventory: async () => ({ local: (await readFramedSyncInventory(source.device.db)).filter(entry => entry.objectType === 'node'),
      remote: (await readFramedSyncInventory(fixture.device.db)).filter(entry => entry.objectType === 'node') }),
    transferObjects: async differences => {
      attempts.push(differences.map(difference => difference.globalId));
      const selected = differences.map(difference => {
        const record = records.find(record => record.object_id === difference.globalId);
        if (!record) throw new Error('test_record_missing');
        return record;
      });
      return (await transferReceivedBatch(fixture, selected)).results;
    },
    reportObjectError: (_difference, error) => { throw error; }
  });
  expect(result).toMatchObject({ complete: true, pending: 0 });
  // Parent and child in one received batch apply together, so the child needs no separate retry.
  expect(attempts).toEqual([['a-child', 'm-neighbor', 'z-parent']]);
  expect(await fixture.device.db.query('SELECT id, parent_id, content FROM nodes ORDER BY id')).toEqual([
    { id: 'a-child', parent_id: 'z-parent', content: 'Child完整正文' },
    { id: 'm-neighbor', parent_id: null, content: 'Independent😀' },
    { id: 'z-parent', parent_id: null, content: 'Parent正文' }
  ]);
  expect(await fixture.device.db.query('SELECT object_id, version_id FROM node_sync_versions ORDER BY object_id'))
    .toEqual(records.map(record => ({ object_id: record.object_id, version_id: record.version_id })));
});

it('preserves the first full object when the second body is truncated and converges on retry', async () => {
  const fixture = await receiver();
  const secondBody = 'Second完整正文'.repeat(40_000);
  const records = [batchRecord('first', 'First😀原文'), batchRecord('second', secondBody)];
  const originals = () => ['nodes', 'node_sync_versions', 'node_sync_version_parents'].map(table => fixture.device.sqlite.prepare(`SELECT * FROM ${table} ORDER BY 1`).all());
  let first: ReturnType<typeof originals> | undefined;
  fixture.host.objectApplied = object => { if (object.globalId === 'first') first = originals(); };
  await expect(transferReceivedBatch(fixture, records, { truncateSecond: true })).rejects.toThrow('request_sync_object_incomplete');
  expect(first).toBeDefined();
  expect(originals()).toEqual(first);
  delete fixture.host.objectApplied;
  expect((await transferReceivedBatch(fixture, records)).results.map(result => result.error)).toEqual(['', '']);
  const complete = await originals();
  await transferReceivedBatch(fixture, records);
  expect(await originals()).toEqual(complete);
  expect(await fixture.device.db.query('SELECT id, content FROM nodes ORDER BY id')).toEqual([
    { id: 'first', content: 'First😀原文' }, { id: 'second', content: secondBody }
  ]);
  expect(await fixture.device.db.query('SELECT version_id FROM node_sync_versions ORDER BY version_id'))
    .toEqual([{ version_id: 'version-first' }, { version_id: 'version-second' }]);
});
