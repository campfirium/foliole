// @vitest-environment node

import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it } from 'vitest';

import { FRAMED_SYNC_STAGING_SCHEMA } from './framedSyncStagingSchema.js';

let sqlite: Database.Database;

beforeEach(() => {
  sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  for (const sql of FRAMED_SYNC_STAGING_SCHEMA) sqlite.exec(sql);
});

afterEach(() => sqlite.close());

it('installs every framed sync staging relation without a migration registry', () => {
  const tables = sqlite.prepare(`SELECT name FROM sqlite_master
    WHERE type = 'table' AND name LIKE 'framed_sync_%' ORDER BY name`).all();
  expect(tables).toHaveLength(17);
  expect(tables).toContainEqual({ name: 'framed_sync_outbound_publications' });
  expect(tables).toContainEqual({ name: 'framed_sync_inbound_attempts' });
  expect(tables).toContainEqual({ name: 'framed_sync_blob_pins' });
  expect(tables).toContainEqual({ name: 'framed_sync_receipts' });
});

it('enforces attempt state and parent ownership in SQLite', () => {
  expect(() => sqlite.prepare(`INSERT INTO framed_sync_outbound_attempts
    VALUES (?, 'transfer', ?, ?, ?, 'unknown')`).run(
    Buffer.alloc(32), Buffer.alloc(16), Buffer.alloc(4), Buffer.alloc(96)
  )).toThrow();
  expect(() => sqlite.prepare(`INSERT INTO framed_sync_inbound_facts
    VALUES (?, ?, 1, 'node', 'global', 'fact', ?)`
  ).run(Buffer.alloc(32), Buffer.alloc(16), Buffer.from('fact'))).toThrow();
});
