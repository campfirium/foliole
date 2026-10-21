// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import { afterEach, expect, it } from 'vitest';

import { buildRestoreFixture, startRestoreFixture } from './backupRestoreSyncGroup.testSupport.js';

let root = '';
const workers: ReturnType<typeof startRestoreFixture>[] = [];
afterEach(async ({ task }) => {
  const active = workers.splice(0);
  await Promise.allSettled(active.map((worker) => worker.close()));
  if (!root) return;
  if (task.result?.state === 'fail') {
    const diagnostics = active.map((worker, index) =>
      `Process ${index + 1}\n${worker.diagnostics()}`).join('\n');
    await fs.writeFile(path.join(root, 'processes.log'), diagnostics);
    console.info('Failed local adoption fixture:', root, diagnostics);
  } else await fs.rm(root, { recursive: true, force: true });
});

async function freePort() {
  const server = net.createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as net.AddressInfo).port;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

async function setup(leave = true) {
  await fs.mkdir('.tmp/artifacts/t319', { recursive: true });
  root = await fs.mkdtemp(path.resolve('.tmp/artifacts/t319/instances-'));
  await fs.symlink(path.resolve('node_modules'), path.join(root, 'node_modules'), 'dir');
  const script = path.join(root, 'fixture.mjs');
  await buildRestoreFixture(script);
  const groupId = `group-${randomUUID()}`;
  const peers = [];
  for (const name of ['Applicant', 'Provider', 'Other']) {
    const worker = startRestoreFixture(script, path.join(root, name), await freePort());
    workers.push(worker);
    peers.push(await worker.send('init', { groupId, name }));
  }
  if (leave) await workers[0]!.send('leave');
  await workers[1]!.send('joinProviderEnable');
  return peers;
}

async function sync(worker: (typeof workers)[number], peer: Awaited<ReturnType<typeof setup>>[number]) {
  await worker.send('sync', { ...peer }).catch((error: Error) => {
    if (!error.message.includes('sync_group_sync_incomplete')) throw error;
  });
  await worker.send('sync', { ...peer });
}

async function completeJoin(worker: (typeof workers)[number], firstAction = 'joinComplete') {
  const deadline = Date.now() + 15_000;
  let pending = 0;
  let action = firstAction;
  // The desktop join UI continues completion every second while synchronization remains pending.
  for (;;) {
    try { await worker.send(action); return pending; }
    catch (error) {
      if (!(error instanceof Error) ||
          error.message.split('\n', 1)[0] !== `${action}: Error: sync_group_sync_incomplete` ||
          Date.now() >= deadline) throw error;
    }
    pending++;
    action = 'joinComplete';
    await delay(1_000);
  }
}

it('continues ordinary UUID sync with a previously synchronized offline member after local adoption', { meta: { calibratedMs: 90000 } }, async () => {
  const peers = await setup(false);
  const [applicant, provider, other] = workers;
  for (const worker of workers) await worker.send('register', {
    members: peers.map((peer, index) => ({ device: peer.device, name: `Member ${index}` }))
  });
  await other!.send('joinProviderEnable');
  await applicant!.send('seed', { id: 'prior-shared', content: 'Prior shared data' });
  await sync(applicant!, peers[2]!).catch((error: Error) => { throw new Error(`before adoption: ${error.message}`); });
  const proofs = await other!.send('proofs') as unknown as { device_identity_key: string }[];
  expect(proofs.some((proof) => proof.device_identity_key === peers[0]!.identity)).toBe(true);
  await applicant!.send('leave');
  await provider!.send('seed', { id: 'group-source', content: 'Group data' });
  const request = await applicant!.send('joinRequest', { origin: peers[1]!.origin, mode: 'use-group' }) as unknown as {
    join_request: { request_id: string }
  };
  await provider!.send('joinAccept', { requestId: request.join_request.request_id });
  expect(await completeJoin(applicant!, 'joinBusy')).toBeGreaterThanOrEqual(1);
  await other!.send('seed', { id: 'offline-created', content: 'Offline data' });
  await sync(applicant!, peers[2]!).catch((error: Error) => { throw new Error(`after adoption: ${error.message}`); });
  for (const worker of [applicant!, other!]) {
    const state = await worker.send('reopen');
    expect(state.library.nodesById['offline-created']?.content).toBe('Offline data');
    expect(state.library.nodesById['group-source']?.content).toBe('Group data');
    expect(state.restore).toBeNull();
  }
});

for (const mode of ['use-group']) {
  it(`${mode} joins by UUID without publishing an applicant restore`, { meta: { calibratedMs: 90000 } }, async () => {
    const peers = await setup();
    const [applicant, provider, other] = workers;
    const localId = randomUUID();
    const remoteId = 'ffffffff-ffff-4fff-bfff-ffffffffffff';
    const childId = '00000000-0000-4000-8000-000000000001';
    const localChildId = '00000000-0000-4000-8000-000000000002';
    await applicant!.send('seed', { id: localId, content: 'Identical article text' });
    await applicant!.send('seed', { id: localChildId, parentId: localId, content: 'Local child article' });
    await provider!.send('seed', { id: remoteId, content: 'Identical article text' });
    await provider!.send('seed', { id: childId, parentId: remoteId, content: 'Child article' });
    await other!.send('seed', { id: 'other-original', content: 'Other member data' });
    const request = await applicant!.send('joinRequest', { origin: peers[1]!.origin, mode }) as unknown as {
      join_request: { request_id: string }
    };
    await provider!.send('joinAccept', { requestId: request.join_request.request_id });
    await completeJoin(applicant!);
    await applicant!.send('sync', { ...peers[1]! }).catch((error: Error) => {
      if (!error.message.includes('sync_group_sync_incomplete')) throw error;
    });
    await applicant!.send('sync', { ...peers[1]! });
    const local = await applicant!.send('reopen');
    const remote = await provider!.send('reopen');
    expect(local.library.nodesById[remoteId]?.content).toBe('Identical article text');
    expect(remote.library.nodesById[remoteId]?.content).toBe('Identical article text');
    expect(local.library.nodesById[childId]?.content).toBe('Child article');
    expect(Boolean(local.library.nodesById[localId])).toBe(false);
    expect(Boolean(remote.library.nodesById[localId])).toBe(false);
    expect(Boolean(local.library.nodesById[localChildId])).toBe(false);
    expect(Boolean(remote.library.nodesById[localChildId])).toBe(false);
    expect(local.restore).toBeNull();
    expect(remote.restore).toBeNull();
    expect((await other!.send('reopen')).library.nodesById['other-original']?.content).toBe('Other member data');
  });
}

it('accepts repeated completion after a background round has already completed local adoption', { meta: { calibratedMs: 90000 } }, async () => {
  const peers = await setup();
  const [applicant, provider] = workers;
  await expect(applicant!.send('joinComplete')).rejects.toThrow('sync_group_join_not_pending');
  await applicant!.send('seed', { id: 'local-before', content: 'Local data' });
  await provider!.send('seed', { id: 'group-source', content: 'Group data' });
  const request = await applicant!.send('joinRequest', { origin: peers[1]!.origin, mode: 'use-group' }) as unknown as {
    join_request: { request_id: string }
  };
  await provider!.send('joinAccept', { requestId: request.join_request.request_id });
  await expect(applicant!.send('joinInterrupt')).rejects.toThrow('test_join_interrupted_after_membership');
  await sync(applicant!, peers[1]!);
  const before = await applicant!.send('snapshot');
  expect(before.library.nodesById['group-source']?.content).toBe('Group data');
  expect(before.library.nodesById['local-before']).toBeUndefined();
  await expect(applicant!.send('joinComplete')).resolves.toMatchObject({
    sync_group: { group_id: peers[1]!.device.group_id }
  });
  const reopened = await applicant!.send('reopen');
  expect(reopened.library.nodesById).toEqual(before.library.nodesById);
  expect(reopened.restore).toBeNull();
  expect((await provider!.send('snapshot')).library.nodesById['local-before']).toBeUndefined();
});

it('resumes local adoption after interruption and database reopening without publishing old data', { meta: { calibratedMs: 90000 } }, async () => {
  const peers = await setup();
  const [applicant, provider] = workers;
  await applicant!.send('seed', { id: 'local-before', content: 'Local data' });
  await provider!.send('seed', { id: 'group-source', content: 'Group data' });
  const request = await applicant!.send('joinRequest', { origin: peers[1]!.origin, mode: 'use-group' }) as unknown as {
    join_request: { request_id: string }
  };
  await provider!.send('joinAccept', { requestId: request.join_request.request_id });
  await expect(applicant!.send('joinInterrupt')).rejects.toThrow('test_join_interrupted_after_membership');
  const interrupted = await applicant!.send('reopen');
  expect(interrupted.library.nodesById['local-before']?.content).toBe('Local data');
  expect(interrupted.library.nodesById['group-source']).toBeUndefined();
  expect((await provider!.send('snapshot')).library.nodesById['local-before']).toBeUndefined();
  await applicant!.send('windowEvents');
  await completeJoin(applicant!);
  const events = await applicant!.send('windowEvents') as unknown as Array<{
    channel: string; payload: { appliedNodeIds?: string[] }
  }>;
  const notified = events.filter((event) => event.channel === 'foliole:workspace-sync-applied')
    .flatMap((event) => event.payload.appliedNodeIds ?? []);
  expect(notified).toEqual(expect.arrayContaining(['local-before', 'group-source']));
  const completed = await applicant!.send('reopen');
  expect(completed.library.nodesById['local-before']).toBeUndefined();
  expect(completed.library.nodesById['group-source']?.content).toBe('Group data');
  expect(completed.restore).toBeNull();
  expect((await provider!.send('reopen')).library.nodesById['local-before']).toBeUndefined();
});
