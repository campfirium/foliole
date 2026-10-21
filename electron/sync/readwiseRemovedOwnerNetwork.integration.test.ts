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

it('converges a removed owner takeover across remaining peers and rejects the old member', { meta: { calibratedMs: 45000 } }, async () => {
  root = await fs.mkdtemp(path.resolve('.tmp/readwise-takeover-'));
  await fs.symlink(path.resolve('node_modules'), path.join(root, 'node_modules'), 'dir');
  const script = path.join(root, 'fixture.mjs');
  await buildRestoreFixture(script);
  const groupId = `group-${randomUUID()}`, names = ['Old', 'Candidate', 'Observer'];
  const peers = [];
  for (const name of names) {
    const worker = startRestoreFixture(script, path.join(root, name), 0);
    workers.push(worker);
    peers.push(await worker.send('init', { groupId, name }));
  }
  for (const worker of workers) {
    await worker.send('register', { members: peers.map((peer, index) => ({ device: peer.device, name: names[index] })) });
    await worker.send('readwiseSeed', { owner: peers[0]!.identity });
  }
  const [old, candidate, observer] = workers;
  await candidate!.send('removeMember', { identity: peers[0]!.identity });
  await candidate!.send('memberExchange', { ...peers[2]! });
  await observer!.send('memberExchange', { ...peers[1]! });
  await expect(candidate!.send('readwiseTakeover')).resolves.toMatchObject({ assignment: {
    is_active: true, active_device_identity_key: peers[1]!.identity, active_owner_epoch: 5
  } });
  await candidate!.send('sync', { ...peers[2]! });
  await observer!.send('reopenMemberState');
  await expect(observer!.send('readwiseRead')).resolves.toMatchObject({ assignment: {
    is_active: false, active_device_identity_key: peers[1]!.identity, active_owner_epoch: 5
  } });
  await old!.send('seed', { id: 'removed-owner-only', content: 'Must not return to the group' });
  await expect(old!.send('sync', { ...peers[1]! })).rejects.toThrow('sync_group_local_device_removed');
  expect((await candidate!.send('snapshot')).library.nodesById['removed-owner-only']).toBeUndefined();
  await candidate!.send('reopenMemberState');
  await expect(candidate!.send('readwiseRead')).resolves.toMatchObject({ assignment: {
    is_active: true, active_owner_epoch: 5
  }, guard: { state: 'active', epoch: 5, ownerId: peers[1]!.identity } });
});
