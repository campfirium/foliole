// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-sync-object-apply-mobile-payloads-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { initializeDatabaseConnection } from '../../lib/core/database/index.js';
import { hashTextBody } from '../../lib/core/database/textBodyHash.js';
import { topicAlternativeHash, validateTopicAlternativeRecord } from '../../lib/core/sync/topicAlternativeRecord.js';

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { applySyncObjectsAsync } from './syncObjectApply.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-sync-object-apply-mobile-payloads-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabaseConnection(openDatabaseConnection());
});

afterEach(async () => {
  vi.restoreAllMocks();
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

function insertNode(nodeId: string) {
  openDatabaseConnection().driver.execute(
    `INSERT INTO nodes (id, kind, title, content, created_at, updated_at)
     VALUES (?, 'item', ?, '', ?, ?)`,
    [nodeId, nodeId, '2026-04-21T10:00:00.000Z', '2026-04-21T10:00:00.000Z']
  );
}

it('applies mobile snake_case learning payloads', async () => {
  insertNode('node-1');

  await applySyncObjectsAsync([{
    content_hash: 'hash-review-mobile',
    deleted_at: null,
    object_id: 'node-1',
    object_type: 'node_review',
    payload_json: JSON.stringify({
      difficulty: 3.4,
      due: '2026-04-25T08:10:00.000Z',
      elapsed_days: 1,
      lapses: 0,
      last_review_at: '2026-04-22T08:10:00.000Z',
      reps: 4,
      scheduled_days: 3,
      stability: 2.8,
      state: 2
    }),
    updated_at: '2026-04-22T08:10:00.000Z'
  }]);

  expect(openDatabaseConnection().driver.queryOne<{
    last_review_at: string;
    scheduled_days: number;
    state: number;
  }>('SELECT last_review_at, scheduled_days, state FROM node_review WHERE node_id = ?', ['node-1']))
    .toBeUndefined();
});

it('does not let an initial review payload overwrite an already reviewed card', async () => {
  insertNode('node-1');
  const driver = openDatabaseConnection().driver;
  driver.execute(
    `INSERT INTO node_review (
       node_id, due, last_review_at, state, stability, difficulty,
       elapsed_days, scheduled_days, reps, lapses
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ['node-1', '2026-04-25T08:10:00.000Z', '2026-04-22T08:10:00.000Z', 2, 2.8, 3.4, 1, 3, 4, 0]
  );

  await applySyncObjectsAsync([{
    content_hash: 'hash-review-initial',
    deleted_at: null,
    object_id: 'node-1',
    object_type: 'node_review',
    payload_json: JSON.stringify({
      difficulty: 0,
      due: '2026-05-22T00:00:00.000Z',
      elapsed_days: 0,
      lapses: 0,
      last_review_at: null,
      reps: 0,
      scheduled_days: 0,
      stability: 0,
      state: 0
    }),
    updated_at: '2026-05-21T08:00:00.000Z'
  }]);

  expect(driver.queryOne<{ due: string; reps: number }>(
    'SELECT due, reps FROM node_review WHERE node_id = ?',
    ['node-1']
  )).toEqual({ due: '2026-04-25T08:10:00.000Z', reps: 4 });
});

it('retains distinct complete same-host alternatives without replacing the older fork', async () => {
  insertNode('node-1');
  const alternative = (id: string, version: string, updatedAt: string) => {
    const payload = validateTopicAlternativeRecord({
      alternative_id: id, node_id: 'node-1', source_version_id: version,
      body_text: `Body ${version}`, body_blob_hash: hashTextBody(`Body ${version}`),
      source_host_name: 'desktop-resolution', created_at: updatedAt, updated_at: updatedAt,
      expires_at: '2099-01-01T00:00:00.000Z', resource_references: '[]', image_sources: null, status: 'available'
    });
    return { content_hash: topicAlternativeHash(payload), deleted_at: null, object_id: id,
      object_type: 'node_text_alternative' as const, payload_json: JSON.stringify(payload), updated_at: updatedAt };
  };
  const states = [alternative('alternative-old', 'version-old', '2026-04-22T08:10:00.000Z'),
    alternative('alternative-new', 'version-new', '2026-04-22T08:11:00.000Z')];
  await expect(applySyncObjectsAsync(states)).resolves.toEqual([
    'node_text_alternative:alternative-old', 'node_text_alternative:alternative-new'
  ]);
  const read = () => openDatabaseConnection().driver.queryAll(
    "SELECT * FROM node_text_alternatives WHERE node_id = 'node-1' ORDER BY alternative_id");
  const expected = [...states].reverse().map(state => JSON.parse(state.payload_json));
  expect(read()).toEqual(expected);
  await expect(applySyncObjectsAsync(states)).resolves.toEqual([]);
  expect(read()).toEqual(expected);
});
