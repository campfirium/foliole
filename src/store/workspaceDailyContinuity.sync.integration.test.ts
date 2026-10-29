// @vitest-environment node
import Database from 'better-sqlite3';
import { afterEach, expect, it } from 'vitest';

import { closeLibraries } from '../../electron/database/syncLibrary.testSupport';
import { createDailyFlowDayWindow } from '../../lib/core/flow/dailyFlowDayWindow';
import { readCycleRows, readDailyFlow } from '../../lib/core/flow/dailyFlowStorage';
import { clearWorkgroupSyncDataForRestore } from '../../lib/core/sync/syncGroupRestoreReset';
import { act, exchange, node, now, open, setupPeers, settings } from '../test/dailyFlowExceptions.testSupport';
import { historyEntry, replayHistory } from '../test/dailyFlowHistorySync.testSupport';

afterEach(closeLibraries);

it('receives learning operations without creating a list, then starts its own durable list', async () => {
  const [source, receiver] = await setupPeers();
  node(source, 'reading-one', 'topic'); node(source, 'reading-two', 'topic');
  await exchange(source, receiver);
  const initial = await open(source);
  const advanced = await act(source, initial, 'soon');
  await exchange(source, receiver);
  expect(await readDailyFlow(receiver.port)).toBeNull();
  expect(await readCycleRows(receiver.port)).toEqual([]);
  const reopened = await open(receiver);
  expect(reopened.currentNodeId).not.toBe(initial.currentNodeId);
  expect(reopened.readTopicCount).toBe(1);
  expect(reopened.daily!.scope).not.toBe(advanced.daily!.scope);
  expect(receiver.db.prepare('SELECT root_id FROM daily_flow_sync_projection').get())
    .not.toEqual(source.db.prepare('SELECT root_id FROM daily_flow_sync_projection').get());
  expect(await open(receiver)).toEqual(reopened);
});

it('keeps local state and received operation facts unchanged on repeated synchronization and independent reread', async () => {
  const [source, receiver] = await setupPeers();
  node(source, 'reading', 'topic');
  await exchange(source, receiver);
  await act(source, await open(source), 'soon');
  await exchange(source, receiver);
  const state = await readDailyFlow(receiver.port);
  const rows = await readCycleRows(receiver.port);
  const facts = receiver.db.prepare('SELECT * FROM daily_flow_sync_facts ORDER BY id').all();
  await exchange(receiver, source);
  expect(await readDailyFlow(receiver.port)).toEqual(state);
  expect(await readCycleRows(receiver.port)).toEqual(rows);
  const reader = new Database(receiver.file, { readonly: true });
  try {
    expect(reader.prepare('SELECT * FROM daily_flow_sync_facts ORDER BY id').all()).toEqual(facts);
    expect(reader.prepare('SELECT * FROM daily_flow_entries ORDER BY order_key').all()).toEqual(rows);
  } finally { reader.close(); }
});

it('rolls back the list and learning mutation when recording the synchronized operation fails', async () => {
  const [peer] = await setupPeers();
  node(peer, 'review', 'item');
  const session = await open(peer);
  const state = await readDailyFlow(peer.port);
  const rows = await readCycleRows(peer.port);
  const reviews = peer.db.prepare('SELECT * FROM review_log ORDER BY op_id').all();
  peer.db.exec(`CREATE TRIGGER reject_flow_sync BEFORE INSERT ON daily_flow_sync_facts
    BEGIN SELECT RAISE(ABORT, 'disk full'); END`);
  await expect(act(peer, session, 'grade')).rejects.toThrow('disk full');
  expect(await readDailyFlow(peer.port)).toEqual(state);
  expect(await readCycleRows(peer.port)).toEqual(rows);
  expect(peer.db.prepare('SELECT * FROM review_log ORDER BY op_id').all()).toEqual(reviews);
  expect(peer.db.prepare('SELECT * FROM daily_flow_operations').all()).toEqual([]);
});

it('does not acknowledge an operation whose storage fails and receives it after recovery', async () => {
  const [source, receiver] = await setupPeers();
  node(source, 'reading', 'topic');
  await exchange(source, receiver);
  await act(source, await open(source), 'soon');
  receiver.db.exec(`CREATE TRIGGER reject_received_flow BEFORE INSERT ON daily_flow_sync_facts
    BEGIN SELECT RAISE(ABORT, 'disk full'); END`);
  await expect(exchange(source, receiver)).rejects.toThrow('disk full');
  expect(await readDailyFlow(receiver.port)).toBeNull();
  expect(receiver.db.prepare('SELECT * FROM daily_flow_sync_facts').all()).toEqual([]);
  expect(receiver.db.prepare("SELECT * FROM sync_object_state WHERE object_type='daily_flow'").all()).toEqual([]);
  receiver.db.exec('DROP TRIGGER reject_received_flow');
  await exchange(source, receiver);
  expect(await readDailyFlow(receiver.port)).toBeNull();
  expect((await open(receiver)).readTopicCount).toBe(1);
});

it('receives targeted Soon undo and restores its own rows and progress', async () => {
  const [source, receiver] = await setupPeers();
  node(source, 'reading-one', 'topic'); node(source, 'reading-two', 'topic');
  await exchange(source, receiver);
  await open(receiver);
  const rows = await readCycleRows(receiver.port);
  const entry = await historyEntry(source, 'reading-one', 'soon', now);
  await exchange(source, receiver);
  expect((await open(receiver)).readTopicCount).toBe(1);
  await replayHistory(source, await open(source), entry, 'undo', now);
  await exchange(source, receiver);
  expect((await open(receiver)).readTopicCount).toBe(0);
  expect(await readCycleRows(receiver.port)).toEqual(rows);
});

it('removes the old list and its shared facts during an explicit library overwrite', async () => {
  const [source, receiver] = await setupPeers();
  node(source, 'reading', 'topic');
  await exchange(source, receiver);
  await act(source, await open(source), 'soon');
  await exchange(source, receiver);
  expect(receiver.db.prepare('SELECT id FROM daily_flow_sync_facts').all().length).toBeGreaterThan(0);
  await receiver.port.transaction(tx => clearWorkgroupSyncDataForRestore(tx, 'replacement-library'));
  expect(await readDailyFlow(receiver.port)).toBeNull();
  expect(await readCycleRows(receiver.port)).toEqual([]);
  expect(receiver.db.prepare('SELECT * FROM daily_flow_sync_facts').all()).toEqual([]);
  expect(receiver.db.prepare('SELECT * FROM daily_flow_sync_projection').all()).toEqual([]);
  expect((await open(receiver)).currentNodeId).toBeNull();
});

it('uses its own day interval and starts a new list at local expiry', async () => {
  const [source, receiver] = await setupPeers();
  node(source, 'reading-one', 'topic'); node(source, 'reading-two', 'topic');
  await exchange(source, receiver);
  const sourceWindow = { start: '2026-10-26T06:30:00.000Z', end: '2026-10-27T06:30:00.000Z' };
  expect(sourceWindow).not.toEqual(createDailyFlowDayWindow(now, settings(receiver).newDayStartsAtHour));
  const initial = await open(source, now, { ...settings(source), dayWindow: sourceWindow });
  const advanced = await act(source, initial, 'soon');
  expect(advanced.dayWindow).toEqual(sourceWindow);
  await exchange(source, receiver);
  const received = await open(receiver);
  expect(received.dayWindow).toEqual(createDailyFlowDayWindow(now, settings(receiver).newDayStartsAtHour));
  expect(received.daily!.dayKey).not.toBe(advanced.daily!.dayKey);
  expect(received.currentNodeId).toBe(advanced.currentNodeId);
  const tomorrow = await open(receiver, sourceWindow.end);
  expect(tomorrow.daily!.dayKey).not.toBe(advanced.daily!.dayKey);
  expect(tomorrow.dayWindow).toEqual(createDailyFlowDayWindow(sourceWindow.end, settings(receiver).newDayStartsAtHour));
});

it('does not inherit another device interval when its clock is just behind that start', async () => {
  const [source, receiver] = await setupPeers();
  node(source, 'reading', 'topic');
  await exchange(source, receiver);
  const dayWindow = { start: '2026-10-26T08:00:00.000Z', end: '2026-10-27T08:00:00.000Z' };
  const created = await open(source, '2026-10-26T08:01:00.000Z', { ...settings(source), dayWindow });
  await exchange(source, receiver);
  const received = await open(receiver, '2026-10-26T07:59:30.000Z');
  expect(received.dayWindow).toEqual(createDailyFlowDayWindow('2026-10-26T07:59:30.000Z', settings(receiver).newDayStartsAtHour));
  expect(received.daily!.dayKey).not.toBe(created.daily!.dayKey);
  expect(received.currentNodeId).toBe(created.currentNodeId);
  expect(receiver.db.prepare("SELECT COUNT(*) AS total FROM daily_flow_sync_facts WHERE kind='create'").get()).toEqual({ total: 1 });
});
