// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-companion-capture-annotation-projection';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { initializeDatabaseConnection } from '../../lib/core/database/index.js';

import {
  ANDROID_SOURCE_DEVICE_ID,
  ARTICLE_PARENT_ID,
  buildAndroidCaptureAnnotationPushPayloads,
  CAPTURE_NODE_ID,
  CLOZE_NODE_ID,
  CLOZE_REVIEW,
  EXPECTED_VERSION_IDS,
  NOTE_NODE_ID
} from './companionSyncCaptureAnnotationProjectionTestSupport.js';
import { applyCompanionSyncPushAsync } from './companionSyncPushAsyncApply.js';
import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { saveJsonSetting } from './settingsStore.js';
import { buildDesktopSyncPack } from './syncPackBuilder.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-capture-annotation-projection-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabaseConnection(openDatabaseConnection());
  saveJsonSetting('device_id', 'desktop-test', '2026-08-12T00:00:00.000Z');
  seedProjectionParents();
  vi.spyOn(crypto, 'randomUUID')
    .mockReturnValueOnce('00000000-0000-4000-8000-000000000101')
    .mockReturnValueOnce('00000000-0000-4000-8000-000000000102')
    .mockReturnValueOnce('00000000-0000-4000-8000-000000000103');
});

afterEach(async () => {
  closeDatabaseConnection();
  vi.restoreAllMocks();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

it('projects Android Capture, Cloze, and Note records into desktop and its next sync pack', async () => {
  const push = await applyCompanionSyncPushAsync(
    await buildAndroidCaptureAnnotationPushPayloads(), ANDROID_SOURCE_DEVICE_ID
  );

  expectAcceptedPush(push);
  expectProjectedNodes();
  expectProjectedSyncMetadata();
  expectProjectedReview();
  await expectNextSyncPack();
});

function expectAcceptedPush(push: Awaited<ReturnType<typeof applyCompanionSyncPushAsync>>) {
  expect(push.acks).toMatchObject([
    acceptedNodeAck(CAPTURE_NODE_ID, EXPECTED_VERSION_IDS[0]),
    acceptedNodeAck(CLOZE_NODE_ID, EXPECTED_VERSION_IDS[1]),
    acceptedNodeAck(NOTE_NODE_ID, EXPECTED_VERSION_IDS[2]),
    { identity: { objectId: CLOZE_NODE_ID, objectType: 'node_review' }, status: 'accepted' }
  ]);
}

function expectProjectedNodes() {
  expect(readProjectedNodes()).toEqual([
    {
      anchor_link: null,
      content: 'Quick note\nsecond line',
      current_version_id: EXPECTED_VERSION_IDS[0],
      id: CAPTURE_NODE_ID,
      kind: 'topic',
      last_modified_by_host_name: ANDROID_SOURCE_DEVICE_ID,
      parent_id: 'special-inbox',
      reveal: null
    },
    {
      anchor_link: expectedAnchor('cloze'),
      content: 'Alpha [...] Gamma',
      current_version_id: EXPECTED_VERSION_IDS[1],
      id: CLOZE_NODE_ID,
      kind: 'item',
      last_modified_by_host_name: ANDROID_SOURCE_DEVICE_ID,
      parent_id: ARTICLE_PARENT_ID,
      reveal: 'Beta'
    },
    {
      anchor_link: expectedAnchor('highlight'),
      content: 'Beta\n※ Remember this',
      current_version_id: EXPECTED_VERSION_IDS[2],
      id: NOTE_NODE_ID,
      kind: 'topic',
      last_modified_by_host_name: ANDROID_SOURCE_DEVICE_ID,
      parent_id: ARTICLE_PARENT_ID,
      reveal: null
    }
  ]);
}

function expectProjectedSyncMetadata() {
  expect(readProjectedVersions()).toEqual(EXPECTED_VERSION_IDS.map((version_id) => ({
    host_name: ANDROID_SOURCE_DEVICE_ID,
    version_id
  })));
}

function expectProjectedReview() {
  expect(readProjectedReview()).toEqual({
    difficulty: CLOZE_REVIEW.difficulty,
    due: CLOZE_REVIEW.due,
    elapsed_days: CLOZE_REVIEW.elapsedDays,
    lapses: CLOZE_REVIEW.lapses,
    last_review_at: CLOZE_REVIEW.lastReviewAt,
    reps: CLOZE_REVIEW.reps,
    scheduled_days: CLOZE_REVIEW.scheduledDays,
    stability: CLOZE_REVIEW.stability,
    state: CLOZE_REVIEW.state
  });
}

async function expectNextSyncPack() {
  const pack = await buildDesktopSyncPack({
    fromStateSeq: 0,
    outputPath: path.join(tempRoot, 'android-capture-annotation.syncpack'),
    packId: 'android-capture-annotation'
  });
  expect(pack).toMatchObject({ objectCount: 4, toStateSeq: 4 });
  expect(Object.fromEntries(pack.manifest.tables.map((table) => [table.name, table.row_count]))).toMatchObject({
    nodes: 3,
    node_sync_versions: 3,
    sync_objects: 1,
    sync_object_state: 4
  });
}

function acceptedNodeAck(objectId: string, versionId: string) {
  return {
    identity: { objectId, objectType: 'node' },
    status: 'accepted',
    versionId
  };
}

function expectedAnchor(kind: 'cloze' | 'highlight') {
  return JSON.stringify({
    id: 'anchor-1',
    kind,
    locator: { from: 6, originalText: 'Beta', to: 10 }
  });
}

function seedProjectionParents() {
  const timestamp = '2026-05-21T07:00:00.000Z';
  openDatabaseConnection().driver.execute(
    `INSERT INTO nodes (id, kind, title, content, created_at, updated_at)
     VALUES ('special-inbox', 'folder', 'Inbox', '', ?, ?), (?, 'topic', 'Article', 'Alpha Beta Gamma', ?, ?)`,
    [timestamp, timestamp, ARTICLE_PARENT_ID, timestamp, timestamp]
  );
}

function readProjectedNodes() {
  return openDatabaseConnection().driver.queryAll(
    `SELECT id, parent_id, kind, content, reveal, anchor_link, current_version_id, last_modified_by_host_name
     FROM nodes WHERE id IN (?, ?, ?) ORDER BY id`,
    [CAPTURE_NODE_ID, CLOZE_NODE_ID, NOTE_NODE_ID]
  );
}

function readProjectedVersions() {
  return openDatabaseConnection().driver.queryAll(
    `SELECT version_id, host_name FROM node_sync_versions
     WHERE object_id IN (?, ?, ?) ORDER BY object_id`,
    [CAPTURE_NODE_ID, CLOZE_NODE_ID, NOTE_NODE_ID]
  );
}

function readProjectedReview() {
  return openDatabaseConnection().driver.queryOne(
    `SELECT due, last_review_at, state, stability, difficulty, elapsed_days, scheduled_days, reps, lapses
     FROM node_review WHERE node_id = ?`,
    [CLOZE_NODE_ID]
  );
}
