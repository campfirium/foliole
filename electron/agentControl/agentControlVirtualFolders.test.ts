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

import { createManualVirtualNodeFilter } from '../../lib/core/nodes/virtualNodeFilter.js';
import { closeDatabaseConnection } from '../database/connection.js';
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

function insertVirtualFolder(manualChildOrder = ['material-c', 'material-a', 'material-b']) {
  upsertNodeSnapshot({
    anchorLink: null,
    content: '',
    createdAt: '2026-07-05T00:00:00.000Z',
    hideTitleHeading: false,
    imageRegions: null,
    isTitleManual: true,
    kind: 'folder',
    manualChildOrder,
    nodeId: 'vf-1',
    parentNodeId: 'special-virtual-root',
    position: null,
    reveal: null,
    title: 'Guide',
    updatedAt: '2026-07-05T00:01:00.000Z',
    virtualFilter: createManualVirtualNodeFilter()
  });
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
  insertNode({ id: 'material-b', title: 'Second' });
  insertNode({ id: 'material-c', title: 'First' });
  insertVirtualFolder();
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
          id: 'material-c',
          material: { id: 'material-c', kind: 'topic', title: 'First', updated_at: '2026-07-05T00:00:00.000Z' },
          material_id: 'material-c',
          position: 10,
          status: 'available'
        },
        expect.objectContaining({ id: 'material-a', material_id: 'material-a', position: 20, status: 'available' })
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

it('derives membership only from active Topics in the stored manual order', async () => {
  insertNode({ id: 'material-a', title: 'Deleted' });
  insertNode({ id: 'material-b', title: 'Other' });
  insertNode({ id: 'material-c', title: 'Gone' });
  insertVirtualFolder(['material-a', 'material-c']);
  softDeleteNodes({ deletedAt: '2026-07-05T00:03:00.000Z', nodeIds: ['material-a'] });
  deleteNodesPermanently({ nodeIds: ['material-c'], nodeOrder: [] });
  const { endpoint, server } = await startServer();
  try {
    const response = await fetch(`${endpoint}/agent-control/v1/virtual-folders/read`, {
      body: JSON.stringify({ id: 'vf-1' }),
      headers: authHeaders(),
      method: 'POST'
    });

    expect(response.status).toBe(200);
    expect(await responseJson(response)).toMatchObject({ items: [], total_count: 0, truncated: false });
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
