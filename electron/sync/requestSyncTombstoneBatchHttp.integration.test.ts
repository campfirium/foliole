// @vitest-environment node
import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { computeNodeSyncHash } from '../../lib/core/database/nodeSyncHash.js';
import { nodeSyncSnapshotHashMetadata } from '../../lib/core/database/nodeSyncSnapshotMetadata.js';
import { FRAMED_SYNC_PROTOCOL_VERSION } from '../../lib/core/sync/framedSyncContract.js';
import { applyFramedFactSources } from '../../lib/core/sync/framedSyncFactApply.js';
import { projectFramedSyncNodeRecord } from '../../lib/core/sync/framedSyncNodeProjection.js';
import { requestSyncBatchEnd } from '../../lib/core/sync/requestSyncBatchContract.js';
import { readRequestSyncBatchResults } from '../../lib/core/sync/requestSyncBatchReceiver.js';
import { RequestSyncFiles } from '../../lib/core/sync/requestSyncFiles.js';
import { requestSyncObjectMessages } from '../../lib/core/sync/requestSyncObjectMessages.js';
import { prepareRequestSyncWire } from '../../lib/core/sync/requestSyncWire.js';
import { applyRemoteNodeTombstone } from '../../lib/core/sync/syncNodeTombstoneApply.js';
import type { NativeSyncNodeRecord } from '../../lib/platform/nativeSyncContract.js';
import { restoreFixture } from '../database/requestSyncRestoreRecovery.testSupport.js';

import { createDesktopRequestSyncExchange } from './desktopRequestSyncExchange.js';
import { groupKey, record, syncServer, type Peer } from './requestSyncDatabaseHttp.testSupport.js';

function deletion(id: string, version: string) {
  const value = record(id, version);
  value.is_tombstone = true;
  value.snapshot.deleted_at = value.updated_at;
  value.content_hash = computeNodeSyncHash({ ...nodeSyncSnapshotHashMetadata(value.snapshot), content: value.body_text! });
  return value;
}

async function pushHeads(source: Peer, exchange: ReturnType<typeof createDesktopRequestSyncExchange>,
  groups: readonly NativeSyncNodeRecord[][]) {
  const batchId = new Uint8Array(16).fill(255);
  const files = groups.map(() => new RequestSyncFiles(source.host.files, `requests/${crypto.randomUUID()}`));
  try {
    const headers = await Promise.all(groups.map(async (heads, index) => {
      const first = heads[0]!;
      const file = files[index]!;
      for (const head of heads) {
        const projection = projectFramedSyncNodeRecord(head);
        const fact = projection.manifest.facts[0]!;
        for (const blob of fact.blobs) await file.writeBody(blob, projection.bodyBlob);
        await file.writeFact(fact);
      }
      return { objectType: 'node', globalId: first.object_id, currentVersionId: first.version_id!,
        sourceStateHash: projectFramedSyncNodeRecord(first).manifest.facts[0]!.sharedStateHash,
        requestId: new Uint8Array(16).fill(index + 1) };
    }));
    const wire = await prepareRequestSyncWire({ ...exchange, messages: async function* (contextId) {
      for (const [index, header] of headers.entries()) {
        yield* requestSyncObjectMessages(header, contextId, files[index]!);
      }
      yield requestSyncBatchEnd(batchId, headers.length);
    } });
    return await exchange.request('/companion/framed-sync?request=objects', wire,
      response => readRequestSyncBatchResults({ ...exchange, ...response }, batchId, headers));
  } finally { await Promise.all(files.map(file => file.close())); }
}

async function withHttp(run: (source: Peer, target: Peer,
  exchange: ReturnType<typeof createDesktopRequestSyncExchange>) => Promise<void>) {
  const fixture = await restoreFixture();
  const source = fixture.peer('source');
  const target = fixture.peer('target');
  const server = syncServer(source, target);
  try {
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('missing_address');
    const context = { groupId: 'group', protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION,
      initiatorDeviceId: source.id, initiatorLibraryEpoch: source.epoch,
      responderDeviceId: target.id, responderLibraryEpoch: target.epoch } as const;
    await run(source, target, createDesktopRequestSyncExchange({ context, groupKey,
      groupSecret: Buffer.from(groupKey).toString('base64url'), endpointUrl: `http://127.0.0.1:${address.port}` }));
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    await fixture.close();
  }
}

const tombstones = (target: Peer) => target.db.query(
  'SELECT node_id, version_id, parent_version_id, content_hash FROM node_sync_tombstones ORDER BY node_id');
const identity = (value: NativeSyncNodeRecord) =>
  ({ node_id: value.object_id, version_id: value.version_id,
    parent_version_id: value.parent_version_id, content_hash: value.content_hash });

it('receives a mixed HTTP batch without resurrecting a node that already has a tombstone', () =>
  withHttp(async (source, target, exchange) => {
    const prior = deletion('held', 'prior');
    await applyRemoteNodeTombstone(target.db, prior, false);
    const sql: string[] = [];
    target.sqlite.close();
    target.sqlite = new Database(target.file, { verbose: statement => sql.push(String(statement)) });
    const deleted = deletion('mixed', 'deleted');
    const results = await pushHeads(source, exchange, [
      [deleted, record('mixed', 'live-branch')], [record('held', 'old-live')], [record('kept', 'kept-v1')]
    ]);
    expect(results.map(result => result.error)).toEqual(['', '', '']);
    const reads = sql.filter(statement => /SELECT (?:node_id, )?version_id, parent_version_id, deleted_at\s+FROM node_sync_tombstones/u.test(statement));
    expect(reads.filter(statement => statement.includes('json_each'))).toHaveLength(1);
    expect(reads).toHaveLength(1);
    for (const id of ['mixed', 'held', 'kept']) expect(reads[0]).toContain(JSON.stringify(id));
    target.reopen();
    expect(await tombstones(target)).toEqual([identity(prior), identity(deleted)]);
    expect(await target.db.query('SELECT id FROM nodes ORDER BY id')).toEqual([{ id: 'kept' }]);
  }));

it('rejects a conflicting deletion identity and rolls back the whole batch', () =>
  withHttp(async (source, target, exchange) => {
    const prior = deletion('owner', 'shared-deletion');
    await applyRemoteNodeTombstone(target.db, prior, false);
    await expect(pushHeads(source, exchange, [
      [record('first', 'first-v1')], [deletion('impostor', 'shared-deletion')], [record('last', 'last-v1')]
    ])).rejects.toThrow('sync_pack_node_version_immutable_mismatch:shared-deletion');
    target.reopen();
    expect(await tombstones(target)).toEqual([identity(prior)]);
    expect(await target.db.query('SELECT id FROM nodes')).toEqual([]);
    expect(await target.db.query('SELECT version_id FROM node_sync_versions')).toEqual([]);
    const results = await pushHeads(source, exchange, [
      [record('first', 'first-v1')], [deletion('impostor', 'independent-deletion')], [record('last', 'last-v1')]
    ]);
    expect(results.map(result => result.error)).toEqual(['', '', '']);
    target.reopen();
    expect(await target.db.query('SELECT id FROM nodes ORDER BY id')).toEqual([{ id: 'first' }, { id: 'last' }]);
    expect((await tombstones(target)).map(row => row.version_id)).toEqual(['independent-deletion', 'shared-deletion']);
  }));

it('reads the tombstone written by an earlier projection of the same node', async () => {
  const fixture = await restoreFixture();
  const target = fixture.peer('target');
  try {
    const deleted = deletion('mixed', 'deleted');
    const projections = [deleted, record('mixed', 'live-branch'), record('first', 'first-v1'),
      record('second', 'second-v1')].map(value => projectFramedSyncNodeRecord(value));
    const sql: string[] = [];
    target.sqlite.close();
    target.sqlite = new Database(target.file, { verbose: statement => sql.push(String(statement)) });
    const rejectedNodes = new Map<string, string>();
    await applyFramedFactSources(target.db, projections.map(projection => async function* () {
      yield* projection.manifest.facts;
    }), {
      requireCompleteVersionGraph: true, rejectedNodes,
      currentVersions: { sourceIds: ['mixed', 'first', 'second'], references: [] },
      loadBody: async (_db, blob) => {
        const match = projections.find(projection => projection.manifest.blobs.some(candidate =>
          Buffer.from(candidate.sha256).equals(blob.sha256)));
        if (!match) throw new Error('missing_fixture_body');
        return match.bodyBlob;
      }
    });
    expect(rejectedNodes.size).toBe(0);
    const reads = sql.filter(statement => /SELECT (?:node_id, )?version_id, parent_version_id, deleted_at\s+FROM node_sync_tombstones/u.test(statement));
    expect(reads.filter(statement => statement.includes('json_each'))).toHaveLength(1);
    expect(reads.filter(statement => statement.includes("WHERE node_id = 'mixed'"))).toHaveLength(2);
    expect(reads[0]).not.toContain('"mixed"');
    target.reopen();
    expect(await tombstones(target)).toEqual([identity(deleted)]);
    expect(await target.db.query('SELECT id FROM nodes ORDER BY id')).toEqual([{ id: 'first' }, { id: 'second' }]);
  } finally { await fixture.close(); }
});
