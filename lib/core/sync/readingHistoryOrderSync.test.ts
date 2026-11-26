import { DatabaseSync } from 'node:sqlite';

import { expect, it } from 'vitest';

import { companionPort } from '../database/fsrs7Migration.testSupport.js';
import { nextReadingHistoryOrderAt, readingOrderAt } from '../review/readingHistoryOrder.js';

import { applySyncObjectInTransaction } from './syncObjectApplyExecutor.js';
import { applyNodeReadingObject } from './syncObjectLearningPayloadExecutor.js';

const dismissed = { interval_duration_ms: 0, interval_growth_factor: 1, last_handled_at: '2026-11-25T10:00:00.000Z',
  next_at: '2026-11-25T10:00:00.000Z', priority: 50, repetition_count: 5, state: 'dismissed' };
const earlier = { interval_duration_ms: 86_400_000, interval_growth_factor: 2, last_handled_at: '2026-11-20T00:00:00.000Z',
  next_at: '2026-11-30T00:00:00.000Z', priority: 50, repetition_count: 4, state: 'active' };

function library(stored: Record<string, unknown>) {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`CREATE TABLE node_reading (node_id TEXT PRIMARY KEY, interval_duration_ms INTEGER NOT NULL DEFAULT 0,
    interval_growth_factor REAL NOT NULL DEFAULT 1, last_handled_at TEXT NOT NULL, next_at TEXT NOT NULL,
    priority REAL NOT NULL DEFAULT 0, repetition_count INTEGER NOT NULL DEFAULT 0, state TEXT NOT NULL DEFAULT 'active',
    history_order_at TEXT);
    CREATE TABLE node_reading_host_state (node_id TEXT, host_name TEXT, reading_position INTEGER, updated_at TEXT,
      PRIMARY KEY (node_id, host_name));
    CREATE TABLE sync_object_state (object_type TEXT, object_id TEXT, state_seq INTEGER, content_hash TEXT,
      last_modified_by_host_name TEXT, updated_at TEXT, sync_dirty INTEGER, deleted_at TEXT,
      PRIMARY KEY (object_type, object_id));
    CREATE TABLE node_sync_tombstones (node_id TEXT PRIMARY KEY);
    CREATE TABLE sync_state_sequence (singleton_id INTEGER PRIMARY KEY, high_water INTEGER NOT NULL);
    INSERT INTO sync_state_sequence VALUES (1, 1);
    CREATE TABLE daily_flow_sync_facts (id TEXT, kind TEXT, occurred_at TEXT, payload_json TEXT);`);
  sqlite.prepare(`INSERT INTO node_reading (node_id, interval_duration_ms, interval_growth_factor, last_handled_at, next_at,
    priority, repetition_count, state, history_order_at) VALUES ('n', ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    stored.interval_duration_ms as number, stored.interval_growth_factor as number, stored.last_handled_at as string,
    stored.next_at as string, stored.priority as number, stored.repetition_count as number, stored.state as string,
    (stored.history_order_at as string | undefined) ?? null);
  sqlite.prepare(`INSERT INTO sync_object_state (object_type, object_id, state_seq, content_hash, updated_at, sync_dirty)
    VALUES ('node_reading', 'n', 1, 'stored', ?, 0)`).run(stored.last_handled_at as string);
  const port = companionPort(sqlite);
  const record = (payload: Record<string, unknown>, updatedAt: string) => ({ object_type: 'node_reading' as const,
    object_id: 'n', content_hash: `incoming-${updatedAt}`, deleted_at: null, updated_at: updatedAt,
    payload_json: JSON.stringify({ node_id: 'n', ...payload }) });
  const apply = (payload: Record<string, unknown>, updatedAt: string) => applyNodeReadingObject(port, record(payload, updatedAt));
  /** The whole sync entry, including the write-time check in front of the reading's own ranking. */
  const receive = (payload: Record<string, unknown>, updatedAt: string) =>
    applySyncObjectInTransaction(port, record(payload, updatedAt));
  const read = () => sqlite.prepare('SELECT state, repetition_count, history_order_at FROM node_reading WHERE node_id = ?').get('n');
  return { apply, read, receive };
}

it('lets an undo that restores older progress win over the reading it reversed', async () => {
  const peer = library(dismissed);
  await peer.apply({ ...earlier, history_order_at: '2026-11-25T10:01:00.000Z' }, '2026-11-25T10:01:00.000Z');
  expect(peer.read()).toEqual({ state: 'active', repetition_count: 4, history_order_at: '2026-11-25T10:01:00.000Z' });
});

it('keeps the reversed reading out once the undo has arrived', async () => {
  const peer = library({ ...earlier, history_order_at: '2026-11-25T10:01:00.000Z' });
  expect(await peer.apply(dismissed, '2026-11-25T10:00:00.000Z')).toBe(false);
  expect(peer.read()).toMatchObject({ state: 'active' });
});

it('lets a later reading on another device win over an earlier undo', async () => {
  const peer = library({ ...earlier, history_order_at: '2026-11-25T10:01:00.000Z' });
  await peer.apply({ ...earlier, last_handled_at: '2026-11-25T12:00:00.000Z', repetition_count: 5 }, '2026-11-25T12:00:00.000Z');
  expect(peer.read()).toMatchObject({ state: 'active', repetition_count: 5 });
});

it('still keeps a stale ordinary write from replacing newer progress', async () => {
  const peer = library(dismissed);
  expect(await peer.apply({ ...earlier, priority: 10 }, '2026-11-25T11:00:00.000Z')).toBe(false);
  expect(peer.read()).toMatchObject({ state: 'dismissed' });
});

it('receives an undo written by a slower clock than the reading it reversed', async () => {
  const peer = library(dismissed);
  await peer.receive({ ...earlier, history_order_at: '2026-11-25T10:00:00.001Z' }, '2026-11-25T09:50:00.000Z');
  expect(peer.read()).toMatchObject({ state: 'active', repetition_count: 4 });
});

it('rejects the reversed reading although its write time is newer than the undo', async () => {
  const peer = library({ ...earlier, history_order_at: '2026-11-25T10:00:00.001Z' });
  expect(await peer.receive(dismissed, '2026-11-25T11:00:00.000Z')).toBeNull();
  expect(peer.read()).toMatchObject({ state: 'active' });
});

it('keeps the stored history order when a payload does not carry one', async () => {
  const peer = library({ ...earlier, history_order_at: '2026-11-25T10:01:00.000Z' });
  await peer.apply({ ...earlier, last_handled_at: '2026-11-25T12:00:00.000Z' }, '2026-11-25T12:00:00.000Z');
  expect(peer.read()).toMatchObject({ history_order_at: '2026-11-25T10:01:00.000Z' });
});

it('orders an undo after the reading it replaces even when the device clock runs behind', () => {
  expect(nextReadingHistoryOrderAt('2026-11-25T09:50:00.000Z',
    { last_handled_at: dismissed.last_handled_at, history_order_at: null })).toBe('2026-11-25T10:00:00.001Z');
  expect(nextReadingHistoryOrderAt('2026-11-25T10:05:00.000Z',
    { last_handled_at: dismissed.last_handled_at, history_order_at: null })).toBe('2026-11-25T10:05:00.000Z');
  expect(nextReadingHistoryOrderAt('2026-11-25T10:05:00.000Z', undefined)).toBe('2026-11-25T10:05:00.000Z');
  expect(readingOrderAt('2026-11-20T00:00:00.000Z', null)).toBe('2026-11-20T00:00:00.000Z');
});
