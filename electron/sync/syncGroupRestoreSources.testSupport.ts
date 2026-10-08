import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';

import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import { OVERWRITE_SOURCE_SETTING_KEYS } from '../../lib/core/database/settingDataPolicy.js';
import { createDefaultImportManagerSettings } from '../../lib/core/import/importManagerSettings.js';
import { createDefaultReadwiseHostSettings } from '../../lib/core/import/readwiseHostSettings.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';

const time = '2026-10-08T00:00:00.000Z';
const tables = ['desktop_sources', 'watched_folder_bindings', 'external_search_folders',
  'import_sources', 'sync_object_state', 'nodes', 'settings', 'setting_records'] as const;

export function restoreSourcesFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-restore-sources-'));
  const file = path.join(root, 'main.sqlite');
  let sqlite = new Database(file);
  initializeDatabaseSchema(sqlite);
  sqlite.pragma('foreign_keys = ON');
  seedIdentity(sqlite);
  seedSources(sqlite, root);
  seedSourceSettings(sqlite);
  const originalFile = path.join(root, 'local-watched', 'Article.md');
  const originalBytes = Buffer.from('\ufeffOriginal disk file 中😀\0');
  fs.mkdirSync(path.dirname(originalFile), { recursive: true });
  fs.writeFileSync(originalFile, originalBytes);
  return { get sqlite() { return sqlite; }, port() { return createBetterSqliteDbPort(sqlite); },
    rows() { return Object.fromEntries(tables.map((table) =>
      [table, sqlite.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()])); },
    preferences() { return {
      settings: sqlite.prepare("SELECT * FROM settings WHERE key = 'app_settings'").all(),
      records: sqlite.prepare("SELECT * FROM setting_records WHERE key = 'app_settings'").all()
    }; },
    originalFileBytes() { return fs.readFileSync(originalFile); }, originalBytes,
    reopen() { sqlite.close(); sqlite = new Database(file); sqlite.pragma('foreign_keys = ON'); },
    close() { sqlite.close(); fs.rmSync(root, { recursive: true, force: true }); }
  };
}

function seedIdentity(sqlite: Database.Database) {
  sqlite.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)')
    .run('host_name', JSON.stringify('Local host'), time);
  sqlite.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)')
    .run('device_id', JSON.stringify('local-device'), time);
  sqlite.prepare('INSERT INTO sync_groups VALUES (?, ?, ?, ?, ?)').run('group', 'Group', 'key', time, time);
  sqlite.prepare(`INSERT INTO sync_group_devices VALUES (?, ?, ?, ?, ?, ?, 'active', ?, NULL, ?, ?)`)
    .run('group', 'local-device', 'anchor', '/local/library', 'Local host', 'darwin', time, time, time);
  sqlite.prepare("INSERT INTO sync_group_local_state VALUES (1, 'group', 'local-device', 'active', ?)").run(time);
}

function seedSources(sqlite: Database.Database, root: string) {
  let sequence = 1;
  const state = (type: string, id: string) => sqlite.prepare(`INSERT INTO sync_object_state
    (object_type, object_id, state_seq, content_hash, last_modified_by_host_name, updated_at, sync_dirty)
    VALUES (?, ?, ?, ?, ?, ?, 1)`).run(type, id, sequence++, `hash-${id}`, 'Original host', time);
  for (const owner of ['local', 'remote']) for (const kind of ['watched', 'external', 'readwise']) {
    const id = `${owner}-${kind}`, ref = `${kind}:${id}`, host = owner === 'local' ? 'Local host' : 'Other host';
    sqlite.prepare(`INSERT INTO desktop_sources VALUES (?, ?, ?, ?, ?, ?, 'posix', ?, ?, ?)`)
      .run(ref, kind, id, host, 'darwin', path.join(root, id), '{"connectionStatus":"connected","kind":"articles"}', time, time);
    if (kind === 'watched') {
      sqlite.prepare(`INSERT INTO watched_folder_bindings
        (binding_id, connection_status, action_mode, archive_path, highlight_mode, highlight_path,
         primary_path, created_at, updated_at, source_ref, owner_device_identity_key, local_rule_id, reported_path)
        VALUES (?, 'connected', 'keep', ?, 'split', ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, `/archive/${id}`, `/highlights/${id}`, path.join(root, id), time, time, ref,
          `${owner}-device`, `rule-${id}`, `/reported/${id}`);
      state('watched_folder', id);
    }
    if (kind === 'external') {
      sqlite.prepare(`INSERT INTO external_search_folders
        (id, folder_path, attachment_mode, attachment_root_path, excluded_dirs_json, created_at, updated_at, source_ref)
        VALUES (?, ?, 'document_relative_first_then_fixed_root', ?, '[".git"]', ?, ?, ?)`)
        .run(id, path.join(root, id), `/attachments/${id}`, time, time, ref);
      sqlite.prepare(`UPDATE external_search_folders SET status = 'ready', document_count = 7,
        indexed_at = ?, last_error = 'Previous cache warning' WHERE id = ?`).run(time, id);
      state('external_folder', id);
    }
    seedImport(sqlite, id, kind, ref, root);
    state('import_source', `${id}-import`);
  }
  state('node', 'old-local-watched');
}

function seedImport(sqlite: Database.Database, id: string, kind: string, ref: string, root: string) {
  sqlite.prepare(`INSERT INTO nodes (id, kind, title, content, created_at, updated_at)
    VALUES (?, 'topic', ?, 'Old body', ?, ?)`).run(`old-${id}`, id, time, time);
  sqlite.prepare(`INSERT INTO import_sources
    (source_fingerprint, provider, source_kind, source_name, source_locator, first_imported_at, last_imported_at,
     last_content_fingerprint, latest_node_id, watched_binding_id, watched_relative_path, source_ref, source_location,
     remote_provider, remote_connection_ref, remote_document_id, remote_annotations_json, remote_import_state_json)
    VALUES (?, ?, 'markdown', 'Article.md', ?, ?, ?, 'unchanged-fingerprint', ?, ?, 'Article.md', ?, 'Article.md', ?, ?, ?, '[]', '{}')`)
    .run(`${id}-import`, kind, path.join(root, id, 'Article.md'), time, time, `old-${id}`,
      kind === 'watched' ? id : null, ref, kind === 'readwise' ? 'readwise' : null,
      kind === 'readwise' ? `connection-${id}` : null, kind === 'readwise' ? `document-${id}` : null);
}

function seedSourceSettings(sqlite: Database.Database) {
  for (const key of [...OVERWRITE_SOURCE_SETTING_KEYS, 'app_settings']) {
    sqlite.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)')
      .run(key, sourceSettingValue(key), time);
  }
  for (const key of ['import_manager_settings', 'app_settings']) {
    sqlite.prepare(`INSERT INTO setting_records
      (key, scope, platform, form_factor, host_name, value_json, content_hash, updated_at)
      VALUES (?, 'host', 'darwin', 'desktop', 'Local host', ?, ?, ?)`)
      .run(key, sourceSettingValue(key), 'a'.repeat(64), time);
  }
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
