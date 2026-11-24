// @vitest-environment node
import { DatabaseSync } from 'node:sqlite';

import { afterEach, expect, it } from 'vitest';

import { buildAssetMarkdownUrl } from '../../platform/assetMarkdownUrl.js';
import { DESKTOP_FRESH_SCHEMA_STATEMENTS } from '../database/desktopFreshSchemaStatements.js';
import type { DbPort, DbRow } from '../sync/dbPort.js';

import { runLibraryMerge } from './libraryMerge.js';

const NOW = '2026-11-24T00:00:00.000Z';
const IMAGE = `${'a'.repeat(64)}.png`;
const INLINE_IMAGE = `${'b'.repeat(64)}.png`;
const PDF = `${'c'.repeat(64)}.pdf`;
const databases: DatabaseSync[] = [];

afterEach(() => {
  for (const db of databases.splice(0)) db.close();
});

function library() {
  const db = new DatabaseSync(':memory:');
  databases.push(db);
  for (const sql of DESKTOP_FRESH_SCHEMA_STATEMENTS) db.exec(sql);
  const port: DbPort = {
    async run(sql, params = []) {
      const { changes, lastInsertRowid } = db.prepare(sql).run(...params);
      return { changes: Number(changes), lastInsertRowId: lastInsertRowid };
    },
    async query<T extends DbRow>(sql: string, params = []) {
      return db.prepare(sql).all(...params) as T[];
    },
    async transaction(execute) {
      db.exec('BEGIN IMMEDIATE');
      try {
        const result = await execute(port);
        db.exec('COMMIT');
        return result;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    }
  };
  return { db, port };
}

function addNode(db: DatabaseSync, id: string, body: string, options: {
  parentId?: string;
  versionId?: string;
  updatedAt?: string;
  references?: string;
} = {}) {
  db.prepare(`INSERT INTO nodes (id, parent_id, title, content, current_version_id, created_at, updated_at,
    last_modified_by_host_name, resource_references) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, options.parentId ?? null, id, body, options.versionId ?? null, NOW,
      options.updatedAt ?? NOW, 'source', options.references ?? '[]');
}

function merge(source: ReturnType<typeof library>, target: ReturnType<typeof library>, now = NOW) {
  return runLibraryMerge({
    source: source.port,
    target: target.port,
    host: {
      async findFolder() { return 'special-merge'; },
      async ensureFolder() { return 'special-merge'; },
      async createNode(_tx, node, parentId) {
        addNode(target.db, node.id, node.content, { parentId, references: node.resource_references ?? '[]' });
      }
    },
    now
  });
}

it('retries attachments that newly added nodes and retained alternatives still reference', async () => {
  const source = library();
  const target = library();
  addNode(target.db, 'special-merge', '');
  addNode(target.db, 'conflict', 'Local body');
  addNode(source.db, 'new', 'An attachment', {
    references: JSON.stringify([{ storage_key: PDF, original_name: 'document.pdf', role: 'reference' }])
  });
  addNode(source.db, 'conflict', `![one](${buildAssetMarkdownUrl(IMAGE)}) ![two](${buildAssetMarkdownUrl(INLINE_IMAGE)})`, {
    versionId: 'version-1',
    references: JSON.stringify([{ storage_key: IMAGE, original_name: null, role: 'image' }])
  });

  expect(await merge(source, target)).toMatchObject({ added: 1, alternatives: 1, attachmentKeys: [IMAGE, INLINE_IMAGE, PDF] });
  expect(await merge(source, target)).toMatchObject({ added: 0, alternatives: 0, attachmentKeys: [IMAGE, INLINE_IMAGE, PDF] });
});

it('retries only source attachments still referenced by the target', async () => {
  const source = library();
  const target = library();
  addNode(target.db, 'special-merge', '');
  addNode(target.db, 'conflict', 'Local body');
  addNode(source.db, 'new', `![removed](${buildAssetMarkdownUrl(IMAGE)}) ![kept](${buildAssetMarkdownUrl(INLINE_IMAGE)})`);
  addNode(source.db, 'conflict', `![dismissed](${buildAssetMarkdownUrl(IMAGE)})`, { versionId: 'version-1' });
  await merge(source, target);

  target.db.prepare("UPDATE nodes SET content = ? WHERE id = 'new'").run(`![kept](${buildAssetMarkdownUrl(INLINE_IMAGE)})`);
  target.db.prepare(`INSERT INTO node_sync_versions (version_id, object_id, host_name, created_at, content_hash)
    VALUES ('original-body', 'new', 'source', ?, 'hash')`).run(NOW);
  source.db.exec("UPDATE nodes SET current_version_id = 'original-body' WHERE id = 'new'");
  target.db.exec("UPDATE node_text_alternatives SET status = 'dismissed', body_text = ''");

  expect(await merge(source, target)).toMatchObject({ added: 0, alternatives: 0, attachmentKeys: [INLINE_IMAGE] });
});
