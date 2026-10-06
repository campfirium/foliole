// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { bootstrapCompanionDatabase } from '../../lib/core/database/companionDatabaseLifecycle.js';
import { computeSyncContentHash } from '../../lib/core/database/syncState.js';
import { buildCanonicalSyncTombstone } from '../../lib/core/sync/canonicalSyncTombstone.js';
import { readFramedSyncInventory } from '../../lib/core/sync/framedSyncInventoryRead.js';
import { selectFramedSyncObjectStateFact } from '../../lib/core/sync/framedSyncObjectStateFact.js';
import { applySyncObjectInTransaction } from '../../lib/core/sync/syncObjectApplyExecutor.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';

it('retires document state through shared apply against the production companion SQLite schema', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'foliole-folder-retirement-companion-'));
  const db = new Database(path.join(root, 'main.db'));
  try {
    const port = createBetterSqliteDbPort(db);
    await bootstrapCompanionDatabase(port, { allowCreate: true, expectedHostName: 'receiver', now: '2026-10-06' });
    const folder = { id: 'folder', source_ref: 'external:folder', host_name: 'Source', host_platform: 'darwin',
      attachment_mode: 'document_relative', excluded_dirs_json: '[]' };
    const document = { document_id: 'folder:article.md', folder_id: 'folder', title: 'Article',
      content_hash: 'a'.repeat(64), body_blob_hash: null, file_name: 'article.md', relative_path: 'article.md',
      extension: 'md', reference_json: null, reference_kind: 'local_path' };
    await port.transaction(async (tx) => {
      for (const [type, id, payload] of [
        ['external_folder', folder.id, folder], ['external_document', document.document_id, document]
      ] as const) await applySyncObjectInTransaction(tx, { object_type: type, object_id: id,
        content_hash: computeSyncContentHash(type, payload), payload_json: JSON.stringify(payload),
        updated_at: '2026-07-01T00:00:00.000Z', deleted_at: null });
      await applySyncObjectInTransaction(tx, { object_type: 'external_folder', object_id: folder.id,
        content_hash: computeSyncContentHash('external_folder', buildCanonicalSyncTombstone(folder.id)),
        payload_json: null, updated_at: '2026-07-24T00:23:10.000Z', deleted_at: '2026-07-24T00:23:10.000Z' });
    });
    expect(db.prepare('SELECT * FROM external_documents').all()).toEqual([]);
    const entry = (await readFramedSyncInventory(port)).find((item) => item.globalId === document.document_id)!;
    await expect(selectFramedSyncObjectStateFact(port, entry, entry.stateFactIds![0]!))
      .resolves.toMatchObject({ globalId: document.document_id });
    expect(db.prepare(`SELECT deleted_at FROM sync_object_state WHERE object_type = 'external_document'
      AND object_id = ?`).pluck().get(document.document_id)).toBe('2026-07-24T00:23:10.000Z');
  } finally { db.close(); rmSync(root, { recursive: true, force: true }); }
});
