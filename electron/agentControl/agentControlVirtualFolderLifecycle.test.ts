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
import { createCollectionVirtualNodeFilter } from '../../lib/core/nodes/virtualNodeFilter.js';
import { closeDatabaseConnection } from '../database/connection.js';
import { closeExternalSearchCacheDatabase } from '../database/externalSearchCacheDatabase.js';
import { initializeDatabase } from '../database/migrate.js';
import { upsertNodeSnapshot } from '../database/nodeMutations.js';

import { readAgentControlMaterial } from './agentControlMaterials.js';
import {
  renameCollectionVirtualFolder,
  updateAgentControlVirtualFolder
} from './agentControlVirtualFolderLifecycle.js';
import {
  addAgentControlVirtualFolderItems,
  createAgentControlVirtualFolder,
  removeAgentControlVirtualFolderItems,
  reorderAgentControlVirtualFolderItems
} from './agentControlVirtualFolderMutations.js';
import { readAgentControlVirtualFolder, readAgentVirtualFolderRow } from './agentControlVirtualFolders.js';

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

it('renames a manual virtual Folder without changing member Topic YAML', () => {
  insertTopic('material-a', '---\ncollections:\n  - "List"\n---\nBody');
  insertTopic('material-b', '---\ncollections:\n  - "List"\n---\nBody B');
  insertTopic('material-c', '---\ncollections:\n  - "List"\n---\nBody C');
  const created = createAgentControlVirtualFolder({ title: 'List' });
  const folderId = created.folder_id;
  addAgentControlVirtualFolderItems({ folderId, materialIds: ['material-a', 'material-b', 'material-c'] });
  const currentUpdatedAt = readAgentVirtualFolderRow(folderId)!.updated_at;
  const updated = updateAgentControlVirtualFolder({
    expectedUpdatedAt: currentUpdatedAt,
    id: folderId,
    title: 'Renamed'
  });
  expect(updated).toMatchObject({ title: 'Renamed' });
  expect(readTopicCollections(readAgentControlMaterial('material-a')?.content ?? '')).toEqual(['List']);
  expect(readTopicCollections(readAgentControlMaterial('material-b')?.content ?? '')).toEqual(['List']);
  expect(readTopicCollections(readAgentControlMaterial('material-c')?.content ?? '')).toEqual(['List']);

  createAgentControlVirtualFolder({ title: 'Other' });
  expect(() => updateAgentControlVirtualFolder({
    expectedUpdatedAt: updated.updated_at,
    id: folderId,
    title: 'Other'
  })).toThrow('conflict');
  expect(readTopicCollections(readAgentControlMaterial('material-a')?.content ?? '')).toEqual(['List']);
});

it('stores add, remove, and reorder operations in manual membership only', () => {
  insertTopic('material-a', 'Body A');
  insertTopic('material-b', 'Body B');
  const folderId = createAgentControlVirtualFolder({ title: 'Manual' }).folder_id;

  expect(addAgentControlVirtualFolderItems({
    folderId,
    materialIds: ['material-a', 'material-b', 'material-a']
  })).toMatchObject({
    added: ['material-a', 'material-b'],
    skipped: [{ id: 'material-a', reason: 'already_present' }]
  });
  expect(reorderAgentControlVirtualFolderItems({
    folderId,
    materialIds: ['material-b', 'material-a']
  })).toMatchObject({ reordered_count: 2 });
  expect(readAgentControlVirtualFolder(folderId, 10)?.items.map((item) => item.id))
    .toEqual(['material-b', 'material-a']);

  expect(removeAgentControlVirtualFolderItems({ folderId, materialIds: ['material-b'] }))
    .toMatchObject({ removed: ['material-b'] });
  expect(readAgentControlVirtualFolder(folderId, 10)?.items.map((item) => item.id))
    .toEqual(['material-a']);
  expect(readTopicCollections(readAgentControlMaterial('material-a')?.content ?? '')).toEqual([]);
});

it('keeps Collection filter renames transactional with Topic YAML', () => {
  insertTopic('material-a', '---\ncollections:\n  - "List"\n---\nBody');
  upsertNodeSnapshot({
    anchorLink: null,
    content: '',
    createdAt: '2026-07-05T00:00:00.000Z',
    hideTitleHeading: false,
    imageRegions: null,
    isTitleManual: true,
    kind: 'folder',
    nodeId: 'collection-folder',
    parentNodeId: 'special-virtual-root',
    position: null,
    reveal: null,
    title: 'List',
    updatedAt: '2026-07-05T00:00:00.000Z',
    virtualFilter: createCollectionVirtualNodeFilter('List')
  });

  expect(renameCollectionVirtualFolder({
    expectedUpdatedAt: '2026-07-05T00:00:00.000Z',
    id: 'collection-folder',
    title: 'Renamed'
  })).toMatchObject({ collectionRenames: [{ from: 'List', nodeIds: ['material-a'], to: 'Renamed' }] });
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
