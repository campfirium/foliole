// @vitest-environment node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let root;
vi.mock('../../electron/nativeAppearance.js', () => ({ applyNativeBaseColorMode: vi.fn() }));
vi.mock('../../electron/ipc/paths.js', () => ({ resolveAppPaths: () => ({ app_data_dir: root,
  app_cache_dir: path.join(root, 'cache'), app_config_dir: path.join(root, 'config'),
  app_log_dir: path.join(root, 'logs'), documents_dir: root }) }));
vi.mock('../../electron/ipc/workspaceContentChangedEvents.js', () => ({ notifyWorkspaceContentChanged: vi.fn() }));
vi.mock('../../electron/mirror/mirrorSyncScheduler.js', () => ({ scheduleMirrorSync: vi.fn() }));

import { seedA5ResourceLanProbe } from '../android/macos-a5-resource-lan-probe.mjs';
import { createDesktopSyncGroupJourneyFact } from './sync-group-journey-fact-action.mjs';
import { createSyncFromZeroDataset } from './sync-from-zero-dataset-action.mjs';
import { closeDatabaseConnection } from '../../electron/database/connection.js';
import { initializeDatabase } from '../../electron/database/migrate.js';
import { loadNodeResourceReferences } from '../../electron/database/nodeResources.js';
import { loadWorkspaceListSnapshot } from '../../electron/database/workspaceListSnapshot.js';
import { loadLibraryPathSettings } from '../../electron/ipc/libraryPaths.js';
import { handleStorageAttachmentCommand } from '../../electron/ipc/storageAttachmentCommands.js';
import { handleNodeMutationCommand } from '../../electron/ipc/storageNodeMutationCommands.js';

beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-image-fixtures-'));
  await initializeDatabase();
});
afterEach(() => { closeDatabaseConnection(); fs.rmSync(root, { recursive: true, force: true }); });

const session = { invoke: async (command, args = {}) => {
  if (command === 'load_workspace_list_snapshot') return loadWorkspaceListSnapshot(args);
  if (command === 'load_library_path_settings') return loadLibraryPathSettings();
  const mutation = handleNodeMutationCommand(command, args);
  return mutation === undefined ? handleStorageAttachmentCommand(command, args) : mutation;
} };

it('persists both LAN image descriptions through production desktop commands', async () => {
  const paths = await loadLibraryPathSettings();
  const fixture = await seedA5ResourceLanProbe(session, paths.library_home);
  try {
    expect(loadNodeResourceReferences(fixture.nodeId).map(item => item.storage_key).sort())
      .toEqual(fixture.images.map(item => item.storageKey).sort());
    expect(fs.existsSync(fixture.missingPath)).toBe(false);
  } finally { fixture.restore(); }
});

it('persists journey images through production desktop commands', async () => {
  const result = await createDesktopSyncGroupJourneyFact({ device: 'A',
    evidenceRoot: root, session, withAttachment: true });
  expect(loadNodeResourceReferences(result.factId)).toHaveLength(1);
});

it('persists every dataset image and resolves it through production desktop commands', async () => {
  const result = await createSyncFromZeroDataset({ session, evidenceRoot: root,
    dataset: { nodeCount: 2, nodePrefix: 'fixture-', contentBodyBytes: 32,
      attachmentCount: 3, attachmentBytes: 128 } });
  expect(result.nodeIds.flatMap(id => loadNodeResourceReferences(id))).toHaveLength(3);
});
