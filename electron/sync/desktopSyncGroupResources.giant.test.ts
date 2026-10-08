// @vitest-environment node
import Database from 'better-sqlite3';
import { expect, it, vi } from 'vitest';

import { loadNodeBodyResolution } from '../../lib/core/database/nodeBodyResolution.js';
import { createBetterSqlite3Driver } from '../database/betterSqlite3Driver.js';
import { seedCurrentBody } from '../database/currentVersionBodyBlob.testSupport.js';

import { downloadDesktopSyncGroupResources } from './desktopSyncGroupResources.js';

const fixture = vi.hoisted(() => ({ db: null as Database.Database | null }));
// Isolate the application singleton; the resource path retains its real SQLite port and transaction.
vi.mock('../database/connection.js', async (original) => ({
  ...await original<typeof import('../database/connection.js')>(),
  openDatabaseConnection: () => ({ sqlite: fixture.db }),
  runWithDatabaseConnectionOwner: <T>(task: () => T | Promise<T>) => Promise.resolve().then(task)
}));

it('preserves complete current text while preparing a missing legacy resource cache', async () => {
  const db = new Database(':memory:');
  fixture.db = db;
  const body = '中😀'.repeat(149_796) + 'abcd';
  const { hash, bytes } = seedCurrentBody(db, body);
  db.prepare("UPDATE nodes SET content = ? WHERE id = 'article'").run(body);
  const fetch = vi.fn(async () => { throw new Error('retained_original_must_not_request_network'); });
  vi.stubGlobal('fetch', fetch);
  const before = db.prepare('SELECT * FROM node_sync_versions').all();
  try {
    expect(db.prepare('SELECT count(*) FROM content_blob_data').pluck().get()).toBe(0);
    const result = await downloadDesktopSyncGroupResources({
      endpoint_url: 'http://127.0.0.1:9', group_id: 'group', local_device_id: 'receiver',
      peer_device_id: 'source', peer_device_name: 'Source', peer_platform: 'mac'
    });
    expect(result).toMatchObject({ remainingContentBlobCount: 0, resourceResults: [] });
    expect(fetch).not.toHaveBeenCalled();
    expect(db.prepare('SELECT length(data) FROM content_blob_data WHERE hash = ?').pluck().get(hash))
      .toBe(bytes.length);
    const resolution = loadNodeBodyResolution(createBetterSqlite3Driver(db), 'article');
    expect(resolution?.status).toBe('resolved');
    if (resolution?.status !== 'resolved') throw new Error('giant_original_body_unavailable');
    expect(resolution.source).toBe('node');
    expect(resolution.content === body).toBe(true);
    expect(db.prepare('SELECT * FROM node_sync_versions').all()).toEqual(before);
  } finally {
    vi.unstubAllGlobals();
    fixture.db = null;
    db.close();
  }
});
