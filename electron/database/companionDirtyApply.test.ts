// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-companion-dirty-apply-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { initializeDatabaseConnection } from '../../lib/core/database/index.js';
import type { NativeCompanionDirtyNodePayload } from '../../lib/platform/nativeCompanionSyncContract.js';

import { createAttachmentRecord, createNodeAttachmentLink } from './attachments.js';
import { applyCompanionDirtyNodes } from './companionDirtyApply.js';
import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';

let tempRoot = '';

function seedLocalNode() {
  const connection = openDatabaseConnection();
  connection.driver.execute(
    `INSERT INTO nodes (
       id, parent_id, kind, priority, desired_retention, title, is_title_manual, hide_title_heading,
       content, opening_text, virtual_filter, reveal, anchor_link, image_regions, position,
       current_version_id, last_modified_by_device_id, sync_dirty, created_at, updated_at, deleted_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      'node-1',
      null,
      'item',
      1,
      null,
      'Desktop Title',
      0,
      0,
      'desktop body',
      null,
      null,
      null,
      null,
      null,
      7,
      null,
      'desktop-device',
      0,
      '2026-04-22T09:00:00.000Z',
      '2026-04-22T10:00:00.000Z',
      null
    ]
  );
  connection.driver.execute(
    `INSERT INTO node_sync_versions (
       version_id, object_id, parent_version_id, device_id, created_at, content_hash
     ) VALUES (?, ?, ?, ?, ?, ?)`,
    ['desktop#1', 'node-1', null, 'desktop-device', '2026-04-22T09:00:00.000Z', 'desktop-hash']
  );
  connection.driver.execute('UPDATE nodes SET current_version_id = ? WHERE id = ?', ['desktop#1', 'node-1']);
  connection.driver.execute('INSERT INTO node_order (node_id, position) VALUES (?, ?)', ['node-1', 7]);
}

function createDirtyPayload(lastSyncedAt: string): NativeCompanionDirtyNodePayload {
  return {
    device_id: 'android-device',
    last_synced_at: lastSyncedAt,
    nodes: [
      {
        device_id: 'android-device',
        object_id: 'node-1',
        object_type: 'node',
        updated_at: '2026-04-22T12:30:00.000Z',
        snapshot: {
          anchorLink: null,
          content: 'android body',
          createdAt: '2026-04-22T09:00:00.000Z',
          desiredRetention: 0.9,
          hideTitleHeading: true,
          id: 'node-1',
          imageRegions: null,
          isTitleManual: true,
          kind: 'item',
          openingText: 'android opening',
          parentNodeId: null,
          priority: 3,
          reading: {
            intervalDurationMs: 60000,
            intervalGrowthFactor: 1.7,
            lastHandledAt: '2026-04-22T12:30:00.000Z',
            nextAt: '2026-04-23T12:30:00.000Z',
            priority: 0.4,
            readingPosition: 18,
            repetitionCount: 2,
            state: 'active'
          },
          reveal: 'android reveal',
          review: {
            difficulty: 4.2,
            due: '2026-04-25T12:30:00.000Z',
            elapsedDays: 1,
            lapses: 0,
            lastReviewAt: '2026-04-22T12:30:00.000Z',
            reps: 3,
            scheduledDays: 3,
            stability: 5.1,
            state: 2
          },
          title: 'Android Title',
          updatedAt: '2026-04-22T12:30:00.000Z'
        }
      }
    ]
  };
}

function expectAppliedNodeState() {
  const connection = openDatabaseConnection();
  expect(
    connection.sqlite.prepare(
      `SELECT current_version_id, last_modified_by_device_id, sync_dirty, title, content, position
       FROM nodes WHERE id = ?`
    ).get('node-1')
  ).toEqual({
    content: 'android body',
    current_version_id: 'desktop#1',
    last_modified_by_device_id: 'android-device',
    position: 7,
    sync_dirty: 0,
    title: 'Android Title'
  });
  expect(
    connection.sqlite.prepare(
      `SELECT interval_duration_ms, interval_growth_factor, last_handled_at, next_at, priority, reading_position,
              repetition_count, state
       FROM node_reading WHERE node_id = ?`
    ).get('node-1')
  ).toEqual({
    interval_duration_ms: 60000,
    interval_growth_factor: 1.7,
    last_handled_at: '2026-04-22T12:30:00.000Z',
    next_at: '2026-04-23T12:30:00.000Z',
    priority: 0.4,
    reading_position: 18,
    repetition_count: 2,
    state: 'active'
  });
  expect(
    connection.sqlite.prepare(
      `SELECT due, last_review_at, state, stability, difficulty, elapsed_days, scheduled_days, reps, lapses
       FROM node_review WHERE node_id = ?`
    ).get('node-1')
  ).toEqual({
    difficulty: 4.2,
    due: '2026-04-25T12:30:00.000Z',
    elapsed_days: 1,
    lapses: 0,
    last_review_at: '2026-04-22T12:30:00.000Z',
    reps: 3,
    scheduled_days: 3,
    stability: 5.1,
    state: 2
  });
  expect(
    connection.sqlite.prepare(
      'SELECT node_id, attachment_id, role FROM node_attachments WHERE node_id = ?'
    ).all('node-1')
  ).toEqual([{ attachment_id: 'att-1', node_id: 'node-1', role: 'reference' }]);
}

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-companion-dirty-apply-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabaseConnection(openDatabaseConnection());
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

it('applies accepted companion dirty nodes and preserves desktop sync metadata', () => {
  createAttachmentRecord({
    id: 'att-1',
    originalName: 'ref.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 128,
    createdAt: '2026-04-22T08:00:00.000Z'
  });
  seedLocalNode();
  createNodeAttachmentLink({
    nodeId: 'node-1',
    attachmentId: 'att-1',
    role: 'reference'
  });

  expect(applyCompanionDirtyNodes(createDirtyPayload('2026-04-22T11:00:00.000Z'))).toEqual({
    appliedObjectIds: ['node-1'],
    conflictObjectIds: []
  });
  expectAppliedNodeState();
});

it('reports conflicts when desktop changed after the last companion sync', () => {
  seedLocalNode();
  openDatabaseConnection().driver.execute(
    `UPDATE nodes
     SET updated_at = ?, last_modified_by_device_id = ?, sync_dirty = 1
     WHERE id = ?`,
    ['2026-04-22T12:10:00.000Z', 'desktop-device', 'node-1']
  );

  expect(applyCompanionDirtyNodes(createDirtyPayload('2026-04-22T11:00:00.000Z'))).toEqual({
    appliedObjectIds: [],
    conflictObjectIds: ['node-1']
  });

  expect(
    openDatabaseConnection().sqlite.prepare(
      'SELECT title, last_modified_by_device_id, sync_dirty FROM nodes WHERE id = ?'
    ).get('node-1')
  ).toEqual({
    last_modified_by_device_id: 'desktop-device',
    sync_dirty: 1,
    title: 'Desktop Title'
  });
});
