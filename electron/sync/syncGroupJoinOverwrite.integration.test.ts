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

async function port() {
  const server = net.createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as net.AddressInfo;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return address.port;
}

async function setup(registerMembers = true) {
  await fs.mkdir('.tmp/artifacts/sync-join', { recursive: true });
  root = await fs.mkdtemp(path.resolve('.tmp/artifacts/sync-join/overwrite-'));
  await fs.symlink(path.resolve('node_modules'), path.join(root, 'node_modules'), 'dir');
  const script = path.join(root, 'fixture.mjs');
  await buildRestoreFixture(script);
  const groupId = `group-${randomUUID()}`;
  const peers = [];
  for (const name of ['Source', 'Provider', 'Offline']) {
    const worker = startRestoreFixture(script, path.join(root, name), await port());
    workers.push(worker);
    peers.push(await worker.send('init', { groupId, name }));
  }
  for (const worker of registerMembers ? workers : []) await worker.send('register', {
    members: peers.map((peer, i) => ({ device: peer.device, name: ['Source', 'Provider', 'Offline'][i] }))
  });
  return { script, peers, groupId };
}

async function sync(worker: (typeof workers)[number], peer: Awaited<ReturnType<typeof setup>>['peers'][number]) {
  await worker.send('sync', { ...peer }).catch((error: Error) => {
    if (!error.message.includes('sync_group_sync_incomplete')) throw error;
  });
  await worker.send('sync', { ...peer });
}

it('preserves restore data while another asynchronous database transaction is active', async () => {
  const { groupId } = await setup(false);
  expect(await workers[0]!.send('preserveConcurrent', { groupId })).toBe(true);
}, 90000);

it('supplies an overwrite to the approving device without prior local membership records', async () => {
  const { peers } = await setup(false);
  const [source, provider] = workers;
  await source!.send('seed', { id: 'local-note', content: 'Fresh source data' });
  await provider!.send('seed', { id: 'remote-note', content: 'Provider data' });
  await source!.send('leave');
  await provider!.send('joinProviderEnable', { anchor: true });
  const request = await source!.send('joinRequest', { origin: peers[1]!.origin, mode: 'overwrite' }) as unknown as {
    join_request: { request_id: string }
  };
  await provider!.send('joinAccept', { requestId: request.join_request.request_id });
  await source!.send('joinComplete');
  await sync(provider!, peers[0]!);
  const received = await provider!.send('reopen');
  expect(received.library.nodesById['remote-note']).toBeUndefined();
  expect(received.library.nodesById['local-note']?.content).toBe('Fresh source data');
}, 90000);

for (const mode of ['overwrite']) {
  it(`${mode} join overwrites the whole group despite retained history`, async () => {
    const { peers, groupId, script } = await setup();
    const [source, provider, offline] = workers;
    await source!.send('seed', { id: 'local-note', content: 'Local chosen data' });
    const backup = await source!.send('backup');
    await provider!.send('seed', { id: 'remote-note', content: 'Remote historical data' });
    await offline!.send('seed', { id: 'offline-note', content: 'Offline historical data' });
    await source!.send('joinProviderEnable', { anchor: true });
    await provider!.send('joinProviderEnable', { anchor: true });
    await sync(source!, peers[1]!);
    await sync(provider!, peers[0]!);
    const proofs = await provider!.send('proofs') as unknown as Array<{
      device_identity_key: string; proof_revision: number
    }>;
    expect(proofs.find((proof) => proof.device_identity_key === peers[0]!.identity)?.proof_revision)
      .toBeGreaterThan(0);
    expect((await source!.send('snapshot')).library.nodesById['remote-note']).toBeDefined();
    await offline!.close();
    workers.pop();
    await source!.send('leave');
    await source!.send('restoreLocal', { file: backup.destinationPath });
    expect((await source!.send('snapshot')).library.nodesById['remote-note']).toBeUndefined();
    await expect(source!.send('joinRequest', { origin: peers[1]!.origin, mode: 'invalid' })).rejects.toThrow('sync_group_join_mode_required');
    const refused = await source!.send('joinRequest', { origin: peers[1]!.origin, mode: 'overwrite' }) as unknown as {
      join_request: { request_id: string }
    };
    await provider!.send('joinReject', { requestId: refused.join_request.request_id });
    await expect(source!.send('joinComplete')).rejects.toThrow();
    expect((await source!.send('snapshot')).restore).toBeNull();
    expect((await source!.send('snapshot')).group).toBeUndefined();
    const request = await source!.send('joinRequest', { origin: peers[1]!.origin, mode: 'overwrite' }) as unknown as {
      join_request: { request_id: string }
    };
    await provider!.send('joinAccept', { requestId: request.join_request.request_id });
    await source!.send('joinComplete');
    await sync(provider!, peers[0]!);
    await expect.poll(async () => (await provider!.send('snapshot')).library.nodesById['remote-note'],
      { timeout: 20000 }).toBeUndefined();
    const local = await source!.send('reopen');
    const received = await provider!.send('reopen');
    expect(local.restore!.event.source_device_identity_key).toBe(peers[0]!.identity);
    expect(received.restore!.event.restore_id).toBe(local.restore!.event.restore_id);
    expect(received.library.nodesById['local-note']?.content).toBe('Local chosen data');
    expect(local.library.nodesById['remote-note']).toBeUndefined();
    await source!.send('enable');
    await assertOfflineCatchup(script, groupId, peers[0]!, local.restore!.event.restore_id);
    await provider!.send('enable');
    await provider!.send('seed', { id: 'after-overwrite', content: 'Normal sync afterwards' });
    await sync(source!, peers[1]!);
    expect((await source!.send('reopen')).library.nodesById['after-overwrite']?.content).toBe('Normal sync afterwards');
    const safety = await provider!.send('safety') as unknown as Array<{ nodes: Array<{ id: string }> }>;
    expect(safety.some((entry) => entry.nodes.some((node) => node.id === 'remote-note'))).toBe(true);
  }, 90000);
}

it.each([false, true])('uses group data to replace local data with an empty provider: %s', async (emptyProvider) => {
  const { peers } = await setup(false);
  const [source, provider] = workers;
  await source!.send('seed', { id: 'local-note', content: 'Local data' });
  if (!emptyProvider) await provider!.send('seed', { id: 'remote-note', content: 'Independent data' });
  await source!.send('leave');
  await provider!.send('joinProviderEnable', { anchor: true });
  await expect.poll(async () => {
    const overview = await provider!.send('joinOverview') as unknown as { server_status: { topology_role: string } };
    return overview.server_status.topology_role;
  }, { timeout: 15000 }).toBe('anchor');
  const request = await source!.send('joinRequest', { origin: peers[1]!.origin, mode: 'use-group' }) as unknown as {
    join_request: { request_id: string }
  };
  await provider!.send('joinAccept', { requestId: request.join_request.request_id });
  await source!.send('joinComplete');
  await sync(source!, peers[1]!);
  await sync(provider!, peers[0]!);
  const local = await source!.send('reopen');
  const remote = await provider!.send('reopen');
  expect(local.restore).toBeNull();
  expect(remote.restore).toBeNull();
  for (const state of [local, remote]) {
    expect(state.library.nodesById['local-note']).toBeUndefined();
    if (!emptyProvider) expect(state.library.nodesById['remote-note']?.content).toBe('Independent data');
  }
}, 90000);

async function assertOfflineCatchup(script: string, groupId: string, peer: Awaited<ReturnType<ReturnType<typeof startRestoreFixture>['send']>>, restoreId: string) {
  const returning = startRestoreFixture(script, path.join(root, 'Offline'), await port());
  workers.push(returning);
  await returning.send('init', { groupId, name: 'Offline' });
  await returning.send('enable');
  await sync(returning, peer);
  const caughtUp = await returning.send('reopen');
  expect(caughtUp.library.nodesById['offline-note']).toBeUndefined();
  expect(caughtUp.library.nodesById['local-note']?.content).toBe('Local chosen data');
  expect(caughtUp.restore!.event.restore_id).toBe(restoreId);
}
