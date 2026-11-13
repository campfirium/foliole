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
vi.mock('../mirror/mirrorSyncScheduler.js', () => ({ scheduleMirrorSync: vi.fn() }));
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

const PASSAGE = 'Repeated 🌱 passage';
const CONTENT = `${PASSAGE} first.\n\n  ${PASSAGE} again.`;
const ACTION = 'create-text-excerpt';
const CAPABILITY = 'materials.createTextExcerpt';

async function createSource(content = CONTENT) {
  const result = await request('create', { content, kind: 'topic', parent_id: null, title: 'Excerpt source' });
  expect(result.status).toBe(200);
  const { id } = result.payload.material;
  const { payload } = await request('read', { id, content_mode: 'full' });
  const from = content.lastIndexOf(PASSAGE);
  return { source_id: id as string, expected_updated_at: payload.material.updated_at as string, from, to: from + PASSAGE.length };
}

it('creates a versioned child at the selected occurrence and reads its source after reopening SQLite', async () => {
  const input = await createSource();
  notify.mockClear();
  const created = await request(ACTION, { ...input, from: input.from - 2, to: input.to + 1 });
  expect(created).toMatchObject({ status: 200, payload: { material: {
    anchor_kind: 'highlight', content: PASSAGE, kind: 'topic', parent_id: input.source_id, title: PASSAGE
  } } });
  expect(notify).toHaveBeenCalledTimes(1);
  const id = created.payload.material.id as string;
  closeExternalSearchCacheDatabase();
  closeDatabaseConnection();

  expect(await request('read', { id, include_relations: true, content_mode: 'full' })).toMatchObject({
    status: 200, payload: {
      material: { id, content: PASSAGE, relations: { source: {
        material_id: input.source_id, anchor_kind: 'highlight',
        locator: { from: input.from, to: input.to, originalText: PASSAGE }
      } } }
    }
  });
  expect(await request('read', { id: input.source_id, content_mode: 'full' })).toMatchObject({
    payload: { material: { content: CONTENT, updated_at: input.expected_updated_at, children: [{ id }] } }
  });
  expect(openDatabaseConnection().driver.queryOne(
    `SELECT version.version_id FROM nodes AS node JOIN node_sync_versions AS version
       ON version.version_id = node.current_version_id WHERE node.id = ?`, [id]
  )).toMatchObject({ version_id: expect.any(String) });
  expect(audit).toContainEqual(expect.objectContaining({ capability: CAPABILITY, result: 'success', targetId: input.source_id }));
  expect(JSON.stringify(audit)).not.toContain(PASSAGE);
});

it('rejects stale, missing, unauthorized and invalid selections without writing children or versions', async () => {
  const content = `---\nsource: hidden\n---\n\n${CONTENT}\n\n![photo](photo.png)`;
  const input = await createSource(content);
  notify.mockClear();
  const before = persistedCounts();
  const emoji = content.lastIndexOf('🌱');
  const image = content.indexOf('![photo]');
  for (const change of [
    { from: -1 }, { from: 1.5 }, { to: input.from }, { to: content.length + 1 },
    { from: input.from - 2, to: input.from }, { from: emoji + 1 }, { to: emoji + 1 },
    { from: image + 2, to: image + 7 }, { from: 4, to: 10 }
  ]) {
    expect(await request(ACTION, { ...input, ...change })).toEqual({ status: 400, payload: { error: 'invalid_request' } });
  }
  expect(await request(ACTION, { ...input, source_id: 'missing' })).toMatchObject({ status: 404 });
  expect(await request(ACTION, input, { authorization: 'Bearer wrong' })).toMatchObject({ status: 401 });
  expect(await request(ACTION, input, { origin: 'https://example.test' })).toMatchObject({ status: 403 });
  expect(persistedCounts()).toEqual(before);
  expect(notify).not.toHaveBeenCalled();

  expect(await request('update', { id: input.source_id, expected_updated_at: input.expected_updated_at,
    content: `New version: ${content}` })).toMatchObject({ status: 200 });
  notify.mockClear();
  const edited = persistedCounts();
  expect(await request(ACTION, input)).toEqual({ status: 409, payload: { error: 'conflict' } });
  expect(persistedCounts()).toEqual(edited);
  expect(notify).not.toHaveBeenCalled();
});

function persistedCounts() {
  return openDatabaseConnection().driver.queryOne(
    'SELECT (SELECT count(*) FROM nodes) AS nodes, (SELECT count(*) FROM node_sync_versions) AS versions'
  );
}

it('uses the CLI capability and numeric offsets, and rolls back if version creation fails', async () => {
  const input = await createSource();
  const descriptor = path.join(root, 'session.json');
  const writeDescriptor = (capabilities: string[]) => writeFile(descriptor, JSON.stringify({
    endpoint: server.endpoint, token: 'test-token', capabilities
  }));
  const args = ['materials', ACTION, '--descriptor', descriptor, '--source-id', input.source_id,
    '--expected-updated-at', input.expected_updated_at, '--from', '0', '--to', String(PASSAGE.length)];
  await writeDescriptor(['materials.create']);
  expect(await runAgentCli(args)).toEqual({ status: 3, output: { error: 'capability_disabled' } });
  await writeDescriptor([CAPABILITY]);

  const { driver } = openDatabaseConnection();
  const before = persistedCounts();
  notify.mockClear();
  driver.execute(`CREATE TEMP TRIGGER reject_excerpt_version BEFORE INSERT ON node_sync_versions
    BEGIN SELECT RAISE(ABORT, 'test version write failure'); END`);
  try {
    expect(await request(ACTION, input)).toMatchObject({ status: 500 });
    expect(persistedCounts()).toEqual(before);
    expect(notify).not.toHaveBeenCalled();
  } finally {
    driver.execute('DROP TRIGGER reject_excerpt_version');
  }
  expect(await runAgentCli(args)).toMatchObject({ status: 0, output: { material: {
    content: PASSAGE, parent_id: input.source_id, anchor_kind: 'highlight'
  } } });
});
