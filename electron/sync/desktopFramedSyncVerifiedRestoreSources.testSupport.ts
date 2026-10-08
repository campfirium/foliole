import fs from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';
import { expect } from 'vitest';

import { OVERWRITE_SOURCE_SETTING_KEYS } from '../../lib/core/database/settingDataPolicy.js';
import { computeSyncContentHash, upsertSyncObjectState } from '../../lib/core/database/syncState.js';
import { createDefaultImportManagerSettings } from '../../lib/core/import/importManagerSettings.js';
import { createDefaultReadwiseHostSettings } from '../../lib/core/import/readwiseHostSettings.js';
import { buildCanonicalSettingSyncPayload } from '../../lib/core/sync/canonicalPrivateStatePayload.js';
import { SYNC_OBJECT_PAYLOAD_SQL_BY_TYPE } from '../../lib/core/sync/syncObjectPayloadSql.js';
import { createBetterSqlite3Driver } from '../database/betterSqlite3Driver.js';

const time = '2026-10-08T02:00:00.000Z';
const watchedId = 'receiver-watched-config', externalId = 'receiver-external-config';
const readwiseId = 'receiver-readwise-config', importId = 'receiver-import-config';

export function seedReceiverRestoreSources(databasePath: string, oldNodeId: string, stateRoot: string) {
  const sqlite = new Database(databasePath);
  const registryFile = path.join(stateRoot, 'data', 'config', 'readwise-api-connections-v1.json');
  fs.mkdirSync(path.dirname(registryFile), { recursive: true });
  fs.writeFileSync(registryFile, JSON.stringify({ version: 2, connection: {
    secretRef: 'receiver-fixture-secret', state: 'connected', verifiedAt: time } }), { mode: 0o600 });
  const originalRoot = path.join(path.dirname(databasePath), 'original-source-fixture');
  const originalFile = path.join(originalRoot, 'watched', 'Article.md');
  const originalBytes = Buffer.from('\ufeffOriginal watched article 中😀\0');
  fs.mkdirSync(path.dirname(originalFile), { recursive: true });
  fs.writeFileSync(originalFile, originalBytes);
  try {
    sqlite.transaction(() => {
      const identity = sqlite.prepare<[], { device_id: string; host_name: string }>(
        `SELECT l.local_device_identity_key AS device_id, d.device_name AS host_name
         FROM sync_group_local_state l JOIN sync_group_devices d
           ON d.group_id = l.group_id AND d.device_identity_key = l.local_device_identity_key
         WHERE l.singleton_id = 1 AND l.state = 'active' AND d.state = 'active'`).get();
      if (!identity) throw new Error('restore_fixture_local_identity_missing');
      seedSourceRows(sqlite, identity, originalRoot);
      seedSourceSettings(sqlite, identity.host_name);
      sqlite.prepare(`INSERT INTO import_sources
        (source_fingerprint, provider, source_kind, source_name, source_locator, first_imported_at, last_imported_at,
         last_content_fingerprint, latest_node_id, watched_binding_id, watched_relative_path, source_ref, source_location)
        VALUES (?, 'watched', 'markdown', 'Article.md', ?, ?, ?, ?, ?, ?, 'Article.md', ?, 'Article.md')`)
        .run(importId, originalFile, time, time, 'original-source-fingerprint', oldNodeId, watchedId, `watched:${watchedId}`);
      const driver = createBetterSqlite3Driver(sqlite);
      for (const [type, id] of [['watched_folder', watchedId], ['external_folder', externalId], ['import_source', importId]] as const) {
        const row = driver.queryOne<{ payload_json: string }>(SYNC_OBJECT_PAYLOAD_SQL_BY_TYPE[type], [id]);
        if (!row) throw new Error('restore_fixture_source_payload_missing');
        upsertSyncObjectState(driver, { objectType: type, objectId: id,
          contentHash: computeSyncContentHash(type, JSON.parse(row.payload_json)),
          lastModifiedByHostName: identity.host_name, updatedAt: time, syncDirty: true });
      }
    })();
    const baseline = receiverRestoreSourceRows(sqlite);
    expect(baseline.sources).toHaveLength(3);
    expect(baseline.watched).toHaveLength(1);
    expect(baseline.external).toHaveLength(1);
    expect(baseline.imports).toHaveLength(1);
    expect(baseline.state).toHaveLength(3);
    return { originalFile, originalBytes, registryFile };
  } finally { sqlite.close(); }
}

function seedSourceRows(sqlite: Database.Database, identity: { device_id: string; host_name: string }, originalRoot: string) {
  for (const [type, id] of [['watched', watchedId], ['external', externalId], ['readwise', readwiseId]] as const) {
    sqlite.prepare(`INSERT INTO desktop_sources VALUES (?, ?, ?, ?, 'darwin', ?, 'posix', ?, ?, ?)`)
      .run(`${type}:${id}`, type, id, identity.host_name, path.join(originalRoot, type),
        '{"connectionStatus":"connected","kind":"articles"}', time, time);
  }
  sqlite.prepare(`INSERT INTO watched_folder_bindings
    (binding_id, connection_status, action_mode, archive_path, highlight_mode, highlight_path,
     primary_path, created_at, updated_at, source_ref, owner_device_identity_key, local_rule_id, reported_path)
    VALUES (?, 'connected', 'keep', ?, 'split', ?, ?, ?, ?, ?, ?, 'receiver-rule', ?)`)
    .run(watchedId, path.join(originalRoot, 'archive'), path.join(originalRoot, 'highlights'),
      path.join(originalRoot, 'watched'), time, time, `watched:${watchedId}`, identity.device_id, path.join(originalRoot, 'watched'));
  sqlite.prepare(`INSERT INTO external_search_folders
    (id, folder_path, attachment_mode, attachment_root_path, excluded_dirs_json, status, document_count,
     indexed_at, last_error, created_at, updated_at, source_ref)
    VALUES (?, ?, 'document_relative_first_then_fixed_root', ?,
      '[".git"]', 'ready', 7, ?, 'Original cache warning', ?, ?, ?)`)
    .run(externalId, path.join(originalRoot, 'external'), path.join(originalRoot, 'attachments'), time, time, time, `external:${externalId}`);
}

function receiverRestoreSourceRows(sqlite: Database.Database) {
  return {
    sources: sqlite.prepare('SELECT * FROM desktop_sources WHERE config_ref IN (?, ?, ?) ORDER BY source_ref')
      .all(watchedId, externalId, readwiseId),
    watched: sqlite.prepare('SELECT * FROM watched_folder_bindings WHERE binding_id = ?').all(watchedId),
    external: sqlite.prepare(`SELECT id, folder_path, attachment_mode, attachment_root_path, excluded_dirs_json,
      created_at, updated_at, source_ref FROM external_search_folders WHERE id = ?`).all(externalId),
    imports: sqlite.prepare('SELECT * FROM import_sources WHERE source_fingerprint = ?').all(importId),
    state: sqlite.prepare('SELECT * FROM sync_object_state WHERE object_id IN (?, ?, ?) ORDER BY object_type')
      .all(watchedId, externalId, importId)
  };
}

export function assertReceiverRestoreSourcesCleared(databasePath: string, baseline: ReturnType<typeof seedReceiverRestoreSources>) {
  const sqlite = new Database(databasePath, { readonly: true, fileMustExist: true });
  try {
    for (const rows of Object.values(receiverRestoreSourceRows(sqlite))) expect(rows).toEqual([]);
    for (const key of OVERWRITE_SOURCE_SETTING_KEYS) {
      expect(sqlite.prepare('SELECT * FROM settings WHERE key = ?').all(key)).toEqual([]);
      expect(sqlite.prepare('SELECT * FROM setting_records WHERE key = ?').all(key)).toEqual([]);
      expect(sqlite.prepare("SELECT * FROM sync_object_state WHERE object_type = 'setting' AND object_id LIKE ?")
        .all(`%:${key}`)).toEqual([]);
    }
    expect(fs.existsSync(baseline.registryFile)).toBe(false);
    expect(fs.readFileSync(baseline.originalFile)).toEqual(baseline.originalBytes);
  } finally { sqlite.close(); }
}

function seedSourceSettings(sqlite: Database.Database, hostName: string) {
  for (const key of OVERWRITE_SOURCE_SETTING_KEYS) {
    sqlite.prepare(`INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`)
      .run(key, sourceSettingValue(key), time);
  }
  const key = 'import_manager_settings', value = sourceSettingValue(key);
  const payload = buildCanonicalSettingSyncPayload({ key, scope: 'host', platform: 'darwin',
    form_factor: 'desktop', host_name: hostName, value_json: value });
  const contentHash = computeSyncContentHash('setting', payload);
  sqlite.prepare(`INSERT INTO setting_records
    (key, scope, platform, form_factor, host_name, value_json, content_hash, updated_at)
    VALUES (?, 'host', 'darwin', 'desktop', ?, ?, ?, ?)`)
    .run(key, hostName, value, contentHash, time);
  upsertSyncObjectState(createBetterSqlite3Driver(sqlite), { objectType: 'setting',
    objectId: `host:darwin:desktop:${hostName}:${key}`, contentHash,
    lastModifiedByHostName: hostName, updatedAt: time, syncDirty: true });
}


function sourceSettingValue(key: string) {
  if (key === 'readwise_import_settings') return JSON.stringify(createDefaultReadwiseHostSettings());
  if (key === 'import_manager_settings') return JSON.stringify(createDefaultImportManagerSettings());
  if (key === 'readwise_api_import_state') return JSON.stringify({ version: 1, connectionRef: 'original-connection', completedThrough: time, updatedAt: time });
  if (key === 'readwise_books_inventory_state') return JSON.stringify({ version: 2, inventories: {} });
  if (key === 'watch_import_cursor_state') return JSON.stringify({ version: 1, adapters: {} });
  if (key === 'readwise_book_epub_picker_state') return JSON.stringify({ lastDirectory: '/original/books', updatedAt: time });
  return JSON.stringify({ original: key });
}
