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

import { runAgentCli } from '../../scripts/agent-control/foliole-agent.mjs';
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

function authHeaders() {
  return {
    authorization: 'Bearer test-token',
    'content-type': 'application/json'
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
    const topLevel = await requestPage(endpoint, { limit: 30 });
    const nested = await requestPage(endpoint, { parent_id: 'special-virtual-root' });

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
    const response = await requestPage(endpoint, { parent_id: 'missing-parent' });

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

function requestPage(endpoint: string, body: Record<string, unknown>) {
  return fetch(`${endpoint}/agent-control/v1/materials/list-children`, {
    body: JSON.stringify(body), headers: authHeaders(), method: 'POST'
  });
}

it.each([undefined, 'parent'])('traverses more than 30 direct children via the CLI (parent %s)', async (parentId) => {
  if (parentId) insertNode({ id: parentId, title: 'Parent', content: '' });
  const ids = Array.from({ length: 60 }, (_, index) => `node-${String(index).padStart(2, '0')}`);
  for (const id of [...ids].reverse()) insertNode({ id, parentId: parentId ?? null, title: 'Same title', content: '' });

  const { endpoint, server } = await startServer([]);
  try {
    const descriptor = path.join(tempRoot, 'session.json');
    await fs.writeFile(descriptor, JSON.stringify({
      endpoint, token: 'test-token', capabilities: ['materials.listChildren']
    }));
    const args = ['materials/list-children', '--descriptor', descriptor];
    if (parentId) args.push('--parent-id', parentId);
    const legacy = await runAgentCli(args);
    expect(legacy.status).toBe(0);
    expect(legacy.output.children).toHaveLength(30);
    expect(legacy.output.children_truncated).toBe(true);
    expect(legacy.output).not.toHaveProperty('next_offset');

    const traversed = [];
    let offset: number | null = 0;
    for (let page = 0; page < 4 && offset !== null; page += 1) {
      const result = await runAgentCli([...args, '--offset', String(offset)]);
      expect(result.status).toBe(0);
      expect(result.output.child_count).toBe(legacy.output.child_count);
      expect(result.output.children_truncated).toBe(result.output.next_offset !== null);
      traversed.push(...result.output.children.map((item: { id: string }) => item.id));
      offset = result.output.next_offset;
    }
    expect(offset).toBeNull();
    expect(traversed).toHaveLength(legacy.output.child_count);
    expect(new Set(traversed).size).toBe(traversed.length);
    expect(traversed.filter((id) => id.startsWith('node-'))).toEqual(ids);
  } finally {
    await closeServer(server);
  }
});

it('uses live offsets and rejects invalid pagination requests', async () => {
  insertNode({ id: 'parent', title: 'Parent', content: '' });
  insertNode({ id: 'b', parentId: 'parent', title: 'B', content: '' });
  insertNode({ id: 'c', parentId: 'parent', title: 'C', content: '' });
  const { endpoint, server } = await startServer([]);
  const request = (offset: unknown, parent_id = 'parent') => requestPage(endpoint, { limit: 1, offset, parent_id });
  try {
    const first = await responseJson(await request(0));
    expect(first).toMatchObject({ children: [{ id: 'b' }], child_count: 2, next_offset: 1 });

    insertNode({ id: 'a', parentId: 'parent', title: 'A', content: '' });
    expect(await responseJson(await request(first.next_offset))).toMatchObject({
      children: [{ id: 'b' }], child_count: 3, next_offset: 2
    });
    expect(await responseJson(await request(2))).toMatchObject({ children: [{ id: 'c' }], next_offset: null });
    expect(await responseJson(await request(9007199254740991))).toMatchObject({
      children: [], child_count: 3, children_truncated: false, next_offset: null
    });
    for (const invalid of [-1, 1.5, '1', null, 9007199254740992]) {
      const response = await request(invalid);
      expect(response.status).toBe(400);
      expect(await responseJson(response)).toEqual({ error: 'invalid_request' });
    }
    expect((await request(0, 'missing')).status).toBe(404);
  } finally {
    await closeServer(server);
  }
});
