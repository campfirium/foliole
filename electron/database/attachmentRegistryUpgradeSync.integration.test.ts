// @vitest-environment node
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it } from 'vitest';

import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import { applySyncNodesWithDbPort } from '../../lib/core/sync/syncNodeApplyExecutor.js';
import { loadCurrentSyncNodeRecord } from '../../lib/core/sync/syncNodeGraph.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import { installHistoricalDesktopSchema } from './historicalMigration.test-support.js';
import { flushNodeSyncVersionWithDriver } from './nodeSyncVersionFromDriver.js';
import { closeLibraries, createPeer, root, startLibraries } from './syncLibrary.testSupport.js';
import { textBranch } from './topicTextState.testSupport.js';

const initialAt = '2026-09-22T12:00:00.000Z';
const movedAt = '2026-09-22T13:00:00.000Z';
const pdf = 'a'.repeat(64);

beforeEach(startLibraries);
afterEach(closeLibraries);

function folder(id: string) {
  const record = textBranch(`version-${id}`, '', undefined, initialAt);
  return { ...record, object_id: id, snapshot: { ...record.snapshot, id, kind: 'folder', title: id } };
}

function seedLegacyTopic(db: Database.Database, baseline: ReturnType<typeof textBranch>) {
  const insert = db.prepare('INSERT INTO nodes (id, kind, parent_id, title, created_at, updated_at, current_version_id) VALUES (?, ?, ?, ?, ?, ?, ?)');
  for (const id of ['old-folder', 'new-folder']) insert.run(id, 'folder', null, id, initialAt, initialAt, null);
  insert.run('topic', 'topic', 'old-folder', 'Topic', initialAt, initialAt, baseline.version_id);
  db.prepare(`INSERT INTO node_sync_versions (version_id, object_id, host_name, created_at, content_hash, body_text, snapshot_json)
    VALUES (?, 'topic', ?, ?, ?, '', ?)`).run(baseline.version_id, baseline.host_name, initialAt, baseline.content_hash, JSON.stringify(baseline.snapshot));
  db.prepare(`INSERT INTO attachments (id, mime_type, original_name, created_at, pdf_index_status)
    VALUES (?, 'application/pdf', 'Original.pdf', ?, 'ready')`).run(pdf, initialAt);
  db.prepare("INSERT INTO node_attachments VALUES ('topic', ?, 'reference')").run(pdf);
}

it('sends the saved placement and migrated PDF reference after upgrading a pending move', async () => {
  const db = new Database(path.join(root, 'legacy-source.db'));
  try { await verifyUpgradeSync(db); } finally { db.close(); }
});

async function verifyUpgradeSync(db: Database.Database) {
  db.pragma('foreign_keys = ON');
  installHistoricalDesktopSchema(db, 118);
  const sourceDriver = createBetterSqlite3Driver(db);
  const receiver = createPeer('receiver');
  const baseline = textBranch('version-topic', '', undefined, initialAt);
  baseline.snapshot.parent_id = 'old-folder';
  seedLegacyTopic(db, baseline);
  await applySyncNodesWithDbPort(receiver.port, [folder('old-folder'), folder('new-folder'), baseline]);
  expect(receiver.driver.queryOne("SELECT parent_id FROM nodes WHERE id = 'topic'")).toEqual({ parent_id: 'old-folder' });

  // The historical move transaction persisted the row before its deferred version was flushed.
  db.prepare("UPDATE nodes SET parent_id = 'new-folder', updated_at = ?, sync_dirty = 1 WHERE id = 'topic'").run(movedAt);
  initializeDatabaseSchema(db);
  flushNodeSyncVersionWithDriver(sourceDriver, 'topic', 'source', movedAt);
  const next = await loadCurrentSyncNodeRecord(createBetterSqliteDbPort(db), 'topic');
  if (!next) throw new Error('missing upgraded topic version');
  await applySyncNodesWithDbPort(receiver.port, [next]);

  for (const driver of [sourceDriver, receiver.driver]) {
    const row = driver.queryOne<{ parent_id: string; resource_references: string }>(
      "SELECT parent_id, resource_references FROM nodes WHERE id = 'topic'");
    expect(row?.parent_id).toBe('new-folder');
    expect(JSON.parse(row!.resource_references)).toEqual([
      { storage_key: `${pdf}.pdf`, role: 'reference', original_name: 'Original.pdf' }
    ]);
  }
}
