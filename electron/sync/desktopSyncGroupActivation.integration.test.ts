// @vitest-environment node
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { reconnectFixturePeer } from './desktopFramedSyncPublicationRecovery.testSupport.js';
import { buildDesktopFramedSyncFixture, createDesktopFramedSyncTwoProcessFixture } from './desktopFramedSyncTwoProcess.testSupport.js';

it('activates discovered peers and automatically persists later edits across independent libraries', async () => {
  const buildRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-activation-build-'));
  const script = path.join(buildRoot, 'fixture.mjs');
  await buildDesktopFramedSyncFixture(script, true);
  const fixture = await createDesktopFramedSyncTwoProcessFixture(script, true, true);
  try {
    const nodeId = 't326-activation';
    await fixture.left.seed({ nodeId, title: 'Automatic collection', content: 'Initial content' });
    await fixture.right.invoke('activation_start');
    await fixture.right.invoke('activation_found', { origin: fixture.leftSnapshot.origin });
    expect(readContent(fixture.rightSnapshot.databasePath, nodeId)).toBe('Initial content');
    await fixture.right.seed({ nodeId, title: 'Automatic collection', content: 'Edited after activation' });
    await fixture.right.invoke('activation_mutation');
    expect(readContent(fixture.leftSnapshot.databasePath, nodeId)).toBe('Edited after activation');
    const restarted = await fixture.restartRight();
    expect(readContent(restarted.snapshot.databasePath, nodeId)).toBe('Edited after activation');
    await fixture.right.invoke('activation_start');
    await fixture.right.invoke('activation_found', { origin: fixture.leftSnapshot.origin });
    await fixture.right.seed({ nodeId, title: 'Automatic collection', content: 'Edited after restart' });
    await fixture.right.invoke('activation_mutation');
    expect(readContent(fixture.leftSnapshot.databasePath, nodeId)).toBe('Edited after restart');
  } finally {
    await Promise.allSettled([fixture.left.close(), fixture.right.close()]);
    await fs.rm(fixture.root, { recursive: true, force: true });
    await fs.rm(buildRoot, { recursive: true, force: true });
  }
}, 60_000);

function readContent(databasePath: string, nodeId: string) {
  const db = new Database(databasePath, { readonly: true, fileMustExist: true });
  try { return db.prepare('SELECT content FROM nodes WHERE id = ?').pluck().get(nodeId); }
  finally { db.close(); }
}

it('automatically relays an inbound committed edit to another discovered desktop', async () => {
  const buildRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-relay-build-'));
  const script = path.join(buildRoot, 'fixture.mjs');
  await buildDesktopFramedSyncFixture(script, true);
  const fixture = await createDesktopFramedSyncTwoProcessFixture(script, true, true);
  const source = await fixture.startThird();
  try {
    const nodeId = 'inbound-relay';
    await source.process.seed({ nodeId, title: 'Relay', content: 'Before inbound edit' });
    await reconnectFixturePeer(source.process, fixture.rightSnapshot);
    await fixture.right.invoke('activation_start');
    await fixture.right.invoke('activation_found', { origin: fixture.leftSnapshot.origin });
    expect(readContent(fixture.leftSnapshot.databasePath, nodeId)).toBe('Before inbound edit');

    await source.process.seed({ nodeId, title: 'Relay', content: 'Committed inbound edit' });
    await reconnectFixturePeer(source.process, fixture.rightSnapshot);
    expect(readContent(fixture.rightSnapshot.databasePath, nodeId)).toBe('Committed inbound edit');
    await expect.poll(() => readContent(fixture.leftSnapshot.databasePath, nodeId), {
      timeout: 5_000, interval: 40
    }).toBe('Committed inbound edit');
    await expect.poll(() => readSyncResult(fixture.rightSnapshot.databasePath)?.status, {
      timeout: 5_000, interval: 40
    }).toBe('completed');
    await new Promise(resolve => setTimeout(resolve, 500));
    const settled = readSyncResult(fixture.rightSnapshot.databasePath);
    expect(settled?.status).toBe('completed');
    await reconnectFixturePeer(source.process, fixture.rightSnapshot);
    await new Promise(resolve => setTimeout(resolve, 500));
    expect(readSyncResult(fixture.rightSnapshot.databasePath)).toEqual(settled);
    const restarted = await fixture.restartLeft();
    expect(readContent(restarted.snapshot.databasePath, nodeId)).toBe('Committed inbound edit');
  } finally {
    await Promise.allSettled([fixture.left.close(), fixture.right.close(), source.process.close()]);
    await fs.rm(fixture.root, { recursive: true, force: true });
    await fs.rm(buildRoot, { recursive: true, force: true });
  }
}, 30_000);

function readSyncResult(databasePath: string): { status: string; run_id: string } | null {
  const db = new Database(databasePath, { readonly: true, fileMustExist: true });
  try {
    const value = db.prepare("SELECT value FROM settings WHERE key = 'sync_group_last_trigger_result'")
      .pluck().get() as string | undefined;
    return value ? JSON.parse(value) : null;
  } finally { db.close(); }
}
