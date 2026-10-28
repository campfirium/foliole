// @vitest-environment node
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let appDataDir = '';
vi.mock('./paths.js', () => ({ resolveAppPaths: () => ({
  app_data_dir: appDataDir, app_cache_dir: path.join(appDataDir, 'cache'),
  app_config_dir: path.join(appDataDir, 'config'), app_log_dir: path.join(appDataDir, 'logs')
}) }));
vi.mock('../sync/desktopMemberSyncCadence.js', () => ({ requestDesktopHighValueSync: vi.fn() }));

import { loadWorkspaceListProjection } from '../../lib/core/database/workspaceListProjection.js';
import { loadWorkspaceListSnapshot } from '../../lib/core/database/workspaceListSnapshot.js';
import { createPreparedDesktopTextImport } from '../../lib/core/import/fingerprint.js';
import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';
import { currentLibraryScope } from '../database/attachmentResourceDescription.js';
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { resetSeededWorkspace } from '../database/databaseTestWorkspace.js';
import { runPreparedImport } from '../database/importPipeline.js';
import { initializeDatabase } from '../database/migrate.js';
import { flushDirtyNodeSyncVersions } from '../database/nodeSyncVersions.js';
import { loadSyncNodes } from '../database/syncNodes.js';

import { handleStorageCommand } from './storageCommands.js';
import { handleWorkspaceReadCommand } from './storageReadCommands.js';

let tempRoot = '';
beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-list-fingerprints-'));
  appDataDir = path.join(tempRoot, 'data');
  initializeDatabase();
  resetSeededWorkspace();
});
afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

function prepared(body: string, minute: number) {
  return createPreparedDesktopTextImport({ content: `# Imported\n\n${body}`, fileName: 'note.md',
    filePath: '/tmp/note.md', importedAt: `2026-10-28T01:${String(minute).padStart(2, '0')}:00.000Z`, kind: 'markdown' });
}

function withoutHostFields<T extends { importContentFingerprint?: string | null; importSourceFingerprint?: string | null;
  readwiseRemoteLifecycle?: unknown; resourceReferences?: unknown }>(node: T) {
  const copy = { ...node };
  delete copy.importContentFingerprint;
  delete copy.importSourceFingerprint;
  delete copy.readwiseRemoteLifecycle;
  delete copy.resourceReferences;
  return copy;
}

function readDesktop(nodeId: string) {
  const full = handleWorkspaceReadCommand(NATIVE_COMMANDS.loadWorkspaceListSnapshot, {})!;
  const scoped = handleWorkspaceReadCommand(NATIVE_COMMANDS.loadWorkspaceListProjection,
    { nodeIds: [nodeId], structure: false, libraryScope: currentLibraryScope() })!;
  return { full: full as ReturnType<typeof loadWorkspaceListSnapshot>,
    scoped: scoped as ReturnType<typeof loadWorkspaceListProjection> };
}

it.each(['full', 'scoped'] as const)('omits host import identities from the %s desktop list while preserving shared facts', (mode) => {
  const imported = runPreparedImport(prepared('Original body', 0));
  const nodeId = imported.nodeId!;
  const driver = openDatabaseConnection().driver;
  const shared = mode === 'full' ? loadWorkspaceListSnapshot(driver)!
    : loadWorkspaceListProjection(driver, { nodeIds: [nodeId], structure: false });
  expect(shared.nodesById[nodeId]).toMatchObject({ importContentFingerprint: imported.contentFingerprint,
    importSourceFingerprint: imported.sourceFingerprint });
  const desktop = readDesktop(nodeId)[mode]!;
  expect(desktop.nodesById[nodeId]).toEqual(withoutHostFields(shared.nodesById[nodeId]!));
  expect(Object.keys(desktop.nodesById[nodeId]!)).not.toContain('importContentFingerprint');
  expect(Object.keys(desktop.nodesById[nodeId]!)).not.toContain('importSourceFingerprint');
  if ('nodeOrder' in shared) expect(desktop).toMatchObject({ nodeOrder: shared.nodeOrder });
  else expect(desktop).toMatchObject({ structure: shared.structure, requestedNodeIds: shared.requestedNodeIds });
});

it('keeps duplicate import, content reimport and native sync identities after desktop reads, edits and reopen', async () => {
  const first = runPreparedImport(prepared('Original body', 0));
  const nodeId = first.nodeId!;
  readDesktop(nodeId);
  const duplicate = runPreparedImport(prepared('Original body', 1));
  expect(duplicate).toMatchObject({ nodeId, duplicateSemantic: 'duplicate' });
  const updated = runPreparedImport(prepared('Updated body', 2));
  expect(updated).toMatchObject({ nodeId, duplicateSemantic: 'updated' });
  const { driver } = openDatabaseConnection();
  const facts = driver.queryOne('SELECT import_content_fingerprint, import_source_fingerprint FROM nodes WHERE id = ?', [nodeId]);
  expect(facts).toEqual({ import_content_fingerprint: updated.contentFingerprint,
    import_source_fingerprint: updated.sourceFingerprint });
  flushDirtyNodeSyncVersions('2026-10-28T01:03:00.000Z');
  expect(loadSyncNodes([nodeId])[0]?.snapshot).toMatchObject(facts!);
  const node = readDesktop(nodeId).full!.nodesById[nodeId]!;
  await handleStorageCommand(NATIVE_COMMANDS.updateNodeContent, {
    nodeId, parentNodeId: node.parentNodeId, kind: node.kind, title: node.title,
    content: '# Imported\n\nLocally edited body', createdAt: node.createdAt,
    updatedAt: '2026-10-28T01:04:00.000Z', isTitleManual: true, reveal: null, position: null
  });
  expect(readDesktop(nodeId).scoped.nodesById[nodeId]).not.toHaveProperty('importContentFingerprint');
  closeDatabaseConnection();
  const reopened = readDesktop(nodeId);
  expect(reopened.full?.nodesById[nodeId]?.title).toBe('Imported');
  expect(reopened.scoped.nodesById[nodeId]?.hasContent).toBe(true);
  expect(openDatabaseConnection().driver.queryOne(
    'SELECT import_content_fingerprint, import_source_fingerprint FROM nodes WHERE id = ?', [nodeId])).toEqual(facts);
});
