// @vitest-environment node
import { promises as fs } from 'node:fs';

import { afterEach, expect, it } from 'vitest';

import {
  createDesktopFramedSyncTwoProcessFixture,
  type DesktopFramedSyncFixtureProcess,
  readDesktopFramedSyncLibraryEvidence
} from './desktopFramedSyncTwoProcess.testSupport.js';
import { requestProcessEvidence, requestProcessFaultProxy } from './requestSyncProcessRecovery.testSupport.js';

type Closeable = Readonly<{ close(): Promise<void> }>;
let root = '';
const closeables: Closeable[] = [];
const processes: DesktopFramedSyncFixtureProcess[] = [];

afterEach(async ({ task }) => {
  await Promise.allSettled(closeables.splice(0).map((value) => value.close()));
  const active = processes.splice(0);
  await Promise.allSettled(active.map((process) => process.close()));
  if (!root) return;
  if (task.result?.state === 'fail') {
    const diagnostics = active.map((process, index) =>
      `Process ${index + 1}\n${process.diagnostics()}`).join('\n');
    await fs.writeFile(`${root}/recovery-processes.log`, diagnostics);
    console.info('Failed framed-sync recovery fixture:', root);
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

it('rejects a tampered signed HTTP object before business writes, then retries', async () => {
  const fixture = await setup();
  const nodeId = 't326-attempt-recovery';
  const content = 'Body recovered after an invalid attempt';
  await fixture.left.seed({ content, nodeId, title: 'Attempt recovery' });
  const before = requestProcessEvidence(fixture.rightSnapshot.databasePath, nodeId);
  const proxy = await requestProcessFaultProxy(fixture.rightSnapshot.origin, 'corrupt_body');
  closeables.push(proxy);
  await expect(fixture.left.synchronize(proxy.origin, nodeId)).rejects.toThrow();
  expect(proxy.injected()).toBeGreaterThan(0);
  expect(requestProcessEvidence(fixture.rightSnapshot.databasePath, nodeId)).toEqual(before);
  expect(readDesktopFramedSyncLibraryEvidence(fixture.rightSnapshot.databasePath)).toMatchObject({
    nodes: [], versions: []
  });
  await fixture.left.synchronize(fixture.rightSnapshot.origin, nodeId);
  const recovered = readDesktopFramedSyncLibraryEvidence(fixture.rightSnapshot.databasePath);
  expect(recovered.nodes).toEqual([expect.objectContaining({ id: nodeId })]);
  expect(recovered.versions).toEqual([expect.objectContaining({ body_text: content, object_id: nodeId })]);
  expect(recovered.versions).toEqual(readDesktopFramedSyncLibraryEvidence(fixture.leftSnapshot.databasePath).versions);
  expect(requestProcessEvidence(fixture.rightSnapshot.databasePath, nodeId).retiredTables).toEqual([]);
});

it('preserves committed facts after its HTTP response is lost and the receiver process restarts', async () => {
  const fixture = await setup();
  const nodeId = 't326-receipt-replay';
  const content = 'Body applied before response loss';
  await fixture.left.seed({ content, nodeId, title: 'Response loss' });
  const proxy = await requestProcessFaultProxy(fixture.rightSnapshot.origin, 'drop_response');
  closeables.push(proxy);
  // The production round retries after response loss and converges from the committed inventory.
  await expect(fixture.left.synchronize(proxy.origin, nodeId)).resolves.toMatchObject({ complete: true });
  expect(proxy.injected()).toBeGreaterThan(0);
  const applied = readDesktopFramedSyncLibraryEvidence(fixture.rightSnapshot.databasePath);
  expect(applied.versions).toEqual([expect.objectContaining({ body_text: content, object_id: nodeId })]);
  const facts = requestProcessEvidence(fixture.rightSnapshot.databasePath, nodeId);
  expect(facts.retiredTables).toEqual([]);
  const restarted = await fixture.restartRight();
  processes.push(restarted.process);
  expect(restarted.snapshot.pid).not.toBe(fixture.rightSnapshot.pid);
  expect(requestProcessEvidence(restarted.snapshot.databasePath, nodeId)).toEqual(facts);
  await fixture.left.synchronize(restarted.snapshot.origin, nodeId);
  const received = readDesktopFramedSyncLibraryEvidence(restarted.snapshot.databasePath);
  expect(received.nodes).toEqual(applied.nodes);
  expect(received.versions).toEqual(applied.versions);
  expect(requestProcessEvidence(restarted.snapshot.databasePath, nodeId).parents).toEqual(facts.parents);
  expect(requestProcessEvidence(restarted.snapshot.databasePath, nodeId).retiredTables).toEqual([]);
  expect(requestProcessEvidence(fixture.leftSnapshot.databasePath, nodeId).retiredTables).toEqual([]);
});
