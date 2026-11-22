// @vitest-environment node
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-agent-control-write-scope-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import type { WorkspaceRefreshScope } from '../../lib/core/database/workspaceSnapshotRefresh.js';
import { closeDatabaseConnection } from '../database/connection.js';
import { closeExternalSearchCacheDatabase } from '../database/externalSearchCacheDatabase.js';
import { initializeDatabase } from '../database/migrate.js';
import { upsertNodeSnapshot } from '../database/nodeMutations.js';

import { closeAgentControlTestServer, startAgentControlTestServer } from './agentControlTestServer.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-agent-control-write-scope-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeExternalSearchCacheDatabase();
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

function insertUnrelated(count: number) {
  for (let index = 0; index < count; index += 1) {
    upsertNodeSnapshot({ anchorLink: null, content: 'Unrelated', createdAt: '2026-07-05T00:00:00.000Z',
      hideTitleHeading: false, imageRegions: null, isTitleManual: true, kind: 'topic', nodeId: `unrelated-${index}`,
      parentNodeId: null, position: null, reveal: null, title: `Unrelated ${index}`, updatedAt: '2026-07-05T00:00:00.000Z' });
  }
}

async function post(endpoint: string, route: string, body: Record<string, unknown>) {
  const response = await fetch(`${endpoint}/agent-control/v1/${route}`, {
    body: JSON.stringify(body),
    headers: { authorization: 'Bearer test-token', 'content-type': 'application/json' },
    method: 'POST'
  });
  expect(response.status).toBe(200);
  return JSON.parse(await response.text()) as Record<string, { id: string; updated_at: string } & Record<string, unknown>> & { folder_id: string };
}

async function scopesForAgentWrites(unrelated: number) {
  insertUnrelated(unrelated);
  const scopes: WorkspaceRefreshScope[] = [];
  const { endpoint, server } = await startAgentControlTestServer([], scope => { scopes.push(scope); });
  try {
    const folder = (await post(endpoint, 'materials/create', { kind: 'folder', parent_id: null, title: 'Folder' })).material;
    const topic = (await post(endpoint, 'materials/create', {
      content: 'Body', kind: 'topic', parent_id: folder.id, title: 'Topic' })).material;
    const updated = (await post(endpoint, 'materials/update', {
      content: 'New body', expected_updated_at: topic.updated_at, id: topic.id })).material;
    await post(endpoint, 'materials/delete-soft', { id: topic.id });
    const list = await post(endpoint, 'virtual-folders/create', { title: 'List' });
    const kept = (await post(endpoint, 'materials/create', {
      content: 'Body', kind: 'topic', parent_id: null, title: 'Kept' })).material;
    await post(endpoint, 'virtual-folders/add-items', { folder_id: list.folder_id, material_ids: [kept.id] });
    return { folder: folder.id as string, topic: topic.id as string, updated: updated.id as string,
      list: list.folder_id as string, kept: kept.id as string, scopes };
  } finally {
    await closeAgentControlTestServer(server);
  }
}

// WA-061: every Agent Control write used to send a whole-library refresh although its answer names the Nodes it changed.
it('names only the written Nodes, whatever the library size', async () => {
  for (const unrelated of [0, 40]) {
    const result = await scopesForAgentWrites(unrelated);
    expect(result.scopes.some(scope => scope.kind === 'full')).toBe(false);
    const named = result.scopes.map(scope => scope.kind === 'nodes' ? [...scope.nodeIds].sort() : []);
    expect(named.slice(0, 4)).toEqual([[result.folder], [result.folder, result.topic].sort(), [result.updated], [result.topic]]);
    expect(named.slice(4)).toEqual([[result.list], [result.kept], [result.list, result.kept].sort()]);
    expect(named.flat().some(id => id.startsWith('unrelated-'))).toBe(false);
    closeExternalSearchCacheDatabase();
    closeDatabaseConnection();
    await fs.rm(mockedAppDataDir, { force: true, recursive: true });
    initializeDatabase();
  }
});
