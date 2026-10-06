// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import net from 'node:net';
import path from 'node:path';

import { afterEach, expect, it } from 'vitest';

import { buildRestoreFixture, startRestoreFixture } from './backupRestoreSyncGroup.testSupport.js';

let root = '';
const workers: ReturnType<typeof startRestoreFixture>[] = [];
afterEach(async () => {
  await Promise.allSettled(workers.splice(0).map((worker) => worker.close()));
  if (root) await fs.rm(root, { recursive: true, force: true });
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
  await workers[1]!.send('joinProviderEnable', { anchor: true });
  return peers;
}

async function sync(worker: (typeof workers)[number], peer: Awaited<ReturnType<typeof setup>>[number]) {
  await worker.send('sync', { ...peer }).catch((error: Error) => {
    if (!error.message.includes('sync_group_sync_incomplete')) throw error;
  });
  await worker.send('sync', { ...peer });
}

it('continues ordinary UUID sync with a previously synchronized offline member after local adoption', async () => {
  const peers = await setup(false);
  const [applicant, provider, other] = workers;
  for (const worker of workers) await worker.send('register', {
    members: peers.map((peer, index) => ({ device: peer.device, name: `Member ${index}` }))
  });
  await other!.send('joinProviderEnable', { anchor: true });
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
  await applicant!.send('joinComplete');
  await other!.send('seed', { id: 'offline-created', content: 'Offline data' });
  await sync(applicant!, peers[2]!).catch((error: Error) => { throw new Error(`after adoption: ${error.message}`); });
  for (const worker of [applicant!, other!]) {
    const state = await worker.send('reopen');
    expect(state.library.nodesById['offline-created']?.content).toBe('Offline data');
    expect(state.library.nodesById['group-source']?.content).toBe('Group data');
    expect(state.restore).toBeNull();
  }
}, 90000);

for (const mode of ['use-group']) {
  it(`${mode} joins by UUID without publishing an applicant restore`, async () => {
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
    await applicant!.send('joinComplete');
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
  }, 90000);
}

it('resumes local adoption after interruption and database reopening without publishing old data', async () => {
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
  await applicant!.send('joinComplete');
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
}, 90000);
