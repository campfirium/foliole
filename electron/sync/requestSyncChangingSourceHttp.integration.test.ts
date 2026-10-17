// @vitest-environment node
import http from 'node:http';

import { expect, it } from 'vitest';

import { FRAMED_SYNC_PROTOCOL_VERSION } from '../../lib/core/sync/framedSyncContract.js';
import { inventoryBucket } from '../../lib/core/sync/framedSyncInventoryBuckets.js';
import { transferRequestSyncBatch } from '../../lib/core/sync/requestSyncBatchExchange.js';
import { exchangeRequestSyncInventory } from '../../lib/core/sync/requestSyncDatabaseExchange.js';
import { respondRequestSyncDatabase, type RequestSyncDatabaseResponseInput } from '../../lib/core/sync/requestSyncDatabaseResponse.js';
import { runRequestSyncDatabaseRound } from '../../lib/core/sync/requestSyncDatabaseRound.js';
import { applyConvergentSyncNodesWithDbPort } from '../../lib/core/sync/syncNodeConvergence.js';
import type { NativeSyncNodeRecord } from '../../lib/platform/nativeSyncContract.js';
import type { SyncGroupMemberStatePayload } from '../../lib/platform/syncGroupMemberStateContract.js';
import { restoreFixture } from '../database/requestSyncRestoreRecovery.testSupport.js';
import { textBranch } from '../database/topicTextState.testSupport.js';

import { handleCompanionLanFramedSyncPost } from './companionLanFramedSyncPost.js';
import { prepareDesktopRequestSyncBody } from './desktopRequestSyncBody.js';
import { createDesktopRequestSyncExchange } from './desktopRequestSyncExchange.js';

const groupKey = new Uint8Array(32).fill(7);
const state = (id: string): SyncGroupMemberStatePayload => ({ contract_version: 3, group_id: 'group',
  sender_device_identity_key: id, library_epoch: `${id}-epoch`, proof_revision: 0,
  source_proof_revisions: {}, devices: [], removals: [], restore: null });

function record(id: string, version: string, parent?: NativeSyncNodeRecord) {
  const value = textBranch(version, `Body ${version}`, parent);
  return { ...value, object_id: id, snapshot: { ...value.snapshot, id } };
}

type Peer = ReturnType<Awaited<ReturnType<typeof restoreFixture>>['peer']>;

function syncServer(source: Peer, target: Peer) {
  return http.createServer((request, response) => {
      void handleCompanionLanFramedSyncPost({ request, response,
        localIdentity: { deviceId: target.id, libraryEpoch: target.epoch },
        authenticate: () => ({ ok: true, device_id: source.id, device_name: source.id }),
        onStream: async input => {
          const mode = new URL(request.url!, 'http://localhost').searchParams.get('request');
          if (mode !== 'inventory' && mode !== 'objects' && mode !== 'pulls') throw new Error('unexpected_mode');
          const operation: RequestSyncDatabaseResponseInput = { ...input, groupKey, mode,
            batch: { peerState: state(source.id) } };
          return respondRequestSyncDatabase(target.host, operation, prepareDesktopRequestSyncBody);
        }
      }).catch(error => response.destroy(error));
    });
}

async function advance(peer: Peer, first: NativeSyncNodeRecord, equal: NativeSyncNodeRecord, burst: boolean) {
  let parent = first;
  for (let index = 2; index <= (burst ? 5 : 2); index++) {
    const next = record('hot', `hot-v${index}`, parent);
    // Deterministic save timestamps reproduce the observed span; this is not a latency measurement.
    const timestamp = new Date(Date.parse(first.version_created_at!) + Math.round((index - 1) * 1875 / 4)).toISOString();
    next.version_created_at = timestamp; next.updated_at = timestamp;
    next.snapshot.updated_at = timestamp;
    await applyConvergentSyncNodesWithDbPort(peer.db, [next], { collectVersionPayloads: false });
    parent = next;
  }
  await applyConvergentSyncNodesWithDbPort(peer.db, [record('equal', 'equal-v2', equal)]);
}

it.each(['remote-bucket', 'remote-detail', 'local-detail', 'selected-pull', 'selected-burst-1875ms'] as const)(
  'converges through production HTTP when edits occur at %s, including an initially equal object', async boundary => {
    const fixture = await restoreFixture();
    const source = fixture.peer('source'); const target = fixture.peer('target');
    const hot = record('hot', 'hot-v1'); const equal = record('equal', 'equal-v1');
    expect(inventoryBucket({ objectType: 'node', globalId: 'hot' }))
      .not.toBe(inventoryBucket({ objectType: 'node', globalId: 'equal' }));
    const context = { groupId: 'group', protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION,
      initiatorDeviceId: source.id, initiatorLibraryEpoch: source.epoch,
      responderDeviceId: target.id, responderLibraryEpoch: target.epoch } as const;
    const server = syncServer(source, target);
    try {
      for (const peer of [source, target]) await applyConvergentSyncNodesWithDbPort(peer.db, [equal]);
      const changing = boundary === 'local-detail' ? source : target;
      await applyConvergentSyncNodesWithDbPort(changing.db, [hot]);
      await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('missing_address');
      const transport = createDesktopRequestSyncExchange({ context, groupKey,
        groupSecret: Buffer.from(groupKey).toString('base64url'), endpointUrl: `http://127.0.0.1:${address.port}` });
      let requests = 0;
      let selectedPullDelivered = false;
      const exchange = { ...transport, request: (async (route, body, consume) => {
        const inventoryRequest = route.includes('request=inventory');
        if (inventoryRequest) requests++;
        const selectedPull = boundary.startsWith('selected-') && route.includes('request=pulls') && !selectedPullDelivered;
        if (selectedPull || (!boundary.startsWith('selected-') && inventoryRequest &&
            requests === (boundary === 'remote-detail' ? 3 : 2))) {
          await advance(changing, hot, equal, boundary === 'selected-burst-1875ms');
        }
        const response = await transport.request(route, body, consume);
        if (selectedPull) {
          expect(await source.db.query("SELECT current_version_id FROM nodes WHERE id = 'hot'"))
            .toEqual([{ current_version_id: 'hot-v1' }]);
          selectedPullDelivered = true;
        }
        return response;
      }) satisfies typeof transport.request };
      const result = await runRequestSyncDatabaseRound({
        exchangeInventory: () => exchangeRequestSyncInventory(source.host, exchange),
        transferObjects: differences => transferRequestSyncBatch(source.host, exchange, differences,
          { peerState: state(target.id) }),
        reportObjectError: (_difference, error) => { throw error; }
      });
      expect(result.complete).toBe(true);
      if (boundary.startsWith('selected-')) expect(selectedPullDelivered).toBe(true);
      expect(requests).toBeGreaterThan(3);
      for (const peer of [source, target]) {
        peer.reopen();
        if (boundary === 'selected-burst-1875ms') expect(await peer.db.query("SELECT version_id FROM node_sync_versions WHERE object_id = 'hot' ORDER BY version_id"))
          .toEqual([1, 2, 3, 4, 5].map(index => ({ version_id: `hot-v${index}` })));
        expect(await peer.db.query('SELECT id, current_version_id FROM nodes ORDER BY id'))
          .toEqual([{ id: 'equal', current_version_id: 'equal-v2' }, { id: 'hot', current_version_id: boundary === 'selected-burst-1875ms' ? 'hot-v5' : 'hot-v2' }]);
      }
    } finally {
      await new Promise<void>(resolve => server.close(() => resolve()));
      await fixture.close();
    }
  });

it('keeps committing independent objects through four HTTP rounds of unavailable hot selections', async () => {
  const fixture = await restoreFixture();
  const source = fixture.peer('source'); const target = fixture.peer('target');
  const server = syncServer(source, target);
  let hot = record('hot', 'hot-0');
  let revision = 0;
  try {
    await applyConvergentSyncNodesWithDbPort(target.db,
      [hot, record('stable-0-a', 'stable-0-a'), record('stable-0-b', 'stable-0-b')]);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('missing_address');
    const context = { groupId: 'group', protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION,
      initiatorDeviceId: source.id, initiatorLibraryEpoch: source.epoch,
      responderDeviceId: target.id, responderLibraryEpoch: target.epoch } as const;
    const exchange = createDesktopRequestSyncExchange({ context, groupKey,
      groupSecret: Buffer.from(groupKey).toString('base64url'), endpointUrl: `http://127.0.0.1:${address.port}` });
    const port = {
      exchangeInventory: () => exchangeRequestSyncInventory(source.host, exchange),
      transferObjects: async (differences: Parameters<typeof transferRequestSyncBatch>[2]) => {
        if (differences.some(difference => difference.globalId === 'hot')) {
          hot = record('hot', `hot-${++revision}`, hot);
          await applyConvergentSyncNodesWithDbPort(target.db, [hot,
            record(`stable-${revision}-a`, `stable-${revision}-a`),
            record(`stable-${revision}-b`, `stable-${revision}-b`)]);
        }
        return transferRequestSyncBatch(source.host, exchange, differences, { peerState: state(target.id) });
      },
      reportObjectError: (_difference: unknown, error: unknown) => { throw error; }
    };
    for (let round = 0; round < 4; round++) {
      expect(await runRequestSyncDatabaseRound(port)).toMatchObject({ complete: false,
        madeProgress: false, dynamicBacklog: true });
      source.reopen();
      expect(source.sqlite.prepare("SELECT count(*) FROM nodes WHERE id LIKE 'stable-%'").pluck().get())
        .toBe(8 * (round + 1));
    }
    expect(await runRequestSyncDatabaseRound({ ...port, transferObjects: differences =>
      transferRequestSyncBatch(source.host, exchange, differences, { peerState: state(target.id) }) }))
      .toMatchObject({ complete: true });
    source.reopen();
    expect(source.sqlite.prepare("SELECT current_version_id FROM nodes WHERE id = 'hot'").pluck().get())
      .toBe(hot.version_id);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    await fixture.close();
  }
});
