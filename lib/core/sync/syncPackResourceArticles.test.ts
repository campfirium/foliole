import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { createBetterSqliteDbPort } from '../../../electron/database/betterSqliteDbPort.js';
import { SYNC_PACK_PROGRESS_SCHEMA_STATEMENTS } from '../database/syncPackProgressSchemaStatements.js';

import {
  clearSyncPackResourceArticles,
  enqueueSyncPackResourceArticles,
  loadSyncPackResourceArticleBatch
} from './syncPackResourceArticles.js';

it('keeps each committed page resource demand across a database reopen', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-resource-articles-'));
  const file = path.join(root, 'library.db');
  try {
    const sqlite = new Database(file);
    for (const sql of SYNC_PACK_PROGRESS_SCHEMA_STATEMENTS) sqlite.exec(sql);
    sqlite.exec(`ATTACH DATABASE ':memory:' AS inc;
      CREATE TABLE inc.sync_object_state (object_type TEXT, object_id TEXT, deleted_at TEXT);
      CREATE TABLE inc.nodes (id TEXT);
      INSERT INTO inc.nodes VALUES ('article-a'), ('article-b');
      INSERT INTO inc.sync_object_state VALUES ('node', 'article-a', NULL),
        ('node', 'article-b', NULL);`);
    const port = createBetterSqliteDbPort(sqlite);
    await expect(port.transaction(async (tx) => {
      await enqueueSyncPackResourceArticles(tx, {
        groupId: 'group', incomingAlias: 'inc', peerId: 'peer'
      });
      throw new Error('page_apply_failed');
    })).rejects.toThrow('page_apply_failed');
    expect(await loadSyncPackResourceArticleBatch(port, 'group', 'peer')).toEqual([]);
    await enqueueSyncPackResourceArticles(port, {
      groupId: 'group', incomingAlias: 'inc', peerId: 'peer'
    });
    sqlite.close();

    const reopened = new Database(file);
    try {
      const restored = createBetterSqliteDbPort(reopened);
      expect(await loadSyncPackResourceArticleBatch(restored, 'group', 'peer'))
        .toEqual(['article-a', 'article-b']);
      await clearSyncPackResourceArticles(restored, 'group', 'peer', ['article-a']);
      expect(await loadSyncPackResourceArticleBatch(restored, 'group', 'peer'))
        .toEqual(['article-b']);
    } finally { reopened.close(); }
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

it('enumerates a large durable backlog in bounded batches', async () => {
  const sqlite = new Database(':memory:');
  try {
    for (const sql of SYNC_PACK_PROGRESS_SCHEMA_STATEMENTS) sqlite.exec(sql);
    const insert = sqlite.prepare(`INSERT INTO sync_pack_resource_articles
      (group_id, peer_id, article_id) VALUES ('group', 'peer', ?)`);
    for (let index = 0; index < 130; index += 1) {
      insert.run(`article-${String(index).padStart(3, '0')}`);
    }
    const port = createBetterSqliteDbPort(sqlite);
    const first = await loadSyncPackResourceArticleBatch(port, 'group', 'peer');
    const second = await loadSyncPackResourceArticleBatch(port, 'group', 'peer', first.at(-1)!);
    const third = await loadSyncPackResourceArticleBatch(port, 'group', 'peer', second.at(-1)!);
    expect([first.length, second.length, third.length]).toEqual([64, 64, 2]);
  } finally { sqlite.close(); }
});
