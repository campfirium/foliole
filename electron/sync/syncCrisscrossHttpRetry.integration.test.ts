// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import net from 'node:net';
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, expect, it } from 'vitest';

import { buildRestoreFixture, startRestoreFixture } from './backupRestoreSyncGroup.testSupport.js';

type Worker = ReturnType<typeof startRestoreFixture>;
type Peer = Awaited<ReturnType<Worker['send']>>;
let root = '';
const workers: Worker[] = [];
afterEach(async ({ task }) => {
  const closed = workers.splice(0);
  await Promise.allSettled(closed.map(worker => worker.close()));
  if (task.result?.state === 'fail') {
    await fs.writeFile(path.join(root, 'workers.log'), closed.map((worker, index) =>
      `Worker ${index}\n${worker.diagnostics()}`).join('\n'));
    console.info('Failed sync databases:', root);
  }
  else if (root) await fs.rm(root, { recursive: true, force: true });
});

async function reservePort() {
  const server = net.createServer();
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as net.AddressInfo;
  await new Promise<void>(resolve => server.close(() => resolve()));
  return address.port;
}

async function setup() {
  await fs.mkdir('.tmp/artifacts/sync-join', { recursive: true });
  root = await fs.mkdtemp(path.resolve('.tmp/artifacts/sync-join/http-retry-'));
  await fs.symlink(path.resolve('node_modules'), path.join(root, 'node_modules'), 'dir');
  const script = path.join(root, 'fixture.mjs');
  await buildRestoreFixture(script);
  const groupId = `group-${randomUUID()}`;
  const peers: Peer[] = [];
  for (const name of ['Left', 'Right', 'Relay']) {
    const worker = startRestoreFixture(script, path.join(root, name), await reservePort());
    workers.push(worker);
    peers.push(await worker.send('init', { groupId, name }));
  }
  for (const worker of workers) {
    await worker.send('register', { members: peers.map((peer, index) => ({
      device: peer.device, name: ['Left', 'Right', 'Relay'][index]
    })) });
  }
  return peers;
}

function persisted(peer: Peer) {
  const db = new Database(peer.database, { readonly: true, fileMustExist: true });
  try {
    return {
      node: db.prepare(`SELECT CAST(cbd.data AS TEXT) AS content, n.current_version_id
        FROM nodes n LEFT JOIN content_blob_data cbd ON cbd.hash = n.body_blob_hash
        WHERE n.id = 'topic'`).get(),
      alternatives: db.prepare(`SELECT body_text FROM node_text_alternatives
        WHERE node_id = 'topic' AND status = 'available' ORDER BY body_text`).pluck().all()
    };
  } finally { db.close(); }
}

async function exchange(peers: Peer[], left: number, right: number) {
  const results = await Promise.allSettled([
    workers[left]!.send('sync', { ...peers[right]! }),
    workers[right]!.send('sync', { ...peers[left]! })
  ]);
  // A concurrent collection may invalidate advertised facts. Retry that failed
  // product command once after both requests finish; never swallow other errors.
  for (const [index, [source, target]] of [[left, right], [right, left]].entries()) {
    const result = results[index]!;
    if (result.status === 'fulfilled') continue;
    expect(String(result.reason)).toContain('sync_pack_fact_presence_changed');
    await workers[source!]!.send('sync', { ...peers[target!]! });
  }
}

it('keeps a converged version stable through concurrent HTTP sync, a stale relay, reopen, and retry', async () => {
  const peers = await setup();
  await workers[0]!.send('seed', { id: 'topic', content: 'Original' });
  await exchange(peers, 0, 1);
  await exchange(peers, 0, 2);
  const offlineRelay = persisted(peers[2]!);
  for (const index of [0, 1]) {
    await workers[index]!.send('seed', { id: 'topic', content: `${index} independent edit` });
  }
  await exchange(peers, 0, 1);
  for (const index of [0, 1]) {
    await workers[index]!.send('seed', { id: 'topic', content: `${index} intermediate edit` });
    await workers[index]!.send('seed', { id: 'topic', content: 'Shared final body' });
  }
  await exchange(peers, 0, 1);
  const final = persisted(peers[0]!);
  expect(final.node).toMatchObject({ content: 'Shared final body' });
  expect(persisted(peers[1]!).node).toEqual(final.node);
  // The relay has retained an older confirmed base while the other two edited independently.
  // Pin real HTTP endpoints instead of advertising these isolated peers to OS discovery.
  expect(persisted(peers[2]!)).toEqual(offlineRelay);
  await exchange(peers, 1, 2);
  await exchange(peers, 2, 0);
  for (const peer of peers) expect(persisted(peer).node).toEqual(final.node);
  const beforeRetry = peers.map(persisted);
  for (const worker of workers) {
    await worker.send('reopen');
  }
  await exchange(peers, 0, 1);
  await exchange(peers, 1, 2);
  await exchange(peers, 2, 0);
  expect(peers.map(persisted)).toEqual(beforeRetry);
}, 90000);
