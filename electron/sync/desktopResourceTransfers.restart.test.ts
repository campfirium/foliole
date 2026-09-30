// @vitest-environment node
import { createHash } from 'node:crypto';
import path from 'node:path';

import Database from 'better-sqlite3';
import { expect, it, vi } from 'vitest';

import { COMPANION_SCHEMA_STATEMENTS } from '../../lib/core/database/companionSchemaStatements.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';
import { openDatabaseConnection } from '../database/connection.js';
import { mockedSyncPackBuilderAppDataDir, resolveSyncPackPath,
  setupSyncPackBuilderTestLifecycle } from '../database/syncPackBuilderTestSupport.js';

import { startAuthenticatedSyncHttp } from './companionLanAuthenticatedHttp.testSupport.js';
import { transferDesktopResources, type ResourceBlobRow } from './desktopResourceTransfers.js';
import { markDesktopSyncGroupMemberStateReady,
  revokeDesktopSyncGroupMemberStateReadiness } from './desktopSyncGroupMemberStateReadiness.js';

vi.mock('../ipc/paths.js', () => ({ resolveAppPaths: () => ({
  app_data_dir: mockedSyncPackBuilderAppDataDir,
  app_cache_dir: path.join(mockedSyncPackBuilderAppDataDir, 'cache'),
  app_config_dir: path.join(mockedSyncPackBuilderAppDataDir, 'config'),
  app_log_dir: path.join(mockedSyncPackBuilderAppDataDir, 'logs')
}) }));
vi.mock('../database/syncGroupStore.js', () => ({ loadDesktopSyncGroup: () => ({
  group_id: 'group', local_device_identity_key: 'source',
  devices: [{ device_identity_key: 'source', state: 'active' },
    { device_identity_key: 'receiver', state: 'active' }]
}) }));
vi.mock('./workgroupKeyStore.js', async (original) => ({
  ...await original<typeof import('./workgroupKeyStore.js')>(),
  loadDesktopWorkgroupKey: () => ({ group_id: 'group',
    group_key: Buffer.alloc(32, 7).toString('base64url'), group_tag: 'test-tag' }),
  consumeDesktopWorkgroupNonce: () => true
}));
setupSyncPackBuilderTestLifecycle();

interface BlobMetadata {
  hash: string;
  stored_sha256: string;
  stored_size_bytes: number;
}

function seedSource() {
  const driver = openDatabaseConnection().driver;
  driver.execute("INSERT INTO sync_groups VALUES ('group', 'Group', 'key', 'now', 'now')");
  driver.execute("INSERT INTO sync_group_local_state VALUES (1, 'group', 'source', 'active', 'now')");
  for (const id of ['source', 'receiver']) driver.execute(`INSERT INTO sync_group_devices
    (group_id, device_identity_key, device_anchor, canonical_library_path, device_name,
     platform, state, joined_at, updated_at) VALUES ('group', ?, ?, '/source', ?, 'mac', 'active', 'now', 'now')`,
  [id, id, id]);
  const blobs: Array<BlobMetadata & { body: Buffer }> = [];
  for (let index = 0; index < 64; index += 1) {
    const body = Buffer.from(`body-${index}`.repeat(1024));
    const hash = createHash('sha256').update(body).digest('hex');
    driver.execute(`INSERT INTO content_blobs
      (hash, storage_key, kind, mime_type, compression, original_size_bytes,
       stored_size_bytes, original_sha256, stored_sha256, availability, created_at)
      VALUES (?, ?, 'topic', 'text/plain', 'none', ?, ?, ?, ?, 'cached', 'now')`,
    [hash, hash, body.length, body.length, hash, hash]);
    driver.execute('INSERT INTO content_blob_data (hash, data) VALUES (?, ?)', [hash, body]);
    blobs.push({ hash, stored_sha256: hash, stored_size_bytes: body.length, body });
  }
  return blobs.sort((a, b) => a.hash.localeCompare(b.hash));
}

function createReceiver(blobs: Array<BlobMetadata & { body: Buffer }>) {
  const filePath = resolveSyncPackPath('resource-restart-target.db');
  const sqlite = new Database(filePath);
  sqlite.exec(COMPANION_SCHEMA_STATEMENTS.join(';\n'));
  const insert = sqlite.prepare(`INSERT INTO content_blobs
    (hash, storage_key, kind, mime_type, compression, original_size_bytes,
     stored_size_bytes, original_sha256, stored_sha256, availability, created_at)
    VALUES (?, ?, 'topic', 'text/plain', 'none', ?, ?, ?, ?, 'missing', 'now')`);
  sqlite.transaction(() => {
    for (const row of blobs) insert.run(row.hash, row.hash, row.body.length,
      row.body.length, row.hash, row.hash);
  })();
  return { filePath, sqlite };
}

it('keeps committed body batches and resumes missing bodies after reopening SQLite', async () => {
  const blobs = seedSource();
  const { filePath, sqlite } = createReceiver(blobs);
  const sourceHighWater = openDatabaseConnection().driver.queryOne<{ high_water: number }>(
    'SELECT high_water FROM sync_state_sequence WHERE singleton_id = 1')?.high_water;
  markDesktopSyncGroupMemberStateReady('receiver');
  const http = await startAuthenticatedSyncHttp();
  const peer = { endpoint_url: http.origin, endpointUrl: http.origin,
    group_id: 'group', local_device_id: 'receiver', peer_device_id: 'source',
    peer_device_name: 'Source', peer_platform: 'mac', deviceId: 'source' };
  let target = sqlite;
  const transfer = (rows: BlobMetadata[]) => transferDesktopResources({ peer,
    needs: rows.map((row) => ({ kind: 'content_blob', id: row.hash })),
    port: createBetterSqliteDbPort(target),
    blobs: new Map(rows.map((row) => [row.hash, {
      hash: row.hash, stored_sha256: row.stored_sha256,
      stored_size_bytes: row.stored_size_bytes
    } satisfies ResourceBlobRow])), attachments: new Map() });
  try {
    const first = await transfer(blobs.slice(0, 32));
    expect(first.ready).toHaveLength(32);
    expect(first.errors).toEqual({});
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network disconnected'); }));
    const failed = await transfer(blobs.slice(32));
    expect(failed.ready).toEqual([]);
    expect(Object.keys(failed.errors)).toHaveLength(32);
    vi.unstubAllGlobals();
    target.close();
    target = new Database(filePath);
    const missing = target.prepare(`SELECT cb.hash, cb.stored_sha256, cb.stored_size_bytes
      FROM content_blobs cb LEFT JOIN content_blob_data data ON data.hash = cb.hash
      WHERE data.hash IS NULL ORDER BY cb.hash`).all() as BlobMetadata[];
    expect(missing.map((row) => row.hash)).toEqual(blobs.slice(32).map((row) => row.hash));
    const resumed = await transfer(missing);
    expect(resumed.ready).toHaveLength(32);
    expect(resumed.errors).toEqual({});
    expect(target.prepare('SELECT COUNT(*) AS count FROM content_blob_data').get())
      .toEqual({ count: 64 });
    expect(target.pragma('quick_check', { simple: true })).toBe('ok');
    expect(openDatabaseConnection().driver.queryOne<{ high_water: number }>(
      'SELECT high_water FROM sync_state_sequence WHERE singleton_id = 1')?.high_water)
      .toBe(sourceHighWater);
  } finally {
    vi.unstubAllGlobals();
    target.close();
    await http.close();
    revokeDesktopSyncGroupMemberStateReadiness('receiver');
  }
}, 30_000);
