// @vitest-environment node
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-agent-control-material-structure-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'), app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir, app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { closeExternalSearchCacheDatabase } from '../database/externalSearchCacheDatabase.js';
import { initializeDatabase } from '../database/migrate.js';

import { closeAgentControlTestServer, startAgentControlTestServer } from './agentControlTestServer.js';
import type { AgentControlAuditEvent } from './agentControlTypes.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-agent-material-structure-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeExternalSearchCacheDatabase();
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

it('creates, moves, reorders, deletes, and restores materials through complete API contracts', async () => {
  const auditEvents: AgentControlAuditEvent[] = [];
  const notify = vi.fn();
  const { endpoint, server } = await startAgentControlTestServer(auditEvents, notify);
  try {
    const folder = await create(endpoint, { kind: 'folder', parent_id: null, title: 'Folder' });
    const folderId = materialId(folder);
    const topic = await create(endpoint, { content: 'Body', kind: 'topic', parent_id: folderId, title: 'Topic' });
    const topicId = materialId(topic);
    const topicUpdatedAt = materialUpdatedAt(topic);
    const second = await create(endpoint, { kind: 'topic', parent_id: folderId, title: 'Second' });
    const secondId = materialId(second);

    const reordered = await postJson(endpoint, 'materials/reorder', {
      material_ids: [secondId, topicId], parent_id: folderId
    });
    expect(reordered.status).toBe(200);
    expect(readOrder().filter((id) => [folderId, secondId, topicId].includes(id))).toEqual([
      folderId, secondId, topicId
    ]);

    const moved = await postJson(endpoint, 'materials/move', {
      expected_updated_at: topicUpdatedAt, id: topicId, parent_id: null
    });
    expect(moved.status).toBe(200);

    const movedPayload = await responseJson(moved);
    const deleted = await postJson(endpoint, 'materials/delete-soft', {
      expected_updated_at: materialUpdatedAt(movedPayload), id: topicId
    });
    expect(deleted.status).toBe(200);
    const deletedPayload = await responseJson(deleted);

    const restored = await postJson(endpoint, 'materials/restore', {
      expected_updated_at: deletedPayload.deleted_at, id: topicId
    });
    expect(restored.status).toBe(200);
    expect(readNode(topicId)).toMatchObject({ deleted_at: null, parent_id: null });
    expect(notify).toHaveBeenCalledTimes(7);
    expect(auditEvents.map((event) => event.capability)).toEqual(expect.arrayContaining([
      'materials.create', 'materials.move', 'materials.reorder', 'materials.restore'
    ]));
  } finally {
    await closeAgentControlTestServer(server);
  }
});

it('rejects a non-folder parent and stale move timestamp', async () => {
  const { endpoint, server } = await startAgentControlTestServer();
  try {
    const topic = await create(endpoint, { kind: 'topic', parent_id: null, title: 'Topic' });
    const topicId = materialId(topic);
    const invalid = await postJson(endpoint, 'materials/create', {
      kind: 'topic', parent_id: topicId, title: 'Child'
    });
    expect(invalid.status).toBe(400);
    const conflict = await postJson(endpoint, 'materials/move', {
      expected_updated_at: 'stale', id: topicId, parent_id: null
    });
    expect(conflict.status).toBe(409);
  } finally {
    await closeAgentControlTestServer(server);
  }
});

async function create(endpoint: string, body: Record<string, unknown>) {
  const response = await postJson(endpoint, 'materials/create', body);
  expect(response.status).toBe(200);
  return responseJson(response);
}

function postJson(endpoint: string, route: string, body: Record<string, unknown>) {
  return fetch(`${endpoint}/agent-control/v1/${route}`, {
    body: JSON.stringify(body),
    headers: { authorization: 'Bearer test-token', 'content-type': 'application/json' },
    method: 'POST'
  });
}

async function responseJson(response: Response) {
  return JSON.parse(await response.text()) as Record<string, unknown>;
}

function materialId(payload: Record<string, unknown>) {
  return String(readMaterial(payload).id);
}

function materialUpdatedAt(payload: Record<string, unknown>) {
  return String(readMaterial(payload).updated_at);
}

function readMaterial(payload: Record<string, unknown>) {
  if (!payload.material || typeof payload.material !== 'object') throw new Error('missing material');
  return payload.material as Record<string, unknown>;
}

function readOrder() {
  return openDatabaseConnection().driver.queryAll<{ node_id: string }>(
    'SELECT node_id FROM node_order ORDER BY position ASC'
  ).map((row) => row.node_id);
}

function readNode(id: string) {
  return openDatabaseConnection().driver.queryOne<Record<string, unknown>>(
    'SELECT parent_id, deleted_at FROM nodes WHERE id = ?', [id]
  );
}
