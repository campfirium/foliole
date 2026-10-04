// @vitest-environment node
import { createHash } from 'node:crypto';

import Database from 'better-sqlite3';
import { expect, it, vi } from 'vitest';

import { createBetterSqliteDbPort } from '../../../electron/database/betterSqliteDbPort.js';
import { seedCurrentBody } from '../../../electron/database/currentVersionBodyBlob.testSupport.js';
import { ANDROID_COMPANION_QUERY_DEFINITIONS } from '../../../lib/core/database/androidCompanionQueryDefinitions.js';
import type { DbParams, DbPort } from '../../../lib/core/sync/dbPort.js';

import { verifyCompanionSyncIdentityBlobBytes } from './companion/sync/syncGroupIdentityBlobIntegrity';
import { loadCompanionMissingContentBlobBatch } from './companionContentBlobSync';

const scope = vi.hoisted(() => ({ port: null as DbPort | null,
  queryLimits: [] as number[], download: vi.fn() }));
vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => 'ios', isNativePlatform: () => true },
  registerPlugin: () => ({ downloadContentBlobBatch: scope.download })
}));
vi.mock('./companion/runtime/iosCompanionDatabaseBootstrap', () => ({
  getIosCompanionDatabaseOwner: () => ({
    runWriter: (task: (port: DbPort) => Promise<unknown>) => task(scope.port!),
    read: (task: (port: DbPort) => Promise<unknown>) => task(scope.port!)
  })
}));
vi.mock('./companion/runtime/iosCompanionActiveDatabase', () => ({
  queryIosCompanionDatabase: (key: keyof typeof ANDROID_COMPANION_QUERY_DEFINITIONS, params: DbParams = []) => {
    if (key === 'contentBlobMissingHashes') scope.queryLimits.push(Number(params[0]));
    return scope.port!.query(ANDROID_COMPANION_QUERY_DEFINITIONS[key].sql, params);
  },
  readIosCompanionDatabase: vi.fn(), searchIosCompanionDatabase: vi.fn()
}));

function addSecondCurrentBody(db: Database.Database, body: string) {
  const hash = createHash('sha256').update(body).digest('hex');
  const size = Buffer.byteLength(body);
  db.prepare(`INSERT INTO content_blobs (hash, storage_key, kind, mime_type, compression,
    original_size_bytes, stored_size_bytes, original_sha256, stored_sha256, availability, created_at)
    VALUES (?, ?, 'text_body', 'text/plain', 'none', ?, ?, ?, ?, 'missing', 'now')`)
    .run(hash, `text/${hash}`, size, size, hash, hash);
  db.prepare(`INSERT INTO nodes (id, kind, title, content, body_blob_hash, current_version_id,
    created_at, updated_at, sync_dirty) VALUES ('second', 'topic', 'Second', '', ?, 'second-head', 'now', 'now', 0)`)
    .run(hash);
  db.prepare(`INSERT INTO node_sync_versions (version_id, object_id, host_name, created_at,
    content_hash, body_text, snapshot_json) VALUES ('second-head', 'second', 'source', 'now', 'second-identity', ?, ?)`)
    .run(body, JSON.stringify({ id: 'second', content: body }));
  db.exec(`INSERT INTO sync_object_state (object_type, object_id, state_seq, current_version_id,
    content_hash, updated_at, sync_dirty, last_modified_by_host_name)
    VALUES ('node', 'second', 11, 'second-head', 'second-identity', 'now', 0, 'source')`);
  return hash;
}

it('materializes two giant current originals across fixed-size native query pages before any download demand', async () => {
  const db = new Database(':memory:');
  try {
    const first = seedCurrentBody(db, 'A'.repeat(6 * 1024 * 1024 + 307200));
    const second = addSecondCurrentBody(db, 'B'.repeat(6 * 1024 * 1024 + 307200));
    scope.port = createBetterSqliteDbPort(db);
    scope.queryLimits = [];
    scope.download.mockClear();
    const result = await loadCompanionMissingContentBlobBatch(1);
    expect(result).toMatchObject({ blobs: [], hashes: [], total: 0, totalBytes: 0 });
    expect(scope.queryLimits).toEqual([1, 1, 1]);
    expect(scope.download).not.toHaveBeenCalled();
    await expect(verifyCompanionSyncIdentityBlobBytes()).resolves.toBeUndefined();
    expect(db.prepare('SELECT hash FROM content_blob_data ORDER BY hash').pluck().all())
      .toEqual([first.hash, second].sort());
    expect(db.prepare('SELECT count(*) FROM content_blobs WHERE availability = ?').pluck().get('cached')).toBe(2);
  } finally { db.close(); scope.port = null; }
});

it('ignores corrupted non-body cache while rejecting corrupted body manifests in the existing scope', async () => {
  const db = new Database(':memory:');
  try {
    const blob = seedCurrentBody(db, 'C'.repeat(6 * 1024 * 1024 + 307200));
    db.prepare('INSERT INTO content_blob_data (hash, data) VALUES (?, ?)')
      .run(blob.hash, Buffer.alloc(blob.bytes.length));
    db.exec("UPDATE content_blobs SET kind = 'unrelated_cache'");
    scope.port = createBetterSqliteDbPort(db);
    await expect(verifyCompanionSyncIdentityBlobBytes()).resolves.toBeUndefined();
    db.exec("UPDATE content_blobs SET kind = 'text_body'");
    await expect(verifyCompanionSyncIdentityBlobBytes()).rejects.toThrow('sync_group_resources_incomplete');
  } finally { db.close(); scope.port = null; }
});
