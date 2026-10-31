// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let root = '';
vi.mock('../../electron/ipc/paths.js', () => ({ resolveAppPaths: () => ({
  app_data_dir: root, app_cache_dir: path.join(root, 'cache'),
  app_config_dir: path.join(root, 'config'), app_log_dir: path.join(root, 'logs')
}) }));
vi.mock('../../electron/deviceAnchorStore.js', () => ({
  loadDesktopLibraryWriterBinding: (libraryPath: string) => ({ deviceAnchor: 'document-base-test', libraryPath })
}));
vi.mock('../../electron/sync/desktopMemberSyncCadence.js', () => ({ requestDesktopHighValueSync: vi.fn() }));

import { closeDatabaseConnection } from '../../electron/database/connection.js';
import { resetSeededWorkspace } from '../../electron/database/databaseTestWorkspace.js';
import { runPreparedImport } from '../../electron/database/importPipeline.js';
import { initializeDatabase } from '../../electron/database/migrate.js';
import { flushDirtyNodeSyncVersions } from '../../electron/database/nodeSyncVersions.js';
import { loadWorkspaceListSnapshot } from '../../electron/database/workspaceListSnapshot.js';
import { loadWorkspaceNodeDocument } from '../../electron/database/workspaceNodeDocument.js';
import { handleStorageCommand } from '../../electron/ipc/storageCommands.js';
import { createPreparedDesktopTextImport } from '../../lib/core/import/fingerprint.js';
import { createOpaqueVersionRef } from '../../lib/core/sync/opaqueSyncRefs.js';
import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';

import { mergeWorkspaceNodeDocument } from './workspaceRendererBoundaryDocument';

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-document-base-'));
  initializeDatabase();
  resetSeededWorkspace();
});
afterEach(async () => { closeDatabaseConnection(); await fs.rm(root, { recursive: true, force: true }); });

function imported(content: string, minute: number) {
  return runPreparedImport(createPreparedDesktopTextImport({ content, fileName: 'source.md',
    filePath: '/tmp/document-base-source.md', kind: 'markdown',
    importedAt: `2026-10-31T00:0${minute}:00.000Z` }));
}

it('persists an edit of reimported content loaded through older list metadata', async () => {
  const first = imported('# Source\n\nOriginal body', 0);
  const id = first.nodeId!;
  flushDirtyNodeSyncVersions('2026-10-31T00:00:00.000Z');
  const metadata = loadWorkspaceListSnapshot()!.nodesById[id]!;
  expect(metadata.currentVersionId).toBeTruthy();
  imported('# Source\n\nReimported complete body 中😀.', 1);
  flushDirtyNodeSyncVersions('2026-10-31T00:01:00.000Z');
  const document = loadWorkspaceNodeDocument(id)!;
  expect(document.currentVersionId).not.toBe(metadata.currentVersionId);
  const loaded = mergeWorkspaceNodeDocument(metadata, document);
  const content = `${loaded.content}\nAccepted keyboard append.`;
  const edit = { baseVersionId: loaded.currentVersionId!, baseContent: loaded.content,
    versionId: createOpaqueVersionRef(randomUUID()) };
  await handleStorageCommand(NATIVE_COMMANDS.updateNodeContentWithAnchors, {
    parent: { nodeId: id, parentNodeId: metadata.parentNodeId, kind: metadata.kind,
      title: metadata.title, content, reveal: null, isTitleManual: true, hideTitleHeading: false,
      createdAt: metadata.createdAt, updatedAt: '2026-10-31T00:02:00.000Z', position: null },
    edit, affectedAnchors: []
  });
  closeDatabaseConnection();
  expect(loadWorkspaceNodeDocument(id)).toMatchObject({ content, currentVersionId: edit.versionId });
});
