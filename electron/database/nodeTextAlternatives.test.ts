// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-node-text-alternative-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { upsertTextBodyBlob } from '../../lib/core/database/contentBodyBlobs.js';
import { initializeDatabaseConnection } from '../../lib/core/database/index.js';
import { resolveNodeBody } from '../../lib/core/database/nodeBodyResolution.js';
import { buildNodeBodyContentSql } from '../../lib/core/database/nodeBodySql.js';

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { flushNodeSyncVersionWithDriver } from './nodeSyncVersionFromDriver.js';
import {
  computeNodeSyncVersionHashFromDriver,
  loadNodeSyncVersionSourceFromDriver
} from './nodeSyncVersionSourceFromDriver.js';
import {
  dismissNodeTextAlternative,
  loadNodeTextAlternativePreview,
  promoteNodeTextAlternative
} from './nodeTextAlternatives.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-node-text-alternative-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabaseConnection(openDatabaseConnection());
  seedAlternative();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

it('loads and dismisses one simple alternate body as durable state', async () => {
  expect(await loadNodeTextAlternativePreview('topic-1')).toMatchObject({
    alternative_id: 'alternative-1',
    current_content: 'Current body',
    kind: 'sync_alternative',
    updated_content: 'Other body'
  });

  await dismissNodeTextAlternative('alternative-1');

  expect(await loadNodeTextAlternativePreview('topic-1')).toBeNull();
  expect(state()).toMatchObject({ count: 0, sync_dirty: 1 });
});

it('promotes the alternate body through a new formal child version', async () => {
  await promoteNodeTextAlternative('alternative-1');

  const row = openDatabaseConnection().driver.queryOne<{
    content: string;
    current_version_id: string;
    parent_version_id: string;
    count: number;
    sync_dirty: number;
  }>(
    `SELECT ${buildNodeBodyContentSql('n')} AS content, n.current_version_id, v.parent_version_id, json_array_length(v.snapshot_json, '$.text_alternatives') AS count, s.sync_dirty
     FROM nodes n LEFT JOIN content_blob_data cbd ON cbd.hash = n.body_blob_hash JOIN node_sync_versions v ON v.version_id = n.current_version_id
     JOIN sync_object_state s ON s.object_type = 'node' AND s.object_id = n.id
     WHERE n.id = 'topic-1'`
  );
  expect(row).toMatchObject({
    content: 'Other body',
    parent_version_id: 'desktop#1',
    count: 0,
    sync_dirty: 1
  });
  expect(row?.current_version_id).toMatch(/^ver_[0-9a-f-]{36}$/);
  const driver = openDatabaseConnection().driver;
  const source = loadNodeSyncVersionSourceFromDriver(driver, 'topic-1');
  if (!source) throw new Error('Promoted node source is missing');
  const body = resolveNodeBody(source);
  if (body.status === 'unavailable') throw new Error('Promoted node body is unavailable');
  const canonicalHash = computeNodeSyncVersionHashFromDriver(
    driver, { ...source, content: body.content }, 'topic-1'
  );
  const hashes = driver.queryOne<{ state_hash: string; version_hash: string }>(
    `SELECT state.content_hash AS state_hash, version.content_hash AS version_hash
     FROM sync_object_state state
     JOIN node_sync_versions version ON version.version_id = state.current_version_id
     WHERE state.object_type = 'node' AND state.object_id = 'topic-1'`
  );
  expect(hashes).toEqual({
    state_hash: canonicalHash,
    version_hash: canonicalHash
  });
});

it('inherits alternative membership and expiry through a normal desktop edit', () => {
  const driver = openDatabaseConnection().driver;
  const before = driver.queryOne<{ snapshot_json: string }>(
    "SELECT snapshot_json FROM node_sync_versions WHERE version_id = 'desktop#1'"
  );
  const references = JSON.parse(before!.snapshot_json).text_alternatives;
  driver.execute("UPDATE nodes SET content = 'Edited main', sync_dirty = 1 WHERE id = 'topic-1'");
  const next = flushNodeSyncVersionWithDriver(driver, 'topic-1', 'desktop');
  const row = driver.queryOne<{ snapshot_json: string; parent_version_id: string; body_text: string }>(
    'SELECT snapshot_json, parent_version_id, body_text FROM node_sync_versions WHERE version_id = ?', [next]
  );
  expect(row).toMatchObject({ body_text: 'Edited main', parent_version_id: 'desktop#1' });
  expect(JSON.parse(row!.snapshot_json).text_alternatives).toEqual(references);
});

it('previews Blob-only authority and hides an alternative while the Blob is unavailable', async () => {
  const driver = openDatabaseConnection().driver;
  const hash = upsertTextBodyBlob(driver, 'Blob current body', '2026-07-25T00:00:00.000Z');
  driver.execute('UPDATE nodes SET content = ?, body_blob_hash = ? WHERE id = ?', ['', hash, 'topic-1']);
  expect((await loadNodeTextAlternativePreview('topic-1'))?.current_content).toBe('Blob current body');

  driver.execute('DELETE FROM content_blob_data WHERE hash = ?', [hash]);
  expect(await loadNodeTextAlternativePreview('topic-1')).toBeNull();
});

function seedAlternative() {
  const driver = openDatabaseConnection().driver;
  const now = new Date().toISOString();
  const otherHash = upsertTextBodyBlob(driver, 'Other body', now);
  const snapshot = JSON.stringify({
    text_alternatives: [{ id: 'alternative-1', body_blob_hash: otherHash, source_host_name: 'android-device',
      created_at: now, expires_at: new Date(Date.now() + 30 * 86400000).toISOString() }],
    anchor_link: null, attachments: [], content: 'Current body', created_at: '2026-07-25T00:00:00.000Z',
    deleted_at: null, desired_retention: null, hide_title_heading: false, id: 'topic-1', image_regions: null,
    is_title_manual: false, kind: 'topic', opening_text: null, parent_id: null, position: null, priority: null,
    reveal: null, title: 'Topic', updated_at: '2026-07-25T00:00:00.000Z', virtual_filter: null
  });
  driver.execute(
    `INSERT INTO nodes (id, kind, title, content, current_version_id, created_at, updated_at)
     VALUES ('topic-1', 'topic', 'Topic', 'Current body', 'desktop#1',
       '2026-07-25T00:00:00.000Z', '2026-07-25T00:00:00.000Z')`
  );
  driver.execute(
    `INSERT INTO node_sync_versions
       (version_id, object_id, host_name, created_at, content_hash, body_text, snapshot_json)
     VALUES ('desktop#1', 'topic-1', 'desktop', '2026-07-25T00:00:00.000Z', 'current-hash', 'Current body', ?)`,
    [snapshot]
  );
  driver.execute(
    `INSERT INTO sync_object_state
       (object_type, object_id, state_seq, current_version_id, content_hash, last_modified_by_host_name, updated_at, sync_dirty)
     VALUES ('node', 'topic-1', 1, 'desktop#1', 'current-hash', 'desktop', ?, 0)`, [now]
  );
}

function state() {
  return openDatabaseConnection().driver.queryOne<{ count: number; sync_dirty: number }>(
    `SELECT json_array_length(v.snapshot_json, '$.text_alternatives') AS count, s.sync_dirty
     FROM nodes n JOIN node_sync_versions v ON v.version_id = n.current_version_id
     JOIN sync_object_state s ON s.object_type = 'node' AND s.object_id = n.id WHERE n.id = 'topic-1'`
  );
}
