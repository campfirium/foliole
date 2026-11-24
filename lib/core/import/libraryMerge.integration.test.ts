// @vitest-environment node
import { DatabaseSync } from 'node:sqlite';

import { afterEach, expect, it } from 'vitest';

import { buildAssetMarkdownUrl } from '../../platform/assetMarkdownUrl.js';
import { DESKTOP_FRESH_SCHEMA_STATEMENTS } from '../database/desktopFreshSchemaStatements.js';
import type { DatabaseBindParams, DatabaseDriver, DatabaseRow } from '../database/driver.js';
import { hashTextBody } from '../database/textBodyHash.js';
import { loadTopicTextBodiesWithDriver } from '../database/topicTextBodiesWithDriver.js';
import { loadTopicTextStateWithDriver } from '../database/topicTextStateWithDriver.js';
import type { DbPort, DbRow } from '../sync/dbPort.js';
import { writeTopicAlternative } from '../sync/topicAlternativeStore.js';

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

it('recovers an attachment shared by a retained body and a dismissed backup body', async () => {
  const target = library();
  const first = library();
  const second = library();
  const image = `![shared](${buildAssetMarkdownUrl(IMAGE)})`;
  addNode(target.db, 'conflict', 'Local body');
  addNode(first.db, 'conflict', `First body ${image}`, { versionId: 'first' });
  addNode(second.db, 'conflict', `Second body ${image}`, { versionId: 'second' });
  expect(await merge(first, target)).toMatchObject({ alternatives: 1, attachmentKeys: [IMAGE] });
  expect(await merge(second, target)).toMatchObject({ alternatives: 1, attachmentKeys: [IMAGE] });
  target.db.exec(`UPDATE node_text_alternatives SET status = 'dismissed', body_text = '', resource_references = '[]'
    WHERE source_version_id = 'second'`);

  expect(await merge(second, target)).toMatchObject({ alternatives: 0, attachmentKeys: [IMAGE] });
  expect(target.db.prepare("SELECT body_text FROM node_text_alternatives WHERE status = 'available'").all())
    .toEqual([{ body_text: `First body ${image}` }]);
});

function previewBodies(target: ReturnType<typeof library>, nodeId: string) {
  const reader = {
    queryAll<T extends DatabaseRow>(sql: string, params: DatabaseBindParams = []) {
      return target.db.prepare(sql).all(...params) as T[];
    }
  } satisfies Pick<DatabaseDriver, 'queryAll'>;
  const driver = reader as DatabaseDriver;
  const options = loadTopicTextStateWithDriver(driver, nodeId);
  return loadTopicTextBodiesWithDriver(driver, nodeId, options).map(body => body.text);
}

async function mergeTextVersion(
  target: ReturnType<typeof library>, body: string, version: number, now: string
) {
  const source = library();
  addNode(source.db, 'conflict', body, { versionId: `v${version}`, updatedAt: `2026-11-0${version}T00:00:00.000Z` });
  return merge(source, target, now);
}

it('keeps the three newest distinct bodies previewable across multiple backup merges', async () => {
  const now = new Date().toISOString();
  const target = library();
  addNode(target.db, 'conflict', 'Local body');

  for (const version of [2, 3, 4]) {
    expect(await mergeTextVersion(target, `Body ${version}`, version, now)).toMatchObject({ alternatives: 1 });
  }
  const older = await mergeTextVersion(target, 'Older body', 1, now);
  expect(previewBodies(target, 'conflict')).toEqual(['Body 4', 'Body 3', 'Body 2']);
  expect(older).toMatchObject({ alternatives: 0, unchanged: 1 });

  expect(await mergeTextVersion(target, 'Newest body', 5, now)).toMatchObject({ alternatives: 1 });
  expect(previewBodies(target, 'conflict')).toEqual(['Newest body', 'Body 4', 'Body 3']);
  expect(target.db.prepare("SELECT content FROM nodes WHERE id = 'conflict'").get()).toEqual({ content: 'Local body' });
});

it('keeps the same alternative body previewable when it arrives with different version IDs', async () => {
  const now = new Date().toISOString();
  const target = library();
  addNode(target.db, 'conflict', 'Local body');

  expect(await mergeTextVersion(target, 'Identical body', 1, now)).toMatchObject({ alternatives: 1 });
  const duplicate = await mergeTextVersion(target, 'Identical body', 2, now);
  expect(previewBodies(target, 'conflict')).toEqual(['Identical body']);
  expect(duplicate).toMatchObject({ alternatives: 0, unchanged: 1 });
});

it('repairs invalid alternatives persisted by an earlier merge when the same Topic is merged again', async () => {
  const now = new Date().toISOString();
  const target = library();
  addNode(target.db, 'conflict', 'Local body');
  await mergeTextVersion(target, 'Same alternative', 1, now);
  await writeTopicAlternative(target.port, {
    alternative_id: 'previous-duplicate', node_id: 'conflict', source_version_id: 'old-version',
    body_text: 'Same alternative', body_blob_hash: hashTextBody('Same alternative'),
    source_host_name: 'old-source', created_at: NOW, expires_at: new Date(Date.parse(now) + 86_400_000).toISOString(),
    resource_references: '[]', image_sources: null, updated_at: now, status: 'available'
  }, true);
  expect(() => previewBodies(target, 'conflict')).toThrow('text_alternative_identity_duplicate');

  expect(await mergeTextVersion(target, 'Local body', 3, now)).toMatchObject({ alternatives: 0, alternativesChanged: true });
  expect(previewBodies(target, 'conflict')).toEqual(['Same alternative']);
});
