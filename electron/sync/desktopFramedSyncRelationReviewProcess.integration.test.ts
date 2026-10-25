// @vitest-environment node
import { promises as fs } from 'node:fs';

import Database from 'better-sqlite3';
import { afterEach, expect, it } from 'vitest';

import { FRAMED_SYNC_FRAME_TYPES, FRAMED_SYNC_PROTOCOL_VERSION } from '../../lib/core/sync/framedSyncContract.js';
import { compareFramedSyncInventories } from '../../lib/core/sync/framedSyncInventory.js';
import { readFramedSyncInventoryEntry } from '../../lib/core/sync/framedSyncInventoryRead.js';
import type { RequestSyncDatabaseHost } from '../../lib/core/sync/requestSyncObjectEndpoint.js';
import { closeRequestSyncReadonlyConnections, withRequestSyncReadonlySnapshot } from '../database/requestSyncReadonlySnapshot.js';

import { createDesktopFramedSyncFiles } from './desktopFramedSyncFiles.js';
import {
  createDesktopFramedSyncTwoProcessFixture,
  type DesktopFramedSyncFixtureProcess,
  readDesktopFramedSyncLibraryEvidence
} from './desktopFramedSyncTwoProcess.testSupport.js';
import { createDesktopFramedSyncFaultProxy } from './desktopFramedSyncTwoProcessFaultProxy.js';
import { postDesktopRequestSyncObject } from './desktopRequestSyncObjectHttp.js';
import { requestProcessEvidence } from './requestSyncProcessRecovery.testSupport.js';

let root = '';
const processes: DesktopFramedSyncFixtureProcess[] = [];

afterEach(async ({ task }) => {
  closeRequestSyncReadonlyConnections();
  const active = processes.splice(0);
  await Promise.allSettled(active.map((process) => process.close()));
  if (!root) return;
  if (task.result?.state === 'fail') {
    await fs.writeFile(`${root}/processes.log`, active.map((process, index) =>
      `Process ${index + 1}\n${process.diagnostics()}`).join('\n'));
    console.info('Failed framed-sync relation/review fixture:', root);
  } else {
    await fs.rm(root, { force: true, recursive: true });
  }
  root = '';
});

async function setup() {
  const fixture = await createDesktopFramedSyncTwoProcessFixture(undefined, true, true);
  root = fixture.root;
  processes.push(fixture.left, fixture.right);
  return fixture;
}

async function postSelected(fixture: Awaited<ReturnType<typeof setup>>, reviewOnly: boolean,
  endpointUrl = fixture.rightSnapshot.origin) {
  const host: RequestSyncDatabaseHost = {
    files: createDesktopFramedSyncFiles(`${fixture.root}/selected-request`),
    readSnapshot: read => withRequestSyncReadonlySnapshot(fixture.leftSnapshot.databasePath, read),
    write: async () => { throw new Error('outbound_request_must_not_write'); }
  };
  const entry = await host.readSnapshot(db => readFramedSyncInventoryEntry(db,
    { objectType: 'node', globalId: 't326-relation-review' }));
  if (!entry) throw new Error('review_source_missing');
  const full = compareFramedSyncInventories({ local: [entry], remote: [] })[0]!;
  const difference = reviewOnly ? { ...full, need: { ...full.need, frontierFactIds: [], requiredRelationIds: [],
    resourceHashes: [], stateFactIds: [], sharedState: false } } : full;
  const groupKey = new Uint8Array(32).fill(7);
  return postDesktopRequestSyncObject(host, { difference, endpointUrl, groupKey,
    groupSecret: Buffer.from(groupKey).toString('base64url'),
    context: { groupId: 't326-group', protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION,
      initiatorDeviceId: fixture.leftSnapshot.deviceId, initiatorLibraryEpoch: `${fixture.leftSnapshot.deviceId}-epoch`,
      responderDeviceId: fixture.rightSnapshot.deviceId, responderLibraryEpoch: `${fixture.rightSnapshot.deviceId}-epoch` } });
}

it('applies a node, parent relation and review through a production request', async () => {
  const fixture = await setup();
  await Promise.all([
    fixture.left.seedRelationReview('sender'),
    fixture.right.seedRelationReview('receiver')
  ]);
  await fixture.left.synchronize(fixture.rightSnapshot.origin, 't326-relation-review');

  const received = readDesktopFramedSyncLibraryEvidence(fixture.rightSnapshot.databasePath);
  expect(received.nodes).toEqual([expect.objectContaining({
    current_version_id: 't326-child-version', id: 't326-relation-review'
  })]);
  expect(received.versions).toEqual([
    { version_id: 't326-base-version', object_id: 't326-relation-review', body_text: null },
    { version_id: 't326-child-version', object_id: 't326-relation-review', body_text: 'Incoming child body' }
  ]);
  expect(received.parents).toEqual([{
    ordinal: 0, parent_version_id: 't326-base-version', version_id: 't326-child-version'
  }]);
  expect(received.reviews).toEqual([{
    grade: 3, node_id: 't326-relation-review', op_id: 't326-review-op'
  }]);
  expect(received.framedSync).toMatchObject({
    inboundFacts: 0, inboundFrames: 0, inboundStates: [], receipts: 0
  });
});

it('rolls back node and relation apply when a review conflicts', async () => {
  const fixture = await setup();
  await Promise.all([
    fixture.left.seedRelationReview('sender'),
    fixture.right.seedRelationReview('receiver_conflict')
  ]);
  const before = requestProcessEvidence(fixture.rightSnapshot.databasePath);
  await expect(postSelected(fixture, false)).rejects.toThrow();
  expect(requestProcessEvidence(fixture.rightSnapshot.databasePath)).toEqual(before);

  const received = readDesktopFramedSyncLibraryEvidence(fixture.rightSnapshot.databasePath);
  expect(received.nodes).toEqual([expect.objectContaining({
    current_version_id: 't326-base-version', id: 't326-relation-review'
  })]);
  expect(received.versions).toEqual([
    expect.objectContaining({ version_id: 't326-base-version' })
  ]);
  expect(received.parents).toEqual([]);
  expect(received.reviews).toEqual([{
    grade: 4, node_id: 't326-relation-review', op_id: 't326-review-op'
  }]);
  expect(received.framedSync.receipts).toBe(0);
});

it('transfers only a review without body frames and preserves all node facts across replay and restart', async () => {
  const fixture = await setup();
  await Promise.all([fixture.left.seedRelationReview('receiver'), fixture.right.seedRelationReview('receiver')]);
  await fixture.left.synchronize(fixture.rightSnapshot.origin);
  const before = readDesktopFramedSyncLibraryEvidence(fixture.rightSnapshot.databasePath);
  await fixture.left.invoke('seed_relation_review', { role: 'review_only' });
  const proxy = await createDesktopFramedSyncFaultProxy({ fault: 'observe', observeFrameTypes: true, targetOrigin: fixture.rightSnapshot.origin });
  try {
    await postSelected(fixture, true, proxy.origin);
    await postSelected(fixture, true, proxy.origin);
    const frames = await proxy.frameTypes();
    expect(frames[FRAMED_SYNC_FRAME_TYPES.fact]).toBeGreaterThan(0);
    expect(frames[FRAMED_SYNC_FRAME_TYPES.blobChunk] ?? 0).toBe(0);
  } finally { await proxy.close(); }
  const restarted = await fixture.restartRight();
  processes.push(restarted.process);
  const received = readDesktopFramedSyncLibraryEvidence(restarted.snapshot.databasePath);
  expect(received.nodes).toEqual(before.nodes);
  expect(received.versions).toEqual(before.versions);
  expect(received.parents).toEqual(before.parents);
  expect(received.reviews).toEqual([{ grade: 3, node_id: 't326-relation-review', op_id: 't326-review-op' }]);
  const reviews = (databasePath: string) => {
    const db = new Database(databasePath, { readonly: true, fileMustExist: true });
    try { return db.prepare('SELECT * FROM review_log ORDER BY op_id').all(); }
    finally { db.close(); }
  };
  expect(reviews(restarted.snapshot.databasePath)).toEqual(reviews(fixture.leftSnapshot.databasePath));
  expect(received.framedSync).toEqual(before.framedSync);
});


it('retains review, void and reset facts across real process sync, replay and receiver restart', async () => {
  const fixture = await setup();
  await fixture.left.seedRelationReview('sender');
  await fixture.right.seedRelationReview('receiver');
  await fixture.left.invoke('seed_relation_review', { role: 'control_events' });
  await fixture.left.synchronize(fixture.rightSnapshot.origin, 't326-relation-review');
  await fixture.left.synchronize(fixture.rightSnapshot.origin, 't326-relation-review');
  const restarted = await fixture.restartRight();
  processes.push(restarted.process);
  const read = (file: string) => {
    const db = new Database(file, { readonly: true, fileMustExist: true });
    try {
      return { facts: db.prepare('SELECT * FROM review_log ORDER BY op_id').all(),
        valid: db.prepare("SELECT r.op_id FROM review_log r WHERE r.kind='review' AND NOT EXISTS (SELECT 1 FROM review_log v WHERE v.kind='void' AND v.voids_op_id=r.op_id)").all() };
    } finally { db.close(); }
  };
  const received = read(restarted.snapshot.databasePath);
  expect(received).toEqual(read(fixture.leftSnapshot.databasePath));
  expect(received.facts).toHaveLength(3);
  expect(received.valid).toEqual([]);
});
