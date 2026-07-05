// @vitest-environment node
import { promises as fs } from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-agent-control-material-mutations-tests';

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
import { upsertNodeSnapshot } from '../database/nodeMutations.js';

import { AGENT_CONTROL_MATERIAL_WRITE_CONTENT_LIMIT } from './agentControlMaterialMutations.js';
import { createAgentControlHttpServer } from './agentControlServer.js';
import type { AgentControlAuditEvent } from './agentControlTypes.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-agent-control-material-mutations-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeExternalSearchCacheDatabase();
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

function insertNode(input: { content: string; id: string; title: string; updatedAt?: string }) {
  upsertNodeSnapshot({
    anchorLink: { id: 'anchor-1', kind: 'highlight', locator: { from: 0, originalText: 'old', to: 3 } },
    content: input.content,
    createdAt: '2026-07-05T00:00:00.000Z',
    desiredRetention: 0.9,
    enableShortTerm: true,
    hideTitleHeading: true,
    imageRegions: [{ attachmentId: 'attachment-1', regions: [{ height: 0.2, id: 'r1', width: 0.2, x: 0.1, y: 0.1 }] }],
    isTitleManual: true,
    kind: 'topic',
    nodeId: input.id,
    parentNodeId: null,
    position: 12,
    priority: 3,
    reveal: 'answer',
    sequentialReadingEnabled: false,
    shelvedAt: '2026-07-05T00:01:00.000Z',
    title: input.title,
    updatedAt: input.updatedAt ?? '2026-07-05T00:00:00.000Z',
    virtualFilter: { conditions: [{ field: 'text', operator: 'contains', value: 'atlas' }], match: 'all', version: 1 }
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
    server.close((error) => error ? reject(error) : resolve());
  });
}

async function post(endpoint: string, route: string, body: Record<string, unknown>) {
  return fetch(`${endpoint}/agent-control/v1/${route}`, {
    body: JSON.stringify(body),
    headers: {
      authorization: 'Bearer test-token',
      'content-type': 'application/json',
      'x-foliole-agent-id': 'codex-local-test'
    },
    method: 'POST'
  });
}

async function responseJson(response: Response) {
  return JSON.parse(await response.text()) as Record<string, unknown>;
}

function readNode(id: string) {
  return openDatabaseConnection().driver.queryOne<Record<string, unknown>>('SELECT * FROM nodes WHERE id = ?', [id]);
}

it('updates material title and content while preserving existing node fields', async () => {
  insertNode({ content: 'Old body', id: 'material-1', title: 'Old title' });
  const auditEvents: AgentControlAuditEvent[] = [];
  const { endpoint, server } = await startServer(auditEvents);
  try {
    const response = await post(endpoint, 'materials/update', {
      content: 'New body',
      expected_updated_at: '2026-07-05T00:00:00.000Z',
      id: 'material-1',
      title: 'New title'
    });

    expect(response.status).toBe(200);
    expect(await responseJson(response)).toMatchObject({
      material: { content: 'New body', deleted: false, id: 'material-1', title: 'New title' }
    });
    expect(readNode('material-1')).toMatchObject({
      anchor_link: expect.stringContaining('anchor-1'),
      content: 'New body',
      desired_retention: 0.9,
      image_regions: expect.stringContaining('attachment-1'),
      priority: 3,
      reveal: 'answer',
      shelved_at: '2026-07-05T00:01:00.000Z',
      sync_dirty: 1,
      title: 'New title',
      virtual_filter: expect.stringContaining('atlas')
    });
    expect(JSON.stringify(auditEvents)).not.toContain('New body');
  } finally {
    await closeServer(server);
  }
});

it('supports partial updates and empty content with optimistic locking', async () => {
  insertNode({ content: 'First body', id: 'material-2', title: 'First title' });
  const { endpoint, server } = await startServer();
  try {
    const titleOnly = await post(endpoint, 'materials/update', {
      expected_updated_at: '2026-07-05T00:00:00.000Z',
      id: 'material-2',
      title: 'Title only'
    });
    const titlePayload = await responseJson(titleOnly);
    const updatedAt = (titlePayload.material as { updated_at: string }).updated_at;

    const emptyContent = await post(endpoint, 'materials/update', {
      content: '',
      expected_updated_at: updatedAt,
      id: 'material-2'
    });

    expect(titleOnly.status).toBe(200);
    expect(emptyContent.status).toBe(200);
    expect(await responseJson(emptyContent)).toMatchObject({
      material: { content: '', id: 'material-2', title: 'Title only' }
    });
  } finally {
    await closeServer(server);
  }
});

it('rejects stale, empty-title, and oversized material updates without writing', async () => {
  insertNode({ content: 'Stable body', id: 'material-3', title: 'Stable title' });
  const { endpoint, server } = await startServer();
  try {
    const stale = await post(endpoint, 'materials/update', {
      content: 'Should not write',
      expected_updated_at: '2026-07-04T00:00:00.000Z',
      id: 'material-3'
    });
    const emptyTitle = await post(endpoint, 'materials/update', {
      expected_updated_at: '2026-07-05T00:00:00.000Z',
      id: 'material-3',
      title: '   '
    });
    const oversized = await post(endpoint, 'materials/update', {
      content: 'x'.repeat(AGENT_CONTROL_MATERIAL_WRITE_CONTENT_LIMIT + 1),
      expected_updated_at: '2026-07-05T00:00:00.000Z',
      id: 'material-3'
    });

    expect(stale.status).toBe(409);
    expect(emptyTitle.status).toBe(400);
    expect(oversized.status).toBe(400);
    expect(readNode('material-3')).toMatchObject({ content: 'Stable body', title: 'Stable title' });
  } finally {
    await closeServer(server);
  }
});

it('soft-deletes materials idempotently and leaves virtual-folder items visible as deleted', async () => {
  insertNode({ content: 'Queue body', id: 'material-4', title: 'Queue title' });
  const { endpoint, server } = await startServer();
  try {
    const folder = await responseJson(await post(endpoint, 'virtual-folders/create', { title: 'Queue' }));
    await post(endpoint, 'virtual-folders/add-items', {
      folder_id: folder.folder_id,
      material_ids: ['material-4']
    });

    const deleted = await post(endpoint, 'materials/delete-soft', {
      expected_updated_at: '2026-07-05T00:00:00.000Z',
      id: 'material-4'
    });
    const repeated = await post(endpoint, 'materials/delete-soft', { id: 'material-4' });
    const folderRead = await post(endpoint, 'virtual-folders/read', { id: folder.folder_id });

    expect(deleted.status).toBe(200);
    expect(await responseJson(deleted)).toMatchObject({ already_deleted: false, deleted: true, material_id: 'material-4' });
    expect(await responseJson(repeated)).toMatchObject({ already_deleted: true, deleted: true, material_id: 'material-4' });
    expect(await responseJson(folderRead)).toMatchObject({
      items: [expect.objectContaining({ material: expect.objectContaining({ id: 'material-4' }), status: 'deleted' })]
    });
  } finally {
    await closeServer(server);
  }
});

it('rejects soft-delete expected_updated_at mismatches without tombstoning', async () => {
  insertNode({ content: 'Keep body', id: 'material-5', title: 'Keep title' });
  const { endpoint, server } = await startServer();
  try {
    const response = await post(endpoint, 'materials/delete-soft', {
      expected_updated_at: '2026-07-04T00:00:00.000Z',
      id: 'material-5'
    });

    expect(response.status).toBe(409);
    expect(readNode('material-5')).toMatchObject({ deleted_at: null });
  } finally {
    await closeServer(server);
  }
});
