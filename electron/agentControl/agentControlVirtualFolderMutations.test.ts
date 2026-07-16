// @vitest-environment node
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-agent-control-virtual-folder-mutations-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { readTopicCollections } from '../../lib/core/nodes/topicCollectionsFrontmatter.js';
import { createManualVirtualNodeFilter } from '../../lib/core/nodes/virtualNodeFilter.js';
import { closeDatabaseConnection } from '../database/connection.js';
import { closeExternalSearchCacheDatabase } from '../database/externalSearchCacheDatabase.js';
import { initializeDatabase } from '../database/migrate.js';
import { softDeleteNodes, upsertNodeSnapshot } from '../database/nodeMutations.js';

import { readAgentControlMaterial } from './agentControlMaterials.js';
import { closeAgentControlTestServer, readAgentControlTestResponseJson as responseJson, startAgentControlTestServer } from './agentControlTestServer.js';
import type { AgentControlAuditEvent } from './agentControlTypes.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-agent-control-virtual-folder-mutations-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeExternalSearchCacheDatabase();
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

function insertNode(id: string, title = id) {
  upsertNodeSnapshot({
    anchorLink: null,
    content: '',
    createdAt: '2026-07-05T00:00:00.000Z',
    hideTitleHeading: false,
    imageRegions: null,
    isTitleManual: true,
    kind: 'topic',
    nodeId: id,
    parentNodeId: null,
    position: null,
    reveal: null,
    title,
    updatedAt: '2026-07-05T00:00:00.000Z'
  });
}

function insertFolder() {
  upsertNodeSnapshot({
    anchorLink: null,
    content: '',
    createdAt: '2026-07-05T00:00:00.000Z',
    hideTitleHeading: false,
    imageRegions: null,
    isTitleManual: true,
    kind: 'folder',
    manualChildOrder: [],
    nodeId: 'vf-1',
    parentNodeId: 'special-virtual-root',
    position: null,
    reveal: null,
    title: 'Guide',
    updatedAt: '2026-07-05T00:00:00.000Z',
    virtualFilter: createManualVirtualNodeFilter()
  });
}

async function post(endpoint: string, pathName: string, body: Record<string, unknown>, token = 'test-token') {
  return fetch(`${endpoint}/agent-control/v1/${pathName}`, {
    body: JSON.stringify(body),
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      'x-foliole-agent-id': 'codex-local-test'
    },
    method: 'POST'
  });
}

const collectionsFor = (materialId: string) => readTopicCollections(readAgentControlMaterial(materialId)?.content ?? '');

it('notifies workspace refresh only after successful virtual folder writes', async () => {
  insertFolder();
  insertNode('material-a');
  const notifyWorkspaceContentChanged = vi.fn();
  const { endpoint, server } = await startAgentControlTestServer([], notifyWorkspaceContentChanged);
  try {
    const unauthorized = await fetch(`${endpoint}/agent-control/v1/virtual-folders/create`, { method: 'POST' });
    expect(unauthorized.status).toBe(401);
    expect(notifyWorkspaceContentChanged).not.toHaveBeenCalled();

    const invalid = await post(endpoint, 'virtual-folders/add-items', { folder_id: 'vf-1', material_ids: [] });
    expect(invalid.status).toBe(400);
    expect(notifyWorkspaceContentChanged).not.toHaveBeenCalled();

    const added = await post(endpoint, 'virtual-folders/add-items', { folder_id: 'vf-1', material_ids: ['material-a'] });
    expect(added.status).toBe(200);
    expect(notifyWorkspaceContentChanged).toHaveBeenCalledTimes(1);

    const created = await post(endpoint, 'virtual-folders/create', { title: 'Agent list' });
    expect(created.status).toBe(200);
    expect(notifyWorkspaceContentChanged).toHaveBeenCalledTimes(2);
  } finally {
    await closeAgentControlTestServer(server);
  }
});

it('creates a virtual folder and records bounded audit events', async () => {
  const auditEvents: AgentControlAuditEvent[] = [];
  const { endpoint, server } = await startAgentControlTestServer(auditEvents);
  try {
    const unauthorized = await fetch(`${endpoint}/agent-control/v1/virtual-folders/create`, { method: 'POST' });
    expect(unauthorized.status).toBe(401);

    const invalid = await post(endpoint, 'virtual-folders/create', { title: '   ' });
    expect(invalid.status).toBe(400);

    const rejectedDescription = await post(endpoint, 'virtual-folders/create', { description: 'Order', title: 'Guide' });
    expect(rejectedDescription.status).toBe(400);

    const created = await post(endpoint, 'virtual-folders/create', { title: 'Guide' });
    expect(created.status).toBe(200);
    const payload = await responseJson(created);
    expect(payload).toMatchObject({ folder: { item_count: 0, title: 'Guide' } });
    expect(typeof payload.folder_id).toBe('string');
    expect(auditEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({ capability: 'virtualFolders.create', errorCategory: 'unauthorized', result: 'auth_failed' }),
      expect.objectContaining({ capability: 'virtualFolders.create', errorCategory: 'invalid_request', result: 'failed' }),
      expect.objectContaining({ capability: 'virtualFolders.create', result: 'success' })
    ]));
  } finally {
    await closeAgentControlTestServer(server);
  }
});

it('adds and removes manual virtual folder members without changing Topic YAML', async () => {
  insertFolder();
  insertNode('material-a', 'Available');
  insertNode('material-b', 'Deleted');
  softDeleteNodes({ deletedAt: '2026-07-05T00:01:00.000Z', nodeIds: ['material-b'] });
  const auditEvents: AgentControlAuditEvent[] = [];
  const { endpoint, server } = await startAgentControlTestServer(auditEvents);
  try {
    const add = await post(endpoint, 'virtual-folders/add-items', {
      folder_id: 'vf-1',
      material_ids: ['material-a', 'material-a', 'missing', 'material-b']
    });
    expect(add.status).toBe(200);
    const addPayload = await responseJson(add);
    expect(addPayload).toMatchObject({
      added: ['material-a'],
      skipped: expect.arrayContaining([
        { id: 'missing', reason: 'not_found' },
        { id: 'material-b', reason: 'deleted' }
      ])
    });

    const remove = await post(endpoint, 'virtual-folders/remove-items', {
      folder_id: 'vf-1',
      material_ids: ['material-a', 'missing-item']
    });
    expect(remove.status).toBe(200);
    expect(await responseJson(remove)).toMatchObject({
      removed: ['material-a'],
      skipped: [{ id: 'missing-item', reason: 'not_found' }]
    });
    expect(collectionsFor('material-a')).toEqual([]);

    const readded = await post(endpoint, 'virtual-folders/add-items', { folder_id: 'vf-1', material_ids: ['material-a'] });
    expect(readded.status).toBe(200);
    expect(await responseJson(readded)).toMatchObject({ added: ['material-a'] });
    expect(collectionsFor('material-a')).toEqual([]);
    expect(auditEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({ capability: 'virtualFolders.addItems', result: 'success', targetId: 'vf-1' }),
      expect.objectContaining({ capability: 'virtualFolders.removeItems', result: 'success', targetId: 'vf-1' })
    ]));
  } finally {
    await closeAgentControlTestServer(server);
  }
});

it('keeps concurrent add-items idempotent without Topic YAML', async () => {
  insertFolder();
  insertNode('material-a');
  const { endpoint, server } = await startAgentControlTestServer();
  try {
    const [first, second] = await Promise.all([
      post(endpoint, 'virtual-folders/add-items', { folder_id: 'vf-1', material_ids: ['material-a'] }),
      post(endpoint, 'virtual-folders/add-items', { folder_id: 'vf-1', material_ids: ['material-a'] })
    ]);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(collectionsFor('material-a')).toEqual([]);
    const read = await post(endpoint, 'virtual-folders/read', { id: 'vf-1' });
    expect((await responseJson(read)).items).toHaveLength(1);
  } finally {
    await closeAgentControlTestServer(server);
  }
});

it('reorders only complete active item sets and reports conflicts', async () => {
  insertFolder();
  insertNode('material-a');
  insertNode('material-b');
  const auditEvents: AgentControlAuditEvent[] = [];
  const { endpoint, server } = await startAgentControlTestServer(auditEvents);
  try {
    const add = await post(endpoint, 'virtual-folders/add-items', { folder_id: 'vf-1', material_ids: ['material-a', 'material-b'] });
    const materialIds = (await responseJson(add)).added as string[];
    const duplicate = await post(endpoint, 'virtual-folders/reorder', {
      folder_id: 'vf-1', material_ids: [materialIds[0], materialIds[0]]
    });
    expect(duplicate.status).toBe(400);

    const conflict = await post(endpoint, 'virtual-folders/reorder', { folder_id: 'vf-1', material_ids: [materialIds[0]] });
    expect(conflict.status).toBe(409);
    expect(await responseJson(conflict)).toEqual({ error: 'conflict' });

    const reordered = await post(endpoint, 'virtual-folders/reorder', {
      folder_id: 'vf-1', material_ids: [materialIds[1], materialIds[0]]
    });
    expect(reordered.status).toBe(200);
    const read = await post(endpoint, 'virtual-folders/read', { id: 'vf-1' });
    expect((await responseJson(read)).items).toMatchObject([{ id: materialIds[1] }, { id: materialIds[0] }]);
    expect(auditEvents).toContainEqual(expect.objectContaining({
      capability: 'virtualFolders.reorder',
      errorCategory: 'conflict',
      result: 'failed',
      targetId: 'vf-1'
    }));
  } finally {
    await closeAgentControlTestServer(server);
  }
});
