// @vitest-environment node
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { runAgentCli } from '../../scripts/agent-control/foliole-agent.mjs';
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { closeExternalSearchCacheDatabase } from '../database/externalSearchCacheDatabase.js';
import { initializeDatabase } from '../database/migrate.js';
import { closeLibraries, root, startLibraries } from '../database/syncLibrary.testSupport.js';

import { closeAgentControlTestServer, startAgentControlTestServer } from './agentControlTestServer.js';
import type { AgentControlAuditEvent } from './agentControlTypes.js';

vi.mock('electron', () => ({ app: {}, nativeTheme: {} }));
vi.mock('../nativeAppearance.js', () => ({ applyNativeBaseColorMode: vi.fn() }));
vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(root, 'cache'), app_config_dir: path.join(root, 'config'),
    app_data_dir: path.join(root, 'desktop'), app_log_dir: path.join(root, 'logs')
  })
}));

const audit: AgentControlAuditEvent[] = [];
const notify = vi.fn();
let server: Awaited<ReturnType<typeof startAgentControlTestServer>>;

beforeEach(async () => {
  await startLibraries();
  initializeDatabase();
  audit.length = 0;
  notify.mockClear();
  server = await startAgentControlTestServer(audit, notify);
});

afterEach(async () => {
  await closeAgentControlTestServer(server.server);
  closeExternalSearchCacheDatabase();
  closeDatabaseConnection();
  await closeLibraries();
});

async function request(action: string, body: Record<string, unknown>, headers: Record<string, string> = {}) {
  const response = await fetch(`${server.endpoint}/agent-control/v1/materials/${action}`, {
    method: 'POST',
    headers: { authorization: 'Bearer test-token', 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body)
  });
  return { status: response.status, payload: await response.json() };
}

async function create(title: string, kind = 'topic', parent_id: string | null = null) {
  const result = await request('create', { kind, parent_id, title });
  expect(result.status).toBe(200);
  return result.payload.material.id as string;
}

async function trash(id: string) {
  expect((await request('delete-soft', { id })).status).toBe(200);
}

it('pages distinct trash roots and passes a root revision to restore over HTTP', async () => {
  const parent = await create('Active parent', 'folder');
  const folder = await create('Folder', 'folder', parent);
  const nested = await create('Nested folder', 'folder', folder);
  const first = await create('First leaf', 'topic', nested);
  const second = await create('Second leaf', 'topic', nested);
  const standalone = await create('Standalone leaf');
  await create('Active leaf');
  expect(await request('list-trash', { query: 'leaf' }))
    .toEqual({ status: 200, payload: { results: [], next_offset: null } });
  await trash(first);
  await trash(nested);
  await trash(folder);
  await trash(standalone);
  notify.mockClear();

  const pages = [];
  for (const offset of [0, 1]) {
    const page = await request('list-trash', { query: ' LEAF ', limit: 1, offset });
    expect(page.status).toBe(200);
    expect(page.payload.results).toHaveLength(1);
    expect(page.payload.next_offset).toBe(offset === 0 ? 1 : null);
    pages.push(page.payload.results[0]);
  }
  expect(pages.map(({ id }) => id).sort()).toEqual([folder, standalone].sort());
  expect(notify).not.toHaveBeenCalled();
  const rootResult = pages.find(({ id }) => id === folder);
  expect(rootResult).toMatchObject({ kind: 'folder', parent_id: parent, title: 'Folder' });
  expect(await request('restore', { id: rootResult.id, expected_updated_at: 'stale' })).toMatchObject({ status: 409 });
  expect(await request('restore', { id: rootResult.id, expected_updated_at: rootResult.updated_at }))
    .toMatchObject({ status: 200, payload: { restored_ids: expect.arrayContaining([folder, nested, first]) } });
  expect(await request('list-trash', { query: 'leaf' })).toMatchObject({
    status: 200, payload: { results: [expect.objectContaining({ id: standalone })], next_offset: null }
  });

  closeExternalSearchCacheDatabase();
  closeDatabaseConnection();
  const rows = openDatabaseConnection().driver.queryAll<{ id: string; deleted_at: string | null }>(
    'SELECT id, deleted_at FROM nodes WHERE id IN (?, ?, ?, ?)', [folder, nested, first, second]
  );
  expect(rows).toHaveLength(4);
  expect(rows.every(({ deleted_at }) => deleted_at === null)).toBe(true);
});

it('guards trash reads and validates pagination on the live HTTP and CLI routes', async () => {
  const id = await create('Private deleted title');
  await trash(id);
  expect(await request('list-trash', {}, { authorization: 'Bearer wrong' }))
    .toEqual({ status: 401, payload: { error: 'unauthorized' } });
  expect(await request('list-trash', {}, { origin: 'https://example.test' }))
    .toEqual({ status: 403, payload: { error: 'forbidden_origin' } });
  for (const body of [{ query: null }, { offset: -1 }, { offset: 0.5 }, { limit: 0 }, { limit: 101 }]) {
    expect(await request('list-trash', body)).toEqual({ status: 400, payload: { error: 'invalid_request' } });
  }
  expect(await request('list-trash', { offset: Number.MAX_SAFE_INTEGER }))
    .toEqual({ status: 200, payload: { results: [], next_offset: null } });

  const descriptor = path.join(root, 'session.json');
  const describeSession = (capabilities: string[]) => writeFile(descriptor, JSON.stringify({
    endpoint: server.endpoint, token: 'test-token', capabilities
  }));
  const list = ['materials', 'list-trash', '--descriptor', descriptor];
  await describeSession(['materials.restore']);
  expect(await runAgentCli(list)).toEqual({ status: 3, output: { error: 'capability_disabled' } });
  await describeSession(['materials.listTrash']);
  expect(await runAgentCli([...list, '--limit', '1', '--offset', '0']))
    .toMatchObject({ status: 0, output: { results: [{ id, title: 'Private deleted title' }], next_offset: null } });
  expect(audit).toContainEqual(expect.objectContaining({ capability: 'materials.listTrash', result: 'success' }));
  expect(JSON.stringify(audit)).not.toContain('Private deleted title');
});
