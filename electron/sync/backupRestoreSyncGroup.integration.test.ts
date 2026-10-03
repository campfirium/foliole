// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import net from 'node:net';
import path from 'node:path';

import { afterEach, expect, it } from 'vitest';

import { buildRestoreFixture, startRestoreFixture } from './backupRestoreSyncGroup.testSupport.js';

let root = '';
const workers: ReturnType<typeof startRestoreFixture>[] = [];
afterEach(async ({ task }) => {
  const closed = workers.splice(0);
  await Promise.allSettled(closed.map((worker) => worker.close()));
  if (root && task.result?.state === 'fail') {
    await fs.writeFile(path.join(root, 'workers.log'), closed.map((worker, index) =>
      `Worker ${index}\n${worker.diagnostics()}`).join('\n'));
    console.info('Failed restore databases:', root);
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

async function setup() {
  await fs.mkdir(path.resolve('.tmp/artifacts/t296'), { recursive: true });
  root = await fs.realpath(await fs.mkdtemp(path.resolve('.tmp/artifacts/t296/multi-')));
  await fs.symlink(path.resolve('node_modules'), path.join(root, 'node_modules'), 'dir');
  const script = path.join(root, 'fixture.mjs');
  await buildRestoreFixture(script);
  const members = ['A', 'B', 'C'].map((name) => ({ name, root: path.join(root, name), anchor: randomUUID() }));
  for (const member of members) {
    await fs.mkdir(path.join(member.root, 'device-identity'), { recursive: true });
    await fs.writeFile(path.join(member.root, 'device-identity', 'anchor-v1'), `${member.anchor}\n`);
  }
  const groupId = `test-t296-${randomUUID()}`;
  const peers = [];
  for (const member of members) {
    const worker = startRestoreFixture(script, member.root, await reservePort());
    workers.push(worker);
    peers.push(await worker.send('init', { groupId, name: member.name, members }));
  }
  const registered = peers.map((peer, index) => ({ device: peer.device, name: members[index]!.name }));
  for (const worker of workers) await worker.send('register', { members: registered });
  return { members, groupId, peers, script };
}

async function resumePausedRestore(context: Awaited<ReturnType<typeof setup>>) {
  const { members, groupId, peers, script } = context;
  const receiver = workers[1]!;
  let source = workers[0]!;
      await source.close();
      source = startRestoreFixture(script, members[0]!.root, await reservePort());
      workers[0] = source;
      peers[0] = await source.send('init', { groupId, name: 'A', members });
      const paused = await source.send('snapshot');
      expect(paused.participation).toMatchObject({ sync_paused: true, participating: false });
      expect(paused.pending!.groupId).toBe(groupId);
      await expect(source!.send('resume')).rejects.toThrow('backup_restore_sync_confirmation_required');
      await source!.send('enable');
      expect((await source!.send('snapshot')).participation.participating).toBe(false);
      await expect(receiver!.send('pull', { ...peers[0], name: 'A' })).rejects.toThrow();
      expect((await receiver!.send('snapshot')).library.nodesById['remote-only']).toBeDefined();
      await source!.send('seed', { content: 'Edited after restore' });
      await source!.send('seed', { id: 'later', content: 'Added while paused' });
      await source.send('delete');
      await source.send('facts');
      await source!.send('resume', { confirm: true });
      await source.close();
      source = startRestoreFixture(script, members[0]!.root, await reservePort());
      workers[0] = source;
      peers[0] = await source.send('init', { groupId, name: 'A', members });
  return source;
}

for (const pause of [false, true]) {
  it(`covers a whole group through independent production instances after ${pause ? 'pause and edits' : 'immediate restore'}`, async () => {
    const { members, groupId, peers, script } = await setup();
    let source = workers[0]!;
    const receiver = workers[1]!;
    const offline = workers[2]!;
    await source!.send('seed', { content: 'Chosen backup' });
    await source.send('seed', { id: 'delete-me', content: 'Delete while paused' });
    await source.send('facts');
    await source.send('batch');
    const backup = await source!.send('backup');
    await source!.send('seed', { content: 'Source before restore' });
    await receiver!.send('seed', { id: 'remote-only', content: 'Remote before restore' });
    await offline!.send('seed', { id: 'offline-only', content: 'Offline before restore' });
    await offline!.close();
    workers.pop();
    await source!.send('restore', { file: backup.destinationPath, pause });
    if (pause) source = await resumePausedRestore({ members, groupId, peers, script });
    else await source.send('enable');
    // An old receiver negotiates first; it must learn the restore instead of overwriting the source.
    await receiver!.send('enable');
    await assertInterruptedRestore(receiver, peers[0]!);
    const adopted = await receiver!.send('pull', { ...peers[0], name: 'A' });
    expect(adopted.applied).toBe(true);
    const a = await source!.send('snapshot');
    const b = await receiver!.send('reopen');
    expect(a.pending).toBeNull();
    expect(b.restore!.event.restore_id).toBe(a.restore!.event.restore_id);
    expect(b.restore!.applied).toBe(true);
    const expected = pause ? 'Edited after restore' : 'Chosen backup';
    expect(a.library.nodesById.topic!.content).toContain(expected);
    expect(b.library.nodesById.topic!.content).toBe(a.library.nodesById.topic!.content);
    expect(b.library.nodesById['remote-only']).toBeUndefined();
    if (pause) expect(b.library.nodesById.later!.content).toBe('Added while paused');
    expect(b.versions).toEqual(a.versions);
    expect(await receiver.send('readFacts')).toEqual(await source.send('readFacts'));
    if (pause) expect(b.library.trashedNodeIds).toContain('delete-me');
    const returning = startRestoreFixture(script, members[2]!.root, await reservePort());
    workers.push(returning);
    await returning.send('init', { groupId, name: 'C', members });
    await returning.send('enable');
    await returning.send('pull', { ...peers[0], name: 'A' });
    const c = await returning.send('reopen');
    expect(c.library.nodesById.topic!.content).toBe(a.library.nodesById.topic!.content);
    expect(c.library.nodesById['offline-only']).toBeUndefined();
    expect(c.versions).toEqual(a.versions);
    // Production receive path must preserve the overwritten remote library in a safety snapshot.
    const snapshots = await receiver.send('safety') as unknown as Array<{ nodes: Array<{ id: string }>; versions: Array<{ body_text: string }> }>;
    expect(snapshots.some((snapshot) => snapshot.nodes.some((node) => node.id === 'remote-only'))).toBe(true);
    expect(snapshots.some((snapshot) => snapshot.versions.some((version) => version.body_text === 'Remote before restore'))).toBe(true);
  }, 90000);
}

async function assertInterruptedRestore(receiver: ReturnType<typeof startRestoreFixture>, peer: Awaited<ReturnType<ReturnType<typeof startRestoreFixture>['send']>>) {
  const first = await receiver.send('pull', { ...peer, name: 'A', firstPage: true });
  expect(first.applied).toBe(false);
  expect(first.cursor).toBeLessThan(first.frontier);
  const interrupted = await receiver.send('reopen');
  expect(interrupted.library.nodesById['remote-only']).toBeDefined();
  expect(interrupted.restore?.applied).toBe(false);
}

for (const enabled of [false, true]) {
  it(`joins a retained group after local-only restore with Sync ${enabled ? 'on' : 'off'}`, async () => {
    await fs.mkdir(path.resolve('.tmp/artifacts/sync-join'), { recursive: true });
    root = await fs.mkdtemp(path.resolve('.tmp/artifacts/sync-join/multi-'));
    await fs.symlink(path.resolve('node_modules'), path.join(root, 'node_modules'), 'dir');
    const script = path.join(root, 'fixture.mjs');
    await buildRestoreFixture(script);
    const provider = startRestoreFixture(script, path.join(root, 'provider'), await reservePort());
    const joining = startRestoreFixture(script, path.join(root, 'joining'), await reservePort());
    workers.push(provider, joining);
    const groupId = `join-${randomUUID()}`;
    const peer = await provider.send('init', { groupId, name: 'Provider' });
    await provider.send('joinProviderEnable');
    await expect.poll(async () => {
      const overview = await provider.send('joinOverview') as unknown as { server_status: { topology_role: string } };
      return overview.server_status.topology_role;
    }, { timeout: 15000 }).toBe('anchor');
    await provider.send('seed', { id: 'provider-note', content: 'Retained remote note' });
    const restored = await joining.send('initLocal', { enabled });
    expect(restored.group).toBeUndefined();
    expect(restored.participation).toMatchObject({ sync_enabled: enabled, sync_paused: true, participating: false });
    await joining.send('seed', { id: 'restored-note', content: 'Restored local note' });
    const pending = await joining.send('joinRequest', { origin: peer.origin }) as unknown as {
      join_request: { request_id: string }; sync_paused: boolean; sync_group: unknown
    };
    expect(pending.sync_paused).toBe(true);
    expect(pending.sync_group).toBeNull();
    await provider.send('joinReject', { requestId: pending.join_request.request_id });
    await expect(joining.send('joinComplete')).rejects.toThrow();
    expect((await joining.send('snapshot')).participation).toEqual(restored.participation);
    await joining.send('pendingRestore', { pending: true, groupId });
    await expect(joining.send('joinRequest', { origin: peer.origin })).rejects.toThrow('backup_restore_sync_confirmation_required');
    await joining.send('pendingRestore', { pending: false });
    const retry = await joining.send('joinRequest', { origin: peer.origin }) as unknown as typeof pending;
    await provider.send('joinAccept', { requestId: retry.join_request.request_id });
    await joining.send('pendingRestore', { pending: true, groupId });
    await expect(joining.send('joinComplete')).rejects.toThrow('backup_restore_sync_confirmation_required');
    expect((await joining.send('snapshot')).group).toBeUndefined();
    await joining.send('pendingRestore', { pending: false });
    await joining.send('joinComplete');
    await expect.poll(async () => (await joining.send('snapshot')).library.nodesById['provider-note']?.content,
      { timeout: 20000 }).toBe('Retained remote note').catch((error) => {
        throw new Error(`${String(error)}\nProvider: ${provider.diagnostics()}\nJoining: ${joining.diagnostics()}`);
      });
    await expect.poll(async () => (await provider.send('snapshot')).library.nodesById['restored-note']?.content,
      { timeout: 20000 }).toBe('Restored local note');
    const reopened = await joining.send('reopen');
    expect(reopened.group).toBe(groupId);
    expect(reopened.participation).toMatchObject({ sync_enabled: true, sync_paused: false, participating: true });
    expect(reopened.library.nodesById['restored-note']?.content).toBe('Restored local note');
    expect((await provider.send('reopen')).library.nodesById['provider-note']?.content).toBe('Retained remote note');
    await expect(joining.send('joinRequest', { origin: peer.origin })).rejects.toThrow('sync_group_identity_mismatch');
  }, 90000);
}
