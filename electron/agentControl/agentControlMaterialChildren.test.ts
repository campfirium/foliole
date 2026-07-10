// @vitest-environment node
import { promises as fs } from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-agent-control-material-children-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { closeDatabaseConnection } from '../database/connection.js';
import { closeExternalSearchCacheDatabase } from '../database/externalSearchCacheDatabase.js';
import { initializeDatabase } from '../database/migrate.js';
import { upsertNodeSnapshot } from '../database/nodeMutations.js';

import { createAgentControlHttpServer } from './agentControlServer.js';
import type { AgentControlAuditEvent } from './agentControlTypes.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-agent-control-material-children-'));
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
    updatedAt: '2026-07-05T00:00:00.000Z'
  });
}

async function startServer(auditEvents: AgentControlAuditEvent[]) {
  const server = createAgentControlHttpServer({
    appVersion: '0.1.0-test',
    auditSink: (event) => {
      auditEvents.push(event);
    },
    token: 'test-token'
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve();
    });
  });
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

function authHeaders() {
  return {
    authorization: 'Bearer test-token',
    'content-type': 'application/json',
    'x-foliole-agent-id': 'codex-local-test'
  };
}

async function responseJson(response: Response) {
  return JSON.parse(await response.text()) as Record<string, unknown>;
}

it('lists workspace top-level materials and direct material children', async () => {
  insertNode({ content: 'Root A body', id: 'root-a', title: 'Root A' });
  insertNode({ content: 'Virtual root body', id: 'special-virtual-root', title: 'Virtual' });
  insertNode({ content: 'Root B body', id: 'root-b', title: 'Root B' });
  insertNode({ anchorKind: 'cloze', content: 'Child body alpha', id: 'child-a', parentId: 'special-virtual-root', title: 'Child A' });
  const auditEvents: AgentControlAuditEvent[] = [];
  const { endpoint, server } = await startServer(auditEvents);
  try {
    const topLevel = await fetch(`${endpoint}/agent-control/v1/materials/list-children`, {
      body: JSON.stringify({ limit: 30 }),
      headers: authHeaders(),
      method: 'POST'
    });
    const nested = await fetch(`${endpoint}/agent-control/v1/materials/list-children`, {
      body: JSON.stringify({ parent_id: 'special-virtual-root' }),
      headers: authHeaders(),
      method: 'POST'
    });

    expect(topLevel.status).toBe(200);
    const topLevelPayload = await responseJson(topLevel);
    expect(topLevelPayload.child_count).toBeGreaterThanOrEqual(2);
    expect(topLevelPayload).toMatchObject({
      children: expect.arrayContaining([
        expect.objectContaining({ id: 'root-a', title: 'Root A' }),
        expect.objectContaining({ id: 'special-virtual-root', special_kind: 'virtual-root', title: 'Virtual' }),
        expect.objectContaining({ id: 'root-b', title: 'Root B' })
      ]),
      children_truncated: false,
      limit: 30,
      parent: null,
      parent_id: null
    });
    expect(nested.status).toBe(200);
    expect(await responseJson(nested)).toMatchObject({
      child_count: 1,
      children: [expect.objectContaining({ anchor_kind: 'cloze', content_preview: 'Child body alpha', id: 'child-a', special_kind: 'virtual' })],
      children_truncated: false,
      limit: 30,
      parent: expect.objectContaining({
        id: 'special-virtual-root',
        kind: 'folder',
        parent_titles: [],
        parents: [],
        special_kind: 'virtual-root',
        title: 'Virtual'
      }),
      parent_id: 'special-virtual-root'
    });
    expect(auditEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({ capability: 'materials.listChildren', result: 'success' }),
      expect.objectContaining({ capability: 'materials.listChildren', result: 'success', targetId: 'special-virtual-root' })
    ]));
  } finally {
    await closeServer(server);
  }
});

it('returns not_found when listing children for a missing parent material', async () => {
  const auditEvents: AgentControlAuditEvent[] = [];
  const { endpoint, server } = await startServer(auditEvents);
  try {
    const response = await fetch(`${endpoint}/agent-control/v1/materials/list-children`, {
      body: JSON.stringify({ parent_id: 'missing-parent' }),
      headers: authHeaders(),
      method: 'POST'
    });

    expect(response.status).toBe(404);
    expect(await responseJson(response)).toEqual({ error: 'not_found' });
    expect(auditEvents).toContainEqual(expect.objectContaining({
      capability: 'materials.listChildren',
      errorCategory: 'not_found',
      result: 'failed',
      targetId: 'missing-parent'
    }));
  } finally {
    await closeServer(server);
  }
});
