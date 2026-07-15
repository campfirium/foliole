// @vitest-environment node
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-agent-control-virtual-folder-lifecycle-tests';
vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'), app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir, app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));
vi.mock('../mirror/mirrorSyncScheduler.js', () => ({ scheduleMirrorSync: vi.fn() }));

import { readTopicCollections } from '../../lib/core/nodes/topicCollectionsFrontmatter.js';
import { closeDatabaseConnection } from '../database/connection.js';
import { closeExternalSearchCacheDatabase } from '../database/externalSearchCacheDatabase.js';
import { initializeDatabase } from '../database/migrate.js';
import { upsertNodeSnapshot } from '../database/nodeMutations.js';

import { readAgentControlMaterial } from './agentControlMaterials.js';
import { updateAgentControlVirtualFolder } from './agentControlVirtualFolderLifecycle.js';
import { createAgentControlVirtualFolder } from './agentControlVirtualFolderMutations.js';

let tempRoot = '';
beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-agent-virtual-lifecycle-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});
afterEach(async () => {
  closeExternalSearchCacheDatabase();
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

it('atomically renames a Collection virtual Folder and all member Topic YAML', () => {
  insertTopic('material-a', '---\ncollections:\n  - "List"\n---\nBody');
  insertTopic('material-b', '---\ncollections:\n  - "List"\n---\nBody B');
  insertTopic('material-c', '---\ncollections:\n  - "List"\n---\nBody C');
  const created = createAgentControlVirtualFolder({ title: 'List' });
  const folderId = created.folder_id;
  const createdAt = created.folder!.updated_at;
  const updated = updateAgentControlVirtualFolder({
    expectedUpdatedAt: createdAt,
    id: folderId,
    title: 'Renamed'
  });
  expect(updated).toMatchObject({ title: 'Renamed' });
  expect(readTopicCollections(readAgentControlMaterial('material-a')?.content ?? '')).toEqual(['Renamed']);
  expect(readTopicCollections(readAgentControlMaterial('material-b')?.content ?? '')).toEqual(['Renamed']);
  expect(readTopicCollections(readAgentControlMaterial('material-c')?.content ?? '')).toEqual(['Renamed']);

  createAgentControlVirtualFolder({ title: 'Other' });
  expect(() => updateAgentControlVirtualFolder({
    expectedUpdatedAt: updated.updated_at,
    id: folderId,
    title: 'Other'
  })).toThrow('conflict');
  expect(readTopicCollections(readAgentControlMaterial('material-a')?.content ?? '')).toEqual(['Renamed']);
});

function insertTopic(id: string, content: string) {
  upsertNodeSnapshot({
    anchorLink: null,
    content,
    createdAt: '2026-07-05T00:00:00.000Z',
    hideTitleHeading: false,
    imageRegions: null,
    isTitleManual: true,
    kind: 'topic',
    nodeId: id,
    parentNodeId: null,
    position: null,
    reveal: null,
    title: id,
    updatedAt: '2026-07-05T00:00:00.000Z'
  });
}
