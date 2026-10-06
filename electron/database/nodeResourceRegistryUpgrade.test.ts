// @vitest-environment node
import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { ANDROID_COMPANION_CORE_SCHEMA_STATEMENTS } from '../../lib/core/database/androidCompanionCoreSchemaStatements.js';
import { migrateCompanionDatabase } from '../../lib/core/database/companionDatabaseMigrationExecutor.js';
import { COMPANION_SCHEMA_STATEMENTS } from '../../lib/core/database/companionSchemaStatements.js';
import { DATABASE_SCHEMA_VERSION } from '../../lib/core/database/databaseSchemaVersion.js';
import { DESKTOP_CORE_SCHEMA_STATEMENTS } from '../../lib/core/database/desktopCoreSchemaStatements.js';
import { DESKTOP_RESOURCE_SCHEMA_STATEMENTS } from '../../lib/core/database/desktopResourceSchemaStatements.js';
import { WATCHED_FOLDER_BINDING_SCHEMA_STATEMENTS } from '../../lib/core/database/desktopSourceConnectionSchemaStatements.js';
import { DESKTOP_SOURCE_SCHEMA_STATEMENTS } from '../../lib/core/database/desktopSourceSchemaStatements.js';
import { EXTERNAL_DOCUMENT_SCHEMA_STATEMENTS } from '../../lib/core/database/externalDocumentSchemaStatements.js';
import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import { NODE_VERSION_RETENTION_SCHEMA_STATEMENTS } from '../../lib/core/database/nodeVersionRetentionSchemaStatements.js';
import { SYNC_GROUP_SCHEMA_STATEMENTS } from '../../lib/core/database/syncGroupSchemaStatements.js';
import { SYNC_SCHEMA_STATEMENTS } from '../../lib/core/database/syncSchemaStatements.js';
import { SYNC_STATE_SEQUENCE_SCHEMA_STATEMENTS } from '../../lib/core/database/syncStateSequenceSchemaStatements.js';
import { canonicalWorkspaceNodePayload } from '../../lib/core/database/workspaceNodeSyncVersion.js';
import { applyLocalContentEdit } from '../../lib/core/sync/localContentEdit.js';
import { retainLocalEditBase } from '../../lib/core/sync/nodeVersionLocalEditHold.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';

const hash = 'a'.repeat(64);
function seedLegacy(db: Database.Database) {
  db.exec(`INSERT INTO nodes (id, title, created_at, updated_at) VALUES ('article', 'Article', 'now', 'now');
    INSERT INTO attachments (id, original_name, mime_type, created_at) VALUES ('${hash}', 'Original.pdf', 'application/pdf', 'now');
    INSERT INTO node_attachments VALUES ('article', '${hash}', 'reference');
    INSERT INTO pdf_page_text VALUES ('${hash}', 1, 'Original text', 100, 200);`);
  const image = 'b'.repeat(64);
  const unused = 'c'.repeat(64);
  db.prepare(`INSERT INTO nodes (id, title, content, image_sources, created_at, updated_at)
    VALUES ('body-only', 'Image owner', ?, ?, 'now', 'now')`)
    .run(`![Current](asset://${image}.png)\n\n[Ordinary link](asset://${unused}.png)`, JSON.stringify({ [`${unused}.png`]: 'https://example.com/unused' }));
  const insert = db.prepare("INSERT INTO attachments (id, original_name, mime_type, created_at) VALUES (?, ?, 'image/png', 'now')");
  insert.run(image, 'Body-owned.png');
  insert.run(unused, 'Unused.png');
}
function expectRetired(db: Database.Database) {
  expect(db.prepare("SELECT name FROM sqlite_master WHERE name IN ('attachments', 'node_attachments')").all()).toEqual([]);
  const row = db.prepare("SELECT resource_references FROM nodes WHERE id = 'article'").get() as { resource_references: string };
  expect(JSON.parse(row.resource_references)).toEqual([{ storage_key: `${hash}.pdf`, original_name: 'Original.pdf', role: 'reference' }]);
  expect(db.prepare('SELECT text FROM pdf_page_text').get()).toEqual({ text: 'Original text' });
  const bodyOwner = db.prepare("SELECT resource_references FROM nodes WHERE id = 'body-only'").get() as { resource_references: string };
  expect(JSON.parse(bodyOwner.resource_references))
    .toEqual([{ storage_key: `${'b'.repeat(64)}.png`, role: 'image', original_name: 'Body-owned.png' }]);
  expect(db.pragma('foreign_key_check')).toEqual([]);
  expect(db.pragma('integrity_check', { simple: true })).toBe('ok');
}
it('runs the registered desktop upgrade and preserves mounted references and PDF text through the next edit', async () => {
  const db = new Database(':memory:');
  try {
    db.exec([...DESKTOP_CORE_SCHEMA_STATEMENTS, ...DESKTOP_RESOURCE_SCHEMA_STATEMENTS,
      ...EXTERNAL_DOCUMENT_SCHEMA_STATEMENTS,
      ...DESKTOP_SOURCE_SCHEMA_STATEMENTS,
      ...WATCHED_FOLDER_BINDING_SCHEMA_STATEMENTS,
      ...SYNC_SCHEMA_STATEMENTS, ...SYNC_STATE_SEQUENCE_SCHEMA_STATEMENTS,
      ...SYNC_GROUP_SCHEMA_STATEMENTS, ...NODE_VERSION_RETENTION_SCHEMA_STATEMENTS].join(';'));
    seedLegacy(db);
    const oldSnapshot = JSON.stringify(canonicalWorkspaceNodePayload({
      id: 'article', parentNodeId: null, kind: 'topic', title: 'Article', content: 'Body',
      isTitleManual: false, hideTitleHeading: false, anchorLink: null, reveal: null,
      reading: null, review: null, createdAt: 'now', updatedAt: 'now'
    }));
    db.prepare(`INSERT INTO node_sync_versions (version_id, object_id, host_name, created_at, content_hash, body_text, snapshot_json)
      VALUES ('legacy-head', 'article', 'source', 'now', 'legacy-hash', 'Body', ?)`).run(oldSnapshot);
    db.exec("UPDATE nodes SET content = 'Body', current_version_id = 'legacy-head' WHERE id = 'article'");
    db.pragma('user_version = 118');
    db.pragma('foreign_keys = ON');
    await retainLocalEditBase(createBetterSqliteDbPort(db), { holdId: 'editor', nodeId: 'article', versionId: 'legacy-head' });
    initializeDatabaseSchema(db);
    expect(db.pragma('user_version', { simple: true })).toBe(DATABASE_SCHEMA_VERSION);
    expectRetired(db);
    const migrated = db.prepare("SELECT current_version_id FROM nodes WHERE id = 'article'").pluck().get() as string;
    expect(migrated).not.toBe('legacy-head');
    await applyLocalContentEdit(createBetterSqliteDbPort(db), { nodeId: 'article', baseVersionId: migrated,
      versionId: 'edited', content: 'Edited body', title: 'Article', hideTitleHeading: false,
      hostName: 'source', updatedAt: 'later' }, undefined, { enqueueSearchInvalidations: false });
    expectRetired(db);
    expect(db.prepare("SELECT snapshot_json FROM node_sync_versions WHERE version_id = 'legacy-head'").pluck().get()).toBe(oldSnapshot);
    initializeDatabaseSchema(db);
    expectRetired(db);
  } finally { db.close(); }
});
it('runs the companion version upgrade and never recreates retired tables on reopen', async () => {
  const db = new Database(':memory:');
  try {
    db.exec([...COMPANION_SCHEMA_STATEMENTS, ...ANDROID_COMPANION_CORE_SCHEMA_STATEMENTS].join(';'));
    seedLegacy(db);
    const oldSnapshot = JSON.stringify(canonicalWorkspaceNodePayload({
      id: 'article', parentNodeId: null, kind: 'topic', title: 'Article', content: 'Body',
      isTitleManual: false, hideTitleHeading: false, anchorLink: null, reveal: null,
      reading: null, review: null, createdAt: 'now', updatedAt: 'now',
      attachments: [{ attachmentId: hash, role: 'reference', originalName: 'Original.pdf', mimeType: 'application/pdf' }]
    }));
    db.prepare(`INSERT INTO node_sync_versions (version_id, object_id, host_name, created_at, content_hash, body_text, snapshot_json)
      VALUES ('legacy-head', 'article', 'source', 'now', 'legacy-hash', 'Body', ?)`).run(oldSnapshot);
    db.exec("UPDATE nodes SET content = 'Body', current_version_id = 'legacy-head' WHERE id = 'article'");
    db.pragma('user_version = 55');
    db.pragma('foreign_keys = ON');
    const port = createBetterSqliteDbPort(db);
    await port.transaction((tx) => migrateCompanionDatabase(tx, 55, 56));
    expect(db.pragma('user_version', { simple: true })).toBe(56);
    expectRetired(db);
    const migrated = db.prepare("SELECT current_version_id FROM nodes WHERE id = 'article'").pluck().get() as string;
    expect(migrated).not.toBe('legacy-head');
    expect(db.prepare("SELECT snapshot_json FROM node_sync_versions WHERE version_id = 'legacy-head'").pluck().get()).toBe(oldSnapshot);
    await applyLocalContentEdit(port, { nodeId: 'article', baseVersionId: migrated, versionId: 'edited',
      content: 'Edited body', title: 'Article', hideTitleHeading: false, hostName: 'source', updatedAt: 'later' }, undefined, { enqueueSearchInvalidations: false });
    expect(db.prepare("SELECT body_text FROM node_sync_versions WHERE version_id = 'edited'").pluck().get()).toBe('Edited body');
    expectRetired(db);
    await port.transaction((tx) => migrateCompanionDatabase(tx, 56, 56));
    expectRetired(db);
  } finally { db.close(); }
});
it('rolls back the registered upgrade when a mounted reference cannot be expressed', () => {
  const db = new Database(':memory:');
  try {
    db.exec([...DESKTOP_CORE_SCHEMA_STATEMENTS, ...DESKTOP_RESOURCE_SCHEMA_STATEMENTS,
      ...SYNC_SCHEMA_STATEMENTS, ...SYNC_STATE_SEQUENCE_SCHEMA_STATEMENTS].join(';'));
    seedLegacy(db);
    db.prepare('UPDATE attachments SET mime_type = ?').run('unknown/type');
    db.pragma('user_version = 118');
    expect(() => initializeDatabaseSchema(db)).toThrow('node_resource_migration_unresolved');
    expect(db.pragma('user_version', { simple: true })).toBe(118);
    expect(db.prepare('SELECT original_name FROM attachments').get()).toEqual({ original_name: 'Original.pdf' });
  } finally { db.close(); }
});
