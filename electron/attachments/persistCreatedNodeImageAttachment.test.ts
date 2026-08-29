// @vitest-environment node
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '';
vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir, app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'), app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { listNodeAttachments } from '../database/attachments.js';
import { closeDatabaseConnection } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';
import { upsertVersionedNodeSnapshotWithOrder } from '../database/nodeVersionedMutations.js';

import { persistCreatedNodeImageAttachment } from './persistCreatedNodeImageAttachment.js';
import { resolveAttachmentStoragePath } from './resourceResolver.js';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nJ8AAAAASUVORK5CYII=', 'base64');
let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-pdf-excerpt-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

function nodeSnapshot(nodeId: string) {
  return {
    nodeId, parentNodeId: null, kind: 'topic' as const, title: 'Image excerpt', isTitleManual: false,
    content: `![Image excerpt](asset://${createHash('sha256').update(png).digest('hex')}.png)`, reveal: null,
    anchorLink: { id: 'anchor-1', kind: 'image-excerpt' as const, locator: { page: 1, x: 0, y: 0, rects: [{ x: 0, y: 0, width: 1, height: 1 }] } },
    position: 0, createdAt: '2026-08-29T00:00:00.000Z', updatedAt: '2026-08-29T00:00:00.000Z'
  };
}

it('atomically persists the node through the canonical owner and links the normal CAS image', async () => {
  const hash = createHash('sha256').update(png).digest('hex');
  await persistCreatedNodeImageAttachment({
    bytes: png, expectedHash: hash, mimeType: 'image/png', nodeId: 'excerpt-1', originalName: 'excerpt.png',
    persistNode: () => upsertVersionedNodeSnapshotWithOrder(nodeSnapshot('excerpt-1'), ['excerpt-1'])
  });
  expect(listNodeAttachments('excerpt-1')).toEqual([
    expect.objectContaining({ attachmentId: hash, nodeId: 'excerpt-1', role: 'image' })
  ]);
  await expect(fs.stat(resolveAttachmentStoragePath(hash, undefined, 'excerpt.png'))).resolves.toBeTruthy();
});

it('removes a newly written CAS file when the database transaction fails', async () => {
  const hash = createHash('sha256').update(png).digest('hex');
  await expect(persistCreatedNodeImageAttachment({
    bytes: png, expectedHash: hash, mimeType: 'image/png', nodeId: 'excerpt-2', originalName: 'excerpt.png',
    persistNode: () => { throw new Error('write failed'); }
  })).rejects.toThrow('write failed');
  await expect(fs.stat(resolveAttachmentStoragePath(hash, undefined, 'excerpt.png'))).rejects.toMatchObject({ code: 'ENOENT' });
});
