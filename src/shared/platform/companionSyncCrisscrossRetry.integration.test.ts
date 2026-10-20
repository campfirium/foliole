// @vitest-environment node
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it } from 'vitest';

import { createBetterSqlite3Driver } from '../../../electron/database/betterSqlite3Driver.js';
import { createBetterSqliteDbPort } from '../../../electron/database/betterSqliteDbPort.js';
import { flushNodeSyncVersionWithDriver } from '../../../electron/database/nodeSyncVersionFromDriver.js';
import { root } from '../../../electron/database/syncLibrary.testSupport.js';
import { assertPersisted, closeLibraries, createPeer, edit, joinPeers,
  startLibraries, type Peer } from '../../../electron/database/syncLibrary.testSupport.js';
import { syncRequestLibrary as sync } from '../../../electron/database/syncRequestLibrary.testSupport.js';
import { createDesktopFramedSyncFiles } from '../../../electron/sync/desktopFramedSyncFiles.js';
import { upsertNodeSnapshot } from '../../../lib/core/database/nodeMutations.js';
import { FRAMED_SYNC_PROTOCOL_VERSION } from '../../../lib/core/sync/framedSyncContract.js';
import { compareFramedSyncInventories } from '../../../lib/core/sync/framedSyncInventory.js';
import { readFramedSyncInventory } from '../../../lib/core/sync/framedSyncInventoryRead.js';
import { RequestSyncFiles } from '../../../lib/core/sync/requestSyncFiles.js';
import { applyRequestSyncObject } from '../../../lib/core/sync/requestSyncObjectApply.js';
import { writeRequestSyncSnapshot } from '../../../lib/core/sync/requestSyncSnapshot.js';
import { repairDirectChildAnchorsForAppliedParent } from '../../../lib/core/sync/syncNodeAnchorRepair.js';
import { loadCurrentSyncNodeRecord } from '../../../lib/core/sync/syncNodeGraph.js';

let initialPeers: Awaited<ReturnType<typeof diverge>>;
beforeEach(async () => {
  await startLibraries();
  initialPeers = await diverge();
}, 30_000);
afterEach(closeLibraries);

async function annotate(peer: Peer, versionId: string, content: string) {
  const at = '2026-09-30T00:10:00.000Z';
  const nodeId = `note-${peer.name}`;
  peer.driver.transaction(driver => {
    upsertNodeSnapshot(driver, { nodeId, hostName: peer.name, parentNodeId: 'topic', kind: 'item',
      title: 'Note', isTitleManual: true, content: 'Annotation', position: null, reveal: null,
      anchorLink: { id: nodeId, kind: 'highlight', locator: { from: 0, to: content.length, originalText: content } },
      createdAt: at, updatedAt: at });
    flushNodeSyncVersionWithDriver(driver, nodeId, peer.name, at);
  });
  await repairDirectChildAnchorsForAppliedParent({ port: peer.port, parentNodeId: 'topic',
    content, sourceVersionId: versionId, updatedAt: at });
}

async function diverge() {
  const left = createPeer('left');
  const right = createPeer('right');
  joinPeers(left, right);
  for (const peer of [left, right]) {
    peer.db.exec('CREATE TABLE companion_meta (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT)');
    peer.db.prepare("INSERT INTO companion_meta VALUES ('host_name', ?, 'now')").run(peer.name);
  }
  edit(left, 'Original');
  await sync(left, right);
  await sync(right, left);
  await annotate(left, edit(left, 'Left edit', 'Title A'), 'Left edit');
  await annotate(right, edit(right, 'Right edit', 'Title B'), 'Right edit');
  await withTopicSnapshot(left, right, async toRight => {
    await withTopicSnapshot(right, left, async toLeft => { await toLeft(); await toRight(); });
  });
  assertPersisted(left, 'Left edit');
  assertPersisted(right, 'Right edit');
  return { left, right };
}

function reopen(peer: Peer) {
  peer.db.close();
  peer.db = new Database(peer.file);
  peer.db.pragma('foreign_keys = ON');
  peer.driver = createBetterSqlite3Driver(peer.db);
  peer.port = createBetterSqliteDbPort(peer.db);
}

it.each([false, true])('keeps converged heads across response replay, forwarding, and reopen (replyLost=%s)', async replyLost => {
  const { left, right } = initialPeers;
  edit(left, 'Intermediate body', 'Title A');
  edit(right, 'Intermediate body', 'Title B');
  edit(left, 'Shared final body', 'Title A');
  edit(right, 'Shared final body', 'Title B');
  await withTopicSnapshot(left, right, async toRight => {
    await withTopicSnapshot(right, left, async toLeft => {
      if (replyLost) { await toLeft(); await toRight(); }
      await toLeft(); await toRight();
      const final = (await loadCurrentSyncNodeRecord(left.port, 'topic'))!;
      assertPersisted(left, 'Shared final body', final.version_id!);
      assertPersisted(right, 'Shared final body', final.version_id!);
      for (const peer of [left, right]) reopen(peer);
      for (const [source, target] of [[left, right], [right, left]] as const) {
        const alternatives = async () => (await loadCurrentSyncNodeRecord(target.port, 'topic'))?.alternative_bodies;
        const beforeAlternatives = await alternatives();
        await (source === left ? toRight : toLeft)();
        assertPersisted(target, 'Shared final body', final.version_id!);
        expect(await alternatives()).toEqual(beforeAlternatives);
      }
      await sync(left, right);
      await sync(right, left);
      assertPersisted(left, 'Shared final body', final.version_id!);
      assertPersisted(right, 'Shared final body', final.version_id!);
    });
  });
}, 30000);

async function withTopicSnapshot(source: Peer, target: Peer,
  execute: (replay: () => Promise<void>) => Promise<void>) {
  const differences = compareFramedSyncInventories({ local: await readFramedSyncInventory(source.port),
    remote: await readFramedSyncInventory(target.port) }).filter(value => value.direction === 'local_to_remote'
      && value.objectType === 'node' && value.globalId === 'topic');
  expect(differences).toHaveLength(1);
  const files = createDesktopFramedSyncFiles(path.join(root, `snapshot-${crypto.randomUUID()}`));
  const requests = differences.map(() => new RequestSyncFiles(files, `requests/${crypto.randomUUID()}`));
  const proof = source.db.prepare<[], { library_epoch: string; proof_revision: number }>(
    'SELECT library_epoch, proof_revision FROM node_version_local_proof_state').get()!;
  const targetEpoch = String(target.db.prepare('SELECT library_epoch FROM node_version_local_proof_state').pluck().get());
  try {
    for (const [index, difference] of differences.entries()) {
      await writeRequestSyncSnapshot(source.port, difference, requests[index]!);
    }
    await execute(async () => {
      for (const [index, difference] of differences.entries()) {
        const request = requests[index]!;
        await applyRequestSyncObject(target.port, {
          context: { groupId: 'group', protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION,
            senderDeviceId: source.id, senderLibraryEpoch: proof.library_epoch,
            receiverDeviceId: target.id, receiverLibraryEpoch: targetEpoch },
          peerState: { contract_version: 3, group_id: 'group', sender_device_identity_key: source.id,
            ...proof, devices: [], removals: [], restore: null, source_proof_revisions: {} },
          globalId: difference.globalId, objectType: difference.objectType, requestId: new Uint8Array(16),
          facts: () => request.readFacts(), loadBody: (_db, blob) => request.loadBody(blob), enqueueSearchInvalidations: false
        });
      }
    });
  } finally { await Promise.all(requests.map(request => request.close())); }
}
