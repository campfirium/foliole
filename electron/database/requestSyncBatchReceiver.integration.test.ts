// @vitest-environment node
import { afterEach, expect, it } from 'vitest';

import { readFramedSyncInventory } from '../../lib/core/sync/framedSyncInventoryRead.js';
import { projectFramedSyncNodeRecord } from '../../lib/core/sync/framedSyncNodeProjection.js';
import { requestSyncBatchEnd } from '../../lib/core/sync/requestSyncBatchContract.js';
import { receiveRequestSyncBatch } from '../../lib/core/sync/requestSyncBatchReceiver.js';
import { runRequestSyncDatabaseRound } from '../../lib/core/sync/requestSyncDatabaseRound.js';
import { RequestSyncFiles } from '../../lib/core/sync/requestSyncFiles.js';
import { requestSyncObjectMessages, type RequestSyncMessage } from '../../lib/core/sync/requestSyncObjectMessages.js';
import { prepareRequestSyncWire } from '../../lib/core/sync/requestSyncWire.js';
import type { NativeSyncNodeRecord } from '../../lib/platform/nativeSyncContract.js';

import { activateBatchReceiver, batchFixture, batchId, batchRecord, context, groupKey, peerState } from './requestSyncBatch.testSupport.js';

const fixtures: Awaited<ReturnType<typeof batchFixture>>[] = [];
afterEach(async () => { for (const fixture of fixtures.splice(0)) await fixture.close(); });

async function receiver() {
  const fixture = await batchFixture(); fixtures.push(fixture); activateBatchReceiver(fixture); return fixture;
}

async function transfer(fixture: Awaited<ReturnType<typeof batchFixture>>, records: NativeSyncNodeRecord[],
  options: { truncate?: boolean; wrongId?: boolean; wrongObjectId?: boolean; wrongGlobalId?: boolean; truncateSecond?: boolean; duplicate?: boolean } = {}) {
  const files = records.map(() => new RequestSyncFiles(fixture.host.files, `requests/${crypto.randomUUID()}`));
  const identities = records.map((record, i) => ({ requestId: new Uint8Array(16).fill(i + 1), objectType: 'node', globalId: record.object_id }));
  try {
    const headers = await Promise.all(records.map(async (record, i) => {
      const projection = projectFramedSyncNodeRecord(record);
      const file = files[i]!;
      const fact = projection.manifest.facts[0]!;
      for (const blob of fact.blobs) await file.writeBody(blob, projection.bodyBlob);
      await file.writeFact(fact);
      return { ...identities[i]!, sourceStateHash: fact.sharedStateHash };
    }));
    const wire = await prepareRequestSyncWire({ context, groupKey, messages: async function* (contextId): AsyncGenerator<RequestSyncMessage> {
      for (const [i, header] of headers.entries()) {
        for await (const message of requestSyncObjectMessages(header, contextId, files[i]!)) {
          yield message;
          if (options.truncateSecond && i === 1 && message.payloadCase === 'blob_chunk') return;
        }
        if (options.duplicate) yield* requestSyncObjectMessages(header, contextId, files[i]!);
      }
      if (!options.truncate) yield requestSyncBatchEnd(batchId, records.length);
    } });
    return await receiveRequestSyncBatch(fixture.host, { ...wire, context, groupKey, peerState,
      author: 'initiator', requestId: options.wrongId ? new Uint8Array(16).fill(99) : batchId,
      expected: options.wrongObjectId ? identities.map(identity => ({ ...identity, requestId: new Uint8Array(16).fill(99) })) : options.wrongGlobalId ? identities.map(identity => ({ ...identity, globalId: 'another-object' })) : identities });
  } finally { await Promise.all(files.map(file => file.close())); }
}

it('rolls back a bad graph object while committing the following valid object and its member position', async () => {
  const fixture = await receiver();
  const missing = batchRecord('parent', 'missing');
  const result = await transfer(fixture, [batchRecord('bad', 'bad', missing), batchRecord('good', 'good')]);
  expect(result.results).toMatchObject([{ globalId: 'bad', error: 'node_version_missing_parents:version-parent' },
    { globalId: 'good', error: '' }]);
  expect(await fixture.device.db.query('SELECT id FROM nodes')).toEqual([{ id: 'good' }]);
  expect(await fixture.device.db.query('SELECT object_id, version_id FROM node_sync_versions'))
    .toEqual([{ object_id: 'good', version_id: 'version-good' }]);
  expect(await fixture.device.db.query('SELECT adopted_version_id FROM node_version_member_positions'))
    .toEqual([{ adopted_version_id: 'version-good' }]);
});

it('keeps earlier object commits when a later object transaction fails', async () => {
  const fixture = await receiver();
  fixture.device.sqlite.exec(`CREATE TRIGGER reject_bad_position BEFORE INSERT ON node_version_member_positions
    WHEN NEW.adopted_version_id = 'version-bad' BEGIN SELECT RAISE(ABORT, 'injected_position_failure'); END`);
  const result = await transfer(fixture, [batchRecord('good', 'good'), batchRecord('bad', 'bad'), batchRecord('last', 'last')]);
  expect(result.results.map(result => result.error)).toEqual(['', 'injected_position_failure', '']);
  expect(await fixture.device.db.query('SELECT id FROM nodes ORDER BY id')).toEqual([{ id: 'good' }, { id: 'last' }]);
  expect(await fixture.device.db.query('SELECT adopted_version_id FROM node_version_member_positions ORDER BY adopted_version_id'))
    .toEqual([{ adopted_version_id: 'version-good' }, { adopted_version_id: 'version-last' }]);
});

it('keeps two siblings and their original versions when their parent already exists', async () => {
  const fixture = await receiver();
  const parent = batchRecord('parent', 'Parent original');
  expect((await transfer(fixture, [parent])).results.map(result => result.error)).toEqual(['']);
  const children = ['child-a', 'child-b'].map(id => {
    const record = batchRecord(id, `Original ${id}`);
    record.snapshot.parent_id = 'parent';
    return record;
  });
  expect((await transfer(fixture, children)).results.map(result => result.error)).toEqual(['', '']);
  const saved = await fixture.device.db.query('SELECT * FROM node_sync_versions ORDER BY version_id');
  await transfer(fixture, children);
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
  await expect(transfer(fixture, [batchRecord('good', 'good')], options)).rejects.toThrow(error);
  expect(await fixture.device.db.query('SELECT id FROM nodes')).toEqual([{ id: 'good' }]);
});

it.each(['wrongObjectId', 'wrongGlobalId'] as const)('rejects mismatched %s before applying any facts', async fault => {
  const fixture = await receiver();
  await expect(transfer(fixture, [batchRecord('good', 'good')], { [fault]: true }))
    .rejects.toThrow('request_sync_batch_identity_mismatch');
  expect(await fixture.device.db.query('SELECT id FROM nodes')).toEqual([]);
});


it('retries a child after its structural parent arrives in the same real SQLite round', async () => {
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
      return (await transfer(fixture, selected)).results;
    },
    reportObjectError: (_difference, error) => { throw error; }
  });
  expect(result).toMatchObject({ complete: true, pending: 0 });
  expect(attempts[0]).toEqual(['a-child', 'm-neighbor', 'z-parent']);
  expect(attempts).toContainEqual(['a-child']);
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
  const originals = () => ['nodes', 'node_sync_versions', 'node_sync_version_parents',
    'node_version_member_positions'].map(table => fixture.device.sqlite.prepare(`SELECT * FROM ${table} ORDER BY 1`).all());
  let first: ReturnType<typeof originals> | undefined;
  fixture.host.objectApplied = object => { if (object.globalId === 'first') first = originals(); };
  await expect(transfer(fixture, records, { truncateSecond: true })).rejects.toThrow('request_sync_object_incomplete');
  expect(first).toBeDefined();
  expect(originals()).toEqual(first);
  delete fixture.host.objectApplied;
  expect((await transfer(fixture, records)).results.map(result => result.error)).toEqual(['', '']);
  const complete = await originals();
  await transfer(fixture, records);
  expect(await originals()).toEqual(complete);
  expect(await fixture.device.db.query('SELECT id, content FROM nodes ORDER BY id')).toEqual([
    { id: 'first', content: 'First😀原文' }, { id: 'second', content: secondBody }
  ]);
  expect(await fixture.device.db.query('SELECT version_id FROM node_sync_versions ORDER BY version_id'))
    .toEqual([{ version_id: 'version-first' }, { version_id: 'version-second' }]);
});
