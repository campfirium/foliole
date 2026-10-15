// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { afterEach, beforeAll, expect, it } from 'vitest';

import type { SyncGroupMemberStatePayload } from '../../lib/platform/syncGroupMemberStateContract.js';
import { syncGroupRemovingEntries } from '../../lib/platform/syncGroupRemovalModel.js';

import { buildRestoreFixture, startRestoreFixture } from './backupRestoreSyncGroup.testSupport.js';

type Worker = ReturnType<typeof startRestoreFixture>;
let root = '';
let script = '';
const workers: Worker[] = [];
beforeAll(async () => {
  await fs.mkdir('.tmp/artifacts/t346', { recursive: true });
  root = await fs.mkdtemp(path.resolve('.tmp/artifacts/t346/http-'));
  await fs.symlink(path.resolve('node_modules'), path.join(root, 'node_modules'), 'dir');
  script = path.join(root, 'fixture.mjs');
  await buildRestoreFixture(script);
}, 60000);
afterEach(async () => { await Promise.all(workers.splice(0).map(worker => worker.close())); });

async function group(count: number) {
  const groupId = `group-${randomUUID()}`;
  const members = [];
  for (let index = 0; index < count; index++) {
    const worker = startRestoreFixture(script, path.join(root, randomUUID()), 0);
    workers.push(worker);
    const peer = await worker.send('init', { groupId, name: `Device ${index}` });
    await worker.send('seed', { content: 'Protected original' });
    members.push({ worker, peer });
  }
  for (const member of members) await member.worker.send('register', {
    members: members.filter(other => other !== member).map(other => ({ device: other.peer.device, name: 'Peer' }))
  });
  return members;
}
async function state(worker: Worker) {
  return await worker.send('memberState') as unknown as SyncGroupMemberStatePayload;
}
async function exchange(source: Awaited<ReturnType<typeof group>>[number], target: typeof source) {
  return source.worker.send('memberExchange', { origin: target.peer.origin, identity: target.peer.identity });
}
function pending(value: SyncGroupMemberStatePayload) {
  return syncGroupRemovingEntries(value.devices, value.removals);
}

it('waits for an offline remaining member, excludes both removal targets, persists convergence and original data', async () => {
  const [a, b, c, d, e] = await group(5);
  await a!.worker.send('facts');
  const facts = await a!.worker.send('readFacts');
  const protectedFacts = await Promise.all([a!, b!, c!, d!, e!].map(member => member.worker.send('readFacts')));
  await a!.worker.send('removeMember', { identity: d!.peer.identity });
  await a!.worker.send('removeMember', { identity: e!.peer.identity });
  await exchange(b!, a!);
  expect(pending(await state(b!.worker))).toHaveLength(2);
  expect((await state(b!.worker)).removals.every(item => item.completed_at === null)).toBe(true);
  await c!.worker.send('pauseMember');
  expect(await c!.worker.send('joinOverview')).toMatchObject({ sync_paused: true });
  await exchange(c!, b!);
  await exchange(a!, c!);
  await exchange(b!, c!);
  for (const member of [a!, b!, c!]) {
    const before = await state(member.worker);
    expect(pending(before)).toEqual([]);
    expect(before.removals).toHaveLength(2);
    expect(before.removals.every(item => item.completed_at !== null)).toBe(true);
    for (const target of [d!, e!]) expect(before.devices.find(device =>
      device.device_identity_key === target.peer.identity)?.state).toBe('left');
    expect(await member.worker.send('reopenMemberState')).toEqual(before);
  }
  expect(await a!.worker.send('readFacts')).toEqual(facts);
  expect(await Promise.all([a!, b!, c!, d!, e!].map(member => member.worker.send('readFacts')))).toEqual(protectedFacts);
  await exchange(d!, a!);
  expect((await d!.worker.send('joinOverview') as unknown as { sync_group: unknown }).sync_group).toBeNull();
}, 90000);

it('keeps target-exit insufficient and finishes after the initiator leaves and another member confirms', async () => {
  const [a, b, c, d] = await group(4);
  await a!.worker.send('removeMember', { identity: d!.peer.identity });
  await exchange(d!, a!);
  expect(pending(await state(a!.worker))).toHaveLength(1);
  await exchange(b!, a!);
  await a!.worker.send('departTo', { origin: b!.peer.origin, identity: b!.peer.identity });
  expect((await state(b!.worker)).devices.find(device => device.device_identity_key === a!.peer.identity)?.state).toBe('left');
  await exchange(c!, b!);
  await exchange(b!, c!);
  expect(pending(await state(b!.worker))).toEqual([]);
  expect(pending(await state(c!.worker))).toEqual([]);
}, 90000);

it('preserves crossing decisions and distinct concurrent decisions, then supersedes old evidence on explicit rejoin', async () => {
  const [a, b, c, d] = await group(4);
  await a!.worker.send('removeMember', { identity: d!.peer.identity });
  await d!.worker.send('removeMember', { identity: a!.peer.identity });
  await exchange(b!, a!);
  await exchange(c!, d!);
  await exchange(b!, c!);
  await exchange(c!, b!);
  const converged = await state(b!.worker);
  expect(pending(converged)).toEqual([]);
  expect(converged.removals.every(item => item.completed_at !== null)).toBe(true);
  await b!.worker.send('register', { members: [{ device: d!.peer.device, name: 'Rejoined' }] });
  await exchange(c!, b!);
  expect((await state(c!.worker)).devices.find(device => device.device_identity_key === d!.peer.identity)?.state).toBe('active');
  await b!.worker.send('removeMember', { identity: d!.peer.identity });
  const next = await state(b!.worker);
  const fresh = next.removals.find(item => !item.superseded_at && item.target_device_identity_key === d!.peer.identity);
  expect(fresh?.completed_at).toBeNull();
  expect(fresh?.confirmations.map(item => item.confirming_device_identity_key)).toEqual([b!.peer.identity]);
}, 90000);

it('keeps concurrent decisions separate, waits for a remaining member, and converges after repeated exchanges', async () => {
  const [a, b, c, d, e] = await group(5);
  await a!.worker.send('removeMember', { identity: e!.peer.identity });
  await b!.worker.send('removeMember', { identity: e!.peer.identity });
  await exchange(c!, a!);
  await exchange(c!, b!);
  const partial = await state(c!.worker);
  expect(partial.removals).toHaveLength(2);
  expect(pending(partial)).toHaveLength(1);
  expect(partial.removals.every(item => !item.completed_at)).toBe(true);
  // D has received no decision yet. It is a remaining member even without data synchronization.
  await exchange(d!, c!);
  await exchange(a!, d!);
  await exchange(b!, a!);
  await exchange(c!, b!);
  for (const member of [a!, b!, c!, d!]) {
    await exchange(member, c!);
    const result = await state(member.worker);
    expect(pending(result)).toEqual([]);
    expect(result.removals.every(item => item.completed_at)).toBe(true);
    expect(result.removals.every(item => new Set(item.confirmations.map(value => value.confirming_device_identity_key)).size ===
      item.confirmations.length)).toBe(true);
  }
}, 90000);

it('waits for a newly admitted member before completing an existing decision', async () => {
  const [a, b, c, target] = await group(4);
  await a!.worker.send('removeMember', { identity: target!.peer.identity });
  await exchange(b!, a!);
  const worker = startRestoreFixture(script, path.join(root, randomUUID()), 0);
  workers.push(worker);
  const peer = await worker.send('init', { groupId: a!.peer.device.group_id, name: 'New member' });
  const newcomer = { worker, peer };
  await worker.send('register', { members: [a!, b!, c!, target!].map(member => ({ device: member.peer.device, name: 'Peer' })) });
  for (const member of [a!, b!, c!]) await member.worker.send('register', { members: [{ device: peer.device, name: 'New member' }] });
  await exchange(c!, b!);
  expect(pending(await state(c!.worker))).toHaveLength(1);
  await exchange(newcomer, c!);
  await exchange(a!, newcomer);
  await exchange(b!, a!);
  expect(pending(await state(b!.worker))).toEqual([]);
  expect((await state(newcomer.worker)).removals[0]?.completed_at).not.toBeNull();
}, 90000);
