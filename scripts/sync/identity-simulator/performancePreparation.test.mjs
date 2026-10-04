// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { measureVersionPayload } from './performancePreparation.js';

it('measures retained UTF-8 facts for actual eligible topics in edit selection order', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'foliole-performance-payload-'));
  const file = path.join(root, 'source.db');
  const sqlite = new Database(file);
  try {
    sqlite.exec(`CREATE TABLE nodes (id TEXT, kind TEXT, deleted_at TEXT, current_version_id TEXT);
      CREATE TABLE node_sync_versions (object_id TEXT, snapshot_json TEXT, body_text TEXT)`);
    const node = sqlite.prepare('INSERT INTO nodes VALUES (?, ?, ?, ?)');
    const version = sqlite.prepare('INSERT INTO node_sync_versions VALUES (?, ?, ?)');
    for (let index = 0; index < 1001; index += 1) {
      const id = `real-topic-${String(index).padStart(4, '0')}`;
      node.run(id, 'topic', null, 'head');
      version.run(id, '中', '😀');
    }
    version.run('real-topic-0000', '中', null);
    for (const [id, kind, deletedAt, head] of [
      ['special-inbox', 'topic', null, 'head'],
      ['special-virtual-root', 'topic', null, 'head'],
      ['a-deleted', 'topic', '2026-10-04', 'head'],
      ['a-folder', 'folder', null, 'head'],
      ['a-no-head', 'topic', null, null]
    ]) {
      node.run(id, kind, deletedAt, head);
      version.run(id, 'excluded', 'excluded');
    }
    expect(measureVersionPayload(file)).toEqual([
      { requestedTopics: 300, selectedTopics: 300, rows: 301, logicalBytes: 2103 },
      { requestedTopics: 1000, selectedTopics: 1000, rows: 1001, logicalBytes: 7003 },
      { requestedTopics: 10000, selectedTopics: 1001, rows: 1002, logicalBytes: 7010 }
    ]);
  } finally {
    sqlite.close();
    rmSync(root, { recursive: true, force: true });
  }
});
