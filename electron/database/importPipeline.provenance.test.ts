// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-import-provenance-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { createPreparedDesktopTextImport } from '../../lib/core/import/fingerprint.js';

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { resetSeededWorkspace } from './databaseTestWorkspace.js';
import { recordPreparedImportFailure, runPreparedImport } from './importPipeline.js';
import { initializeDatabase } from './migrate.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-import-provenance-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
  resetSeededWorkspace();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

function prepared(content: string, importedAt: string) {
  return createPreparedDesktopTextImport({
    content,
    fileName: 'note.md',
    filePath: '/tmp/note.md',
    importedAt,
    kind: 'markdown'
  });
}

function readProvenance(nodeId: string) {
  return openDatabaseConnection().sqlite.prepare(
    `SELECT import_source_fingerprint, import_content_fingerprint, sync_dirty
     FROM nodes WHERE id = ?`
  ).get(nodeId);
}

it('maintains provenance only for successful content identity branches', () => {
  const first = runPreparedImport(prepared('# Imported\nBody', '2026-07-15T01:00:00.000Z'));
  expect(first.nodeId).toBeTruthy();
  expect(readProvenance(first.nodeId!)).toEqual({
    import_content_fingerprint: first.contentFingerprint,
    import_source_fingerprint: first.sourceFingerprint,
    sync_dirty: 1
  });

  openDatabaseConnection().sqlite.prepare(
    `UPDATE nodes SET import_source_fingerprint = NULL, import_content_fingerprint = NULL, sync_dirty = 0
     WHERE id = ?`
  ).run(first.nodeId);
  const duplicate = runPreparedImport(prepared('# Imported\nBody', '2026-07-15T01:05:00.000Z'));
  expect(duplicate.duplicateSemantic).toBe('duplicate');
  expect(readProvenance(first.nodeId!)).toEqual({
    import_content_fingerprint: duplicate.contentFingerprint,
    import_source_fingerprint: duplicate.sourceFingerprint,
    sync_dirty: 1
  });

  const updated = runPreparedImport(prepared('# Imported\nUpdated', '2026-07-15T01:10:00.000Z'));
  const successfulProvenance = readProvenance(first.nodeId!);
  expect(successfulProvenance).toEqual({
    import_content_fingerprint: updated.contentFingerprint,
    import_source_fingerprint: updated.sourceFingerprint,
    sync_dirty: 1
  });

  runPreparedImport(prepared('   ', '2026-07-15T01:15:00.000Z'));
  const failedPrepared = prepared('# Imported\nFailed', '2026-07-15T01:20:00.000Z');
  recordPreparedImportFailure(failedPrepared, 'test failure');
  expect(readProvenance(first.nodeId!)).toEqual(successfulProvenance);

  const retry = runPreparedImport({
    ...failedPrepared,
    importedAt: '2026-07-15T01:25:00.000Z'
  });
  expect(retry.duplicateSemantic).toBe('updated');
  expect(readProvenance(first.nodeId!)).toEqual({
    import_content_fingerprint: retry.contentFingerprint,
    import_source_fingerprint: retry.sourceFingerprint,
    sync_dirty: 1
  });
});
