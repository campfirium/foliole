// @vitest-environment node
import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { DESKTOP_FRESH_SCHEMA_STATEMENTS } from '../../lib/core/database/desktopFreshSchemaStatements.js';
import { serializeNodeResourceReferences } from '../../lib/core/database/nodeResourceReferences.js';
import { SYNC_STATE_SEQUENCE_SCHEMA_STATEMENTS } from '../../lib/core/database/syncStateSequenceSchemaStatements.js';
import { attachWorkspaceNodeAttachments } from '../../lib/core/database/workspaceSnapshotAttachments.js';
import type { WorkspaceNodeSnapshot } from '../../lib/core/database/workspaceSnapshotHelpers.js';
import { applyLocalContentEdit } from '../../lib/core/sync/localContentEdit.js';
import { loadNodeOwnedArticleResourceNeeds } from '../../lib/core/sync/nodeOwnedArticleResourceNeeds.js';
import { retainLocalEditBase } from '../../lib/core/sync/nodeVersionLocalEditHold.js';
import { applySyncNodesWithDbPort } from '../../lib/core/sync/syncNodeApplyExecutor.js';
import { hashTextBodyContent } from '../../lib/core/sync/syncNodeTextBodyBlobs.js';
import type { NativeSyncNodeRecord } from '../../lib/platform/nativeSyncContract.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import { flushNodeSyncVersionWithDriver } from './nodeSyncVersionFromDriver.js';

function replica() {
  const db = new Database(':memory:');
  for (const sql of [...DESKTOP_FRESH_SCHEMA_STATEMENTS, ...SYNC_STATE_SEQUENCE_SCHEMA_STATEMENTS]) db.exec(sql);
  db.pragma('foreign_keys = ON');
  return { db, driver: createBetterSqlite3Driver(db), port: createBetterSqliteDbPort(db) };
}

const image = `${'a'.repeat(64)}.png`;
const pdf = `${'b'.repeat(64)}.pdf`;
const references = serializeNodeResourceReferences([
  { storage_key: image, original_name: 'Source image.png', role: 'image' },
  { storage_key: pdf, original_name: 'Source document.pdf', role: 'reference' }
]);

function currentRecord(source: ReturnType<typeof replica>): NativeSyncNodeRecord {
  const row = source.db.prepare('SELECT * FROM node_sync_versions WHERE object_id = ?').get('article') as {
    version_id: string; content_hash: string; snapshot_json: string; body_text: string;
  };
  return {
    ancestor_version_ids: [], object_type: 'node', object_id: 'article', host_name: 'source',
    version_id: row.version_id, parent_version_id: null, parent_version_ids: [],
    content_hash: row.content_hash, body_text: row.body_text,
    updated_at: '2026-09-30T00:00:00.000Z', version_created_at: '2026-09-30T00:00:00.000Z',
    snapshot: JSON.parse(row.snapshot_json)
  };
}

it('persists current node resources through production version creation and remote apply without either registry', async () => {
  const source = replica();
  const target = replica();
  try {
    const body = `![image](asset://${image})`;
    const bodyHash = await hashTextBodyContent(body, {});
    source.db.prepare(`INSERT INTO nodes (id, title, content, body_blob_hash, resource_references, sync_dirty, created_at, updated_at)
      VALUES ('article', 'Article', ?, ?, ?, 1, 'now', 'now')`).run(body, bodyHash, references);
    expect(flushNodeSyncVersionWithDriver(source.driver, 'article', 'source')).toBeTruthy();
    const record = currentRecord(source);
    expect((await applySyncNodesWithDbPort(target.port, [record])).appliedIds).toEqual(['article']);
    expect(target.db.prepare('SELECT resource_references FROM nodes WHERE id = ?').get('article'))
      .toEqual({ resource_references: references });
    expect((await loadNodeOwnedArticleResourceNeeds(target.port, ['article'])).unreadableArticleIds).toEqual([]);
    expect((await loadNodeOwnedArticleResourceNeeds(target.port, ['article'])).needs.map((need) => need.storageKey).sort())
      .toEqual([image, pdf]);
    const nodes = { article: { id: 'article' } as WorkspaceNodeSnapshot };
    attachWorkspaceNodeAttachments(target.driver, nodes);
    expect(nodes.article.resourceReferences?.map((reference) => reference.original_name))
      .toEqual(['Source image.png', 'Source document.pdf']);
    expect((await applySyncNodesWithDbPort(target.port, [record])).appliedIds).toEqual([]);
    expect(target.db.prepare("SELECT name FROM sqlite_master WHERE name IN ('attachments', 'node_attachments')").all())
      .toEqual([]);
    expect(target.db.pragma('foreign_key_check')).toEqual([]);
  } finally { source.db.close(); target.db.close(); }
});

it('rejects an invalid mounted key transactionally without losing the existing node or version', async () => {
  const target = replica();
  const source = replica();
  try {
    source.db.prepare(`INSERT INTO nodes (id, title, content, resource_references, sync_dirty, created_at, updated_at)
      VALUES ('article', 'Article', 'Body', ?, 1, 'now', 'now')`).run(references);
    flushNodeSyncVersionWithDriver(source.driver, 'article', 'source');
    const record = currentRecord(source);
    await applySyncNodesWithDbPort(target.port, [record]);
    const before = target.db.prepare('SELECT * FROM nodes').all();
    const versions = target.db.prepare('SELECT * FROM node_sync_versions').all();
    const invalid = { ...record, version_id: 'source#invalid', parent_version_id: record.version_id,
      parent_version_ids: [record.version_id!], snapshot: { ...record.snapshot,
        resource_references: JSON.stringify([{ storage_key: '../file.pdf', role: 'reference', original_name: 'File.pdf' }]) } };
    await expect(applySyncNodesWithDbPort(target.port, [invalid])).rejects.toThrow('node_resource_reference_invalid');
    expect(target.db.prepare('SELECT * FROM nodes').all()).toEqual(before);
    expect(target.db.prepare('SELECT * FROM node_sync_versions').all()).toEqual(versions);
  } finally { source.db.close(); target.db.close(); }
});

it.each([{ operation: 'import', initial: '[]', current: references },
  { operation: 'remove', initial: references, current: '[]' }])('preserves current resource facts after $operation when text uses a stale base', async ({ initial, current }) => {
  const source = replica();
  try {
    source.db.prepare("INSERT INTO nodes (id, title, content, resource_references, sync_dirty, created_at, updated_at) VALUES ('article', 'Article', 'Body', ?, 1, 'now', 'now')").run(initial);
    const base = flushNodeSyncVersionWithDriver(source.driver, 'article', 'source')!;
    await retainLocalEditBase(source.port, { holdId: 'editor', nodeId: 'article', versionId: base });
    source.db.prepare("UPDATE nodes SET resource_references = ?, sync_dirty = 1 WHERE id = 'article'").run(current);
    flushNodeSyncVersionWithDriver(source.driver, 'article', 'source');
    const edit = { nodeId: 'article', baseVersionId: base, versionId: 'delayed-edit',
      content: 'Edited body', title: 'Article', hideTitleHeading: false, hostName: 'source',
      updatedAt: new Date(Date.now() + 1000).toISOString() };
    const result = await applyLocalContentEdit(source.port, edit);
    expect(source.db.prepare("SELECT resource_references FROM nodes WHERE id = 'article'").pluck().get()).toBe(current);
    expect(source.db.prepare("SELECT body_text FROM node_sync_versions WHERE version_id = 'delayed-edit'").pluck().get())
      .toBe('Edited body');
    expect((await applyLocalContentEdit(source.port, edit)).current.version_id).toBe(result.current.version_id);
  } finally { source.db.close(); }
});
