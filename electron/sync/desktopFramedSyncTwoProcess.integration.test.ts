// @vitest-environment node
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { afterEach, expect, it } from 'vitest';

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
  const fixture = await createDesktopFramedSyncTwoProcessFixture(undefined, true, true);
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
    { deviceId: fixture.leftSnapshot.deviceId, pid: fixture.leftSnapshot.pid },
    { deviceId: fixture.rightSnapshot.deviceId, pid: fixture.rightSnapshot.pid }
  ]);
  await fixture.left.seed({
    content: 'Body from desktop A',
    nodeId: 't326-one-object',
    title: 'One object'
  });
  expect(readDesktopFramedSyncLibraryEvidence(fixture.leftSnapshot.databasePath)).toMatchObject({
    journalMode: 'wal',
    nodes: [{ content: 'Body from desktop A', id: 't326-one-object', title: 'One object' }],
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

it('moves exact full body bytes through a request round and preserves them after restart', async () => {
  const fixture = await setup();
  const prefix = '\uFEFFBody from desktop A 🌿\r\n';
  const content = prefix + 'a'.repeat(1_048_576 - Buffer.byteLength(prefix));
  await fixture.left.seed({
    content,
    nodeId: 't326-one-object',
    title: 'One object'
  });
  await fixture.left.synchronize(fixture.rightSnapshot.origin);
  const sent = readDesktopFramedSyncLibraryEvidence(fixture.leftSnapshot.databasePath);
  const received = readDesktopFramedSyncLibraryEvidence(fixture.rightSnapshot.databasePath);
  expect(received.nodes).toEqual([
    expect.objectContaining({ content, id: 't326-one-object', title: 'One object' })
  ]);
  expect(received.versions).toEqual([
    expect.objectContaining({ body_text: content, object_id: 't326-one-object' })
  ]);
  expect(sent.versions).toEqual(received.versions);
  const receivedNode = received.nodes[0] as { current_version_id: string };
  const receivedVersion = received.versions[0] as { version_id: string };
  expect(receivedNode.current_version_id).toBe(receivedVersion.version_id);
  const restarted = await fixture.restartRight();
  processes.push(restarted.process);
  await fixture.left.synchronize(restarted.snapshot.origin);
  const reopened = readDesktopFramedSyncLibraryEvidence(restarted.snapshot.databasePath);
  expect(reopened.nodes).toEqual(received.nodes);
  expect(reopened.versions).toEqual(received.versions);
});

it('commits the Node independently and fills its image in the ordinary resource phase', { meta: { calibratedMs: 60_000 } }, async () => {
  const fixture = await setup();
  const bytes = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.alloc(1024 * 1024 + 37, 0x51)
  ]);
  const seeded = await fixture.left.seedResource({
    bytes,
    includeImageInBody: true,
    nodeId: 't326-binary-resource'
  });

  const source = path.join(fixture.leftSnapshot.stateRoot, 'documents', 'Foliole', 'Assets', seeded.storageKey);
  const unavailable = path.join(root, 'unavailable-image');
  await fs.rename(source, unavailable);
  await expect(fixture.left.synchronize(fixture.rightSnapshot.origin)).resolves.toMatchObject({ complete: false });

  const target = path.join(fixture.rightSnapshot.stateRoot, 'documents', 'Foliole', 'Assets',
    seeded.storageKey);
  await expect(fs.readFile(target)).rejects.toMatchObject({ code: 'ENOENT' });
  const received = readDesktopFramedSyncLibraryEvidence(fixture.rightSnapshot.databasePath);
  expect(received.nodes).toEqual([expect.objectContaining({
    id: 't326-binary-resource',
    resource_references: expect.stringContaining(seeded.storageKey)
  })]);
  await fs.rename(unavailable, source);
  await expect(fixture.left.synchronize(fixture.rightSnapshot.origin)).resolves.toMatchObject({ complete: true });
  await expect(fs.readFile(target)).resolves.toEqual(bytes);
  expect(await fs.readdir(path.dirname(target))).toEqual([seeded.storageKey]);
  const restarted = await fixture.restartRight();
  processes.push(restarted.process);
  await expect(fs.readFile(target)).resolves.toEqual(bytes);
  expect(readDesktopFramedSyncLibraryEvidence(restarted.snapshot.databasePath).nodes).toEqual(received.nodes);
});

it('rejects an unauthenticated current request without changing business state', async () => {
  const fixture = await setup();
  const before = readDesktopFramedSyncLibraryEvidence(fixture.rightSnapshot.databasePath);
  const url = new URL('/companion/framed-sync?request=inventory&peer_round_id=12345678-1234-4234-8234-123456789abc&peer_round_mode=single', fixture.rightSnapshot.origin);
  url.searchParams.set('initiator_device_id', fixture.leftSnapshot.deviceId);
  url.searchParams.set('initiator_library_epoch', `${fixture.leftSnapshot.deviceId}-epoch`);
  url.searchParams.set('responder_device_id', fixture.rightSnapshot.deviceId);
  url.searchParams.set('responder_library_epoch', `${fixture.rightSnapshot.deviceId}-epoch`);
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
  expect(readDesktopFramedSyncLibraryEvidence(fixture.rightSnapshot.databasePath)).toEqual(before);
});
