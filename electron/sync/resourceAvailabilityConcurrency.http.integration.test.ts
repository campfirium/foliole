// @vitest-environment node
import { once } from 'node:events';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { expect, it } from 'vitest';

import type { FixtureReply } from './backupRestoreSyncGroup.fixture.js';
import { buildRestoreFixture, startRestoreFixture } from './backupRestoreSyncGroup.testSupport.js';

it('keeps both databases available during simultaneous authenticated resource negotiation', async () => {
  const parent = path.resolve('.tmp/artifacts/sync-resource-concurrency');
  await fs.mkdir(parent, { recursive: true });
  const root = await fs.realpath(await fs.mkdtemp(path.join(parent, 'pair-')));
  await fs.symlink(path.resolve('node_modules'), path.join(root, 'node_modules'), 'dir');
  const script = path.join(root, 'fixture.mjs');
  await buildRestoreFixture(script);
  const workers = ['A', 'B'].map((name) => startRestoreFixture(script, path.join(root, name), 0));
  let passed = false;
  const queries: Promise<unknown>[] = [];
  try {
    const peers: FixtureReply[] = [];
    for (const [index, worker] of workers.entries()) {
      peers.push(await worker.send('init', { groupId: 'resource-concurrency', name: String(index) }));
    }
    const members = peers.map((peer, index) => ({ device: peer.device, name: String(index) }));
    for (const worker of workers) await worker.send('register', { members });
    for (const [index, worker] of workers.entries()) {
      const peer = peers[1 - index]!;
      expect(await worker.send('resourceQuery', { ...peer })).toEqual({
        provider_device_id: peer.identity, resources: []
      });
    }
    for (const [index, worker] of workers.entries()) {
      const request = worker.send('resourceQuery', { ...peers[1 - index]!, hold: true });
      void request.catch(() => undefined);
      queries.push(request);
    }
    for (const worker of workers) {
      await expect.poll(() => worker.send('resourceWaiting'), { timeout: 5000 }).toBe(true);
    }
    // While both network requests are pending, ordinary durable reads must remain usable.
    await within(Promise.all(workers.map((worker) => worker.send('resourceRead'))));
    await Promise.all(workers.map((worker) => worker.send('resourceRelease')));
    const responses = await within(Promise.all(queries));
    expect(responses).toEqual(peers.map((_, index) => ({
      provider_device_id: peers[1 - index]!.identity, resources: []
    })));
    for (const worker of workers) expect((await worker.send('reopen')).group).toBe('resource-concurrency');
    passed = true;
  } finally {
    // A failed lock test must not wait for the very database owner it is diagnosing.
    await Promise.all(workers.map(async (worker) => {
      if (worker.child.exitCode !== null) return;
      const exited = once(worker.child, 'exit');
      worker.child.kill();
      await exited;
    }));
    await Promise.allSettled(queries);
    if (passed) await fs.rm(root, { recursive: true, force: true });
    else {
      await fs.writeFile(path.join(root, 'workers.log'), workers.map((worker) => worker.diagnostics()).join('\n'));
      console.info('Resource concurrency evidence:', root);
    }
  }
}, 30000);

async function within<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([promise, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('database or peer response blocked during resource negotiation')), 2000);
    })]);
  } finally { clearTimeout(timer); }
}
