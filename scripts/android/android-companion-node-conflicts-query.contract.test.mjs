// @vitest-environment node

import { DatabaseSync } from 'node:sqlite';

import { afterEach, beforeEach, expect, it } from 'vitest';

import { ANDROID_COMPANION_CORE_SCHEMA_STATEMENTS } from '../../lib/core/database/androidCompanionCoreSchemaStatements.ts';
import { ANDROID_COMPANION_SYNC_QUERY_DEFINITIONS } from '../../lib/core/database/androidCompanionSyncQueryDefinitions.ts';

let database;

beforeEach(() => {
  database = new DatabaseSync(':memory:');
  database.exec(ANDROID_COMPANION_CORE_SCHEMA_STATEMENTS.join(';\n'));
});

afterEach(() => database.close());

it('reads conflict authors from the current host-name schema', () => {
  database.prepare(
    `INSERT INTO nodes (id, kind, title, content, is_title_manual, created_at, updated_at)
     VALUES ('node-1', 'topic', 'Topic', '', 1, '2026-08-22', '2026-08-22')`
  ).run();
  database.prepare(
    `INSERT INTO node_sync_conflicts (
       conflict_version_id, object_id, parent_version_id, host_name,
       content_hash, snapshot_json, detected_at
     ) VALUES ('conflict-1', 'node-1', NULL, 'Maci', 'hash-1', '{}', '2026-08-22')`
  ).run();

  const row = database.prepare(
    ANDROID_COMPANION_SYNC_QUERY_DEFINITIONS.nodeConflicts.sql
  ).get();

  expect(row).toEqual(expect.objectContaining({ host_name: 'Maci', object_id: 'node-1' }));
  expect(ANDROID_COMPANION_SYNC_QUERY_DEFINITIONS.nodeConflicts.columns)
    .toContainEqual(expect.objectContaining({ key: 'host_name', source: 'host_name' }));
});
