// @vitest-environment node
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

import { expect, it } from 'vitest';

import { COMPANION_SCHEMA_STATEMENTS } from '../../lib/core/database/companionSchemaStatements';
import type { DbParams, DbPort, DbRow } from '../../lib/core/sync/dbPort';

import { seedCapacityNodes } from './capacityAcceptanceFixture';

it('prepares representative metadata against the real companion schema', async () => {
  const sqlite = new DatabaseSync(':memory:');
  const db: DbPort = {
    query: async <T extends DbRow>(sql: string, params: DbParams = []) => sqlite.prepare(sql).all(...params) as T[],
    run: async (sql, params = []) => {
      const result = sqlite.prepare(sql).run(...params);
      return { changes: Number(result.changes), lastInsertRowId: result.lastInsertRowid };
    },
    transaction: async (action) => {
      sqlite.exec('BEGIN');
      try {
        const result = await action(db);
        sqlite.exec('COMMIT');
        return result;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    }
  };
  try {
    for (const sql of COMPANION_SCHEMA_STATEMENTS) sqlite.exec(sql);
    await seedCapacityNodes(db, 0, 1000, 'T219-isolated');
    expect(sqlite.prepare('SELECT COUNT(*) AS count FROM nodes').get()?.count).toBe(1000);
    expect(sqlite.prepare('SELECT COUNT(*) AS count FROM node_review').get()?.count).toBe(200);
    expect(sqlite.prepare('SELECT state, repetition_count FROM node_reading LIMIT 1').get())
      .toEqual({ state: 'active', repetition_count: 0 });
    expect(sqlite.prepare('SELECT scroll_top, source FROM node_view_state LIMIT 1').get())
      .toEqual({ scroll_top: 100, source: 'user-scroll' });
    const blob = sqlite.prepare('SELECT hash, data, typeof(data) AS storage FROM content_blob_data LIMIT 1').get()!;
    expect(blob.storage).toBe('blob');
    expect(blob.data).toHaveLength(4096);
    expect(createHash('sha256').update(blob.data as Uint8Array).digest('hex')).toBe(blob.hash);
  } finally {
    sqlite.close();
  }
});
