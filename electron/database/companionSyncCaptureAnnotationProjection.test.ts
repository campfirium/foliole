// @vitest-environment node

import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedRequestProjectionAppDataDir, 'cache'),
    app_config_dir: path.join(mockedRequestProjectionAppDataDir, 'config'),
    app_data_dir: mockedRequestProjectionAppDataDir,
    app_log_dir: path.join(mockedRequestProjectionAppDataDir, 'logs')
  })
}));

import { buildNodeBodyContentSql } from '../../lib/core/database/nodeBodySql.js';
import { applySyncNodesWithDbPort } from '../../lib/core/sync/syncNodeApplyExecutor.js';
import { applySyncObjectInTransaction } from '../../lib/core/sync/syncObjectApplyExecutor.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import {
  ANDROID_SOURCE_DEVICE_ID,
  ARTICLE_PARENT_ID,
  buildAndroidCaptureAnnotationRecords,
  CAPTURE_NODE_ID,
  CLOZE_NODE_ID,
  CLOZE_REVIEW,
  EXPECTED_VERSION_IDS,
  NOTE_NODE_ID
} from './companionSyncCaptureAnnotationProjectionTestSupport.js';
import { mockedRequestProjectionAppDataDir, ownerPort, projectionPeer, setupRequestProjection, transferProjection } from './requestProjection.testSupport.js';
import type { RestorePeer } from './requestSyncRestoreRecovery.testSupport.js';

let projected: RestorePeer;
setupRequestProjection();
beforeEach(() => {
  vi.spyOn(crypto, 'randomUUID')
    .mockReturnValueOnce('00000000-0000-4000-8000-000000000101')
    .mockReturnValueOnce('00000000-0000-4000-8000-000000000102')
    .mockReturnValueOnce('00000000-0000-4000-8000-000000000103');
});

afterEach(() => vi.restoreAllMocks());

it('projects Android Capture, Cloze, and Note records through desktop and its next request snapshot', async () => {
  await ownerPort().run("INSERT INTO nodes (id,kind,title,content,created_at,updated_at) VALUES ('special-inbox','folder','Inbox','','now','now')");
  const records = await buildAndroidCaptureAnnotationRecords();
  await applySyncNodesWithDbPort(ownerPort(), records.versions);
  await ownerPort().transaction(tx => applySyncObjectInTransaction(tx, records.review, { hostName: ANDROID_SOURCE_DEVICE_ID }));
  projected = projectionPeer('target');
  await transferProjection(ownerPort(), projected.db);
  expectProjectedNodes();
  expectProjectedSyncMetadata();
  expectProjectedReview();
  const downstream = projectionPeer('observer');
  await transferProjection(projected.db, downstream.db);
  projected = downstream;
  expectProjectedNodes();
  expectProjectedSyncMetadata();
  expectProjectedReview();
});

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

function expectedAnchor(kind: 'cloze' | 'highlight') {
  return JSON.stringify({
    id: 'anchor-1',
    kind,
    locator: { from: 6, originalText: 'Beta', to: 10 }
  });
}

function readProjectedNodes() {
  return createBetterSqlite3Driver(projected.sqlite).queryAll(
    `SELECT nodes.id, parent_id, kind, ${buildNodeBodyContentSql('nodes')} AS content, reveal, anchor_link, current_version_id, last_modified_by_host_name
     FROM nodes LEFT JOIN content_blob_data cbd ON cbd.hash = nodes.body_blob_hash WHERE nodes.id IN (?, ?, ?) ORDER BY nodes.id`,
    [CAPTURE_NODE_ID, CLOZE_NODE_ID, NOTE_NODE_ID]
  );
}

function readProjectedVersions() {
  return createBetterSqlite3Driver(projected.sqlite).queryAll(
    `SELECT version_id, host_name FROM node_sync_versions
     WHERE object_id IN (?, ?, ?) ORDER BY object_id`,
    [CAPTURE_NODE_ID, CLOZE_NODE_ID, NOTE_NODE_ID]
  );
}

function readProjectedReview() {
  return createBetterSqlite3Driver(projected.sqlite).queryOne(
    `SELECT due, last_review_at, state, stability, difficulty, elapsed_days, scheduled_days, reps, lapses
     FROM node_review WHERE node_id = ?`,
    [CLOZE_NODE_ID]
  );
}
