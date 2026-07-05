// @vitest-environment node
import { promises as fs } from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-agent-control-materials-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { syncNodeSearchIndexForNodeIds } from '../../lib/core/database/workspaceSearchIndex.js';
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { closeExternalSearchCacheDatabase } from '../database/externalSearchCacheDatabase.js';
import { initializeDatabase } from '../database/migrate.js';
import { softDeleteNodes, upsertNodeSnapshot } from '../database/nodeMutations.js';

import { AGENT_CONTROL_MATERIAL_CONTENT_LIMIT } from './agentControlMaterials.js';
import { createAgentControlHttpServer } from './agentControlServer.js';
import type { AgentControlAuditEvent } from './agentControlTypes.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-agent-control-materials-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeExternalSearchCacheDatabase();
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

function insertNode(input: { content: string; id: string; parentId?: string | null; title: string; updatedAt?: string }) {
  upsertNodeSnapshot({
    anchorLink: null,
    content: input.content,
    createdAt: '2026-07-05T00:00:00.000Z',
    hideTitleHeading: false,
    imageRegions: null,
    isTitleManual: true,
    kind: 'topic',
    nodeId: input.id,
    parentNodeId: input.parentId ?? null,
    position: null,
    reveal: null,
    title: input.title,
    updatedAt: input.updatedAt ?? '2026-07-05T00:00:00.000Z'
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
  const port = (server.address() as AddressInfo).port;
  return {
    endpoint: `http://127.0.0.1:${port}`,
    server
  };
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

it('reads a bounded material payload by explicit id', async () => {
  insertNode({ content: 'Root body', id: 'root', title: 'Root' });
  insertNode({
    content: 'x'.repeat(AGENT_CONTROL_MATERIAL_CONTENT_LIMIT + 1),
    id: 'child',
    parentId: 'root',
    title: 'Child',
    updatedAt: '2026-07-05T00:00:03.000Z'
  });
  const auditEvents: AgentControlAuditEvent[] = [];
  const { endpoint, server } = await startServer(auditEvents);
  try {
    const response = await fetch(`${endpoint}/agent-control/v1/materials/read`, {
      body: JSON.stringify({ id: 'child' }),
      headers: authHeaders(),
      method: 'POST'
    });

    expect(response.status).toBe(200);
    expect(await responseJson(response)).toEqual({
      material: {
        content: 'x'.repeat(AGENT_CONTROL_MATERIAL_CONTENT_LIMIT),
        content_char_count: AGENT_CONTROL_MATERIAL_CONTENT_LIMIT + 1,
        content_truncated: true,
        deleted: false,
        id: 'child',
        kind: 'topic',
        parent_titles: ['Root'],
        title: 'Child',
        updated_at: '2026-07-05T00:00:03.000Z'
      }
    });
    expect(JSON.stringify(auditEvents)).not.toContain('x'.repeat(20));
    expect(auditEvents).toContainEqual(expect.objectContaining({
      callerId: 'codex-local-test',
      capability: 'materials.read',
      result: 'success',
      targetId: 'child'
    }));
  } finally {
    await closeServer(server);
  }
});

it('reports ancestor soft deletion in read payloads', async () => {
  insertNode({ content: 'Root body', id: 'root', title: 'Root' });
  insertNode({ content: 'Child body', id: 'child', parentId: 'root', title: 'Child' });
  softDeleteNodes({ deletedAt: '2026-07-05T00:01:00.000Z', nodeIds: ['root'] });
  const { endpoint, server } = await startServer();
  try {
    const response = await fetch(`${endpoint}/agent-control/v1/materials/read`, {
      body: JSON.stringify({ id: 'child' }),
      headers: authHeaders(),
      method: 'POST'
    });

    expect(response.status).toBe(200);
    expect(await responseJson(response)).toMatchObject({
      material: {
        deleted: true,
        id: 'child',
        parent_titles: ['Root']
      }
    });
  } finally {
    await closeServer(server);
  }
});

it('searches materials through existing workspace search and applies agent limits', async () => {
  insertNode({ content: 'Atlas content first', id: 'atlas-1', title: 'Atlas One', updatedAt: '2026-07-05T00:00:03.000Z' });
  insertNode({ content: 'Atlas content second', id: 'atlas-2', title: 'Atlas Two', updatedAt: '2026-07-05T00:00:02.000Z' });
  syncNodeSearchIndexForNodeIds(openDatabaseConnection().driver, ['atlas-1', 'atlas-2']);
  const { endpoint, server } = await startServer();
  try {
    const response = await fetch(`${endpoint}/agent-control/v1/materials/search`, {
      body: JSON.stringify({ limit: 1, query: 'Atlas' }),
      headers: authHeaders(),
      method: 'POST'
    });

    expect(response.status).toBe(200);
    expect(await responseJson(response)).toMatchObject({
      count: 1,
      limit: 1,
      query: 'Atlas',
      results: [
        expect.objectContaining({
          id: 'atlas-1',
          kind: 'node',
          source: { kind: 'node' },
          title: 'Atlas One'
        })
      ]
    });
  } finally {
    await closeServer(server);
  }
});
