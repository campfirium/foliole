// @vitest-environment node
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-agent-control-virtual-folder-lifecycle-tests';
vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'), app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir, app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { closeDatabaseConnection } from '../database/connection.js';
import { closeExternalSearchCacheDatabase } from '../database/externalSearchCacheDatabase.js';
import { initializeDatabase } from '../database/migrate.js';

import { closeAgentControlTestServer, startAgentControlTestServer } from './agentControlTestServer.js';

let tempRoot = '';
beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-agent-virtual-lifecycle-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});
afterEach(async () => {
  closeExternalSearchCacheDatabase();
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

it('updates, soft deletes, and restores a virtual Folder with optimistic locks', async () => {
  const notify = vi.fn();
  const { endpoint, server } = await startAgentControlTestServer([], notify);
  try {
    const created = await postPayload(endpoint, 'virtual-folders/create', { title: 'List' });
    const folderId = String(created.folder_id);
    const createdAt = String((created.folder as Record<string, unknown>).updated_at);
    const updated = await postPayload(endpoint, 'virtual-folders/update', {
      description: 'Notes', expected_updated_at: createdAt, id: folderId, title: 'Renamed'
    });
    expect(updated).toMatchObject({ description: 'Notes', title: 'Renamed' });
    const deleted = await postPayload(endpoint, 'virtual-folders/delete-soft', {
      expected_updated_at: updated.updated_at, id: folderId
    });
    expect(deleted.deleted).toBe(true);
    const restored = await postPayload(endpoint, 'virtual-folders/restore', {
      expected_updated_at: deleted.deleted_at, id: folderId
    });
    expect(restored.restored).toBe(true);
    expect(notify).toHaveBeenCalledTimes(4);

    const stale = await post(endpoint, 'virtual-folders/update', {
      expected_updated_at: createdAt, id: folderId, title: 'Stale'
    });
    expect(stale.status).toBe(409);
  } finally {
    await closeAgentControlTestServer(server);
  }
});

async function postPayload(endpoint: string, route: string, body: Record<string, unknown>) {
  const response = await post(endpoint, route, body);
  expect(response.status).toBe(200);
  return JSON.parse(await response.text()) as Record<string, unknown>;
}

function post(endpoint: string, route: string, body: Record<string, unknown>) {
  return fetch(`${endpoint}/agent-control/v1/${route}`, {
    body: JSON.stringify(body),
    headers: { authorization: 'Bearer test-token', 'content-type': 'application/json' },
    method: 'POST'
  });
}
