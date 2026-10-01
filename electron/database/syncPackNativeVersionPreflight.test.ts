import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import { ANDROID_SYNC_PACK_PROVIDER_DEFINITIONS } from '../../lib/core/sync/androidSyncPackProviderDefinitions.js';

it('counts oversized histories and alternative dependencies before native row copying', () => {
  const db = new Database(':memory:');
  try {
    initializeDatabaseSchema(db);
    db.exec(`INSERT INTO nodes (id, kind, title, current_version_id, created_at, updated_at)
        VALUES ('article', 'topic', 'Article', 'held-version', 'now', 'now');
      INSERT INTO node_sync_versions
        (version_id, object_id, host_name, created_at, content_hash, body_text, snapshot_json)
        VALUES ('held-version', 'article', 'source', 'now', 'hash', zeroblob(5 * 1024 * 1024), '{}');
      INSERT INTO node_text_alternatives
        (alternative_id, node_id, source_version_id, body_text, source_host_name, created_at, status, updated_at)
        VALUES ('alternative', 'article', 'held-version', 'Alternative body', 'source', 'now', 'available', 'now');
      INSERT INTO sync_object_state (object_type, object_id, state_seq, content_hash, last_modified_by_host_name, updated_at)
        VALUES ('node_text_alternative', 'alternative', 7, 'alternative-hash', 'source', 'now');`);
    const row = db.prepare(ANDROID_SYNC_PACK_PROVIDER_DEFINITIONS.versionPreflightSql)
      .get(0, 7, 0, 7) as { bytes: number; rows: number };
    expect(row.rows).toBe(1);
    expect(row.bytes).toBeGreaterThan(4 * 1024 * 1024);
    expect(db.prepare(ANDROID_SYNC_PACK_PROVIDER_DEFINITIONS.versionPreflightSql)
      .get(0, 6, 0, 6)).toEqual({ bytes: 0, rows: 0 });
  } finally { db.close(); }
});
