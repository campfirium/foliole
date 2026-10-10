// @vitest-environment node
import { promises as fs } from 'node:fs';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { loadForegroundSourceWithDbPort } from '../../lib/core/database/foregroundTimeSource.js';
import { computeSyncContentHash } from '../../lib/core/database/syncState.js';
import { applySyncObjectInTransaction } from '../../lib/core/sync/syncObjectApplyExecutor.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';

import { readFixtureInventory, reconnectFixturePeer } from './desktopFramedSyncPublicationRecovery.testSupport.js';
import { createDesktopFramedSyncTwoProcessFixture } from './desktopFramedSyncTwoProcess.testSupport.js';

const leftSource = '11111111-1111-4111-8111-111111111111';
const rightSource = '22222222-2222-4222-8222-222222222222';
const day = '2026-10-10';
const now = '2026-10-10T00:00:00.000Z';

async function contribute(file: string, sourceId: string, durationMs: number) {
  const sqlite = new Database(file);
  try {
    const payload = { source_id: sourceId, day_key: day, duration_ms: durationMs };
    await createBetterSqliteDbPort(sqlite).transaction(tx => applySyncObjectInTransaction(tx, {
      object_type: 'foreground_daily_time', object_id: `${sourceId}:${day}`, deleted_at: null,
      payload_json: JSON.stringify(payload), content_hash: computeSyncContentHash('foreground_daily_time', payload), updated_at: now
    }));
  } finally { sqlite.close(); }
}

function total(file: string) {
  const sqlite = new Database(file, { readonly: true });
  try { return sqlite.prepare('SELECT COALESCE(SUM(duration_ms), 0) FROM foreground_daily_time').pluck().get(); }
  finally { sqlite.close(); }
}

async function converge(fixture: Awaited<ReturnType<typeof createDesktopFramedSyncTwoProcessFixture>>) {
  await reconnectFixturePeer(fixture.left, await fixture.right.snapshot());
  await reconnectFixturePeer(fixture.right, await fixture.left.snapshot());
  expect(await readFixtureInventory(fixture.left)).toEqual(await readFixtureInventory(fixture.right));
}

it('adds independent offline contributions once across authenticated transfers, replay and process restarts', async () => {
  const fixture = await createDesktopFramedSyncTwoProcessFixture();
  try {
    await contribute(fixture.leftSnapshot.databasePath, leftSource, 600_000);
    await contribute(fixture.rightSnapshot.databasePath, rightSource, 600_000);
    await converge(fixture);
    for (const file of [fixture.leftSnapshot.databasePath, fixture.rightSnapshot.databasePath]) expect(total(file)).toBe(1_200_000);
    await contribute(fixture.leftSnapshot.databasePath, leftSource, 720_000);
    await contribute(fixture.rightSnapshot.databasePath, rightSource, 780_000);
    await fixture.restartLeft(); await fixture.restartRight();
    await converge(fixture); await converge(fixture);
    await contribute(fixture.rightSnapshot.databasePath, leftSource, 600_000);
    await converge(fixture);
    for (const file of [fixture.leftSnapshot.databasePath, fixture.rightSnapshot.databasePath]) expect(total(file)).toBe(1_500_000);
  } finally {
    await Promise.allSettled([fixture.left.close(), fixture.right.close()]);
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
}, 60_000);

it('preserves unpublished maxima on overwrite and publishes them with later independent contributions after reopening', async () => {
  const fixture = await createDesktopFramedSyncTwoProcessFixture();
  try {
    const sourceFile = fixture.leftSnapshot.databasePath, receiverFile = fixture.rightSnapshot.databasePath;
    await contribute(sourceFile, leftSource, 60_000);
    await contribute(receiverFile, leftSource, 100_000);
    await contribute(receiverFile, rightSource, 20_000);
    const sqlite = new Database(receiverFile);
    let originalSource: string;
    try {
      originalSource = await loadForegroundSourceWithDbPort(createBetterSqliteDbPort(sqlite), rightSource);
      sqlite.prepare("DELETE FROM sync_object_state WHERE object_type = 'foreground_daily_time'").run();
    } finally { sqlite.close(); }
    const args = { mode: 'restore', peerOrigin: fixture.leftSnapshot.origin,
      peerDeviceId: 'desktop-a', restoreId: 'foreground-restore' };
    await fixture.right.invoke('begin_identity_restore', args);
    expect(await fixture.right.invoke('identity_restore_round', args)).toMatchObject({ complete: true });
    expect(total(receiverFile)).toBe(120_000);
    const restored = new Database(receiverFile);
    let freshSource: string;
    try {
      freshSource = await loadForegroundSourceWithDbPort(createBetterSqliteDbPort(restored), rightSource);
      expect(freshSource).not.toBe(originalSource);
      expect(restored.prepare("SELECT count(*) FROM sync_object_state WHERE object_type = 'foreground_daily_time'").pluck().get()).toBe(2);
    } finally { restored.close(); }
    await fixture.restartRight();
    await contribute(receiverFile, freshSource, 10_000);
    await converge(fixture); await converge(fixture);
    for (const file of [sourceFile, receiverFile]) expect(total(file)).toBe(130_000);
  } finally {
    await Promise.allSettled([fixture.left.close(), fixture.right.close()]);
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
}, 60_000);
