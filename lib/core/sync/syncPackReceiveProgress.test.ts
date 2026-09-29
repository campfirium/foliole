import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { createBetterSqliteDbPort } from '../../../electron/database/betterSqliteDbPort.js';
import { SYNC_PACK_PROGRESS_SCHEMA_STATEMENTS } from '../database/syncPackProgressSchemaStatements.js';

import {
  isRetiredSyncPackSourceEpoch,
  saveSyncPackReceiveProgress,
  shouldApplySyncPackPage
} from './syncPackReceiveProgress.js';

it('accepts ordinary changes after a completed restore while retaining cursor continuity', () => {
  const progress = { completed: true, cursorStateSeq: 8, frontierStateSeq: 8,
    groupId: 'group', peerId: 'peer', restoreId: 'restore-a', sourceEpoch: 'epoch-a' };
  const next = { sourceEpoch: 'epoch-a', fromStateSeq: 8, toStateSeq: 9, frontierStateSeq: 9 };
  expect(shouldApplySyncPackPage(next, progress, 8, false)).toBe(true);
  expect(() => shouldApplySyncPackPage({ ...next, fromStateSeq: 7 }, progress, 8, false))
    .toThrow('sync_pack_cursor_not_contiguous');
  expect(() => shouldApplySyncPackPage(next, { ...progress, completed: false }, 8, false))
    .toThrow('sync_pack_restore_event_changed');
  expect(() => shouldApplySyncPackPage({ ...next, restoreId: 'restore-b' }, progress, 8, false))
    .toThrow('sync_pack_restore_event_changed');
});

it('continues an incomplete receive round when the same source advances its frontier', async () => {
  const sqlite = new Database(':memory:');
  try {
    for (const statement of SYNC_PACK_PROGRESS_SCHEMA_STATEMENTS) sqlite.exec(statement);
    const port = createBetterSqliteDbPort(sqlite);
    await saveSyncPackReceiveProgress(port, 'group', 'peer', {
      sourceEpoch: 'epoch-a', fromStateSeq: 0, toStateSeq: 22, frontierStateSeq: 96
    });
    const progress = { completed: false, cursorStateSeq: 22, frontierStateSeq: 96,
      groupId: 'group', peerId: 'peer', restoreId: null, sourceEpoch: 'epoch-a' };
    const next = { sourceEpoch: 'epoch-a', fromStateSeq: 22,
      toStateSeq: 23, frontierStateSeq: 468 };
    expect(shouldApplySyncPackPage(next, progress, 22, false)).toBe(true);
    expect(() => shouldApplySyncPackPage({ ...next, fromStateSeq: 21 }, progress, 22, false))
      .toThrow('sync_pack_cursor_not_contiguous');
    expect(() => shouldApplySyncPackPage({ ...next, frontierStateSeq: 95 }, progress, 22, false))
      .toThrow('sync_pack_frontier_changed');
    await saveSyncPackReceiveProgress(port, 'group', 'peer', next);
    expect(sqlite.prepare(`SELECT cursor_state_seq, frontier_state_seq, completed
      FROM sync_pack_receive_progress`).get()).toEqual({
      cursor_state_seq: 23, frontier_state_seq: 468, completed: 0
    });
  } finally { sqlite.close(); }
});

it('keeps a retired authenticated source epoch from replacing a newer receive cursor', async () => {
  const sqlite = new Database(':memory:');
  try {
    for (const statement of SYNC_PACK_PROGRESS_SCHEMA_STATEMENTS) sqlite.exec(statement);
    const port = createBetterSqliteDbPort(sqlite);
    const first = { sourceEpoch: 'epoch-a', fromStateSeq: 0, toStateSeq: 5, frontierStateSeq: 5 };
    const next = { sourceEpoch: 'epoch-b', fromStateSeq: 0, toStateSeq: 1, frontierStateSeq: 3 };
    await port.transaction(async (tx) => {
      await saveSyncPackReceiveProgress(tx, 'group', 'peer', first);
      await saveSyncPackReceiveProgress(tx, 'group', 'peer', next);
    });
    expect(await isRetiredSyncPackSourceEpoch(port, 'group', 'peer', 'epoch-a')).toBe(true);
    expect(() => shouldApplySyncPackPage(first, {
      completed: false, cursorStateSeq: 1, frontierStateSeq: 3,
      groupId: 'group', peerId: 'peer', restoreId: null, sourceEpoch: 'epoch-b'
    }, 1, true)).toThrow('sync_pack_source_epoch_retired');
    expect(() => shouldApplySyncPackPage(next, null, 5, false))
      .toThrow('sync_pack_source_epoch_unproven');
  } finally { sqlite.close(); }
});

it('records an empty new source epoch and retires the previous one', async () => {
  const sqlite = new Database(':memory:');
  try {
    for (const statement of SYNC_PACK_PROGRESS_SCHEMA_STATEMENTS) sqlite.exec(statement);
    const port = createBetterSqliteDbPort(sqlite);
    await saveSyncPackReceiveProgress(port, 'group', 'peer', {
      sourceEpoch: 'epoch-a', fromStateSeq: 0, toStateSeq: 5, frontierStateSeq: 5
    });
    const empty = { sourceEpoch: 'epoch-b', fromStateSeq: 0,
      toStateSeq: 0, frontierStateSeq: 0 };
    expect(shouldApplySyncPackPage(empty, null, 0, false)).toBe(true);
    expect(shouldApplySyncPackPage(empty, {
      completed: true, cursorStateSeq: 5, frontierStateSeq: 5,
      groupId: 'group', peerId: 'peer', restoreId: null, sourceEpoch: 'epoch-a'
    }, 0, false)).toBe(true);
    await saveSyncPackReceiveProgress(port, 'group', 'peer', empty);
    expect(await isRetiredSyncPackSourceEpoch(port, 'group', 'peer', 'epoch-a')).toBe(true);
  } finally { sqlite.close(); }
});
