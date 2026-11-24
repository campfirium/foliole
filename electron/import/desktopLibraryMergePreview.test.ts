// @vitest-environment node
import { DatabaseSync } from 'node:sqlite';

import { expect, it, vi } from 'vitest';

import { DESKTOP_FRESH_SCHEMA_STATEMENTS } from '../../lib/core/database/desktopFreshSchemaStatements.js';
import { bindParentOrderWriter } from '../../lib/core/database/parentOrderWriter.js';
import { hashTextBody } from '../../lib/core/database/textBodyHash.js';
import { runLibraryMerge } from '../../lib/core/import/libraryMerge.js';
import { createBetterSqlite3Driver } from '../database/betterSqlite3Driver.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';
import { upsertNodeSnapshot } from '../database/nodeMutations.js';
import { loadNodeTextAlternativePreview, promoteNodeTextAlternative } from '../database/nodeTextAlternatives.js';

const connection = vi.hoisted(() => ({ current: null as object | null }));
vi.mock('../database/connection.js', () => ({
  openDatabaseConnection: () => connection.current,
  runWithDatabaseConnectionOwner: (fn: () => unknown) => fn()
}));

function library() {
  const database = new DatabaseSync(':memory:');
  for (const sql of DESKTOP_FRESH_SCHEMA_STATEMENTS) database.exec(sql);
  const sqlite = {
    prepare: database.prepare.bind(database),
    get inTransaction() { return database.isTransaction; },
    transaction<T>(execute: () => T) {
      return () => {
        database.exec('SAVEPOINT test_transaction');
        try {
          const result = execute();
          database.exec('RELEASE test_transaction');
          return result;
        } catch (error) {
          database.exec('ROLLBACK TO test_transaction; RELEASE test_transaction');
          throw error;
        }
      };
    }
  } as unknown as Parameters<typeof createBetterSqlite3Driver>[0];
  const driver = createBetterSqlite3Driver(sqlite);
  return { database, driver, sqlite, port: createBetterSqliteDbPort(sqlite) };
}

it('previews and promotes a merged body in a local topic before its first sync', async () => {
  const source = library();
  const target = library();
  connection.current = target;
  const now = new Date().toISOString();
  try {
    target.driver.execute('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)',
      ['host_name', JSON.stringify('local'), now]);
    bindParentOrderWriter(target.driver, { deviceAnchor: 'local', libraryPath: ':memory:' });
    upsertNodeSnapshot({ nodeId: 'topic', kind: 'topic', parentNodeId: null, position: null,
      title: 'Local topic', isTitleManual: true, content: 'Local body', reveal: null,
      anchorLink: null, createdAt: now, updatedAt: now });
    source.driver.execute('INSERT INTO nodes (id, title, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      ['topic', 'Backup topic', 'Backup body', now, now]);
    expect(await runLibraryMerge({ source: source.port, target: target.port, now, host: {
      async findFolder() { return null; },
      async ensureFolder() { throw new Error('Unexpected new folder'); },
      async createNode() { throw new Error('Unexpected new node'); }
    } })).toMatchObject({ alternatives: 1 });

    const preview = await loadNodeTextAlternativePreview('topic');
    expect(preview).toMatchObject({ current_content: 'Local body', updated_content: 'Backup body' });
    expect(target.driver.queryOne('SELECT current_version_id FROM nodes WHERE id = ?', ['topic']))
      .toEqual({ current_version_id: null });
    expect(await promoteNodeTextAlternative('topic', preview!.alternative_id)).toMatchObject({ status: 'promoted' });
    expect(await loadNodeTextAlternativePreview('topic')).toBeNull();
    expect(target.driver.queryOne(`SELECT n.content, json_extract(v.snapshot_json, '$.body_blob_hash') AS previous_body_hash FROM nodes n
      JOIN node_sync_versions current ON current.version_id = n.current_version_id
      JOIN node_sync_versions v ON v.version_id = current.parent_version_id WHERE n.id = ?`, ['topic']))
      .toEqual({ content: 'Backup body', previous_body_hash: hashTextBody('Local body') });
  } finally {
    connection.current = null;
    source.database.close();
    target.database.close();
  }
});
