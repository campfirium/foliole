// @vitest-environment node
import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { createBetterSqliteDbPort } from '../../../electron/database/betterSqliteDbPort.js';

import { parseSyncIdentityPackContainerManifest } from './syncIdentityPackManifest.js';
import { buildSyncIdentityPackPage } from './syncIdentityPackPage.js';
import { stageSyncIdentityRestorePage,
  loadSyncIdentityRestorePage } from './syncIdentityRestorePageStorage.js';
import { SYNC_PACK_TABLE_NAMES } from './syncPackManifest.js';
import { PACK_SCHEMA } from './syncPackSchema.js';

it('replays exact staged pack rows through one fixed incoming attachment', async () => {
  const sqlite = new Database(':memory:');
  try {
    sqlite.exec("ATTACH DATABASE ':memory:' AS inc");
    sqlite.exec("ATTACH DATABASE ':memory:' AS identity_view");
    for (const statement of PACK_SCHEMA) sqlite.exec(statement.replace('CREATE TABLE ',
      'CREATE TABLE inc.'));
    sqlite.exec('ALTER TABLE inc.sync_object_state ADD COLUMN current_version_id TEXT');
    const page = buildSyncIdentityPackPage({ group_id: 'group',
      source_peer_id: 'source', target_peer_id: 'target',
      source_view_id: '11111111-1111-4111-8111-111111111111',
      page_index: 0, previous_page_id: null, objects: [],
      restore_id: 'restore', restore_set_id: 'a'.repeat(64) });
    const inner = { contract: 'global-id-v1',
      pack_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', identity_page: page,
      dependencies: [], tables: SYNC_PACK_TABLE_NAMES.map((name) => ({ name,
        row_count: name === 'review_log' ? 1 : 0 })) };
    const manifest = parseSyncIdentityPackContainerManifest({ ...inner,
      format: 'foliole.sync-pack', format_version: 21, schema_version: 92,
      compression: 'zlib', database_file: 'incoming.db.deflate',
      from_peer_id: 'source', to_peer_id: 'target',
      database_uncompressed_sha256: `sha256:${'b'.repeat(64)}`,
      database_compressed_sha256: `sha256:${'c'.repeat(64)}` },
    { sourcePeerId: 'source', targetPeerId: 'target' });
    sqlite.prepare('INSERT INTO inc.pack_manifest VALUES (?, ?)')
      .run('manifest_json', JSON.stringify(inner));
    sqlite.prepare(`INSERT INTO inc.review_log VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run('review-1', 'op-1', "quoted ' host", 'node-1', 3, 'v1', 'now', 'before',
        1, 2, 'after', 3, 4);
    const port = createBetterSqliteDbPort(sqlite);
    await stageSyncIdentityRestorePage(port, 0, manifest);
    sqlite.exec('DELETE FROM inc.review_log; DELETE FROM inc.pack_manifest');
    await port.transaction((tx) => loadSyncIdentityRestorePage(tx, 0, manifest));
    expect(sqlite.prepare('SELECT host_name FROM inc.review_log').pluck().get())
      .toBe("quoted ' host");
  } finally { sqlite.close(); }
});
