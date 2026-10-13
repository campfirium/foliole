// @vitest-environment node
import Database from 'better-sqlite3';
import { expect, it, vi } from 'vitest';

import { loadNodeBodyResolution } from '../../lib/core/database/nodeBodyResolution.js';
import { createBetterSqlite3Driver } from '../database/betterSqlite3Driver.js';
import { seedCurrentBody } from '../database/currentVersionBodyBlob.testSupport.js';

it('reads complete large current text without a resource peer or shared cache', () => {
  const db = new Database(':memory:');
  const body = '中😀'.repeat(149_796) + 'abcd';
  seedCurrentBody(db, body);
  db.prepare("UPDATE nodes SET content = ? WHERE id = 'article'").run(body);
  const fetch = vi.fn(async () => { throw new Error('retained_original_must_not_request_network'); });
  vi.stubGlobal('fetch', fetch);
  const before = db.prepare('SELECT * FROM node_sync_versions').all();
  try {
    expect(db.prepare('SELECT count(*) FROM content_blob_data').pluck().get()).toBe(0);
    const resolution = loadNodeBodyResolution(createBetterSqlite3Driver(db), 'article');
    expect(resolution?.status).toBe('resolved');
    if (resolution?.status !== 'resolved') throw new Error('giant_original_body_unavailable');
    expect(resolution.source).toBe('node');
    expect(resolution.content === body).toBe(true);
    expect(db.prepare('SELECT * FROM node_sync_versions').all()).toEqual(before);
    expect(db.prepare('SELECT count(*) FROM content_blob_data').pluck().get()).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
  } finally {
    vi.unstubAllGlobals();
    db.close();
  }
});
