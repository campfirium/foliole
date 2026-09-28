import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { ANDROID_SYNC_PACK_PROVIDER_DEFINITIONS } from '../../lib/core/sync/androidSyncPackProviderDefinitions.js';

it('counts oversized histories and alternative dependencies before native row copying', () => {
  const db = new Database(':memory:');
  try {
    db.exec(`CREATE TABLE sync_object_state (object_type TEXT, object_id TEXT, state_seq INTEGER);
      CREATE TABLE node_sync_versions (object_id TEXT, body_text BLOB, snapshot_json TEXT);
      CREATE TABLE node_text_alternatives (alternative_id TEXT, node_id TEXT);
      INSERT INTO node_text_alternatives VALUES ('alternative', 'article');
      INSERT INTO sync_object_state VALUES ('node_text_alternative', 'alternative', 7);
      INSERT INTO node_sync_versions VALUES ('article', zeroblob(5 * 1024 * 1024), '{}');`);
    const row = db.prepare(ANDROID_SYNC_PACK_PROVIDER_DEFINITIONS.versionPreflightSql)
      .get(0, 7, 0, 7) as { bytes: number; rows: number };
    expect(row.rows).toBe(1);
    expect(row.bytes).toBeGreaterThan(4 * 1024 * 1024);
    expect(db.prepare(ANDROID_SYNC_PACK_PROVIDER_DEFINITIONS.versionPreflightSql)
      .get(0, 6, 0, 6)).toEqual({ bytes: 0, rows: 0 });
  } finally { db.close(); }
});
