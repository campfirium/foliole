// @vitest-environment node
import { promises as fs } from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
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

import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { closeExternalSearchCacheDatabase } from '../database/externalSearchCacheDatabase.js';
import { initializeDatabase } from '../database/migrate.js';
import { softDeleteNodes, upsertNodeSnapshot } from '../database/nodeMutations.js';

import { createAgentControlHttpServer } from './agentControlServer.js';
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
  openDatabaseConnection().driver.execute(
    `INSERT INTO virtual_folders (id, title, description, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
    ['vf-1', 'Guide', '', '2026-07-05T00:00:00.000Z', '2026-07-05T00:00:00.000Z']
  );
}

async function startServer(auditEvents: AgentControlAuditEvent[] = []) {
  const server = createAgentControlHttpServer({
    appVersion: '0.1.0-test',
    auditSink: (event) => {
      auditEvents.push(event);
    },
    token: 'test-token'
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { endpoint: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, server };
}

function closeServer(server: http.Server) {
  return new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
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

async function responseJson(response: Response) {
  return JSON.parse(await response.text()) as Record<string, unknown>;
}

function activeItemCount(materialId: string) {
  return openDatabaseConnection().driver.queryOne<{ count: number }>(
    `SELECT COUNT(*) AS count FROM virtual_folder_items
     WHERE folder_id = 'vf-1' AND material_node_id = ? AND deleted_at IS NULL`,
    [materialId]
  )?.count ?? 0;
}

it('creates a virtual folder and records bounded audit events', async () => {
  const auditEvents: AgentControlAuditEvent[] = [];
  const { endpoint, server } = await startServer(auditEvents);
  try {
    const unauthorized = await fetch(`${endpoint}/agent-control/v1/virtual-folders/create`, { method: 'POST' });
    expect(unauthorized.status).toBe(401);

    const invalid = await post(endpoint, 'virtual-folders/create', { title: '   ' });
    expect(invalid.status).toBe(400);

    const created = await post(endpoint, 'virtual-folders/create', { description: 'Order', title: 'Guide' });
    expect(created.status).toBe(200);
    const payload = await responseJson(created);
    expect(payload).toMatchObject({ folder: { description: 'Order', title: 'Guide' } });
    expect(typeof payload.folder_id).toBe('string');
    expect(auditEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({ capability: 'virtualFolders.create', errorCategory: 'unauthorized', result: 'auth_failed' }),
      expect.objectContaining({ capability: 'virtualFolders.create', errorCategory: 'invalid_request', result: 'failed' }),
      expect.objectContaining({ capability: 'virtualFolders.create', result: 'success' })
    ]));
  } finally {
    await closeServer(server);
  }
});

it('adds, restores, and removes virtual folder items without moving materials', async () => {
  insertFolder();
  insertNode('material-a', 'Available');
  insertNode('material-b', 'Deleted');
  softDeleteNodes({ deletedAt: '2026-07-05T00:01:00.000Z', nodeIds: ['material-b'] });
  const auditEvents: AgentControlAuditEvent[] = [];
  const { endpoint, server } = await startServer(auditEvents);
  try {
    const add = await post(endpoint, 'virtual-folders/add-items', {
      folder_id: 'vf-1',
      material_ids: ['material-a', 'material-a', 'missing', 'material-b']
    });
    expect(add.status).toBe(200);
    const addPayload = await responseJson(add);
    expect(addPayload).toMatchObject({
      added: [expect.any(String)],
      skipped: expect.arrayContaining([
        { id: 'missing', reason: 'not_found' },
        { id: 'material-b', reason: 'deleted' }
      ])
    });

    const remove = await post(endpoint, 'virtual-folders/remove-items', {
      folder_id: 'vf-1',
      item_ids: [String((addPayload.added as string[])[0]), 'missing-item']
    });
    expect(remove.status).toBe(200);
    expect(await responseJson(remove)).toMatchObject({
      removed: [String((addPayload.added as string[])[0])],
      skipped: [{ id: 'missing-item', reason: 'not_found' }]
    });

    const restored = await post(endpoint, 'virtual-folders/add-items', { folder_id: 'vf-1', material_ids: ['material-a'] });
    expect(restored.status).toBe(200);
    expect(await responseJson(restored)).toMatchObject({ added: [], restored: [String((addPayload.added as string[])[0])] });
    expect(activeItemCount('material-a')).toBe(1);
    expect(auditEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({ capability: 'virtualFolders.addItems', result: 'success', targetId: 'vf-1' }),
      expect.objectContaining({ capability: 'virtualFolders.removeItems', result: 'success', targetId: 'vf-1' })
    ]));
  } finally {
    await closeServer(server);
  }
});

it('keeps concurrent add-items idempotent without a schema uniqueness constraint', async () => {
  insertFolder();
  insertNode('material-a');
  const { endpoint, server } = await startServer();
  try {
    const [first, second] = await Promise.all([
      post(endpoint, 'virtual-folders/add-items', { folder_id: 'vf-1', material_ids: ['material-a'] }),
      post(endpoint, 'virtual-folders/add-items', { folder_id: 'vf-1', material_ids: ['material-a'] })
    ]);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(activeItemCount('material-a')).toBe(1);
  } finally {
    await closeServer(server);
  }
});

it('reorders only complete active item sets and reports conflicts', async () => {
  insertFolder();
  insertNode('material-a');
  insertNode('material-b');
  const auditEvents: AgentControlAuditEvent[] = [];
  const { endpoint, server } = await startServer(auditEvents);
  try {
    const add = await post(endpoint, 'virtual-folders/add-items', { folder_id: 'vf-1', material_ids: ['material-a', 'material-b'] });
    const itemIds = (await responseJson(add)).added as string[];
    const duplicate = await post(endpoint, 'virtual-folders/reorder', { folder_id: 'vf-1', item_ids: [itemIds[0], itemIds[0]] });
    expect(duplicate.status).toBe(400);

    const conflict = await post(endpoint, 'virtual-folders/reorder', { folder_id: 'vf-1', item_ids: [itemIds[0]] });
    expect(conflict.status).toBe(409);
    expect(await responseJson(conflict)).toEqual({ error: 'conflict' });

    const reordered = await post(endpoint, 'virtual-folders/reorder', { folder_id: 'vf-1', item_ids: [itemIds[1], itemIds[0]] });
    expect(reordered.status).toBe(200);
    const read = await post(endpoint, 'virtual-folders/read', { id: 'vf-1' });
    expect((await responseJson(read)).items).toMatchObject([{ id: itemIds[1] }, { id: itemIds[0] }]);
    expect(auditEvents).toContainEqual(expect.objectContaining({
      capability: 'virtualFolders.reorder',
      errorCategory: 'conflict',
      result: 'failed',
      targetId: 'vf-1'
    }));
  } finally {
    await closeServer(server);
  }
});
