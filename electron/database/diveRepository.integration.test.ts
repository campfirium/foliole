// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import BetterSqlite3 from 'better-sqlite3';
import { expect, it } from 'vitest';

import { resolveDiveTopicIds } from '../../lib/core/nodes/dive.js';

import { addDiveSources, createDive, listDives } from './diveRepository.js';

it('persists direct sources and resolves descendants from the current library tree', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'foliole-dive-'));
  const databasePath = path.join(root, 'library.sqlite');
  let db = new BetterSqlite3(databasePath);
  try {
    db.exec(`
      CREATE TABLE workspace_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE nodes (id TEXT PRIMARY KEY, kind TEXT, parent_id TEXT, virtual_filter TEXT, deleted_at TEXT);
      INSERT INTO nodes (id, kind, parent_id) VALUES
        ('folder', 'folder', NULL), ('nested', 'folder', 'folder'), ('overlap', 'topic', 'nested'),
        ('inherited', 'topic', 'nested'), ('outside', 'topic', NULL), ('special-inbox', 'folder', NULL);
    `);
    const dive = createDive(db, 'Probability', ['folder']);
    expect(() => addDiveSources(db, dive.id, ['overlap', 'special-inbox'])).toThrow('unavailable');
    expect(listDives(db)).toEqual([dive]);
    addDiveSources(db, dive.id, ['overlap', 'outside', 'overlap']);
    addDiveSources(db, dive.id, ['outside']);
    db.close();
    db = new BetterSqlite3(databasePath);
    const [saved] = listDives(db);
    expect(saved).toEqual({ ...dive, directSourceIds: ['folder', 'overlap', 'outside'] });

    const members = () => {
      const nodes = db.prepare<[], { id: string; kind: string; parentNodeId: string | null }>(
        'SELECT id, kind, parent_id AS parentNodeId FROM nodes'
      ).all();
      return resolveDiveTopicIds(saved!, {
        kindOf: (id) => nodes.find((node) => node.id === id)?.kind,
        childrenOf: (id) => nodes.filter((node) => node.parentNodeId === id).map((node) => node.id)
      });
    };
    expect(members()).toEqual(['overlap', 'inherited', 'outside']);
    db.prepare('UPDATE nodes SET parent_id = NULL WHERE id = ?').run('nested');
    expect(members()).toEqual(['overlap', 'outside']);
  } finally {
    if (db.open) db.close();
    rmSync(root, { recursive: true, force: true });
  }
});
