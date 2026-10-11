// @vitest-environment node
import { afterEach, expect, it } from 'vitest';

import { projectFramedSyncNodeRecord } from '../../lib/core/sync/framedSyncNodeProjection.js';
import { requestSyncBatchEnd } from '../../lib/core/sync/requestSyncBatchContract.js';
import { receiveRequestSyncBatch } from '../../lib/core/sync/requestSyncBatchReceiver.js';
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
  options: { truncate?: boolean; wrongId?: boolean; wrongObjectId?: boolean; duplicate?: boolean } = {}) {
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
        yield* requestSyncObjectMessages(header, contextId, files[i]!);
        if (options.duplicate) yield* requestSyncObjectMessages(header, contextId, files[i]!);
      }
      if (!options.truncate) yield requestSyncBatchEnd(batchId, records.length);
    } });
    return await receiveRequestSyncBatch(fixture.host, { ...wire, context, groupKey, peerState,
      author: 'initiator', requestId: options.wrongId ? new Uint8Array(16).fill(99) : batchId,
      expected: options.wrongObjectId ? identities.map(identity => ({ ...identity, requestId: new Uint8Array(16).fill(99) })) : identities });
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

it.each([
  { options: { truncate: true }, error: 'request_sync_batch_end_missing' },
  { options: { wrongId: true }, error: 'request_sync_batch_end_invalid' },
  { options: { duplicate: true }, error: 'request_sync_batch_identity_duplicate' }
])('rejects $error even after a complete object, preserving that object commit', async ({ options, error }) => {
  const fixture = await receiver();
  await expect(transfer(fixture, [batchRecord('good', 'good')], options)).rejects.toThrow(error);
  expect(await fixture.device.db.query('SELECT id FROM nodes')).toEqual([{ id: 'good' }]);
});

it('rejects a mismatched object correlation id before applying any facts', async () => {
  const fixture = await receiver();
  await expect(transfer(fixture, [batchRecord('good', 'good')], { wrongObjectId: true }))
    .rejects.toThrow('request_sync_batch_identity_mismatch');
  expect(await fixture.device.db.query('SELECT id FROM nodes')).toEqual([]);
});
