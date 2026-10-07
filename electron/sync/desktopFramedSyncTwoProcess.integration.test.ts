// @vitest-environment node
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { afterEach, expect, it } from 'vitest';

import { postDesktopFramedSync } from './desktopFramedSyncHttp.js';
import {
  encryptProtocolFrame,
  manifestToWire,
  newTransferAttempt,
  processFrameStream,
  TRANSFER_FRAME_TYPES
} from './desktopFramedSyncProcessWire.js';
import { framedSyncEncodedLength, framedSyncEncodedSha256 } from './desktopFramedSyncStream.js';
import {
  createDesktopFramedSyncTwoProcessFixture,
  type DesktopFramedSyncFixtureProcess
} from './desktopFramedSyncTwoProcess.testSupport.js';
import { readDesktopFramedSyncLibraryEvidence } from './desktopFramedSyncTwoProcessEvidence.js';

let root = '';
const processes: DesktopFramedSyncFixtureProcess[] = [];

afterEach(async ({ task }) => {
  const active = processes.splice(0);
  await Promise.allSettled(active.map((process) => process.close()));
  if (!root) return;
  if (task.result?.state === 'fail') {
    const diagnostics = active.map((process, index) =>
      `Process ${index + 1}\n${process.diagnostics()}`).join('\n');
    await fs.writeFile(`${root}/processes.log`, diagnostics);
    console.info('Failed framed-sync two-process fixture:', root);
  } else {
    await fs.rm(root, { force: true, recursive: true });
  }
  root = '';
});

async function setup() {
  const fixture = await createDesktopFramedSyncTwoProcessFixture();
  root = fixture.root;
  processes.push(fixture.left, fixture.right);
  return fixture;
}

it('owns two independent Electron Node processes, HTTP ports, and SQLite libraries', async () => {
  const fixture = await setup();
  expect(fixture.leftSnapshot.pid).not.toBe(fixture.rightSnapshot.pid);
  expect(fixture.leftSnapshot.origin).not.toBe(fixture.rightSnapshot.origin);
  expect(fixture.leftSnapshot.databasePath).not.toBe(fixture.rightSnapshot.databasePath);
  const health = await Promise.all([
    fetch(`${fixture.leftSnapshot.origin}/health`).then((response) => response.json()),
    fetch(`${fixture.rightSnapshot.origin}/health`).then((response) => response.json())
  ]);
  expect(health).toEqual([
    { deviceId: 'desktop-a', pid: fixture.leftSnapshot.pid },
    { deviceId: 'desktop-b', pid: fixture.rightSnapshot.pid }
  ]);
  await fixture.left.seed({
    content: 'Body from desktop A',
    nodeId: 't326-one-object',
    title: 'One object'
  });
  expect(readDesktopFramedSyncLibraryEvidence(fixture.leftSnapshot.databasePath)).toMatchObject({
    journalMode: 'wal',
    nodes: [{ content: '', id: 't326-one-object', title: 'One object' }],
    versions: [expect.objectContaining({
      body_text: 'Body from desktop A',
      object_id: 't326-one-object'
    })]
  });
  expect(readDesktopFramedSyncLibraryEvidence(fixture.rightSnapshot.databasePath)).toMatchObject({
    journalMode: 'wal',
    nodes: []
  });
});

it('moves one object and version body through the production framed-sync process port', async () => {
  const fixture = await setup();
  await fixture.left.seed({
    content: 'Body from desktop A',
    nodeId: 't326-one-object',
    title: 'One object'
  });
  await fixture.left.synchronize(fixture.rightSnapshot.origin);
  const sent = readDesktopFramedSyncLibraryEvidence(fixture.leftSnapshot.databasePath);
  const received = readDesktopFramedSyncLibraryEvidence(fixture.rightSnapshot.databasePath);
  expect(sent.framedSync).toEqual({
    availableBlobs: 0,
    availableResources: 0,
    inboundFacts: 0,
    inboundFrames: 0,
    inboundStates: [],
    outboundFrames: 0,
    outboundHolds: 0,
    outboundStates: [{ state: 'receipt_committed' }],
    receipts: 1,
    resourceChunks: 0
  });
  expect(received.framedSync).toEqual({
    availableBlobs: 0,
    availableResources: 0,
    inboundFacts: 0,
    inboundFrames: 0,
    inboundStates: [{ state: 'applied' }],
    outboundFrames: 1,
    outboundHolds: 0,
    outboundStates: [],
    receipts: 1,
    resourceChunks: 0
  });
  expect(received.nodes).toEqual([
    expect.objectContaining({ content: '', id: 't326-one-object', title: 'One object' })
  ]);
  expect(received.versions).toEqual([
    expect.objectContaining({ body_text: 'Body from desktop A', object_id: 't326-one-object' })
  ]);
  expect(sent.versions).toEqual(received.versions);
  const receivedNode = received.nodes[0] as { current_version_id: string };
  const receivedVersion = received.versions[0] as { version_id: string };
  expect(receivedNode.current_version_id).toBe(receivedVersion.version_id);
  const restarted = await fixture.restartRight();
  processes.push(restarted.process);
  await fixture.left.synchronize(restarted.snapshot.origin);
  expect(readDesktopFramedSyncLibraryEvidence(fixture.leftSnapshot.databasePath).framedSync)
    .toMatchObject({ outboundFrames: 0, outboundHolds: 0, receipts: 1 });
  const reopened = readDesktopFramedSyncLibraryEvidence(restarted.snapshot.databasePath);
  expect(reopened.framedSync).toMatchObject({ inboundFrames: 0, outboundFrames: 1, receipts: 1 });
  expect(reopened.nodes).toEqual(received.nodes);
  expect(reopened.versions).toEqual(received.versions);
});

it('streams a Node image into the receiver Assets store before committing its receipt', async () => {
  const fixture = await setup();
  const bytes = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.alloc(1024 * 1024 + 37, 0x51)
  ]);
  const seeded = await fixture.left.seedResource({
    bytes,
    nodeId: 't326-binary-resource'
  });

  await fixture.left.synchronize(fixture.rightSnapshot.origin, 't326-binary-resource');

  const target = path.join(fixture.rightSnapshot.stateRoot, 'documents', 'Foliole', 'Assets',
    seeded.storageKey);
  await expect(fs.readFile(target)).resolves.toEqual(bytes);
  const received = readDesktopFramedSyncLibraryEvidence(fixture.rightSnapshot.databasePath);
  expect(received.nodes).toEqual([expect.objectContaining({
    id: 't326-binary-resource',
    resource_references: expect.stringContaining(seeded.storageKey)
  })]);
  expect(received.framedSync).toMatchObject({
    availableResources: 0,
    receipts: 1,
    resourceChunks: 0
  });
  expect(await fs.readdir(path.dirname(target))).toEqual([seeded.storageKey]);
  const restarted = await fixture.restartRight();
  processes.push(restarted.process);
  await expect(fs.readFile(target)).resolves.toEqual(bytes);
  expect(readDesktopFramedSyncLibraryEvidence(restarted.snapshot.databasePath).nodes).toEqual(received.nodes);
});

it('rejects an unauthenticated framed-sync request before staging any bytes', async () => {
  const fixture = await setup();
  const url = new URL('/companion/framed-sync', fixture.rightSnapshot.origin);
  url.searchParams.set('initiator_device_id', 'desktop-a');
  url.searchParams.set('initiator_library_epoch', 'desktop-a-epoch');
  url.searchParams.set('responder_device_id', 'desktop-b');
  url.searchParams.set('responder_library_epoch', 'desktop-b-epoch');
  const response = await fetch(url, {
    body: new Uint8Array(),
    headers: {
      'content-type': 'application/vnd.foliole.framed-sync',
      'x-sync-group-id': 't326-group'
    },
    method: 'POST'
  });
  expect(response.status).toBe(401);
  expect(await response.json()).toEqual({ error: 'missing_headers' });
  expect(readDesktopFramedSyncLibraryEvidence(fixture.rightSnapshot.databasePath).framedSync)
    .toMatchObject({ inboundFacts: 0, inboundFrames: 0, inboundStates: [], receipts: 0 });
});

it('rejects a non-canonical transfer identity before staging its authenticated header', async () => {
  const fixture = await setup();
  const tamperedTransferId = new Uint8Array(32).fill(1);
  const contentId = new Uint8Array(32).fill(3);
  const attempt = newTransferAttempt(tamperedTransferId);
  const secret = Buffer.alloc(32, 7).toString('base64url');
  const frame = await encryptProtocolFrame({
    attempt,
    frameType: TRANSFER_FRAME_TYPES.transferHeader,
    groupKey: new Uint8Array(Buffer.from(secret, 'base64url')),
    payload: {
      attemptId: attempt.attemptId,
      manifest: manifestToWire({ blobs: [], facts: [] }, 't326-group', contentId),
      transferId: tamperedTransferId
    },
    payloadCase: 'transfer_header',
    sequence: 0n,
    transferId: tamperedTransferId
  });
  await expect(postDesktopFramedSync({
    body: {
      bodySha256: framedSyncEncodedSha256(attempt.preamble, [frame]),
      contentLength: framedSyncEncodedLength(attempt.preamble, [frame]),
      frames: processFrameStream([frame]),
      preamble: attempt.preamble
    },
    endpointUrl: fixture.rightSnapshot.origin,
    groupId: 't326-group',
    localDeviceId: 'desktop-a',
    localLibraryEpoch: 'desktop-a-epoch',
    pathWithQuery: '/companion/framed-sync',
    remoteDeviceId: 'desktop-b',
    remoteLibraryEpoch: 'desktop-b-epoch',
    secret
  })).rejects.toThrow('framed_sync_http_400');
  expect(readDesktopFramedSyncLibraryEvidence(fixture.rightSnapshot.databasePath).framedSync)
    .toMatchObject({
      availableBlobs: 0,
      inboundFacts: 0,
      inboundFrames: 0,
      inboundStates: [],
      outboundFrames: 0,
      receipts: 0
    });
});
