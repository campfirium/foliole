// @vitest-environment node
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { AGENT_CONTROL_LEARNING_IMPORT_KEY } from '../../lib/platform/agentControlLearningImport.js';
import { runAgentCli } from '../../scripts/agent-control/foliole-agent.mjs';
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { closeExternalSearchCacheDatabase } from '../database/externalSearchCacheDatabase.js';
import { initializeDatabase } from '../database/migrate.js';
import { closeLibraries, root, startLibraries } from '../database/syncLibrary.testSupport.js';
import { saveAppSettingsState } from '../ipc/storage.js';

import { closeAgentControlTestServer, startAgentControlTestServer } from './agentControlTestServer.js';

vi.mock('electron', () => ({ app: {}, nativeTheme: {} }));
vi.mock('../nativeAppearance.js', () => ({ applyNativeBaseColorMode: vi.fn() }));
vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(root, 'cache'), app_config_dir: path.join(root, 'config'),
    app_data_dir: path.join(root, 'desktop'), app_log_dir: path.join(root, 'logs')
  })
}));

const notify = vi.fn();
const title = 'Create retry integration';
const topic = { kind: 'topic', parent_id: null, title };
let server: Awaited<ReturnType<typeof startAgentControlTestServer>>;

beforeEach(async () => {
  await startLibraries();
  initializeDatabase();
  notify.mockClear();
  server = await startAgentControlTestServer([], notify);
});

afterEach(async () => {
  await closeAgentControlTestServer(server.server);
  closeExternalSearchCacheDatabase();
  closeDatabaseConnection();
  await closeLibraries();
});

async function create(input: Record<string, unknown>, token = 'test-token') {
  const response = await fetch(`${server.endpoint}/agent-control/v1/materials/create`, {
    method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(input)
  });
  return { status: response.status, payload: await response.json() };
}

function topicIds() {
  return openDatabaseConnection().driver.queryAll<{ id: string }>('SELECT id FROM nodes WHERE title = ?', [title])
    .map(({ id }) => id);
}

it('coalesces concurrent HTTP creates and recovers the original ID via CLI after reopening the library', async () => {
  const requestId = 'test.topic:1';
  const firstBody = { ...topic, title: ` ${title} `, request_id: requestId };
  const retryBody = { request_id: requestId, ...topic, content: '' };
  expect(topicIds()).toEqual([]);
  const [first, retry] = await Promise.all([create(firstBody), create(retryBody)]);
  expect(first.status).toBe(200);
  expect(retry).toEqual(first);
  const id = first.payload.material.id;
  expect(topicIds()).toEqual([id]);
  expect(notify).toHaveBeenCalledTimes(1);

  await closeAgentControlTestServer(server.server);
  closeExternalSearchCacheDatabase();
  closeDatabaseConnection();
  server = await startAgentControlTestServer([], notify);
  const descriptor = path.join(root, 'agent-control-session.json');
  await writeFile(descriptor, JSON.stringify({
    endpoint: server.endpoint, token: 'test-token', capabilities: ['materials.create']
  }));
  const args = ['materials/create', '--descriptor', descriptor, '--kind', 'topic', '--title', title,
    '--request-id', requestId];
  expect(await runAgentCli(args)).toMatchObject({ status: 0, output: { material: { id } } });
  expect(await runAgentCli([...args, '--content', 'Different body']))
    .toEqual({ status: 1, output: { error: 'request_id_conflict' } });
  expect(topicIds()).toEqual([id]);
  expect(notify).toHaveBeenCalledTimes(1);
});

it('rolls back the material if the receipt write fails and lets the same request succeed later', async () => {
  const { sqlite } = openDatabaseConnection();
  sqlite.exec(`CREATE TEMP TRIGGER fail_create_receipt BEFORE INSERT ON workspace_meta
    WHEN NEW.key GLOB 'agent_control:materials.create:*' BEGIN SELECT RAISE(ABORT, 'receipt failure'); END`);
  const body = { ...topic, request_id: 'rollback-test' };
  expect(await create(body)).toEqual({ status: 500, payload: { error: 'internal_error' } });
  expect(topicIds()).toEqual([]);
  expect(notify).not.toHaveBeenCalled();
  sqlite.exec('DROP TRIGGER fail_create_receipt');
  const created = await create(body);
  expect(created.status).toBe(200);
  expect(await create(body)).toEqual(created);
  expect(topicIds()).toEqual([created.payload.material.id]);
});

it('enforces authorization on replay and preserves unkeyed creation', async () => {
  const requestId = 'scheduled-item';
  const body = { kind: 'item', parent_id: null, content: 'Question', reveal: 'Answer', request_id: requestId,
    review_schedule: { due: '2026-10-02T08:00:00+08:00', priority: 3 } };
  expect((await create(body)).status).toBe(403);
  await saveAppSettingsState({ [AGENT_CONTROL_LEARNING_IMPORT_KEY]: 'true' });
  const first = await create(body);
  expect(first.status).toBe(200);
  expect(await create({ ...body, parent_id: 'special-inbox',
    review_schedule: { priority: 3, due: '2026-10-02T00:00:00Z' } })).toEqual(first);
  expect((await create(body, 'wrong-token')).status).toBe(401);
  await saveAppSettingsState({ [AGENT_CONTROL_LEARNING_IMPORT_KEY]: 'false' });
  expect((await create(body)).status).toBe(403);
  expect((await create({ ...topic, request_id: '' })).status).toBe(400);
  expect(topicIds()).toEqual([]);
  expect((await create(topic)).status).toBe(200);
  expect((await create(topic)).status).toBe(200);
  expect(topicIds()).toHaveLength(2);
  expect(notify).toHaveBeenCalledTimes(3);
});
