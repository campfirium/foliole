// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import { afterEach, expect, it } from 'vitest';

import { buildRestoreFixture, startRestoreFixture } from './backupRestoreSyncGroup.testSupport.js';

type Worker = ReturnType<typeof startRestoreFixture>;
let root = '';
const workers: Worker[] = [];
afterEach(async ({ task }) => {
  const closed = workers.splice(0);
  await Promise.allSettled(closed.map((worker) => worker.close()));
  if (root && task.result?.state === 'fail') {
    await fs.writeFile(path.join(root, 'workers.log'), closed.map((worker, index) =>
      `Worker ${index}\n${worker.diagnostics()}`).join('\n'));
    console.info('Failed rebind databases:', root);
  } else if (root) await fs.rm(root, { recursive: true, force: true });
});

async function reservePort() {
  const server = net.createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('port missing');
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return address.port;
}

async function writeAnchor(memberRoot: string) {
  await fs.mkdir(path.join(memberRoot, 'device-identity'), { recursive: true });
  await fs.writeFile(path.join(memberRoot, 'device-identity', 'anchor-v1'), `${randomUUID()}\n`);
}

async function start(script: string, memberRoot: string, groupId: string, name: string) {
  const worker = startRestoreFixture(script, memberRoot, await reservePort());
  workers.push(worker);
  return { worker, peer: await worker.send('init', { groupId, name }) };
}

async function synchronize(worker: Worker, peer: { origin: string; identity: string }) {
  const deadline = Date.now() + 20000;
  for (;;) {
    const result = await worker.send('sync', peer) as unknown as { status: string };
    if (result.status === 'completed') return;
    expect(result.status).toBe('pending');
    if (Date.now() >= deadline) throw new Error('Rebind synchronization remained pending.');
    await delay(1000);
  }
}

it('lets a copied library sync beside its original as a separate member', { meta: { calibratedMs: 120_000 } }, async () => {
  await fs.mkdir(path.resolve('.tmp/artifacts/d4-rebind'), { recursive: true });
  root = await fs.realpath(await fs.mkdtemp(path.resolve('.tmp/artifacts/d4-rebind/multi-')));
  await fs.symlink(path.resolve('node_modules'), path.join(root, 'node_modules'), 'dir');
  const script = path.join(root, 'fixture.mjs');
  await buildRestoreFixture(script);
  const rootA = path.join(root, 'A');
  const rootB = path.join(root, 'B');
  const rootCopy = path.join(root, 'copy');
  for (const memberRoot of [rootA, rootB]) await writeAnchor(memberRoot);
  const groupId = `test-d4-${randomUUID()}`;
  let a = await start(script, rootA, groupId, 'A');
  const b = await start(script, rootB, groupId, 'B');
  for (const { worker } of [a, b]) {
    await worker.send('register', { members: [{ device: a.peer.device, name: 'A' }, { device: b.peer.device, name: 'B' }] });
  }
  await a.worker.send('seed', { id: 'before-copy', content: 'Written before copy' });
  await synchronize(b.worker, a.peer);

  await a.worker.close();
  workers.splice(workers.indexOf(a.worker), 1);
  await fs.cp(rootA, rootCopy, { recursive: true });
  await writeAnchor(rootCopy);
  a = await start(script, rootA, groupId, 'A');
  const copy = await start(script, rootCopy, groupId, 'A');
  expect(a.peer.identity).toBe(a.peer.device.identity_key);
  expect(copy.peer.identity).not.toBe(a.peer.identity);
  expect(copy.peer.database).not.toBe(a.peer.database);
  expect((await copy.worker.send('snapshot')).library.nodesById['before-copy']).toBeDefined();

  await copy.worker.send('memberExchange', { origin: b.peer.origin, identity: b.peer.identity });
  await copy.worker.send('seed', { id: 'from-copy', content: 'Written in copy' });
  await a.worker.send('seed', { id: 'from-original', content: 'Written in original' });
  await synchronize(b.worker, copy.peer);
  await synchronize(b.worker, a.peer);
  await synchronize(copy.worker, b.peer);
  await synchronize(a.worker, b.peer);

  for (const { worker } of [a, b, copy]) {
    const nodes = (await worker.send('snapshot')).library.nodesById;
    expect(['before-copy', 'from-copy', 'from-original'].every((id) => nodes[id])).toBe(true);
  }
  const members = await b.worker.send('memberState') as unknown as { devices: Array<{ device_identity_key: string; state: string }> };
  expect(members.devices.filter((device) => device.state === 'active').map((device) => device.device_identity_key))
    .toEqual(expect.arrayContaining([a.peer.identity, b.peer.identity, copy.peer.identity]));
});
