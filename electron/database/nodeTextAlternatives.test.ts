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

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
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
  expect(loadNodeTextAlternativePreview('topic-1')).toMatchObject({
    alternative_id: 'alternative-1',
    current_content: 'Current body',
    kind: 'sync_alternative',
    updated_content: 'Other body'
  });

  await dismissNodeTextAlternative('alternative-1');

  expect(loadNodeTextAlternativePreview('topic-1')).toBeNull();
  expect(state()).toMatchObject({ status: 'dismissed', sync_dirty: 1 });
});

it('promotes the alternate body through a new formal child version', async () => {
  await promoteNodeTextAlternative('alternative-1');

  const row = openDatabaseConnection().driver.queryOne<{
    content: string;
    current_version_id: string;
    parent_version_id: string;
    status: string;
    sync_dirty: number;
  }>(
    `SELECT n.content, n.current_version_id, v.parent_version_id, a.status, s.sync_dirty
     FROM nodes n JOIN node_sync_versions v ON v.version_id = n.current_version_id
     JOIN node_text_alternatives a ON a.node_id = n.id
     JOIN sync_object_state s ON s.object_type = 'node_text_alternative' AND s.object_id = a.alternative_id
     WHERE n.id = 'topic-1'`
  );
  expect(row).toMatchObject({
    content: 'Other body',
    parent_version_id: 'desktop#1',
    status: 'promoted',
    sync_dirty: 1
  });
  expect(row?.current_version_id).toMatch(/^ver_[0-9a-f-]{36}$/);
});

it('previews Blob-only authority and hides an alternative while the Blob is unavailable', () => {
  const driver = openDatabaseConnection().driver;
  const hash = upsertTextBodyBlob(driver, 'Blob current body', '2026-07-25T00:00:00.000Z');
  driver.execute('UPDATE nodes SET content = ?, body_blob_hash = ? WHERE id = ?', ['', hash, 'topic-1']);
  expect(loadNodeTextAlternativePreview('topic-1')?.current_content).toBe('Blob current body');

  driver.execute('DELETE FROM content_blob_data WHERE hash = ?', [hash]);
  expect(loadNodeTextAlternativePreview('topic-1')).toBeNull();
});

function seedAlternative() {
  const driver = openDatabaseConnection().driver;
  const snapshot = JSON.stringify({
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
    `INSERT INTO node_text_alternatives VALUES ('alternative-1', 'topic-1', 'android#1', 'Other body',
       'android-device', '2026-07-25T00:30:00.000Z', 'available', '2026-07-25T00:30:00.000Z')`
  );
  driver.execute(
    `INSERT INTO sync_object_state
       (object_type, object_id, state_seq, content_hash, last_modified_by_host_name, updated_at, sync_dirty)
     VALUES ('node_text_alternative', 'alternative-1', 1, 'alternative-hash', 'desktop',
       '2026-07-25T00:30:00.000Z', 0)`
  );
}

function state() {
  return openDatabaseConnection().driver.queryOne<{ status: string; sync_dirty: number }>(
    `SELECT a.status, s.sync_dirty FROM node_text_alternatives a JOIN sync_object_state s
       ON s.object_type = 'node_text_alternative' AND s.object_id = a.alternative_id`
  );
}
