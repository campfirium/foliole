// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-sync-nodes-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { initializeDatabaseConnection } from '../../lib/core/database/index.js';

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { loadSyncNodes, loadSyncNodeVersionsSince } from './syncNodes.js';

let tempRoot = '';

async function initializeTestDatabase() {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-sync-nodes-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabaseConnection(openDatabaseConnection());
  return openDatabaseConnection();
}

function insertParentNode(connection: ReturnType<typeof openDatabaseConnection>) {
  connection.driver.execute(
    `INSERT INTO nodes (
       id, parent_id, kind, title, content, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ['parent-1', null, 'topic', 'Parent 1', '', '2026-04-21T09:00:00.000Z', '2026-04-21T09:00:00.000Z']
  );
}

function insertAttachmentFixtures(connection: ReturnType<typeof openDatabaseConnection>) {
  connection.driver.execute(
    `INSERT INTO attachments (id, original_name, mime_type, size_bytes, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    ['att-1', 'att-1.png', 'image/png', 10, '2026-04-21T09:10:00.000Z']
  );
  connection.driver.execute(
    `INSERT INTO attachments (id, original_name, mime_type, size_bytes, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    ['att-2', 'att-2.png', 'image/png', 20, '2026-04-21T09:11:00.000Z']
  );
}

function insertNodeFixture(connection: ReturnType<typeof openDatabaseConnection>) {
  connection.driver.execute(
    `INSERT INTO nodes (
       id, parent_id, kind, title, content, is_title_manual, hide_title_heading,
       opening_text, virtual_filter, reveal, anchor_link, image_regions, position,
       current_version_id, created_at, updated_at, deleted_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      'node-1',
      'parent-1',
      'item',
      'Node 1',
      'hello',
      1,
      0,
      'opening',
      '{"kind":"all"}',
      null,
      '{"kind":"highlight"}',
      '[{"attachmentId":"att-2","regions":[]}]',
      7,
      'desktop#2',
      '2026-04-21T10:00:00.000Z',
      '2026-04-21T11:00:00.000Z',
      null
    ]
  );
  connection.driver.execute('INSERT INTO node_order (node_id, position) VALUES (?, ?)', ['node-1', 7]);
}

function insertVersionFixtures(connection: ReturnType<typeof openDatabaseConnection>) {
  const versions = [
    ['desktop#0', null, 'hash-0', '2026-04-21T10:00:00.000Z'],
    ['desktop#1', 'desktop#0', 'hash-1', '2026-04-21T10:30:00.000Z'],
    ['desktop#2', 'desktop#1', 'hash-2', '2026-04-21T11:00:00.000Z']
  ] as const;
  for (const [versionId, parentVersionId, contentHash, createdAt] of versions) {
    connection.driver.execute(
      `INSERT INTO node_sync_versions (
         version_id, object_id, parent_version_id, device_id, created_at, content_hash
       ) VALUES (?, ?, ?, ?, ?, ?)`,
      [versionId, 'node-1', parentVersionId, 'desktop', createdAt, contentHash]
    );
  }
}

function insertNodeAttachmentFixtures(connection: ReturnType<typeof openDatabaseConnection>) {
  connection.driver.execute(
    `INSERT INTO node_attachments (node_id, attachment_id, role) VALUES (?, ?, ?)`,
    ['node-1', 'att-2', 'cover']
  );
  connection.driver.execute(
    `INSERT INTO node_attachments (node_id, attachment_id, role) VALUES (?, ?, ?)`,
    ['node-1', 'att-1', 'inline']
  );
}

function replaceNodeOrderPosition(connection: ReturnType<typeof openDatabaseConnection>, position: number) {
  connection.driver.execute('UPDATE nodes SET position = NULL WHERE id = ?', ['node-1']);
  connection.driver.execute(
    `INSERT INTO node_order (node_id, position) VALUES (?, ?)
     ON CONFLICT(node_id) DO UPDATE SET position = excluded.position`,
    ['node-1', position]
  );
}

function insertSyncNodeFixture(connection: ReturnType<typeof openDatabaseConnection>) {
  insertParentNode(connection);
  insertAttachmentFixtures(connection);
  insertNodeFixture(connection);
  insertVersionFixtures(connection);
  insertNodeAttachmentFixtures(connection);
}

function expectedSyncNodeRecord() {
  return [
    {
      ancestor_version_ids: ['desktop#1', 'desktop#0'],
      content_hash: 'hash-2',
      device_id: 'desktop',
      object_id: 'node-1',
      object_type: 'node',
      parent_version_id: 'desktop#1',
      snapshot: {
        anchor_link: '{"kind":"highlight"}',
        attachments: [
          { attachment_id: 'att-1', role: 'inline' },
          { attachment_id: 'att-2', role: 'cover' }
        ],
        body_blob_hash: null,
        content: 'hello',
        created_at: '2026-04-21T10:00:00.000Z',
        deleted_at: null,
        desired_retention: null,
        hide_title_heading: false,
        id: 'node-1',
        image_regions: '[{"attachmentId":"att-2","regions":[]}]',
        is_title_manual: true,
        kind: 'item',
        opening_text: 'opening',
        parent_id: 'parent-1',
        position: 7,
        priority: null,
        reveal: null,
        title: 'Node 1',
        updated_at: '2026-04-21T11:00:00.000Z',
        virtual_filter: '{"kind":"all"}'
      },
      updated_at: '2026-04-21T11:00:00.000Z',
      version_created_at: '2026-04-21T11:00:00.000Z',
      version_id: 'desktop#2'
    }
  ];
}

describe('loadSyncNodes', () => {
  beforeEach(async () => {
    await initializeTestDatabase();
  });

  afterEach(async () => {
    closeDatabaseConnection();
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it('returns sync node records with attachments and ancestor ids', () => {
    const connection = openDatabaseConnection();
    insertSyncNodeFixture(connection);
    expect(loadSyncNodes(['node-1'])).toEqual(expectedSyncNodeRecord());
  });

  it('uses node_order as the fallback sync node position source', () => {
    const connection = openDatabaseConnection();
    insertSyncNodeFixture(connection);
    replaceNodeOrderPosition(connection, 12);

    expect(loadSyncNodes(['node-1'])[0].snapshot.position).toBe(12);
  });

  it('returns empty array for empty object ids input', () => {
    expect(loadSyncNodes([])).toEqual([]);
  });

  it('loads current node records changed after a node version cursor', () => {
    const connection = openDatabaseConnection();
    insertSyncNodeFixture(connection);

    expect(loadSyncNodeVersionsSince({ createdAt: '2026-04-21T10:30:00.000Z', versionId: 'desktop#1' }, 10))
      .toEqual(expectedSyncNodeRecord());
  });

  it('uses version snapshot json instead of current node state for version streams', () => {
    const connection = openDatabaseConnection();
    insertSyncNodeFixture(connection);
    connection.driver.execute(
      `UPDATE node_sync_versions
       SET snapshot_json = ?
       WHERE version_id = ?`,
      [JSON.stringify({ ...expectedSyncNodeRecord()[0].snapshot, title: 'Historical title' }), 'desktop#2']
    );

    expect(loadSyncNodeVersionsSince({ createdAt: '2026-04-21T10:30:00.000Z', versionId: 'desktop#1' }, 10)[0].snapshot.title)
      .toBe('Historical title');
  });
});
