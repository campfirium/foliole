// @vitest-environment node
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-agent-control-item-tests';

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
import { loadWorkspaceSnapshot } from '../database/workspaceSnapshot.js';

import { closeAgentControlTestServer, startAgentControlTestServer } from './agentControlTestServer.js';

let tempRoot = '';

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 7, 31, 12));
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-agent-item-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  vi.useRealTimers();
  closeExternalSearchCacheDatabase();
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

it('keeps a question-answer Item intact through the complete materials lifecycle', async () => {
  const { endpoint, server } = await startAgentControlTestServer();
  try {
    const folder = readMaterial(await postOk(endpoint, 'materials/create', {
      kind: 'folder', parent_id: null, title: 'Review Folder'
    }));
    const topic = readMaterial(await postOk(endpoint, 'materials/create', {
      content: 'Topic body', kind: 'topic', parent_id: folder.id, title: 'Review Topic'
    }));
    let item = readMaterial(await postOk(endpoint, 'materials/create', {
      content: '# What is retrieval practice?\n\nExplain briefly.',
      kind: 'item', parent_id: null, reveal: 'Actively recalling an answer.'
    }));

    expect(item).toMatchObject({
      content: '# What is retrieval practice?\n\nExplain briefly.',
      kind: 'item', parent_id: 'special-inbox', reveal: 'Actively recalling an answer.',
      reveal_char_count: 29, reveal_truncated: false, title: 'What is retrieval practice?'
    });
    expect(readStoredItem(String(item.id))).toMatchObject({
      difficulty: 0, elapsed_days: 0, is_title_manual: 0, kind: 'item', lapses: 0,
      parent_id: 'special-inbox', reps: 0, reveal: 'Actively recalling an answer.',
      scheduled_days: 0, stability: 0, state: 0
    });

    item = await verifyItemUpdateSemantics(endpoint, item);
    await verifyItemMovementAndPersistence(endpoint, item, String(folder.id), String(topic.id));
  } finally {
    await closeAgentControlTestServer(server);
  }
});

async function verifyItemUpdateSemantics(endpoint: string, initial: Record<string, unknown>) {
  let item = await update(endpoint, initial, { content: 'Why does retrieval practice work?' });
  expect(item).toMatchObject({ title: 'Why does retrieval practice work?' });
  item = await update(endpoint, item, { reveal: 'x'.repeat(4_000) });
  expect(item).toMatchObject({ reveal: 'x'.repeat(4_000), reveal_char_count: 4_000, reveal_truncated: false });
  const oversized = await post(endpoint, 'materials/update', {
    expected_updated_at: item.updated_at, id: item.id, reveal: 'x'.repeat(4_001)
  });
  expect(oversized.status).toBe(400);
  expect(readStoredItem(String(item.id))?.reveal).toBe('x'.repeat(4_000));
  item = await update(endpoint, item, { title: 'Manual review title' });
  item = await update(endpoint, item, { content: 'A changed question', reveal: 'A changed answer' });
  expect(item).toMatchObject({ content: 'A changed question', reveal: 'A changed answer', title: 'Manual review title' });
  expect(readStoredItem(String(item.id))?.is_title_manual).toBe(1);
  return item;
}

async function verifyItemMovementAndPersistence(
  endpoint: string,
  initial: Record<string, unknown>,
  folderId: string,
  topicId: string
) {
  let item = await move(endpoint, initial, folderId);
  item = await move(endpoint, item, topicId);
  item = await move(endpoint, item, null);
  expect(item.parent_id).toBe('special-inbox');
  const sibling = readMaterial(await postOk(endpoint, 'materials/create', {
    content: 'Second question', kind: 'item', parent_id: null, reveal: 'Second answer'
  }));
  expect((await post(endpoint, 'materials/move', {
    expected_updated_at: item.updated_at, id: item.id, parent_id: sibling.id
  })).status).toBe(400);
  const deleted = await postOk(endpoint, 'materials/delete-soft', {
    expected_updated_at: item.updated_at, id: item.id
  });
  const restored = readMaterial(await postOk(endpoint, 'materials/restore', {
    expected_updated_at: deleted.deleted_at, id: item.id
  }));
  expect(restored).toMatchObject({ id: item.id, kind: 'item', reveal: 'A changed answer' });
  expectHydratedReviewEligibility(String(item.id));
}

function expectHydratedReviewEligibility(itemId: string) {
  const snapshot = loadWorkspaceSnapshot({ includeBody: true })!;
  expect(snapshot.nodesById[itemId]).toMatchObject({
    content: 'A changed question', kind: 'item', reveal: 'A changed answer',
    review: { due: expect.any(String), reps: 0, state: 0 }
  });
  expect(snapshot.nodeOrder).toContain(itemId);
}

it('rejects invalid Item field and parent combinations before writing', async () => {
  const { endpoint, server } = await startAgentControlTestServer();
  try {
    const baseline = readCounts();
    const invalidBodies = [
      { content: 'Question', kind: 'item', parent_id: null },
      { content: '', kind: 'item', parent_id: null, reveal: 'Answer' },
      { content: 'Question', kind: 'item', parent_id: null, reveal: 'Answer', title: 'Caller title' },
      { kind: 'topic', parent_id: null, reveal: 'Answer', title: 'Topic' },
      { content: 'Question', kind: 'item', parent_id: 'special-home', reveal: 'Answer' },
      { content: 'Question', kind: 'item', parent_id: 'special-virtual-root', reveal: 'Answer' }
    ];
    for (const body of invalidBodies) expect((await post(endpoint, 'materials/create', body)).status).toBe(400);
    expect(readCounts()).toEqual(baseline);
  } finally {
    await closeAgentControlTestServer(server);
  }
});

async function update(endpoint: string, item: Record<string, unknown>, patch: Record<string, unknown>) {
  return readMaterial(await postOk(endpoint, 'materials/update', {
    expected_updated_at: item.updated_at, id: item.id, ...patch
  }));
}

async function move(endpoint: string, item: Record<string, unknown>, parentId: string | null) {
  return readMaterial(await postOk(endpoint, 'materials/move', {
    expected_updated_at: item.updated_at, id: item.id, parent_id: parentId
  }));
}

function post(endpoint: string, route: string, body: Record<string, unknown>) {
  return fetch(`${endpoint}/agent-control/v1/${route}`, {
    body: JSON.stringify(body),
    headers: { authorization: 'Bearer test-token', 'content-type': 'application/json' },
    method: 'POST'
  });
}

async function postOk(endpoint: string, route: string, body: Record<string, unknown>) {
  const response = await post(endpoint, route, body);
  expect(response.status).toBe(200);
  return JSON.parse(await response.text()) as Record<string, unknown>;
}

function readMaterial(payload: Record<string, unknown>) {
  return payload.material as Record<string, unknown>;
}

function readStoredItem(id: string) {
  return openDatabaseConnection().driver.queryOne<Record<string, unknown>>(
    `SELECT n.kind, n.parent_id, n.reveal, n.is_title_manual, nr.due, nr.state, nr.stability,
            nr.difficulty, nr.elapsed_days, nr.scheduled_days, nr.reps, nr.lapses
       FROM nodes n JOIN node_review nr ON nr.node_id = n.id WHERE n.id = ?`, [id]
  );
}

function readCounts() {
  return {
    nodes: openDatabaseConnection().driver.queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM nodes')?.count,
    order: openDatabaseConnection().driver.queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM node_order')?.count,
    review: openDatabaseConnection().driver.queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM node_review')?.count
  };
}
