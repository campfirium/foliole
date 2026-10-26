// @vitest-environment node
import Database from 'better-sqlite3';
import { afterEach, expect, it } from 'vitest';

import { createBetterSqlite3Driver } from '../../../electron/database/betterSqlite3Driver.js';

import { initializeDatabaseSchema } from './migrations.js';
import { rebuildWorkspaceSearchIndexes, syncNodeSearchIndexForNodeIds, syncPdfSearchIndexForNodeIds, syncWorkspaceSearchIndexForNodeIds } from './workspaceSearchIndex.js';
import { syncWorkspaceSearchPathForSubtreeRootIds } from './workspaceSearchSubtreeIndex.js';

const databases: Database.Database[] = [];
afterEach(() => databases.splice(0).forEach((db) => db.close()));

function host() {
  const db = new Database(':memory:');
  databases.push(db);
  initializeDatabaseSchema(db);
  db.exec(`ATTACH DATABASE ':memory:' AS search;
    CREATE VIRTUAL TABLE search.node_search USING fts5(title,path,content,node_id UNINDEXED,updated_at UNINDEXED,is_trashed UNINDEXED);
    CREATE VIRTUAL TABLE search.pdf_search USING fts5(title,path,text,node_id UNINDEXED,attachment_id UNINDEXED,page UNINDEXED,
      updated_at UNINDEXED,page_text_length UNINDEXED,is_trashed UNINDEXED);
    CREATE TABLE search.pdf_page_map(row_id INTEGER PRIMARY KEY,node_id TEXT,attachment_id TEXT,page INTEGER,
      UNIQUE(node_id,attachment_id,page));`);
  const driver = createBetterSqlite3Driver(db);
  const insert = db.prepare(`INSERT INTO nodes(id,parent_id,kind,title,content,created_at,updated_at)
    VALUES (?,?,'topic',?,'Search body','2026-10-26','2026-10-26')`);
  const add = (id: string, parent: string | null, title = id) => insert.run(id, parent, title);
  return { db, driver, add };
}

for (const [name, sync] of Object.entries({
  node: syncNodeSearchIndexForNodeIds,
  workspace: syncWorkspaceSearchIndexForNodeIds,
  pdf: syncPdfSearchIndexForNodeIds,
  subtree: syncWorkspaceSearchPathForSubtreeRootIds
})) {
  it(`${name} path work stays bounded when unrelated sibling trees grow`, () => {
    const costs: number[] = [];
    for (const size of [100, 1000, 10000]) {
      const { db, driver, add } = host();
      add('root', null, ' Root ');
      add('target', 'root');
      const attachmentId = 'a'.repeat(64);
      db.prepare('UPDATE nodes SET resource_references=? WHERE id=?').run(JSON.stringify([
        { storage_key: `${attachmentId}.pdf`, role: 'reference', original_name: 'Source.pdf' }
      ]), 'target');
      db.prepare("INSERT INTO pdf_index_state(attachment_id,status) VALUES (?,'ready')").run(attachmentId);
      db.prepare('INSERT INTO pdf_page_text(attachment_id,page,text) VALUES (?,1,?)').run(attachmentId, 'PDF body');
      db.transaction(() => {
        for (let i = 0; i < size; i++) add(`other-${i}`, 'root');
      })();
      rebuildWorkspaceSearchIndexes(driver);
      let calls = 0;
      db.function('trim', (value: string) => { calls++; return value.replace(/^ +| +$/g, ''); });
      sync(driver, ['target']);
      costs.push(calls);
      expect(db.prepare("SELECT title,path,text,node_id,is_trashed FROM search.pdf_search WHERE node_id='target'").get())
        .toEqual({ title: 'Source.pdf', path: 'Root', text: 'PDF body', node_id: 'target', is_trashed: 0 });
      expect(db.prepare("SELECT title,path,content,node_id,is_trashed FROM search.node_search WHERE node_id='target'").get())
        .toEqual({ title: 'target', path: 'Root', content: 'Search body', node_id: 'target', is_trashed: 0 });
    }
    expect(Math.max(...costs)).toBeLessThan(20);
    expect(new Set(costs).size).toBe(1);
  });
}

it('matches full rebuild through deep ancestry, overlapping seeds, moves, trash and restore', () => {
  const { db, driver, add } = host();
  add('root', null, ' Root ');
  add('blank', 'root', '   ');
  add('parent', 'blank', ' Parent ');
  add('leaf', 'parent');
  add('other', null, 'Other');
  rebuildWorkspaceSearchIndexes(driver);
  const rows = () => db.prepare('SELECT title,path,content,node_id,updated_at,is_trashed FROM search.node_search ORDER BY node_id').all();
  const compare = (ids: string[]) => {
    syncWorkspaceSearchIndexForNodeIds(driver, ids);
    const incremental = rows();
    rebuildWorkspaceSearchIndexes(driver);
    expect(incremental).toEqual(rows());
  };
  db.exec("UPDATE nodes SET deleted_at='2026-10-26' WHERE id='root'");
  compare(['root', 'parent', 'missing']);
  expect(db.prepare("SELECT path,is_trashed FROM search.node_search WHERE node_id='leaf'").get())
    .toEqual({ path: 'Root / Untitled / Parent', is_trashed: 1 });
  db.exec("UPDATE nodes SET parent_id='other' WHERE id='parent'");
  compare(['parent']);
  db.exec("UPDATE nodes SET deleted_at=NULL,title='Renamed' WHERE id='root'");
  compare(['root']);
  db.exec("UPDATE nodes SET parent_id='blank' WHERE id='parent'");
  syncWorkspaceSearchPathForSubtreeRootIds(driver, ['parent', 'leaf']);
  const moved = rows();
  rebuildWorkspaceSearchIndexes(driver);
  expect(moved).toEqual(rows());
  db.exec("DELETE FROM nodes WHERE id='leaf'");
  compare(['leaf', 'missing']);
});
