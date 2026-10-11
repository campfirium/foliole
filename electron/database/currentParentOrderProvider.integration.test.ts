// @vitest-environment node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import { upsertSyncObjectState } from '../../lib/core/database/syncState.js';
import { currentParentOrderHash } from '../../lib/core/sync/currentParentOrder.js';

import { buildProviderPack } from './androidSyncPackProviderDefinitions.testSupport.js';
import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';

it('preserves original current sources with quoted and Unicode identities', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-current-order-provider-'));
  const sourcePath = path.join(root, 'source.db');
  const source = new Database(sourcePath);
  try {
    initializeDatabaseSchema(source);
    const sources = [{ authorId: 'a"中', counter: 4, childIds: ['node-1', 'late\\child'] },
      { authorId: '😀', counter: 2, childIds: ['late\\child', 'node-1'] }];
    source.prepare('INSERT INTO parent_child_order VALUES (?, ?, ?)').run('parent', '[]', 'now');
    for (const value of sources) source.prepare('INSERT INTO parent_order_sources VALUES (?, ?, ?, ?)')
      .run('parent', value.authorId, value.counter, JSON.stringify(value.childIds));
    upsertSyncObjectState(createBetterSqlite3Driver(source), { objectType: 'parent_child_order',
      objectId: 'parent', contentHash: currentParentOrderHash('parent', sources),
      lastModifiedByHostName: 'android-b', updatedAt: 'now' });
    const pack = buildProviderPack(sourcePath, 0, 100);
    const row = pack.prepare("SELECT payload_json, content_hash FROM sync_objects WHERE object_type = 'parent_child_order'")
      .get() as { payload_json: string; content_hash: string };
    const payload = JSON.parse(row.payload_json);
    expect(JSON.parse(payload.sources_json)).toEqual(sources);
    expect(currentParentOrderHash(payload.parent_id, JSON.parse(payload.sources_json))).toBe(row.content_hash);
    pack.close();
  } finally { source.close(); fs.rmSync(root, { force: true, recursive: true }); }
});
