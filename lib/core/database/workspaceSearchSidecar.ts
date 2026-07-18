import type { DatabaseDriver } from './driver.js';
import {
  DEFAULT_FULL_TEXT_SEARCH_INDEX_STRATEGY,
  FULL_TEXT_SEARCH_INDEX_STRATEGY_SETTING_KEY,
  resolveFullTextSearchIndexStrategy,
  type FullTextSearchIndexStrategy,
  type FullTextSearchTokenizer
} from './fullTextSearchIndexStrategy.js';
import type { DatabaseConnectionLike, DatabaseMigrationTarget } from './migrationTypes.js';
import { rebuildWorkspaceSearchIndexes } from './workspaceSearchIndex.js';
import {
  createWorkspaceSearchMetadataTable,
  readWorkspaceSearchMetadata,
  toWorkspaceSearchSidecarRebuildStatus,
  tryWriteWorkspaceSearchMetadata,
  writeWorkspaceSearchMetadata,
  type WorkspaceSearchSidecarRebuildStatus
} from './workspaceSearchSidecarMetadata.js';
import {
  clearIndexedWorkspaceSearchSourceState,
  ensureWorkspaceSearchSourceState,
  markWorkspaceSearchSourceIndexedIfSettled,
  markWorkspaceSearchSourceRevisionQueued,
  recoverInterruptedWorkspaceSearchInvalidations,
  workspaceSearchSourceStateMatches
} from './workspaceSearchSourceState.js';

export type { WorkspaceSearchSidecarRebuildStatus } from './workspaceSearchSidecarMetadata.js';

const SEARCH_SIDECAR_SCHEMA_VERSION = 1;
const APP_SETTINGS_KEY = 'app_settings';

interface AppSettingsRow {
  value?: unknown;
}

interface WorkspaceSearchSidecarConnection extends DatabaseConnectionLike {
  driver: DatabaseDriver;
}

interface InitializeWorkspaceSearchSidecarOptions {
  rebuildWorkspaceSearchIndexes?: (driver: DatabaseDriver) => void;
}

interface WorkspaceSearchSidecarRebuildOptions {
  rebuildWorkspaceSearchIndexes?: (driver: DatabaseDriver) => void;
  strategy: FullTextSearchIndexStrategy;
}

function readJsonObject(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'string') return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function readAppSettings(sqlite: DatabaseMigrationTarget) {
  const row = sqlite.prepare('SELECT value FROM main.settings WHERE key = ?').all(APP_SETTINGS_KEY)[0] as AppSettingsRow | undefined;
  return readJsonObject(row?.value);
}

function dropSearchIndexTables(sqlite: DatabaseMigrationTarget) {
  sqlite.exec('DROP TABLE IF EXISTS search.node_search');
  sqlite.exec('DROP TABLE IF EXISTS search.pdf_search');
}

function createSearchIndexTables(sqlite: DatabaseMigrationTarget, tokenizer: FullTextSearchTokenizer) {
  sqlite.exec(`CREATE VIRTUAL TABLE search.node_search USING fts5(
    title,
    path,
    content,
    node_id UNINDEXED,
    updated_at UNINDEXED,
    tokenize = '${tokenizer}'
  )`);
  sqlite.exec(`CREATE VIRTUAL TABLE search.pdf_search USING fts5(
    title,
    path,
    text,
    node_id UNINDEXED,
    attachment_id UNINDEXED,
    page UNINDEXED,
    updated_at UNINDEXED,
    page_text_length UNINDEXED,
    tokenize = '${tokenizer}'
  )`);
}

function shouldRecreateSearchIndexes(sqlite: DatabaseMigrationTarget, tokenizer: FullTextSearchTokenizer) {
  const metadata = readWorkspaceSearchMetadata(sqlite, 'schema');
  return metadata?.schemaVersion !== SEARCH_SIDECAR_SCHEMA_VERSION || metadata?.tokenizer !== tokenizer || !hasSearchIndexTables(sqlite);
}

function hasSearchIndexTables(sqlite: DatabaseMigrationTarget) {
  const rows = sqlite.prepare(
    `SELECT name
     FROM search.sqlite_master
     WHERE type = 'table'
       AND name IN ('node_search', 'pdf_search')`
  ).all() as Array<{ name: string }>;
  const names = new Set(rows.map((row) => row.name));
  return names.has('node_search') && names.has('pdf_search');
}

function shouldRetryPreviousRebuild(sqlite: DatabaseMigrationTarget) {
  const status = readWorkspaceSearchMetadata(sqlite, 'last_rebuild_status');
  return status?.status === 'failed' || status?.status === 'rebuilding';
}

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function readWorkspaceSearchSidecarRebuildStatus(
  sqlite: DatabaseMigrationTarget
): WorkspaceSearchSidecarRebuildStatus | null {
  createWorkspaceSearchMetadataTable(sqlite);
  return toWorkspaceSearchSidecarRebuildStatus(readWorkspaceSearchMetadata(sqlite, 'last_rebuild_status'));
}

export function markWorkspaceSearchSidecarRebuilding<T extends WorkspaceSearchSidecarConnection>(
  connection: T,
  strategy: FullTextSearchIndexStrategy
): WorkspaceSearchSidecarRebuildStatus {
  const resolution = resolveFullTextSearchIndexStrategy({
    [FULL_TEXT_SEARCH_INDEX_STRATEGY_SETTING_KEY]: strategy
  });
  const rebuildingStatus = {
    status: 'rebuilding',
    strategy: resolution.strategy,
    tokenizer: resolution.tokenizer
  } as const;
  createWorkspaceSearchMetadataTable(connection.sqlite);
  writeWorkspaceSearchMetadata(connection.sqlite, 'last_rebuild_status', rebuildingStatus);
  return rebuildingStatus;
}

export function rebuildWorkspaceSearchSidecar<T extends WorkspaceSearchSidecarConnection>(
  connection: T,
  options: WorkspaceSearchSidecarRebuildOptions
): WorkspaceSearchSidecarRebuildStatus {
  const resolution = resolveFullTextSearchIndexStrategy({
    [FULL_TEXT_SEARCH_INDEX_STRATEGY_SETTING_KEY]: options.strategy
  });
  createWorkspaceSearchMetadataTable(connection.sqlite);
  ensureWorkspaceSearchSourceState(connection.driver);
  markWorkspaceSearchSidecarRebuilding(connection, resolution.strategy);
  try {
    return connection.driver.transaction(() => {
      clearIndexedWorkspaceSearchSourceState(connection.driver);
      dropSearchIndexTables(connection.sqlite);
      createSearchIndexTables(connection.sqlite, resolution.tokenizer);
      (options.rebuildWorkspaceSearchIndexes ?? rebuildWorkspaceSearchIndexes)(connection.driver);
      writeWorkspaceSearchMetadata(connection.sqlite, 'schema', {
        schemaVersion: SEARCH_SIDECAR_SCHEMA_VERSION,
        strategy: resolution.strategy,
        tokenizer: resolution.tokenizer
      });
      markWorkspaceSearchSourceRevisionQueued(connection.driver);
      markWorkspaceSearchSourceIndexedIfSettled(connection.driver);
      const readyStatus = {
        status: 'ready',
        strategy: resolution.strategy,
        tokenizer: resolution.tokenizer
      } as const;
      writeWorkspaceSearchMetadata(connection.sqlite, 'last_rebuild_status', readyStatus);
      return readyStatus;
    });
  } catch (error) {
    const failedStatus = {
      error: toErrorMessage(error),
      status: 'failed',
      strategy: resolution.strategy,
      tokenizer: resolution.tokenizer
    } as const;
    tryWriteWorkspaceSearchMetadata(connection.sqlite, 'last_rebuild_status', failedStatus);
    return failedStatus;
  }
}

export function initializeWorkspaceSearchSidecar<T extends WorkspaceSearchSidecarConnection>(
  connection: T,
  options: InitializeWorkspaceSearchSidecarOptions = {}
): T {
  const resolution = resolveFullTextSearchIndexStrategy(readAppSettings(connection.sqlite));
  createWorkspaceSearchMetadataTable(connection.sqlite);
  recoverInterruptedWorkspaceSearchInvalidations(connection.driver);
  ensureWorkspaceSearchSourceState(connection.driver);
  if (
    shouldRecreateSearchIndexes(connection.sqlite, resolution.tokenizer)
    || shouldRetryPreviousRebuild(connection.sqlite)
    || !workspaceSearchSourceStateMatches(connection.driver)
  ) {
    const rebuildOptions: WorkspaceSearchSidecarRebuildOptions = { strategy: resolution.strategy };
    if (options.rebuildWorkspaceSearchIndexes) {
      rebuildOptions.rebuildWorkspaceSearchIndexes = options.rebuildWorkspaceSearchIndexes;
    }
    rebuildWorkspaceSearchSidecar(connection, rebuildOptions);
  }
  return connection;
}

export function defaultWorkspaceSearchSidecarMetadata() {
  return {
    schemaVersion: SEARCH_SIDECAR_SCHEMA_VERSION,
    strategy: DEFAULT_FULL_TEXT_SEARCH_INDEX_STRATEGY,
    tokenizer: 'unicode61' as const
  };
}
