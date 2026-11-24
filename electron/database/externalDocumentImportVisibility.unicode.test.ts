// @vitest-environment node

import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

import { expect, it, vi } from 'vitest';

import { DESKTOP_FRESH_SCHEMA_STATEMENTS } from '../../lib/core/database/desktopFreshSchemaStatements.js';
import type { DatabaseDriver } from '../../lib/core/database/driver.js';
import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import type { DatabaseMigrationTarget } from '../../lib/core/database/migrationTypes.js';
import { LEGACY_STORED_IMPORT_LOCATOR_SCHEMA } from '../../lib/core/database/storedImportLocatorSchema.js';

import {
  isExternalDocumentVisible, resolveImportedNodeIdForExternalDocument
} from './externalDocumentImportVisibility.js';
import { searchExternalDocuments } from './externalSearchDocumentSearch.js';
import { nodeSqliteTestDriver } from './nodeSqlite.testSupport.js';

const state = vi.hoisted(() => ({
  driver: undefined as DatabaseDriver | undefined,
  external: undefined as DatabaseSync | undefined
}));
vi.mock('./connection.js', () => ({
  openDatabaseConnection: () => ({ driver: state.driver })
}));
vi.mock('./externalSearchCacheDatabase.js', () => ({
  openExternalSearchCacheDatabase: () => state.external
}));
vi.mock('./readwiseManagedExternalDocuments.js', () => ({
  searchReadwiseExternalDocuments: () => []
}));

function migrationTarget(sqlite: DatabaseSync): DatabaseMigrationTarget {
  const driver = nodeSqliteTestDriver(sqlite);
  return {
    exec: (sql) => { sqlite.exec(sql); },
    pragma: (command) => sqlite.prepare(`PRAGMA ${command}`).get()?.user_version,
    function: (name, options, callback) => sqlite.function(name, options, callback),
    prepare(sql) {
      const statement = sqlite.prepare(sql);
      return {
        all: (...params) => statement.all(...params as SQLInputValue[]),
        run: (...params) => statement.run(...params as SQLInputValue[])
      };
    },
    transaction: (run) => () => driver.transaction(run)
  };
}

function insertSource(sqlite: DatabaseSync) {
  sqlite.exec(`INSERT INTO nodes (id, kind, title, content, created_at, updated_at)
    VALUES ('topic', 'topic', 'Library topic', 'visible body', 'now', 'now');
    INSERT INTO import_sources
      (source_fingerprint, provider, source_kind, source_name, source_locator,
       first_imported_at, last_imported_at, latest_node_id, last_content_fingerprint)
    VALUES ('fingerprint', 'import', 'file', 'Øresund.md', 'C:\\Sources\\Øresund.md',
      'now', 'now', 'topic', 'content');`);
}

function expectImportedVisibility() {
  for (const locator of ['C:/Sources/Øresund.md', 'c:/sources/øresund.md']) {
    expect(isExternalDocumentVisible(locator)).toBe(false);
    expect(resolveImportedNodeIdForExternalDocument(locator)).toBe('topic');
  }
  expect(isExternalDocumentVisible('C:/Sources/Öresund.md')).toBe(true);
}

it('hides the search hit and opens the imported Topic for Unicode case variants', () => {
  const sqlite = new DatabaseSync(':memory:');
  state.driver = nodeSqliteTestDriver(sqlite);
  state.external = sqlite;
  try {
    initializeDatabaseSchema(migrationTarget(sqlite));
    sqlite.function('source_search_lower', { deterministic: true, directOnly: true },
      (value) => typeof value === 'string' ? value.toLowerCase() : null);
    sqlite.exec(`CREATE VIRTUAL TABLE external_search_fts USING fts5(
      title, file_name, relative_path, content, absolute_path UNINDEXED, folder_id UNINDEXED,
      folder_path UNINDEXED, modified_at UNINDEXED, tokenize='trigram');
      INSERT INTO external_search_fts VALUES ('Øresund', 'Øresund.md', 'Øresund.md', 'visible body',
        'C:/Sources/Øresund.md', 'opened-external-documents', 'C:/Sources', '2026-11-24');`);
    expect(searchExternalDocuments('visible body').map((result) => result.id)).toEqual(['C:/Sources/Øresund.md']);
    expect(isExternalDocumentVisible('C:/Sources/Øresund.md')).toBe(true);
    insertSource(sqlite);
    expectImportedVisibility();
    expect(searchExternalDocuments('visible body')).toEqual([]);
  } finally {
    state.driver = undefined;
    state.external = undefined;
    sqlite.close();
  }
});

it('rebuilds only the existing import locator keys when opening a version 197 library', () => {
  const sqlite = new DatabaseSync(':memory:');
  state.driver = nodeSqliteTestDriver(sqlite);
  try {
    for (const sql of DESKTOP_FRESH_SCHEMA_STATEMENTS) {
      if (!sql.includes('stored_import_')) sqlite.exec(sql);
    }
    for (const sql of LEGACY_STORED_IMPORT_LOCATOR_SCHEMA) sqlite.exec(sql);
    sqlite.exec('PRAGMA user_version = 197');
    insertSource(sqlite);
    expect(sqlite.prepare('SELECT locator FROM stored_import_locators').get()?.locator).toBe('c:/sources/Øresund.md');
    initializeDatabaseSchema(migrationTarget(sqlite));
    expectImportedVisibility();
    expect(sqlite.prepare('SELECT source_locator FROM import_sources').get()?.source_locator)
      .toBe('C:\\Sources\\Øresund.md');
  } finally {
    state.driver = undefined;
    sqlite.close();
  }
});
