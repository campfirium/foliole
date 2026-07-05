// @vitest-environment node
import { promises as fs } from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-agent-control-virtual-folders-tests';

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
import { deleteNodesPermanently, softDeleteNodes, upsertNodeSnapshot } from '../database/nodeMutations.js';

import { createAgentControlHttpServer } from './agentControlServer.js';
import type { AgentControlAuditEvent } from './agentControlTypes.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-agent-control-virtual-folders-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeExternalSearchCacheDatabase();
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

function insertNode(input: { content?: string; id: string; title: string; updatedAt?: string }) {
  upsertNodeSnapshot({
    anchorLink: null,
    content: input.content ?? '',
    createdAt: '2026-07-05T00:00:00.000Z',
    hideTitleHeading: false,
    imageRegions: null,
    isTitleManual: true,
    kind: 'topic',
    nodeId: input.id,
    parentNodeId: null,
    position: null,
    reveal: null,
    title: input.title,
    updatedAt: input.updatedAt ?? '2026-07-05T00:00:00.000Z'
  });
}

function insertVirtualFolder() {
  const driver = openDatabaseConnection().driver;
  driver.execute(
    `INSERT INTO virtual_folders (id, title, description, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
    ['vf-1', 'Guide', 'Reading order', '2026-07-05T00:00:00.000Z', '2026-07-05T00:01:00.000Z']
  );
  driver.execute(
    `INSERT INTO virtual_folder_items (id, folder_id, material_node_id, position, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    ['item-1', 'vf-1', 'material-a', 10, '2026-07-05T00:00:00.000Z', '2026-07-05T00:01:00.000Z']
  );
  driver.execute(
    `INSERT INTO virtual_folder_items (id, folder_id, material_node_id, position, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    ['item-2', 'vf-1', 'material-b', 20, '2026-07-05T00:00:00.000Z', '2026-07-05T00:01:00.000Z']
  );
  driver.execute(
    `INSERT INTO virtual_folder_items (id, folder_id, material_node_id, position, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    ['item-3', 'vf-1', 'material-c', 30, '2026-07-05T00:00:00.000Z', '2026-07-05T00:01:00.000Z']
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
  return new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

async function responseJson(response: Response) {
  return JSON.parse(await response.text()) as Record<string, unknown>;
}

function authHeaders() {
  return {
    authorization: 'Bearer test-token',
    'content-type': 'application/json',
    'x-foliole-agent-id': 'codex-local-test'
  };
}

it('lists and reads virtual folders with bounded ordered material projections', async () => {
  insertNode({ id: 'material-a', title: 'Available', updatedAt: '2026-07-05T00:02:00.000Z' });
  insertNode({ id: 'material-b', title: 'Deleted' });
  insertNode({ id: 'material-c', title: 'Gone' });
  insertVirtualFolder();
  softDeleteNodes({ deletedAt: '2026-07-05T00:03:00.000Z', nodeIds: ['material-b'] });
  deleteNodesPermanently({ nodeIds: ['material-c'], nodeOrder: [] });
  const auditEvents: AgentControlAuditEvent[] = [];
  const { endpoint, server } = await startServer(auditEvents);
  try {
    const listResponse = await fetch(`${endpoint}/agent-control/v1/virtual-folders/list`, {
      body: JSON.stringify({}),
      headers: authHeaders(),
      method: 'POST'
    });
    expect(listResponse.status).toBe(200);
    expect(await responseJson(listResponse)).toMatchObject({
      count: 1,
      virtual_folders: [expect.objectContaining({ id: 'vf-1', item_count: 3, title: 'Guide' })]
    });

    const readResponse = await fetch(`${endpoint}/agent-control/v1/virtual-folders/read`, {
      body: JSON.stringify({ id: 'vf-1', limit: 2 }),
      headers: authHeaders(),
      method: 'POST'
    });
    expect(readResponse.status).toBe(200);
    expect(await responseJson(readResponse)).toMatchObject({
      folder: expect.objectContaining({ id: 'vf-1', item_count: 3 }),
      items: [
        {
          id: 'item-1',
          material: { id: 'material-a', kind: 'topic', title: 'Available', updated_at: '2026-07-05T00:02:00.000Z' },
          material_id: 'material-a',
          position: 10,
          status: 'available'
        },
        expect.objectContaining({ id: 'item-2', material_id: 'material-b', position: 20, status: 'deleted' })
      ],
      total_count: 3,
      truncated: true
    });
    expect(auditEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({ capability: 'virtualFolders.list', result: 'success' }),
      expect.objectContaining({ capability: 'virtualFolders.read', result: 'success', targetId: 'vf-1' })
    ]));
  } finally {
    await closeServer(server);
  }
});

it('keeps missing item placeholders after material hard deletion', async () => {
  insertNode({ id: 'material-c', title: 'Gone' });
  insertVirtualFolder();
  deleteNodesPermanently({ nodeIds: ['material-c'], nodeOrder: [] });
  const { endpoint, server } = await startServer();
  try {
    const response = await fetch(`${endpoint}/agent-control/v1/virtual-folders/read`, {
      body: JSON.stringify({ id: 'vf-1' }),
      headers: authHeaders(),
      method: 'POST'
    });

    expect(response.status).toBe(200);
    expect(await responseJson(response)).toMatchObject({
      items: expect.arrayContaining([
        { id: 'item-3', material: null, material_id: 'material-c', position: 30, status: 'missing' }
      ])
    });
  } finally {
    await closeServer(server);
  }
});

it('returns bounded errors for virtual folder read requests', async () => {
  const auditEvents: AgentControlAuditEvent[] = [];
  const { endpoint, server } = await startServer(auditEvents);
  try {
    const unauthorized = await fetch(`${endpoint}/agent-control/v1/virtual-folders/read`, { method: 'POST' });
    expect(unauthorized.status).toBe(401);

    const invalid = await fetch(`${endpoint}/agent-control/v1/virtual-folders/read`, {
      body: JSON.stringify({ id: '   ' }),
      headers: authHeaders(),
      method: 'POST'
    });
    expect(invalid.status).toBe(400);

    const missing = await fetch(`${endpoint}/agent-control/v1/virtual-folders/read`, {
      body: JSON.stringify({ id: 'missing' }),
      headers: authHeaders(),
      method: 'POST'
    });
    expect(missing.status).toBe(404);
    expect(await responseJson(missing)).toEqual({ error: 'not_found' });

    expect(auditEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({ capability: 'virtualFolders.read', errorCategory: 'unauthorized', result: 'auth_failed' }),
      expect.objectContaining({ capability: 'virtualFolders.read', errorCategory: 'invalid_request', result: 'failed' }),
      expect.objectContaining({
        capability: 'virtualFolders.read',
        errorCategory: 'not_found',
        result: 'failed',
        targetId: 'missing'
      })
    ]));
  } finally {
    await closeServer(server);
  }
});
