// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import { ANDROID_SYNC_PACK_PROVIDER_DEFINITIONS as definitions
} from '../../lib/core/sync/androidSyncPackProviderDefinitions.js';

it('copies one selected identity and its structural ancestor without local sequence values', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-identity-native-sql-'));
  const sourcePath = path.join(root, 'source.db');
  const source = new Database(sourcePath);
  const pack = new Database(':memory:');
  try {
    initializeDatabaseSchema(source);
    source.exec(`INSERT INTO nodes (id, parent_id, kind, title, content, created_at, updated_at)
      VALUES ('parent', NULL, 'topic', 'Parent', '', 'now', 'now'),
             ('child', 'parent', 'topic', 'Child', '', 'now', 'now'),
             ('unrelated', NULL, 'topic', 'Other', '', 'now', 'now');
      INSERT INTO sync_object_state (object_type, object_id, state_seq, content_hash,
        last_modified_by_host_name, updated_at) VALUES
        ('node', 'parent', 9, 'parent-hash', 'source', 'now'),
        ('node', 'child', 10, 'child-hash', 'source', 'now'),
        ('node', 'unrelated', 11, 'other-hash', 'source', 'now');
      INSERT INTO review_log (id, op_id, host_name, node_id, grade,
        scheduler_version, reviewed_at, due_before, stability_before, difficulty_before,
        due_after, stability_after, difficulty_after)
      VALUES ('review-1', 'op-1', 'source', 'child', 3, 'ts-fsrs@4', 'now',
        'before', 1, 2, 'later', 3, 4);
      UPDATE sync_object_state SET current_version_id = 'child-v1'
        WHERE object_type = 'node' AND object_id = 'child'`);
    for (const statement of definitions.packSchema) pack.exec(statement);
    pack.exec('ALTER TABLE sync_object_state ADD COLUMN current_version_id TEXT');
    pack.exec('CREATE TABLE selected_identity_objects (object_type TEXT, object_id TEXT)');
    pack.exec("INSERT INTO selected_identity_objects VALUES ('node', 'child')");
    pack.prepare('ATTACH DATABASE ? AS source').run(sourcePath);
    pack.exec(definitions.identityStateCopySql);
    pack.exec(definitions.identityPreludeCopySql);
    pack.exec(definitions.identityHeadCopySql);
    pack.exec(definitions.copyStatements[5]);
    pack.exec(definitions.identityReviewCopySql);
    expect(pack.prepare(`SELECT object_id, state_seq, current_version_id FROM sync_object_state
      ORDER BY object_id`).all()).toEqual([
      { object_id: 'child', state_seq: 0, current_version_id: 'child-v1' },
      { object_id: 'parent', state_seq: 0, current_version_id: null }
    ]);
    expect(pack.prepare('SELECT id FROM nodes ORDER BY id').all()).toEqual([
      { id: 'child' }, { id: 'parent' }
    ]);
    expect(pack.prepare('SELECT op_id FROM review_log').all()).toEqual([{ op_id: 'op-1' }]);
  } finally {
    pack.close();
    source.close();
    fs.rmSync(root, { force: true, recursive: true });
  }
});
