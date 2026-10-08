// @vitest-environment node
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { expect, it, vi } from 'vitest';

import { createBetterSqliteDbPort } from '../../../../../../electron/database/betterSqliteDbPort.js';
import { FRAMED_SYNC_RESOURCE_DEMAND_SCHEMA } from '../../../../../../lib/core/database/framedSyncResourceDemandSchema.js';
import type { DbPort } from '../../../../../../lib/core/sync/dbPort.js';
import { buildAssetMarkdownUrl } from '../../../../../../lib/platform/assetMarkdownUrl.js';

const native = vi.hoisted(() => ({ db: null as DbPort | null, pull: vi.fn(), resolve: vi.fn() }));
vi.mock('../../../companionWorkspaceRuntimeRepository', () => ({ FolioleCompanionSync: {
  pullFramedSyncObject: native.pull, resolveAttachmentResource: native.resolve
} }));
vi.mock('../../runtime/iosCompanionDatabaseBootstrap', () => ({
  getIosCompanionDatabaseOwner: () => ({
    read: (task: (db: DbPort) => unknown) => task(native.db!),
    runWriter: (task: (db: DbPort) => unknown) => task(native.db!)
  })
}));

import { runCompanionFramedSyncResourceRound } from './companionFramedSyncResourceRound.js';

const request = { endpoint_url: 'http://desktop:43110', receiver_device_id: 'desktop',
  receiver_library_epoch: 'desktop-epoch', sync_group_id: 'group' };
const hash = 'a'.repeat(64);
const key = `${'b'.repeat(64)}.png`;
const roundId = new Uint8Array(16).fill(7);

function seed(sqlite: Database.Database) {
  sqlite.exec(FRAMED_SYNC_RESOURCE_DEMAND_SCHEMA);
  sqlite.exec(`CREATE TABLE sync_group_local_state (singleton_id INTEGER, state TEXT, group_id TEXT,
      local_device_identity_key TEXT);
    INSERT INTO sync_group_local_state VALUES (1, 'active', 'group', 'mobile');
    CREATE TABLE node_version_local_proof_state (singleton_id INTEGER, library_epoch TEXT);
    INSERT INTO node_version_local_proof_state VALUES (1, 'mobile-epoch');
    CREATE TABLE nodes (id TEXT PRIMARY KEY, current_version_id TEXT, body_blob_hash TEXT,
      content TEXT, resource_references TEXT, deleted_at TEXT);
    CREATE TABLE node_sync_versions (version_id TEXT PRIMARY KEY, object_id TEXT,
      content_hash TEXT, snapshot_json TEXT)`);
  sqlite.prepare('INSERT INTO nodes VALUES (?, ?, ?, ?, ?, NULL)')
    .run('article', 'version', hash, `![image](${buildAssetMarkdownUrl(key)})`, '[]');
  sqlite.prepare('INSERT INTO node_sync_versions VALUES (?, ?, ?, ?)')
    .run('version', 'article', 'c'.repeat(64), JSON.stringify({ body_blob_hash: hash }));
}

it('persists the exact resource request before native I/O and retries it after SQLite reopen', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'foliole-mobile-resource-round-'));
  const file = path.join(root, 'library.db');
  let sqlite = new Database(file);
  try {
    seed(sqlite);
    native.db = createBetterSqliteDbPort(sqlite);
    native.resolve.mockResolvedValue({ status: 'missing' });
    native.pull.mockImplementation(async () => {
      expect(sqlite.prepare('SELECT state, request_started FROM framed_sync_resource_demands').get())
        .toEqual({ state: 'pending', request_started: 1 });
      throw new Error('framed_sync_http_409:framed_sync_resource_source_unavailable');
    });
    expect(await runCompanionFramedSyncResourceRound(request, roundId, ['article']))
      .toEqual({ pending: 1, scanned: 1, transferred: 0, unavailable: 0 });
    const sent = native.pull.mock.calls[0]![0];
    expect(sent).toMatchObject({ object_id: 'article', object_type: 'node', frontier_fact_ids: [],
      resource_hashes: [], resources: [{ demand_id: expect.any(String), global_id: 'article',
        version_id: 'version', body_hash: hash, storage_key: key, shared_state_hash: 'c'.repeat(64) }] });
    sqlite.close();
    sqlite = new Database(file);
    native.db = createBetterSqliteDbPort(sqlite);
    sqlite.exec("UPDATE node_sync_versions SET content_hash = 'invalid' WHERE version_id = 'version'");
    expect(await runCompanionFramedSyncResourceRound(request, roundId, ['article']))
      .toEqual({ pending: 1, scanned: 1, transferred: 0, unavailable: 0 });
    expect(native.pull.mock.calls[1]![0]).toEqual(sent);
    native.pull.mockRejectedValueOnce(new Error('authenticated_resource_hash_mismatch'));
    await expect(runCompanionFramedSyncResourceRound(request, roundId, ['article']))
      .rejects.toThrow('authenticated_resource_hash_mismatch');
    expect(sqlite.prepare('SELECT count(*) FROM framed_sync_resource_demands').pluck().get()).toBe(1);
  } finally {
    native.db = null;
    if (sqlite.open) sqlite.close();
    await rm(root, { recursive: true, force: true });
  }
});
