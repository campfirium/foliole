// @vitest-environment node
import { promises as fs } from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-agent-control-materials-search-tests';

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
import { upsertNodeSnapshot } from '../database/nodeMutations.js';

import { createAgentControlHttpServer } from './agentControlServer.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-agent-control-materials-search-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeExternalSearchCacheDatabase();
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

function insertNode(input: {
  anchorKind?: 'cloze' | 'highlight';
  content: string;
  id: string;
  parentId?: string | null;
  title: string;
  updatedAt?: string;
}) {
  upsertNodeSnapshot({
    anchorLink: input.anchorKind ? { id: `${input.id}-anchor`, kind: input.anchorKind } : null,
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

async function startServer() {
  const server = createAgentControlHttpServer({
    appVersion: '0.1.0-test',
    auditSink: () => undefined,
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

function authHeaders() {
  return {
    authorization: 'Bearer test-token',
    'content-type': 'application/json',
    'x-foliole-agent-id': 'codex-local-test'
  };
}

it('searches materials with parent titles and applies agent limits', async () => {
  insertNode({ content: 'Container', id: 'special-virtual-root', title: 'Virtual' });
  insertNode({ anchorKind: 'highlight', content: 'Atlas content first', id: 'atlas-1', parentId: 'special-virtual-root', title: 'Atlas One', updatedAt: '2026-07-05T00:00:03.000Z' });
  insertNode({ content: 'Atlas content second', id: 'atlas-2', parentId: 'special-virtual-root', title: 'Atlas Two', updatedAt: '2026-07-05T00:00:02.000Z' });
  syncNodeSearchIndexForNodeIds(openDatabaseConnection().driver, ['atlas-1', 'atlas-2']);
  const { endpoint, server } = await startServer();
  try {
    const response = await fetch(`${endpoint}/agent-control/v1/materials/search`, {
      body: JSON.stringify({ limit: 1, query: 'Atlas' }),
      headers: authHeaders(),
      method: 'POST'
    });

    expect(response.status).toBe(200);
    expect(JSON.parse(await response.text())).toMatchObject({
      count: 1,
      limit: 1,
      query: 'Atlas',
      results: [
        expect.objectContaining({
          anchor_kind: 'highlight',
          id: 'atlas-1',
          kind: 'node',
          parent_titles: ['Virtual'],
          special_kind: 'virtual',
          source: { kind: 'node', readable_material_id: 'atlas-1' },
          title: 'Atlas One'
        })
      ]
    });
  } finally {
    await closeServer(server);
  }
});
