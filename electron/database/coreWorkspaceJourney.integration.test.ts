// @vitest-environment node
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let appDataDir = '';
vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: appDataDir,
    app_cache_dir: path.join(appDataDir, 'cache'),
    app_config_dir: path.join(appDataDir, 'config'),
    app_log_dir: path.join(appDataDir, 'logs')
  })
}));

import { processSearchIndexInvalidations } from '../../lib/core/database/searchIndexInvalidations.js';
import { createPreparedDesktopTextImport } from '../../lib/core/import/fingerprint.js';
import { applyLocalContentEdit } from '../../lib/core/sync/localContentEdit.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { loadOrCreateDesktopHostName } from './hostProfile.js';
import { runPreparedImport } from './importPipeline.js';
import { initializeDatabase } from './migrate.js';
import { flushNodeSyncVersion } from './nodeSyncVersions.js';
import { loadReadingProgress, saveReadingProgress } from './readingProgress.js';
import { loadWorkspaceNodeDocument } from './workspaceNodeDocument.js';
import { searchWorkspace } from './workspaceSearch.js';

let root = '';
const importedContent = '# Integration article\n\nOriginalJourneyNeedle';
const editedContent = '# Integration article\n\nEditedJourneyNeedle';
const createdAt = '2026-10-01T00:00:00.000Z';
const editedAt = '2026-10-01T00:01:00.000Z';

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-core-journey-'));
  appDataDir = path.join(root, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  if (root) await fs.rm(root, { recursive: true, force: true });
});

function importArticle() {
  const prepared = createPreparedDesktopTextImport({
    content: importedContent, degradedReason: null, fileName: 'article.md',
    filePath: path.join(root, 'article.md'), importedAt: createdAt, kind: 'markdown'
  });
  const first = runPreparedImport(prepared);
  expect(first).toMatchObject({ duplicateSemantic: 'new', resultStatus: 'imported' });
  const nodeId = first.nodeId!;
  expect(nodeId).toBeTruthy();
  expect(runPreparedImport({ ...prepared, importedAt: editedAt }))
    .toMatchObject({ duplicateSemantic: 'duplicate', nodeId });
  expect(loadWorkspaceNodeDocument(nodeId)?.content).toBe(importedContent);
  return nodeId;
}

async function editArticle(nodeId: string) {
  flushNodeSyncVersion(nodeId, createdAt);
  const connection = openDatabaseConnection();
  const row = connection.sqlite.prepare('SELECT current_version_id FROM nodes WHERE id = ?')
    .get(nodeId) as { current_version_id: string };
  await applyLocalContentEdit(createBetterSqliteDbPort(connection.sqlite), {
    baseVersionId: row.current_version_id, versionId: 'ver_core-journey-edit',
    content: editedContent, hideTitleHeading: true,
    hostName: loadOrCreateDesktopHostName(editedAt), nodeId,
    title: 'Integration article', updatedAt: editedAt
  }, undefined, { enqueueSearchInvalidations: true });
  saveReadingProgress({
    activeNodeId: nodeId, browseRootNodeId: 'special-inbox', updatedAt: editedAt,
    nodeViewStates: [{ nodeId, scrollTop: 124, selectionFrom: 30, selectionTo: 35 }]
  });
}

function expectDurableJourney(nodeId: string) {
  processSearchIndexInvalidations(openDatabaseConnection().driver);
  expect(loadWorkspaceNodeDocument(nodeId)?.content).toBe(editedContent);
  expect(searchWorkspace('EditedJourneyNeedle').map((result) => result.id)).toContain(nodeId);
  expect(searchWorkspace('OriginalJourneyNeedle').map((result) => result.id)).not.toContain(nodeId);
  expect(loadReadingProgress()).toMatchObject({
    activeNodeId: nodeId, browseRootNodeId: 'special-inbox',
    nodeViewStateById: { [nodeId]: { scrollTop: 124, selectionFrom: 30, selectionTo: 35 } }
  });
}

it('preserves imported identity, edited body, search and reading position across reopening', async () => {
  const nodeId = importArticle();
  await editArticle(nodeId);
  expectDurableJourney(nodeId);
  closeDatabaseConnection();
  initializeDatabase();
  expectDurableJourney(nodeId);
  expect(openDatabaseConnection().sqlite.prepare('SELECT COUNT(*) AS count FROM nodes WHERE id = ?')
    .get(nodeId)).toEqual({ count: 1 });
});
