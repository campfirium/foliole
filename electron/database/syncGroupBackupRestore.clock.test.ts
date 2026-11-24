// @vitest-environment node

import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { backup, DatabaseSync } from 'node:sqlite';

import { expect, it } from 'vitest';

import { DESKTOP_FRESH_SCHEMA_STATEMENTS } from '../../lib/core/database/desktopFreshSchemaStatements.js';
import { registerStoredImportLocatorKey } from '../../lib/core/database/storedImportLocatorSchema.js';
import { prepareSyncGroupOverwrite } from '../../lib/core/sync/syncGroupOverwriteProgress.js';
import { markSyncGroupRestoreApplied } from '../../lib/core/sync/syncGroupRestoreEvents.js';
import { applySyncNodesWithDbPort } from '../../lib/core/sync/syncNodeApplyExecutor.js';
import { loadCurrentSyncNodeRecord } from '../../lib/core/sync/syncNodeGraph.js';
import { parseSyncGroupRestoreEvent } from '../../lib/platform/syncGroupRestoreContract.js';

import { nodeSqliteTestDriver, nodeSqliteTestPort } from './nodeSqlite.testSupport.js';
import { captureCurrentSyncGroupForBackupRestore, finishSyncGroupBackupRestore } from './syncGroupBackupRestore.js';
import { loadDesktopSyncGroupRestoreState, receiveDesktopSyncGroupRestoreState } from './syncGroupRestoreState.js';
import { textBranch } from './topicTextState.testSupport.js';

function createLibrary(file: string, deviceId: string) {
  const sqlite = new DatabaseSync(file);
  registerStoredImportLocatorKey(sqlite);
  for (const sql of DESKTOP_FRESH_SCHEMA_STATEMENTS) sqlite.exec(sql);
  sqlite.exec("INSERT INTO sync_groups VALUES ('group', 'Group', 'key', 'now', 'now')");
  sqlite.prepare("INSERT INTO sync_group_local_state VALUES (1, 'group', ?, 'active', 'now')").run(deviceId);
  sqlite.prepare("INSERT INTO settings VALUES ('host_name', ?, 'now')").run(deviceId);
  return sqlite;
}

function restoreGeneration(sqlite: DatabaseSync) {
  return sqlite.prepare('SELECT source_epoch FROM sync_state_sequence').get()?.source_epoch;
}

async function deliverRestore(source: DatabaseSync, target: DatabaseSync, expectedBody: string) {
  const outbound = loadDesktopSyncGroupRestoreState(nodeSqliteTestDriver(source), 'group')!;
  expect(outbound).toMatchObject({ event: { restore_id: restoreGeneration(source) }, applied: true });
  const event = parseSyncGroupRestoreEvent(JSON.parse(JSON.stringify(outbound.event)));
  const inbound = receiveDesktopSyncGroupRestoreState(nodeSqliteTestDriver(target), 'group', { event, applied: true });
  expect(inbound).toEqual({ event, applied: false });
  const port = nodeSqliteTestPort(target);
  await prepareSyncGroupOverwrite(port, { groupId: 'group', overwriteId: event.restore_id,
    providerDeviceId: 'source', providerLibraryEpoch: event.restore_id,
    receiverDeviceId: 'target', receiverLibraryEpoch: event.restore_id });
  const topic = await loadCurrentSyncNodeRecord(nodeSqliteTestPort(source), 'topic');
  expect(topic?.body_text).toBe(expectedBody);
  await applySyncNodesWithDbPort(port, [topic!]);
  await markSyncGroupRestoreApplied(port, event);
  expect((await loadCurrentSyncNodeRecord(port, 'topic'))?.body_text).toBe(expectedBody);
  expect(restoreGeneration(target)).toBe(event.restore_id);
  return event.restore_id;
}

it('publishes consecutive backup overwrites to a second library after a clock rollback', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'foliole-restore-order-'));
  const source = createLibrary(path.join(root, 'source.db'), 'source');
  const targetFile = path.join(root, 'target.db');
  const target = createLibrary(targetFile, 'target');
  const first = '2026-10-01T12:00:00.000Z';
  const earlier = '2026-09-27T12:00:00.000Z';
  let saved: DatabaseSync | undefined;
  try {
    const firstPath = path.join(root, 'first.db');
    await backup(source, firstPath);
    const firstBackup = new DatabaseSync(firstPath);
    registerStoredImportLocatorKey(firstBackup);
    try {
      const snapshot = captureCurrentSyncGroupForBackupRestore(nodeSqliteTestDriver(source));
      await applySyncNodesWithDbPort(nodeSqliteTestPort(firstBackup), [textBranch('first-version', 'First backup')]);
      finishSyncGroupBackupRestore(nodeSqliteTestDriver(firstBackup), snapshot, first);
      await deliverRestore(firstBackup, target, 'First backup');
      await applySyncNodesWithDbPort(nodeSqliteTestPort(source), [textBranch('second-version', 'Second backup')]);
      const snapshotAfterFirst = captureCurrentSyncGroupForBackupRestore(nodeSqliteTestDriver(firstBackup));
      finishSyncGroupBackupRestore(nodeSqliteTestDriver(source), snapshotAfterFirst, earlier);
    } finally {
      firstBackup.close();
    }
    const newestId = await deliverRestore(source, target, 'Second backup');
    expect(source.prepare('SELECT applied_at FROM sync_group_restore_events WHERE restore_id = ?').get(newestId))
      .toEqual({ applied_at: earlier });
    saved = new DatabaseSync(targetFile, { readOnly: true });
    expect((await loadCurrentSyncNodeRecord(nodeSqliteTestPort(saved), 'topic'))?.body_text).toBe('Second backup');
    expect(loadDesktopSyncGroupRestoreState(nodeSqliteTestDriver(saved), 'group')).toMatchObject({
      event: { restore_id: newestId }, applied: true
    });
  } finally {
    saved?.close();
    target.close();
    source.close();
    await rm(root, { recursive: true, force: true });
  }
});
