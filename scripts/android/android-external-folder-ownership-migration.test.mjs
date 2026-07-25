// @vitest-environment node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ASSET_ROOT = path.join(REPO_ROOT, 'android/app/src/main/assets');
const MIGRATION_JAVA = path.join(
  REPO_ROOT,
  'android/app/src/main/java/com/foliole/android/FolioleCompanionExternalFolderOwnershipMigration.java'
);

async function loadAsset(name) {
  return JSON.parse(await readFile(path.join(ASSET_ROOT, name), 'utf8'));
}

function createVersion19ExternalFolders(database) {
  database.exec(`CREATE TABLE external_search_folders (
    id TEXT PRIMARY KEY, folder_path TEXT NOT NULL, attachment_mode TEXT NOT NULL,
    attachment_root_path TEXT, excluded_dirs_json TEXT NOT NULL DEFAULT '[]', status TEXT NOT NULL DEFAULT 'idle',
    document_count INTEGER NOT NULL DEFAULT 0, indexed_at TEXT, last_error TEXT,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  )`);
  database.prepare(`INSERT INTO external_search_folders (
    id, folder_path, attachment_mode, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?)`).run('legacy-folder', '/Books', 'copy', '2026-01-01', '2026-01-01');
}

describe('Android external folder ownership migration', () => {
  it('upgrades a version 19 table before installing the current schema', async () => {
    const database = new DatabaseSync(':memory:');
    const core = await loadAsset('companion-core-schema.json');
    const migration = await loadAsset('companion-migration-schema.json');
    createVersion19ExternalFolders(database);

    const actions = migration.plan
      .filter((step) => 19 < step.beforeVersion)
      .flatMap((step) => step.actions);
    expect(actions[0]?.type).toBe('migrateExternalFolderOwnership');

    for (const action of actions) {
      if (action.type === 'migrateExternalFolderOwnership') {
        for (const name of [
          'externalFoldersNextTable', 'externalFoldersCopyLegacyRows', 'externalFoldersDropLegacyTable',
          'externalFoldersRenameNextTable', 'externalFoldersOwnerPathIndex'
        ]) database.exec(migration.statementsByName[name]);
      } else if (action.type === 'installSchema') {
        for (const statement of core.statements) database.exec(statement);
      }
    }

    expect(database.prepare('PRAGMA table_info(external_search_folders)').all().map((row) => row.name))
      .toContain('owner_installation_id');
    expect(database.prepare('SELECT id, folder_path FROM external_search_folders').all())
      .toEqual([{ id: 'legacy-folder', folder_path: '/Books' }]);
    expect(database.prepare("SELECT name FROM sqlite_master WHERE type = 'index'").all().map((row) => row.name))
      .toContain('idx_external_search_folders_owner_path');
    database.close();
  });

  it('skips ownership migration when the legacy table does not exist', async () => {
    const source = await readFile(MIGRATION_JAVA, 'utf8');
    const tableGuard = source.indexOf('!FolioleCompanionSqliteRuntime.tableExists');
    const columnGuard = source.indexOf('FolioleCompanionSqliteRuntime.columnExists');

    expect(tableGuard).toBeGreaterThan(-1);
    expect(columnGuard).toBeGreaterThan(tableGuard);
  });
});
