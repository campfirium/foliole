// @vitest-environment node
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import { afterEach, expect, it } from 'vitest';

import { buildRestoreFixture, startRestoreFixture } from './backupRestoreSyncGroup.testSupport.js';

const workers: ReturnType<typeof startRestoreFixture>[] = [];
let root = '';
afterEach(async () => {
  await Promise.allSettled(workers.splice(0).map(worker => worker.close()));
  if (root) await fs.rm(root, { recursive: true, force: true });
});

it('publishes a saved watched path through canonical sync without manual synchronization', { meta: { calibratedMs: 30000 } }, async () => {
  root = await fs.mkdtemp(path.resolve('.tmp/watched-settings-'));
  await fs.symlink(path.resolve('node_modules'), path.join(root, 'node_modules'), 'dir');
  const script = path.join(root, 'fixture.mjs');
  await buildRestoreFixture(script);
  const groupId = `group-${randomUUID()}`;
  const peers = [];
  for (const name of ['Owner', 'Receiver']) {
    const worker = startRestoreFixture(script, path.join(root, name), 0);
    workers.push(worker);
    peers.push(await worker.send('init', { groupId, name }));
  }
  for (const worker of workers) await worker.send('register', {
    members: peers.map((peer, index) => ({ device: peer.device, name: ['Owner', 'Receiver'][index] }))
  });
  const [owner, receiver] = workers;
  const initial = path.join(root, 'initial'), changed = path.join(root, 'changed');
  await fs.mkdir(initial); await fs.mkdir(changed);
  await owner!.send('watchedSeed', { folder: initial });
  await owner!.send('sync', { ...peers[1]! });
  const read = () => receiver!.send('watchedRead') as unknown as Promise<{ bindings: Array<{ primary_path: string }> }>;
  expect((await read()).bindings.map(binding => binding.primary_path)).toEqual([initial]);
  await owner!.send('watchedRoute', { endpoint_url: peers[1]!.origin, group_id: groupId,
    local_device_id: peers[0]!.identity, peer_device_id: peers[1]!.identity,
    peer_device_name: 'Receiver', peer_platform: 'darwin' });
  await owner!.send('watchedSave', { folder: changed });
  await expect.poll(async () => (await read()).bindings.map(binding => binding.primary_path),
    { timeout: 5000 }).toEqual([changed]);
  await receiver!.send('reopen');
  expect((await read()).bindings.map(binding => binding.primary_path)).toEqual([changed]);
});
