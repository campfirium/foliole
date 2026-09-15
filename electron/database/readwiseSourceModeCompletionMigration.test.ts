// @vitest-environment node

import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it } from 'vitest';

import {
  DATABASE_SCHEMA_VERSION,
  initializeDatabaseSchema
} from '../../lib/core/database/migrations.js';

let sqlite: Database.Database;

beforeEach(() => {
  sqlite = new Database(':memory:');
  initializeDatabaseSchema(sqlite);
  sqlite.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('host_name', ?, 'host')")
    .run(JSON.stringify('This Mac'));
});

afterEach(() => sqlite.close());

it('invalidates a deployed v2 completion when schema 89 upgrades', () => {
  const completion = {
    batchId: 'old-batch', completedAt: 'old-done',
    sourceHost: 'This Mac', startedAt: 'old-start'
  };
  saveSetting('readwise_source_cutover_v2', {
    annotations: [], batchId: completion.batchId, cohortDocumentIds: ['document-1'],
    completedAt: completion.completedAt, completionVersion: 2,
    documents: [{ nodeId: 'topic-1', remoteId: 'document-1', status: 'materialized' }],
    phase: null, retiredNodeIds: [], sourceHost: completion.sourceHost,
    startedAt: completion.startedAt, status: 'api', version: 2
  });
  saveSetting('readwise_source_mode', { completion, mode: 'api', version: 1 });
  sqlite.pragma('user_version = 89');

  initializeDatabaseSchema(sqlite);

  expect(readSetting('readwise_source_mode')).toEqual({ mode: 'relay', version: 1 });
  expect(readSetting('readwise_source_mode_conflict')).toEqual({ reasons: [], version: 1 });
  expect(readSetting('readwise_source_cutover_v2')).toMatchObject({
    completionVersion: 2, status: 'api'
  });
  expect(sqlite.pragma('user_version', { simple: true })).toBe(DATABASE_SCHEMA_VERSION);
});

function saveSetting(key: string, value: unknown) {
  sqlite.prepare(`INSERT INTO settings (key, value, updated_at) VALUES (?, ?, 'old')
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`)
    .run(key, JSON.stringify(value));
}

function readSetting(key: string) {
  const row = sqlite.prepare('SELECT value FROM settings WHERE key = ?')
    .get(key) as { value: string } | undefined;
  return row ? JSON.parse(row.value) as Record<string, unknown> : null;
}
