// @vitest-environment node

import { expect, it } from 'vitest';

import { FRAMED_SYNC_PROTOCOL_VERSION } from '../../lib/core/sync/framedSyncContract.js';
import { inventoryBucket } from '../../lib/core/sync/framedSyncInventoryBuckets.js';
import { transferRequestSyncBatch } from '../../lib/core/sync/requestSyncBatchExchange.js';
import { exchangeRequestSyncInventory } from '../../lib/core/sync/requestSyncDatabaseExchange.js';
import { runRequestSyncDatabaseRound } from '../../lib/core/sync/requestSyncDatabaseRound.js';
import { applyConvergentSyncNodesWithDbPort } from '../../lib/core/sync/syncNodeConvergence.js';
import type { NativeSyncNodeRecord } from '../../lib/platform/nativeSyncContract.js';
import { restoreFixture } from '../database/requestSyncRestoreRecovery.testSupport.js';

import { createDesktopRequestSyncExchange } from './desktopRequestSyncExchange.js';
import { groupKey, record, state, syncServer, type Peer } from './requestSyncDatabaseHttp.testSupport.js';

async function advance(peer: Peer, first: NativeSyncNodeRecord, equal: NativeSyncNodeRecord,
  burst: boolean, move = false) {
  if (move) {
    const moved = record('hot', 'hot-v2', first);
    moved.snapshot.parent_id = 'new-parent';
    await applyConvergentSyncNodesWithDbPort(peer.db, [moved]);
    return;
  }
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

async function verifyChangingSource(peer: Peer, boundary: string) {
  peer.reopen();
  const burst = boundary === 'selected-burst-1875ms';
  const moving = boundary === 'selected-move';
  if (burst) expect(await peer.db.query("SELECT version_id FROM node_sync_versions WHERE object_id = 'hot' ORDER BY version_id"))
    .toEqual([1, 2, 3, 4, 5].map(index => ({ version_id: `hot-v${index}` })));
  const nodes = moving ? "WHERE id IN ('equal', 'hot')" : '';
  expect(await peer.db.query(`SELECT id, current_version_id FROM nodes ${nodes} ORDER BY id`))
    .toEqual([{ id: 'equal', current_version_id: moving ? 'equal-v1' : 'equal-v2' },
      { id: 'hot', current_version_id: burst ? 'hot-v5' : 'hot-v2' }]);
  if (moving) expect(await peer.db.query("SELECT parent_id FROM nodes WHERE id = 'hot'"))
    .toEqual([{ parent_id: 'new-parent' }]);
}

it.each(['remote-bucket', 'remote-detail', 'local-detail', 'selected-pull', 'selected-burst-1875ms', 'selected-move'] as const)(
  'converges through production HTTP when edits occur at %s, including an initially equal object', async boundary => {
    const fixture = await restoreFixture();
    const source = fixture.peer('source'); const target = fixture.peer('target');
    const hot = record('hot', 'hot-v1'); const equal = record('equal', 'equal-v1');
    const moving = boundary === 'selected-move';
    if (moving) hot.snapshot.parent_id = 'old-parent';
    expect(inventoryBucket({ objectType: 'node', globalId: 'hot' }))
      .not.toBe(inventoryBucket({ objectType: 'node', globalId: 'equal' }));
    const context = { groupId: 'group', protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION,
      initiatorDeviceId: source.id, initiatorLibraryEpoch: source.epoch,
      responderDeviceId: target.id, responderLibraryEpoch: target.epoch } as const;
    const server = syncServer(source, target);
    try {
      const shared = moving ? [equal, record('old-parent', 'old-parent-v1'), record('new-parent', 'new-parent-v1')] : [equal];
      for (const peer of [source, target]) await applyConvergentSyncNodesWithDbPort(peer.db, shared);
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
          await advance(changing, hot, equal, boundary === 'selected-burst-1875ms', moving);
        }
        const response = await transport.request(route, body, consume);
        if (selectedPull) expect(await source.db.query("SELECT current_version_id FROM nodes WHERE id = 'hot'"))
          .toEqual(moving ? [] : [{ current_version_id: 'hot-v1' }]);
        selectedPullDelivered ||= selectedPull;
        return response;
      }) satisfies typeof transport.request };
      const result = await runRequestSyncDatabaseRound({
        exchangeInventory: async () => {
          const inventories = await exchangeRequestSyncInventory(source.host, exchange, undefined, moving);
          if (moving && !selectedPullDelivered) expect(inventories.remote.find(item => item.globalId === 'hot'))
            .toMatchObject({ currentVersionId: 'hot-v1', adoptionParentId: 'old-parent' });
          return inventories;
        },
        transferObjects: differences => transferRequestSyncBatch(source.host, exchange, differences, { peerState: state(target.id) }),
        reportObjectError: (_difference, error) => { throw error; }
      });
      expect(result.complete).toBe(true);
      if (boundary.startsWith('selected-')) expect(selectedPullDelivered).toBe(true);
      expect(requests).toBeGreaterThan(3);
      for (const peer of [source, target]) await verifyChangingSource(peer, boundary);
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

it('delivers an object the responder created after returning its inventory in the next round', async () => {
  const fixture = await restoreFixture();
  const source = fixture.peer('source'); const target = fixture.peer('target');
  const server = syncServer(source, target);
  try {
    for (const peer of [source, target]) await applyConvergentSyncNodesWithDbPort(peer.db, [record('equal', 'equal-v1')]);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('missing_address');
    const context = { groupId: 'group', protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION,
      initiatorDeviceId: source.id, initiatorLibraryEpoch: source.epoch,
      responderDeviceId: target.id, responderLibraryEpoch: target.epoch } as const;
    const transport = createDesktopRequestSyncExchange({ context, groupKey,
      groupSecret: Buffer.from(groupKey).toString('base64url'), endpointUrl: `http://127.0.0.1:${address.port}` });
    let created = false;
    const exchange = { ...transport, request: (async (route, body, consume) => {
      const response = await transport.request(route, body, consume);
      if (!created && route.includes('request=inventory')) {
        created = true;
        await applyConvergentSyncNodesWithDbPort(target.db, [record('fresh', 'fresh-v1')]);
      }
      return response;
    }) satisfies typeof transport.request };
    const port = { exchangeInventory: () => exchangeRequestSyncInventory(source.host, exchange),
      transferObjects: (differences: Parameters<typeof transferRequestSyncBatch>[2]) =>
        transferRequestSyncBatch(source.host, exchange, differences, { peerState: state(target.id) }),
      reportObjectError: (_difference: unknown, error: unknown) => { throw error; } };
    await runRequestSyncDatabaseRound(port);
    expect(created).toBe(true);
    expect(await runRequestSyncDatabaseRound(port)).toMatchObject({ complete: true });
    for (const peer of [source, target]) {
      peer.reopen();
      expect(await peer.db.query('SELECT id, current_version_id FROM nodes ORDER BY id'))
        .toEqual([{ id: 'equal', current_version_id: 'equal-v1' }, { id: 'fresh', current_version_id: 'fresh-v1' }]);
    }
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    await fixture.close();
  }
});
