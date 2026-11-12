// @vitest-environment node
import { promises as fs } from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-agent-control-material-identity-read-tests';

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
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-agent-control-material-identity-read-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeExternalSearchCacheDatabase();
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

it('includes material identity fields on the material read payload itself', async () => {
  insertNode({ content: 'Virtual root body', id: 'special-virtual-root', title: 'Virtual' });
  insertNode({
    anchorKind: 'cloze',
    content: 'Derived cloze body',
    id: 'derived-cloze',
    parentId: 'special-virtual-root',
    title: 'Derived cloze'
  });
  const { endpoint, server } = await startServer();
  try {
    const response = await fetch(`${endpoint}/agent-control/v1/materials/read`, {
      body: JSON.stringify({ id: 'derived-cloze' }),
      headers: authHeaders(),
      method: 'POST'
    });

    const responseBody = await responseJson(response);
    expect(response.status, JSON.stringify(responseBody)).toBe(200);
    expect(responseBody).toMatchObject({
      material: {
        anchor_kind: 'cloze',
        id: 'derived-cloze',
        parent_id: 'special-virtual-root',
        special_kind: 'virtual'
      }
    });
  } finally {
    await closeServer(server);
  }
});

it('returns complete question and answer with their revision on explicit full reads', async () => {
  const content = '问题😀'.repeat(3000);
  const reveal = '答案🌱'.repeat(2000);
  const revision = '2026-07-05T00:00:00.000Z';
  upsertNodeSnapshot({
    anchorLink: null, content, createdAt: revision, isTitleManual: true, kind: 'item',
    nodeId: 'long-item', parentNodeId: null, position: null, reveal, title: 'Long Item', updatedAt: revision
  });
  const { endpoint, server } = await startServer();
  try {
    const read = (body: object) => fetch(`${endpoint}/agent-control/v1/materials/read`, {
      body: JSON.stringify({ id: 'long-item', ...body }), headers: authHeaders(), method: 'POST'
    });
    const full = await read({ content_mode: 'full' });
    expect(full.status).toBe(200);
    expect(await full.json()).toMatchObject({ material: {
      content, reveal, content_truncated: false, reveal_truncated: false, updated_at: revision
    } });
    expect(await (await read({})).json()).toMatchObject({ material: {
      content: content.slice(0, 4000), reveal: reveal.slice(0, 4000),
      content_truncated: true, reveal_truncated: true, updated_at: revision
    } });
    expect((await read({ content_mode: true })).status).toBe(400);
    const descriptor = path.join(tempRoot, 'agent-control-session.json');
    await fs.writeFile(descriptor, JSON.stringify({ endpoint, token: 'test-token', capabilities: ['materials.read'] }));
    const cli = await runAgentCli([
      'materials/read', '--descriptor', descriptor, '--id', 'long-item', '--content-mode', 'full'
    ]);
    expect(cli).toMatchObject({ status: 0, output: { material: { content, reveal, updated_at: revision } } });
  } finally {
    await closeServer(server);
  }
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
