// @vitest-environment node
import { createHash } from 'node:crypto';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { DbParams, DbPort, DbRow } from '../../lib/core/sync/dbPort.js';
import { verifyStoredContentBlobBytes } from '../../lib/core/sync/storedContentBlobIntegrity.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';

import { verifyDesktopSyncIdentityBlobBytes } from './desktopSyncIdentityBlobIntegrity.js';

const runtime = vi.hoisted(() => ({ sqlite: null as unknown as Database.Database,
  queries: [] as string[], chunkLimits: [] as number[], chunkSizes: [] as number[],
  download: vi.fn(async () => ({ resourceResults: [{ unresolved: ['blob'], issues: [] }] })) }));
vi.mock('../database/connection.js', () => ({
  openDatabaseConnection: () => ({ sqlite: runtime.sqlite }),
  runWithDatabaseConnectionOwner: (task: () => unknown) => task()
}));
vi.mock('../database/betterSqliteDbPort.js', async (original) => {
  const actual = await original<typeof import('../database/betterSqliteDbPort.js')>();
  return { ...actual, createBetterSqliteDbPort: (sqlite: Database.Database): DbPort => {
    const port = actual.createBetterSqliteDbPort(sqlite);
    return { ...port, query: async <T extends DbRow>(sql: string, params: DbParams = []) => {
      runtime.queries.push(sql);
      const rows = await port.query<T>(sql, params);
      if (sql.includes('AS chunk_hex')) {
        runtime.chunkLimits.push(Number(params[1]));
        runtime.chunkSizes.push(String(rows[0]?.chunk_hex ?? '').length);
      }
      return rows;
    } };
  } };
});
vi.mock('./desktopSyncGroupResources.js', () => ({ downloadDesktopSyncGroupResources: runtime.download }));


const peer = { endpoint_url: 'http://peer', group_id: 'group', local_device_id: 'local',
  peer_device_id: 'peer', peer_device_name: 'Peer', peer_platform: 'mac' };
beforeEach(() => {
  runtime.sqlite = new Database(':memory:');
  runtime.sqlite.exec(`CREATE TABLE content_blobs
    (hash TEXT PRIMARY KEY, stored_sha256 TEXT, stored_size_bytes INTEGER, kind TEXT);
    CREATE TABLE content_blob_data (hash TEXT PRIMARY KEY, data BLOB);`);
  runtime.queries = [];
  runtime.chunkLimits = [];
  runtime.chunkSizes = [];
  runtime.download.mockClear();
});
afterEach(() => runtime.sqlite.close());

function cachedGiant() {
  const bytes = Buffer.alloc(6 * 1024 * 1024 + 307200, 0x5a);
  const hash = createHash('sha256').update(bytes).digest('hex');
  runtime.sqlite.prepare('INSERT INTO content_blobs VALUES (?, ?, ?, ?)').run(hash, hash, bytes.length, 'text_body');
  runtime.sqlite.prepare('INSERT INTO content_blob_data VALUES (?, ?)').run(hash, bytes);
  return { bytes, hash, stored_sha256: hash, stored_size_bytes: bytes.length };
}

it('verifies a cached 6.3 MiB blob through bounded SQLite hex slices', async () => {
  cachedGiant();
  await expect(verifyDesktopSyncIdentityBlobBytes(peer)).resolves.toBeUndefined();
  expect(runtime.download).not.toHaveBeenCalled();
  expect(runtime.chunkLimits.length).toBeGreaterThan(24);
  expect(Math.max(...runtime.chunkLimits)).toBeLessThanOrEqual(256 * 1024);
  expect(Math.max(...runtime.chunkSizes)).toBeLessThanOrEqual(512 * 1024);
  expect(runtime.queries.some((sql) => /SELECT\s+data\s+FROM/iu.test(sql))).toBe(false);
});

it('rejects same-size corrupted cached bytes rather than accepting their manifest', async () => {
  const blob = cachedGiant();
  blob.bytes[300000] = 0x41;
  runtime.sqlite.prepare('UPDATE content_blob_data SET data = ?').run(blob.bytes);
  await expect(verifyDesktopSyncIdentityBlobBytes(peer)).rejects.toThrow('sync_group_resources_incomplete');
  expect(runtime.download).toHaveBeenCalledOnce();
});

it('rejects a stored byte length mismatch before reading chunks', async () => {
  cachedGiant();
  runtime.sqlite.exec('UPDATE content_blobs SET stored_size_bytes = stored_size_bytes + 1');
  await expect(verifyDesktopSyncIdentityBlobBytes(peer)).rejects.toThrow('sync_group_resources_incomplete');
  expect(runtime.chunkLimits).toEqual([]);
});

it('reports missing giant bytes as missing and retains the existing desktop download path', async () => {
  const blob = cachedGiant();
  runtime.sqlite.exec('DELETE FROM content_blob_data');
  await expect(verifyStoredContentBlobBytes(createBetterSqliteDbPort(runtime.sqlite), blob)).resolves.toBe(false);
  await expect(verifyDesktopSyncIdentityBlobBytes(peer)).rejects.toThrow('sync_group_resources_incomplete');
  expect(runtime.download).toHaveBeenCalledOnce();
  expect(runtime.chunkLimits).toEqual([]);
});
