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

async function startLegacyGroup() {
  root = await fs.mkdtemp(path.resolve('.tmp/readwise-legacy-owner-'));
  await fs.symlink(path.resolve('node_modules'), path.join(root, 'node_modules'), 'dir');
  const script = path.join(root, 'fixture.mjs');
  await buildRestoreFixture(script);
  const groupId = `group-${randomUUID()}`, names = ['Mac', 'Windows'];
  const peers = [];
  for (const name of names) {
    const worker = startRestoreFixture(script, path.join(root, name), 0);
    workers.push(worker);
    peers.push(await worker.send('init', { groupId, name }));
  }
  for (const worker of workers) {
    await worker.send('register', { members: peers.map((peer, index) => ({ device: peer.device, name: names[index] })) });
    await worker.send('readwiseSeed', { owner: peers[0]!.identity, legacyName: 'Mac' });
  }
  return { mac: workers[0]!, windows: workers[1]!, peers };
}

it('keeps a v0.7.14 owner confirmation visibly pending while another desktop is offline', { meta: { calibratedMs: 45000 } }, async () => {
  const { mac, windows, peers } = await startLegacyGroup();
  await expect(mac.send('readwiseRead')).resolves.toMatchObject({ assignment: {
    is_active: false, active_host_name: null, active_device_identity_key: null, legacy_unassigned: true
  }, guard: null });
  await mac.send('memberExchange', { ...peers[1]! });
  await windows.close();
  workers.splice(1, 1);
  await expect(mac.send('readwiseTakeover')).resolves.toMatchObject({ assignment: {
    is_active: false, handoff_pending: true, active_device_identity_key: null
  } });
  await mac.send('reopenMemberState');
  await expect(mac.send('readwiseRead')).resolves.toMatchObject({ assignment: {
    is_active: false, handoff_pending: true
  } });
});
