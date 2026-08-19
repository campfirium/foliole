import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { DbPort } from '../../../../../lib/core/sync/dbPort';
import { createCapacitorSqliteDbPort } from '../../capacitorSqliteDbPort';
import { createFakeCapacitorConnection, installCompanionNodeSchema } from '../../companionSyncNodeVersionsTestSupport';

const ownerState = vi.hoisted(() => ({ port: null as unknown }));

vi.mock('./iosCompanionDatabaseBootstrap', () => ({
  getIosCompanionDatabaseOwner: vi.fn(() => ({
    read: <T>(task: (db: DbPort) => Promise<T>) => task(ownerState.port as DbPort),
    runWriter: <T>(task: (db: DbPort) => Promise<T>) => task(ownerState.port as DbPort)
  }))
}));

import {
  saveIosActiveViewState,
  saveIosNodeViewState,
  saveIosOpenState,
  saveIosReading,
  saveIosReview,
  saveIosSetting
} from './iosCompanionActiveDatabaseWrites';

let database: Database.Database | null = null;

beforeEach(() => {
  database = new Database(':memory:');
  installCompanionNodeSchema(database);
  database.exec(`
    INSERT INTO companion_meta (key, value, updated_at) VALUES ('device_id', 'ios-device', '2026-08-06T00:00:00Z');
    INSERT INTO companion_meta (key, value, updated_at) VALUES ('host_name', 'iPhone', '2026-08-06T00:00:00Z');
    INSERT INTO nodes (id, title, created_at, updated_at)
    VALUES ('node-1', 'Node 1', '2026-08-06T00:00:00Z', '2026-08-06T00:00:00Z');
  `);
  ownerState.port = createCapacitorSqliteDbPort(createFakeCapacitorConnection(database) as never, 'ios');
});

afterEach(() => {
  database?.close();
  database = null;
});

it('persists iOS setting, reading, review, open, and view state through one shared DbPort', async () => {
  await saveIosSetting({ key: 'app_settings', value_json: '{}' });
  await saveIosOpenState({ last_opened_at: '2026-08-06T01:00:00Z', node_id: 'node-1' });
  await saveIosReading({
    node_id: 'node-1',
    reading_json: JSON.stringify({
      interval_duration_ms: 60000, interval_growth_factor: 1.5, last_handled_at: '2026-08-06T01:00:00Z',
      next_at: '2026-08-06T01:01:00Z', priority: 2, reading_position: 42, repetition_count: 3, state: 'active'
    })
  });
  await saveIosReview({
    node_id: 'node-1',
    review_json: JSON.stringify({ difficulty: 5, due: '2026-08-07T00:00:00Z', elapsed_days: 1,
      lapses: 0, last_review_at: '2026-08-06T00:00:00Z', reps: 2, scheduled_days: 1, stability: 3, state: 2 })
  });
  await saveIosActiveViewState({ node_id: 'node-1' });
  await saveIosNodeViewState({ node_id: 'node-1', scroll_top: 42.8 });

  expect(database?.prepare("SELECT value FROM workspace_meta WHERE key = 'active_node_id'").pluck().get()).toBe('node-1');
  expect(database?.prepare('SELECT scroll_top FROM node_view_state WHERE node_id = ?').pluck().get('node-1')).toBe(42);
  expect(database?.prepare('SELECT state FROM node_reading WHERE node_id = ?').pluck().get('node-1')).toBe('active');
  expect(database?.prepare('SELECT state FROM node_review WHERE node_id = ?').pluck().get('node-1')).toBe(2);
  expect(database?.prepare('SELECT count(*) FROM sync_object_state WHERE sync_dirty = 1').pluck().get()).toBe(6);
});
