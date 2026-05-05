// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-sync-apply-async-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { initializeDatabaseConnection } from '../../lib/core/database/index.js';
import type { NativeSyncNodeRecord } from '../../lib/platform/nativeSyncContract.js';

import { createAttachmentRecord } from './attachments.js';
import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { applySyncNodesAsync } from './syncApply.js';

let tempRoot = '';

function createRemoteNodeRecord(): NativeSyncNodeRecord {
  return {
    ancestor_version_ids: ['desktop#0'],
    content_hash: 'hash-1',
    device_id: 'phone',
    object_id: 'node-1',
    object_type: 'node',
    parent_version_id: 'desktop#0',
    snapshot: {
      anchor_link: null,
      attachments: [
        { attachment_id: 'att-1', role: 'reference' },
        { attachment_id: 'missing-att', role: 'inline' }
      ],
      content: 'remote body',
      created_at: '2026-04-21T10:00:00.000Z',
      deleted_at: null,
      desired_retention: 0.85,
      hide_title_heading: true,
      id: 'node-1',
      image_regions: null,
      is_title_manual: true,
      kind: 'item',
      opening_text: 'remote opening',
      parent_id: null,
      position: 4,
      priority: 2,
      reveal: 'answer',
      title: 'Remote Node',
      updated_at: '2026-04-21T11:00:00.000Z',
      virtual_filter: null
    },
    updated_at: '2026-04-21T11:00:00.000Z',
    version_created_at: '2026-04-21T11:00:00.000Z',
    version_id: 'phone#1'
  };
}

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-sync-apply-async-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabaseConnection(openDatabaseConnection());
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

it('applies remote sync nodes through the async desktop DbPort entry', async () => {
  createAttachmentRecord({
    id: 'att-1',
    originalName: 'att-1.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 128,
    createdAt: '2026-04-21T09:00:00.000Z'
  });

  await expect(applySyncNodesAsync([createRemoteNodeRecord()])).resolves.toEqual(['node-1']);

  const connection = openDatabaseConnection();
  expect(
    connection.sqlite.prepare(
      `SELECT current_version_id, last_modified_by_device_id, sync_dirty, title, content, body_blob_hash, position
       FROM nodes WHERE id = ?`
    ).get('node-1')
  ).toEqual({
    body_blob_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
    content: 'remote body',
    current_version_id: 'phone#1',
    last_modified_by_device_id: 'phone',
    position: 4,
    sync_dirty: 0,
    title: 'Remote Node'
  });
});
