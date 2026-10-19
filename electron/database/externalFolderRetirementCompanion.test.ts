// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { ANDROID_COMPANION_DOCUMENT_RESOURCE_QUERY_DEFINITIONS } from '../../lib/core/database/androidCompanionDocumentResourceQueryDefinitions.js';
import { bootstrapCompanionDatabase } from '../../lib/core/database/companionDatabaseLifecycle.js';
import { forgetDepartedExternalFoldersWithDbPort } from '../../lib/core/database/externalFolderRetirement.js';
import { computeSyncContentHash } from '../../lib/core/database/syncState.js';
import { buildCanonicalSyncTombstone } from '../../lib/core/sync/canonicalSyncTombstone.js';
import { readFramedSyncInventory } from '../../lib/core/sync/framedSyncInventoryRead.js';
import { selectFramedSyncObjectStateFact } from '../../lib/core/sync/framedSyncObjectStateFact.js';
import { applySyncObjectInTransaction } from '../../lib/core/sync/syncObjectApplyExecutor.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';

it.each(['tombstone', 'membership'] as const)('removes the library through %s against the production companion SQLite schema', async (mode) => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'foliole-folder-retirement-companion-'));
  const db = new Database(path.join(root, 'main.db'));
  try {
    const port = createBetterSqliteDbPort(db);
    await bootstrapCompanionDatabase(port, { allowCreate: true, expectedHostName: 'receiver', now: '2026-10-06' });
    expect(db.prepare("SELECT name FROM sqlite_master WHERE name = 'external_folder_host_preferences'").get()).toBeUndefined();
    for (const query of Object.values(ANDROID_COMPANION_DOCUMENT_RESOURCE_QUERY_DEFINITIONS)) expect(() => db.prepare(query.sql)).not.toThrow();
    const originalPath = path.join(root, 'article.md');
    writeFileSync(originalPath, 'Original article');
    await port.run(`INSERT INTO nodes (id, title, content, import_source_fingerprint, created_at, updated_at)
      VALUES ('imported', 'Imported article', 'Original article', 'external:folder', 'now', 'now')`);
    const folder = { id: 'folder', source_ref: 'external:folder', host_name: 'Source', host_platform: 'darwin',
      attachment_mode: 'document_relative', excluded_dirs_json: '[]', owner_device_identity_key: 'provider' };
    const document = { document_id: 'folder:article.md', folder_id: 'folder', title: 'Article',
      content_hash: 'a'.repeat(64), body_blob_hash: null, file_name: 'article.md', relative_path: 'article.md',
      extension: 'md', reference_json: null, reference_kind: 'local_path' };
    await port.transaction(async (tx) => {
      for (const [type, id, payload] of [
        ['external_folder', folder.id, folder], ['external_document', document.document_id, document]
      ] as const) await applySyncObjectInTransaction(tx, { object_type: type, object_id: id,
        content_hash: computeSyncContentHash(type, payload), payload_json: JSON.stringify(payload),
        updated_at: '2026-07-01T00:00:00.000Z', deleted_at: null });
      if (mode === 'membership') {
        await tx.run(`INSERT INTO sync_groups (group_id, display_name, workgroup_key, created_at, updated_at)
          VALUES ('group', 'Group', 'key', 'now', 'now')`);
        await tx.run(`INSERT INTO sync_group_devices
          (group_id, device_identity_key, device_anchor, canonical_library_path, device_name, platform,
           state, joined_at, left_at, last_seen_at, updated_at)
          VALUES ('group', 'provider', 'anchor', '/provider', 'Provider', 'darwin', 'left', 'now', '2026-07-01T00:00:00.000Z', 'now', 'now')`);
        await forgetDepartedExternalFoldersWithDbPort(tx, 'group', '2026-07-05T00:00:00.000Z');
        expect((await tx.query('SELECT id FROM external_search_folders')).length).toBe(1);
        await forgetDepartedExternalFoldersWithDbPort(tx, 'group', '2026-07-24T00:23:10.000Z');
      } else await applySyncObjectInTransaction(tx, { object_type: 'external_folder', object_id: folder.id,
        content_hash: computeSyncContentHash('external_folder', buildCanonicalSyncTombstone(folder.id)),
        payload_json: null, updated_at: '2026-07-24T00:23:10.000Z', deleted_at: '2026-07-24T00:23:10.000Z' });
    });
    expect(db.prepare('SELECT * FROM external_documents').all()).toEqual([]);
    expect(db.prepare('SELECT * FROM external_search_folders').all()).toEqual([]);
    expect(readFileSync(originalPath, 'utf8')).toBe('Original article');
    expect(db.prepare("SELECT content, deleted_at FROM nodes WHERE id = 'imported'").get())
      .toEqual({ content: 'Original article', deleted_at: null });
    expect(db.prepare('SELECT source_ref FROM desktop_sources WHERE source_ref = ?').get(folder.source_ref))
      .toBeUndefined();
    if (mode === 'membership') {
      expect((await readFramedSyncInventory(port)).find((item) => item.globalId === document.document_id)).toBeUndefined();
      expect(db.prepare(`SELECT object_id FROM sync_object_state WHERE object_type IN ('external_document', 'external_folder')`)
        .all()).toEqual([]);
      return;
    }
    const entry = (await readFramedSyncInventory(port)).find((item) => item.globalId === document.document_id)!;
    await expect(selectFramedSyncObjectStateFact(port, entry, entry.stateFactIds![0]!))
      .resolves.toMatchObject({ globalId: document.document_id });
    expect(db.prepare(`SELECT deleted_at FROM sync_object_state WHERE object_type = 'external_document'
      AND object_id = ?`).pluck().get(document.document_id)).toBe('2026-07-24T00:23:10.000Z');
  } finally { db.close(); rmSync(root, { recursive: true, force: true }); }
});
