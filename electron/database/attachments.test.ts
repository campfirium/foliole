// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-attachments-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import {
  createAttachmentRecord,
  createNodeAttachmentLink,
  deleteNodeAttachmentLink,
  listAttachmentNodeLinks,
  listNodeAttachments
} from './attachments.js';
import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { initializeDatabase } from './migrate.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-attachments-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

function seedNode(nodeId: string) {
  openDatabaseConnection().sqlite
    .prepare(
      `INSERT INTO nodes (
         id,
         parent_id,
         title,
         is_title_manual,
         hide_title_heading,
         content,
         reveal,
         anchor_link,
         created_at,
         updated_at,
         deleted_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(nodeId, null, nodeId, 1, 0, '', null, null, '2026-03-20T00:00:00.000Z', '2026-03-20T00:00:00.000Z', null);
}

function getAttachmentRowCount(attachmentId: string) {
  const row = openDatabaseConnection().sqlite
    .prepare('SELECT COUNT(*) AS count FROM attachments WHERE id = ?')
    .get(attachmentId) as { count: number };
  return row.count;
}

function createSharedAttachment() {
  createAttachmentRecord({
    id: 'attachment-1',
    hash: 'hash-1',
    originalName: 'shared.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 8192,
    createdAt: '2026-03-20T00:00:00.000Z'
  });
}

function linkSharedAttachment(nodeId: string) {
  createNodeAttachmentLink({
    nodeId,
    attachmentId: 'attachment-1',
    role: 'reference'
  });
}

function expectSharedAttachmentForNode(nodeId: string) {
  expect(listNodeAttachments(nodeId)).toEqual([
    {
      nodeId,
      attachmentId: 'attachment-1',
      role: 'reference',
      attachment: {
        id: 'attachment-1',
        hash: 'hash-1',
        originalName: 'shared.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 8192,
        createdAt: '2026-03-20T00:00:00.000Z'
      }
    }
  ]);
}

it('creates an attachment record and returns it through node-based lookup', () => {
  seedNode('node-1');
  createAttachmentRecord({
    id: 'attachment-1',
    hash: 'hash-1',
    originalName: 'diagram.png',
    mimeType: 'image/png',
    sizeBytes: 2048,
    createdAt: '2026-03-20T00:00:00.000Z'
  });

  createNodeAttachmentLink({
    nodeId: 'node-1',
    attachmentId: 'attachment-1',
    role: 'image'
  });

  expect(listNodeAttachments('node-1')).toEqual([
    {
      nodeId: 'node-1',
      attachmentId: 'attachment-1',
      role: 'image',
      attachment: {
        id: 'attachment-1',
        hash: 'hash-1',
        originalName: 'diagram.png',
        mimeType: 'image/png',
        sizeBytes: 2048,
        createdAt: '2026-03-20T00:00:00.000Z'
      }
    }
  ]);
  expect(listAttachmentNodeLinks('attachment-1')).toEqual([
    {
      nodeId: 'node-1',
      attachmentId: 'attachment-1',
      role: 'image'
    }
  ]);
});

it('supports reusing the same attachment across multiple nodes and keeps the attachment after unlink', () => {
  seedNode('node-1');
  seedNode('node-2');
  createSharedAttachment();
  linkSharedAttachment('node-1');
  linkSharedAttachment('node-2');

  expect(listAttachmentNodeLinks('attachment-1')).toEqual([
    {
      nodeId: 'node-1',
      attachmentId: 'attachment-1',
      role: 'reference'
    },
    {
      nodeId: 'node-2',
      attachmentId: 'attachment-1',
      role: 'reference'
    }
  ]);

  deleteNodeAttachmentLink({
    nodeId: 'node-1',
    attachmentId: 'attachment-1',
    role: 'reference'
  });

  expect(listAttachmentNodeLinks('attachment-1')).toEqual([
    {
      nodeId: 'node-2',
      attachmentId: 'attachment-1',
      role: 'reference'
    }
  ]);
  expect(listNodeAttachments('node-1')).toEqual([]);
  expectSharedAttachmentForNode('node-2');
  expect(getAttachmentRowCount('attachment-1')).toBe(1);
});
