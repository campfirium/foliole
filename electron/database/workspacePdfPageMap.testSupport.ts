import Database from 'better-sqlite3';

import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import { upsertNodeResourceReference } from '../../lib/core/database/nodeResourceReferences.js';
import { refreshWorkspacePdfPageMap } from '../../lib/core/database/workspacePdfPageMap.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';

export function pageMapLibrary() {
  const sqlite = new Database(':memory:');
  initializeDatabaseSchema(sqlite);
  sqlite.exec(`ATTACH DATABASE ':memory:' AS search;
    CREATE VIRTUAL TABLE search.node_search USING fts5(title,path,content,node_id UNINDEXED,updated_at UNINDEXED,is_trashed UNINDEXED);
    CREATE VIRTUAL TABLE search.pdf_search USING fts5(title,path,text,node_id UNINDEXED,attachment_id UNINDEXED,
      page UNINDEXED,updated_at UNINDEXED,page_text_length UNINDEXED,is_trashed UNINDEXED);
    CREATE TABLE search.pdf_page_map(row_id INTEGER PRIMARY KEY,node_id TEXT,attachment_id TEXT,page INTEGER,
      UNIQUE(node_id,attachment_id,page));`);
  const driver = createBetterSqlite3Driver(sqlite);
  const insertNode = (id: string, parent: string | null = null) => driver.execute(
    `INSERT INTO nodes(id,parent_id,kind,title,content,created_at,updated_at)
     VALUES(?,?,'topic',?,'body','now','now')`, [id, parent, id]);
  const attach = (node: string, attachment: string) => {
    const current = driver.queryOne<{ resource_references: string }>('SELECT resource_references FROM nodes WHERE id=?', [node])!;
    const references = upsertNodeResourceReference(current.resource_references,
      { storage_key: `${attachment}.pdf`, role: 'reference', original_name: 'Source.pdf' });
    driver.execute('UPDATE nodes SET resource_references=? WHERE id=?', [references, node]);
  };
  const map = () => driver.queryAll('SELECT * FROM search.pdf_page_map ORDER BY row_id');
  const expectedMap = () => driver.queryAll(`SELECT rowid AS row_id,node_id,attachment_id,CAST(page AS INTEGER) AS page
    FROM search.pdf_search ORDER BY rowid`);
  const seedUnrelated = (size: number) => {
    const insert = sqlite.prepare(`INSERT INTO search.pdf_search(title,path,text,node_id,attachment_id,page)
      VALUES('PDF','','page','unrelated','unrelated-pdf',?)`);
    sqlite.transaction(() => { for (let i = 1; i <= size; i++) insert.run(i); })();
    refreshWorkspacePdfPageMap(driver);
  };
  return { sqlite, driver, insertNode, attach, map, expectedMap, seedUnrelated };
}
