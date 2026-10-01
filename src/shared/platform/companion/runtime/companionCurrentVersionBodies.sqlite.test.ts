// @vitest-environment node
import Database from 'better-sqlite3';
import { expect, it, vi } from 'vitest';

import { createBetterSqliteDbPort } from '../../../../../electron/database/betterSqliteDbPort.js';
import { seedCurrentBody } from '../../../../../electron/database/currentVersionBodyBlob.testSupport.js';
import type { DbPort } from '../../../../../lib/core/sync/dbPort.js';

import { materializeCompanionCurrentBodies } from './companionCurrentVersionBodies';

const scope = vi.hoisted(() => ({ port: null as DbPort | null }));
vi.mock('./iosCompanionDatabaseBootstrap', () => ({
  getIosCompanionDatabaseOwner: () => ({ runWriter: (task: (db: DbPort) => Promise<number>) => task(scope.port!) })
}));

it('materializes through the mobile writer seam with real SQLite and keeps a reclaimed body missing', async () => {
  const db = new Database(':memory:');
  try {
    const { bytes, hash } = seedCurrentBody(db);
    scope.port = createBetterSqliteDbPort(db);
    expect(await materializeCompanionCurrentBodies([hash])).toBe(1);
    expect(db.prepare('SELECT data FROM content_blob_data WHERE hash=?').pluck().get(hash)).toEqual(bytes);
    db.exec(`DELETE FROM content_blob_data; UPDATE content_blobs SET availability = 'missing';
      UPDATE node_sync_versions SET body_text = NULL, snapshot_json = json_set(snapshot_json, '$.content', NULL)`);
    expect(await materializeCompanionCurrentBodies([hash])).toBe(0);
    expect(db.prepare('SELECT count(*) FROM content_blob_data').pluck().get()).toBe(0);
  } finally { db.close(); scope.port = null; }
});
