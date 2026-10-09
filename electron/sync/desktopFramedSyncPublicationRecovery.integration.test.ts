// @vitest-environment node
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { afterEach, expect, it } from 'vitest';
import { z } from 'zod';

import { compareFramedSyncInventories } from '../../lib/core/sync/framedSyncInventory.js';
import { LIBRARY_ASSETS_DIRNAME } from '../../lib/platform/libraryPaths.js';

import { publicationEvidence, publishFixtureDelivery, readFixtureInventory, reconnectFixturePeer }
  from './desktopFramedSyncPublicationRecovery.testSupport.js';
import { createDesktopFramedSyncTwoProcessFixture, readDesktopFramedSyncLibraryEvidence,
  type DesktopFramedSyncFixtureProcess } from './desktopFramedSyncTwoProcess.testSupport.js';
import { createDesktopFramedSyncFaultProxy } from './desktopFramedSyncTwoProcessFaultProxy.js';

let root = '';
const processes: DesktopFramedSyncFixtureProcess[] = [];
afterEach(async ({ task }) => {
  await Promise.allSettled(processes.splice(0).map((process) => process.close()));
  if (root && task.result?.state !== 'fail') await fs.rm(root, { recursive: true, force: true });
});

it('recovers an unacknowledged publication on normal peer reconnect with no inventory difference', async () => {
  const fixture = await createDesktopFramedSyncTwoProcessFixture();
  root = fixture.root;
  processes.push(fixture.left, fixture.right);
  const nodeId = 't326-reconnect';
  await fixture.left.seed({ content: 'Original body', nodeId, title: 'Original title' });
  const differences = compareFramedSyncInventories({ local: await readFixtureInventory(fixture.left),
    remote: await readFixtureInventory(fixture.right) });
  expect(differences.length).toBeGreaterThan(0);
  expect(differences.every((value) => value.direction === 'local_to_remote')).toBe(true);
  const proxy = await createDesktopFramedSyncFaultProxy({
    dropReceiptResponseAt: 1,
    fault: 'drop_receipt_response', targetOrigin: fixture.rightSnapshot.origin
  });
  try { await expect(reconnectFixturePeer(fixture.left, { ...fixture.rightSnapshot, origin: proxy.origin }))
    .rejects.toThrow(); }
  finally { await proxy.close(); }
  const pending = publicationEvidence(fixture.leftSnapshot.databasePath).publications
    .map((value) => z.object({ id: z.string(), state: z.string() }).parse(value))
    .filter((value) => value.state === 'published');
  expect(pending.length).toBeGreaterThan(0);
  for (const { id } of pending) expect(publicationEvidence(fixture.rightSnapshot.databasePath).receipts)
    .toContainEqual({ id, receiver_device_id: 'desktop-b' });
  await alignFixturePositions(fixture);
  expect(compareFramedSyncInventories({ local: await readFixtureInventory(fixture.left),
    remote: await readFixtureInventory(fixture.right) })).toEqual([]);
  const restarted = await fixture.restartLeft();
  processes.push(restarted.process);
  const observation = await createDesktopFramedSyncFaultProxy({
    fault: 'observe', targetOrigin: fixture.rightSnapshot.origin
  });
  try {
    await restarted.process.invoke('round', { input: {
      kind: 'reconcile', peer: { deviceId: 'desktop-b', libraryEpoch: 'desktop-b-epoch' },
      peerOrigin: observation.origin
    } });
    expect(observation.wireBytes().transferBytes).toBe(0);
    expect(observation.wireBytes().sessionBytes).toBeGreaterThan(0);
  } finally { await observation.close(); }
  const sender = readDesktopFramedSyncLibraryEvidence(restarted.snapshot.databasePath);
  expect(sender.framedSync.outboundHolds).toBe(0);
  const recovered = publicationEvidence(restarted.snapshot.databasePath);
  for (const { id } of pending) {
    expect(recovered.receipts).not.toContainEqual({ id, receiver_device_id: 'desktop-b' });
    expect(recovered.publications).toContainEqual(expect.objectContaining({ id, state: 'receipt_committed' }));
    expect(publicationEvidence(fixture.rightSnapshot.databasePath).receipts
      .filter(receipt => receipt.id === id)).toHaveLength(1);
  }
});

async function alignFixturePositions(fixture: Awaited<ReturnType<typeof createDesktopFramedSyncTwoProcessFixture>>) {
  const differences = compareFramedSyncInventories({ local: await readFixtureInventory(fixture.left),
    remote: await readFixtureInventory(fixture.right) });
  expect(differences.every(value => value.objectType === 'parent_order_position')).toBe(true);
  for (const difference of differences) {
    const localSource = difference.direction === 'local_to_remote';
    const source = localSource ? fixture.left : fixture.right;
    const peer = localSource ? fixture.rightSnapshot : fixture.leftSnapshot;
    const selected = z.object({ publication: z.object({ transferId: z.instanceof(Uint8Array) }) })
      .parse(await source.invoke('round', { input: { kind: 'select',
        difference: { ...difference, direction: 'local_to_remote' },
        peer: { deviceId: peer.deviceId, libraryEpoch: `${peer.deviceId}-epoch` }, peerOrigin: peer.origin } }));
    await source.invoke('round', { input: { kind: 'send',
      transferId: Buffer.from(selected.publication.transferId).toString('hex') } });
  }
}

it.each(['publication', 'partial', 'finalised'] as const)(
  'recovers %s after edits, normal collection and sender restart without reselecting facts', async (mode) => {
    const fixture = await createDesktopFramedSyncTwoProcessFixture();
    root = fixture.root;
    processes.push(fixture.left, fixture.right);
    const nodeId = 't326-frozen-recovery';
    await fixture.left.seed({ content: 'Root body', nodeId, title: 'Root' });
    await fixture.left.seed({ content: 'Frozen body', nodeId, title: 'Frozen' });
    const id = await publishFixtureDelivery(fixture.left, fixture.rightSnapshot, mode);
    await fixture.left.seed({ content: 'Latest body', nodeId, title: 'Latest' });
    await fixture.left.invoke('collect_content');
    const retained = readDesktopFramedSyncLibraryEvidence(fixture.leftSnapshot.databasePath);
    expect(retained.versions).toContainEqual(expect.objectContaining({ body_text: 'Frozen body' }));
    const restarted = await fixture.restartLeft();
    processes.push(restarted.process);
    await reconnectFixturePeer(restarted.process, fixture.rightSnapshot);
    const after = publicationEvidence(restarted.snapshot.databasePath);
    expect(after.publications[0]).toEqual(expect.objectContaining({
      id, manifest_json: '{"blobs":[],"facts":[]}', state: 'receipt_committed'
    }));
    expect(after.receipts).toContainEqual({ id, receiver_device_id: 'desktop-b' });
    expect(after.frames).toEqual([]);
    expect(after.attempts).toEqual([]);
    expect(readDesktopFramedSyncLibraryEvidence(fixture.rightSnapshot.databasePath).versions)
      .toContainEqual(expect.objectContaining({ body_text: 'Frozen body' }));
    expect(after.holds).toEqual([]);
  }
);

it('keeps C content protected after B receipt and releases only C after its delivery', async () => {
  const fixture = await createDesktopFramedSyncTwoProcessFixture();
  root = fixture.root;
  const third = await fixture.startThird();
  processes.push(fixture.left, fixture.right, third.process);
  await Promise.all([fixture.left, fixture.right, third.process].map(process =>
    process.invoke('register_order_member', { deviceId: third.snapshot.deviceId })));
  const nodeId = 't326-independent-receipts';
  const originalBytes = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(128, 1)
  ]);
  const original = await fixture.left.seedResource({ bytes: originalBytes, nodeId });
  const b = await publishFixtureDelivery(fixture.left, fixture.rightSnapshot, 'publication');
  const c = await publishFixtureDelivery(fixture.left, third.snapshot, 'publication');
  expect(b).not.toBe(c);
  await fixture.left.seedResource({ bytes: Buffer.concat([originalBytes, Buffer.alloc(128, 2)]), nodeId });
  await fixture.left.invoke('collect_content');
  await reconnectFixturePeer(fixture.left, fixture.rightSnapshot);
  expect(publicationEvidence(fixture.leftSnapshot.databasePath).holds)
    .toEqual([{ member_id: 'desktop-c' }]);
  await fixture.left.invoke('collect_content');
  expect(await fs.readFile(path.join(path.dirname(path.dirname(fixture.leftSnapshot.databasePath)),
    LIBRARY_ASSETS_DIRNAME, original.storageKey)))
    .toEqual(originalBytes);
  const restarted = await fixture.restartLeft();
  processes.push(restarted.process);
  await reconnectFixturePeer(restarted.process, third.snapshot);
  const evidence = publicationEvidence(restarted.snapshot.databasePath);
  expect(evidence.holds).toEqual([]);
  expect(evidence.receipts).toEqual(expect.arrayContaining([
    { id: b, receiver_device_id: 'desktop-b' }, { id: c, receiver_device_id: 'desktop-c' }
  ]));
});

it('replays ready staging after receiver restart before apply and persists the original content', async () => {
  const fixture = await createDesktopFramedSyncTwoProcessFixture();
  root = fixture.root;
  processes.push(fixture.left, fixture.right);
  await fixture.left.seed({ content: 'Ready body', nodeId: 't326-ready', title: 'Ready' });
  await fixture.right.invoke('round', { input: { kind: 'pause_before_apply' } });
  await expect(reconnectFixturePeer(fixture.left, fixture.rightSnapshot)).rejects.toThrow('fixture_paused_before_apply');
  const ready = readDesktopFramedSyncLibraryEvidence(fixture.rightSnapshot.databasePath);
  expect(ready.framedSync.inboundStates).toEqual([{ state: 'ready_to_apply' }]);
  expect(ready.nodes).toEqual([]);
  expect(ready.framedSync.receipts).toBe(0);
  const id = z.object({ id: z.string() }).parse(
    publicationEvidence(fixture.leftSnapshot.databasePath).publications[0]).id;
  const restarted = await fixture.restartRight();
  processes.push(restarted.process);
  await reconnectFixturePeer(fixture.left, restarted.snapshot);
  const applied = readDesktopFramedSyncLibraryEvidence(restarted.snapshot.databasePath);
  expect(publicationEvidence(restarted.snapshot.databasePath).receipts)
    .toContainEqual({ id, receiver_device_id: 'desktop-b' });
  expect(applied.versions).toContainEqual(expect.objectContaining({ body_text: 'Ready body' }));
});

it('keeps the receiver edit made before apply and records both branches durably', async () => {
  const fixture = await createDesktopFramedSyncTwoProcessFixture();
  root = fixture.root;
  processes.push(fixture.left, fixture.right);
  const nodeId = 't326-before-apply-edit';
  await fixture.left.seed({ content: 'Common body', nodeId, title: 'Common' });
  await reconnectFixturePeer(fixture.left, fixture.rightSnapshot);
  await fixture.left.seed({ content: 'Sender branch', nodeId, title: 'Sender branch' });
  const id = await publishFixtureDelivery(fixture.left, fixture.rightSnapshot, 'publication');
  await fixture.right.seed({ content: 'Receiver branch', nodeId, title: 'Receiver branch' });
  await reconnectFixturePeer(fixture.left, fixture.rightSnapshot);
  const receiver = readDesktopFramedSyncLibraryEvidence(fixture.rightSnapshot.databasePath);
  expect(receiver.versions).toEqual(expect.arrayContaining([
    expect.objectContaining({ body_text: 'Receiver branch' }),
    expect.objectContaining({ body_text: 'Sender branch' })
  ]));
  expect(receiver.nodes).toContainEqual(expect.objectContaining({ title: 'Receiver branch' }));
  expect(publicationEvidence(fixture.leftSnapshot.databasePath).receipts)
    .toContainEqual({ id, receiver_device_id: 'desktop-b' });
});

it('drains the responder publication when its peer initiates an unchanged inventory round', async () => {
  const fixture = await createDesktopFramedSyncTwoProcessFixture();
  root = fixture.root;
  processes.push(fixture.left, fixture.right);
  await fixture.left.seed({ content: 'Responder body', nodeId: 't326-responder', title: 'Responder' });
  const proxy = await createDesktopFramedSyncFaultProxy({
    fault: 'drop_receipt_response', targetOrigin: fixture.rightSnapshot.origin
  });
  try { await expect(fixture.left.synchronize(proxy.origin)).rejects.toThrow(); }
  finally { await proxy.close(); }
  // Remember the current discovered route without supplying a transfer ID.
  await fixture.left.invoke('round', { input: { kind: 'remember_peer', peerOrigin: fixture.rightSnapshot.origin,
    peer: { deviceId: 'desktop-b', libraryEpoch: 'desktop-b-epoch' } } });
  await reconnectFixturePeer(fixture.right, fixture.leftSnapshot);
  expect(publicationEvidence(fixture.leftSnapshot.databasePath).holds).toEqual([]);
  expect(publicationEvidence(fixture.leftSnapshot.databasePath).receipts)
    .toContainEqual(expect.objectContaining({ receiver_device_id: 'desktop-b' }));
});
