// @vitest-environment node
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { reconnectFixturePeer } from './desktopFramedSyncPublicationRecovery.testSupport.js';
import { buildDesktopFramedSyncFixture, createDesktopFramedSyncTwoProcessFixture } from './desktopFramedSyncTwoProcess.testSupport.js';

it('activates discovered peers and automatically persists later edits across independent libraries', { meta: { calibratedMs: 60_000 } }, async () => {
  const buildRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-activation-build-'));
  const script = path.join(buildRoot, 'fixture.mjs');
  await buildDesktopFramedSyncFixture(script, true);
  const fixture = await createDesktopFramedSyncTwoProcessFixture(script, true, true);
  try {
    const nodeId = 't326-activation';
    await fixture.left.seed({ nodeId, title: 'Automatic collection', content: 'Initial content' });
    await activateBoth(fixture.right, fixture.rightSnapshot, fixture.left, fixture.leftSnapshot);
    await converged(fixture.rightSnapshot.databasePath, nodeId, 'Initial content');
    await fixture.right.seed({ nodeId, title: 'Automatic collection', content: 'Edited after activation' });
    await fixture.right.invoke('activation_mutation');
    await converged(fixture.leftSnapshot.databasePath, nodeId, 'Edited after activation');
    const restarted = await fixture.restartRight();
    expect(readContent(restarted.snapshot.databasePath, nodeId)).toBe('Edited after activation');
    await activateBoth(fixture.right, restarted.snapshot, fixture.left, fixture.leftSnapshot);
    await fixture.right.seed({ nodeId, title: 'Automatic collection', content: 'Edited after restart' });
    await fixture.right.invoke('activation_mutation');
    await converged(fixture.leftSnapshot.databasePath, nodeId, 'Edited after restart');
  } finally {
    await Promise.allSettled([fixture.left.close(), fixture.right.close()]);
    await fs.rm(fixture.root, { recursive: true, force: true });
    await fs.rm(buildRoot, { recursive: true, force: true });
  }
});

type FixtureProcess = Awaited<ReturnType<typeof createDesktopFramedSyncTwoProcessFixture>>['left'];

/** Production desktops discover each other; the lower device then holds a session on its upstream. */
async function activateBoth(first: FixtureProcess, firstSnapshot: { origin: string },
  second: FixtureProcess, secondSnapshot: { origin: string }) {
  await first.invoke('activation_start');
  await second.invoke('activation_start');
  await first.invoke('activation_found', { origin: secondSnapshot.origin });
  await second.invoke('activation_found', { origin: firstSnapshot.origin });
}

function converged(databasePath: string, nodeId: string, content: string) {
  return expect.poll(() => readContent(databasePath, nodeId), { timeout: 10_000, interval: 40 }).toBe(content);
}

function readContent(databasePath: string, nodeId: string) {
  const db = new Database(databasePath, { readonly: true, fileMustExist: true });
  try { return db.prepare('SELECT content FROM nodes WHERE id = ?').pluck().get(nodeId); }
  finally { db.close(); }
}

it('automatically relays an inbound committed edit to another discovered desktop', { meta: { calibratedMs: 30_000 } }, async () => {
  const buildRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-relay-build-'));
  const script = path.join(buildRoot, 'fixture.mjs');
  await buildDesktopFramedSyncFixture(script, true);
  const fixture = await createDesktopFramedSyncTwoProcessFixture(script, true, true);
  const source = await fixture.startThird();
  try {
    const nodeId = 'inbound-relay';
    await source.process.seed({ nodeId, title: 'Relay', content: 'Before inbound edit' });
    await reconnectFixturePeer(source.process, fixture.rightSnapshot);
    await activateBoth(fixture.right, fixture.rightSnapshot, fixture.left, fixture.leftSnapshot);
    await converged(fixture.leftSnapshot.databasePath, nodeId, 'Before inbound edit');

    await source.process.seed({ nodeId, title: 'Relay', content: 'Committed inbound edit' });
    await reconnectFixturePeer(source.process, fixture.rightSnapshot);
    expect(readContent(fixture.rightSnapshot.databasePath, nodeId)).toBe('Committed inbound edit');
    await expect.poll(() => readContent(fixture.leftSnapshot.databasePath, nodeId), {
      timeout: 5_000, interval: 40
    }).toBe('Committed inbound edit');
    // The lower device schedules the pair; its last round settles once and a no-op push changes nothing.
    const client = fixture.leftSnapshot.deviceId < fixture.rightSnapshot.deviceId ? fixture.leftSnapshot : fixture.rightSnapshot;
    await expect.poll(() => readSyncResult(client.databasePath)?.status, { timeout: 5_000, interval: 40 }).toBe('completed');
    await new Promise(resolve => setTimeout(resolve, 500));
    const settled = readSyncResult(client.databasePath);
    await reconnectFixturePeer(source.process, fixture.rightSnapshot);
    await new Promise(resolve => setTimeout(resolve, 500));
    expect(readSyncResult(client.databasePath)).toEqual(settled);
    const restarted = await fixture.restartLeft();
    expect(readContent(restarted.snapshot.databasePath, nodeId)).toBe('Committed inbound edit');
  } finally {
    await Promise.allSettled([fixture.left.close(), fixture.right.close(), source.process.close()]);
    await fs.rm(fixture.root, { recursive: true, force: true });
    await fs.rm(buildRoot, { recursive: true, force: true });
  }
});

it('does not relay an inbound commit back to the desktop that pushed it', { meta: { calibratedMs: 30_000 } }, async () => {
  const buildRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-relay-echo-build-'));
  const script = path.join(buildRoot, 'fixture.mjs');
  await buildDesktopFramedSyncFixture(script, true);
  const fixture = await createDesktopFramedSyncTwoProcessFixture(script, true, true);
  try {
    const nodeId = 'relay-echo';
    await fixture.left.seed({ nodeId, title: 'Echo', content: 'Before' });
    await fixture.right.invoke('activation_start');
    await fixture.right.invoke('activation_found', { origin: fixture.leftSnapshot.origin });
    await fixture.left.invoke('activation_start');
    await fixture.left.invoke('activation_found', { origin: fixture.rightSnapshot.origin });
    const before = new Set(readActivityRuns(fixture.rightSnapshot.databasePath, fixture.leftSnapshot.deviceId));

    await fixture.left.seed({ nodeId, title: 'Echo', content: 'Pushed by left' });
    await fixture.left.invoke('activation_mutation');
    expect(readContent(fixture.rightSnapshot.databasePath, nodeId)).toBe('Pushed by left');
    await new Promise(resolve => setTimeout(resolve, 1_500));
    const echoed = readActivityRuns(fixture.rightSnapshot.databasePath, fixture.leftSnapshot.deviceId)
      .filter(run => !before.has(run));
    expect(echoed).toEqual([]);
  } finally {
    await Promise.allSettled([fixture.left.close(), fixture.right.close()]);
    await fs.rm(fixture.root, { recursive: true, force: true });
    await fs.rm(buildRoot, { recursive: true, force: true });
  }
});

function readActivityRuns(databasePath: string, peerId: string) {
  const db = new Database(databasePath, { readonly: true, fileMustExist: true });
  try {
    const value = db.prepare("SELECT value FROM settings WHERE key = 'sync_group_activity'").pluck().get() as string | undefined;
    const events = value ? JSON.parse(value) as { run_id: string; peer_device_id: string | null }[] : [];
    return [...new Set(events.filter(event => event.peer_device_id === peerId).map(event => event.run_id))];
  } finally { db.close(); }
}

function readSyncResult(databasePath: string): { status: string; run_id: string } | null {
  const db = new Database(databasePath, { readonly: true, fileMustExist: true });
  try {
    const value = db.prepare("SELECT value FROM settings WHERE key = 'sync_group_last_trigger_result'")
      .pluck().get() as string | undefined;
    return value ? JSON.parse(value) : null;
  } finally { db.close(); }
}
