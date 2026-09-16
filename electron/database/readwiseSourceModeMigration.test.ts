// @vitest-environment node

import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it } from 'vitest';

import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import {
  invalidateLegacyReadwiseSourceCompletion,
  migrateReadwiseSourceMode
} from '../../lib/core/database/readwiseSourceModeMigration.js';

let sqlite: Database.Database;

beforeEach(() => {
  sqlite = new Database(':memory:');
  initializeDatabaseSchema(sqlite);
  sqlite.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('host_name', ?, 'host')")
    .run(JSON.stringify('This Mac'));
});

afterEach(() => sqlite.close());

it('moves a clean legacy folder mode into the canonical library setting', () => {
  saveLegacyHost('folder');
  migrateReadwiseSourceMode(sqlite);

  expect(readSetting('readwise_source_mode')).toEqual({ mode: 'relay', version: 1 });
  expect(readSetting('readwise_source_mode_conflict')).toBeNull();
  expect(readSetting('readwise_import_settings')).not.toHaveProperty('readwiseSourceMode');
  expect(readCanonical('readwise_source_mode')).toMatchObject({
    host_name: '*', scope: 'user_space', value_json: JSON.stringify({ mode: 'relay', version: 1 })
  });
  expect(readSyncState('readwise_source_mode')).toMatchObject({ sync_dirty: 1 });
});

it('preserves relay and fails closed when a completed cutover conflicts with it', () => {
  saveLegacyHost('folder');
  saveCompletedCutover();
  migrateReadwiseSourceMode(sqlite);

  expect(readSetting('readwise_source_mode')).toEqual({
    completion: {
      batchId: null, completedAt: 'done', sourceHost: 'This Mac', startedAt: 'start'
    },
    mode: 'relay', version: 1
  });
  expect(readSetting('readwise_source_mode_conflict')).toEqual({
    reasons: ['completion_conflicts_with_mode'], version: 1
  });
});

it('keeps a proved API library enabled without retaining a Host mode copy', () => {
  saveLegacyHost('api');
  saveCompletedCutover();
  migrateReadwiseSourceMode(sqlite);

  expect(readSetting('readwise_source_mode')).toEqual({
    completion: {
      batchId: null, completedAt: 'done', sourceHost: 'This Mac', startedAt: 'start'
    },
    mode: 'api', version: 1
  });
  expect(readSetting('readwise_source_mode_conflict')).toBeNull();
  expect(readSetting('readwise_import_settings')).not.toHaveProperty('readwiseSourceMode');
});

it('returns a historical v2 API claim to relay until the current migration completes', () => {
  saveCompletedCutover(2);
  const completion = {
    batchId: null, completedAt: 'done', sourceHost: 'This Mac', startedAt: 'start'
  };
  sqlite.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('readwise_source_mode', ?, 'done')")
    .run(JSON.stringify({ completion, mode: 'api', version: 1 }));

  invalidateLegacyReadwiseSourceCompletion(sqlite, 'repair');

  expect(readSetting('readwise_source_mode')).toEqual({ mode: 'relay', version: 1 });
  expect(readSetting('readwise_source_mode_conflict')).toEqual({ reasons: [], version: 1 });
  expect(readCanonical('readwise_source_mode')).toMatchObject({
    value_json: JSON.stringify({ mode: 'relay', version: 1 })
  });
});

function saveLegacyHost(mode: string) {
  const value = JSON.stringify({ readwiseSourceMode: mode, version: 6 });
  sqlite.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('readwise_import_settings', ?, 'mode')")
    .run(value);
  sqlite.prepare(`INSERT INTO setting_records
    (key, scope, platform, form_factor, host_name, value_json, content_hash, updated_at)
    VALUES ('readwise_import_settings', 'host', 'windows', 'desktop', 'This Mac', ?, 'old', 'mode')`)
    .run(value);
}

function saveCompletedCutover(completionVersion = 4) {
  const value = JSON.stringify({
    annotations: [], cohortDocumentIds: ['document'], completedAt: 'done', completionVersion,
    documents: [{ nodeId: 'topic', remoteId: 'document', status: 'bound' }], phase: null,
    retiredNodeIds: [], sourceHost: 'This Mac', startedAt: 'start', status: 'api', version: 2
  });
  sqlite.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('readwise_source_cutover_v2', ?, 'done')")
    .run(value);
}

function readSetting(key: string) {
  const row = sqlite.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row ? JSON.parse(row.value) as unknown : null;
}

function readCanonical(key: string) {
  return sqlite.prepare('SELECT host_name, scope, value_json FROM setting_records WHERE key = ?').get(key);
}

function readSyncState(key: string) {
  return sqlite.prepare("SELECT sync_dirty FROM sync_object_state WHERE object_type = 'setting' AND object_id = ?")
    .get(`user_space:windows:desktop:*:${key}`);
}
