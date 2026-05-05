// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-node-attachment-cleanup-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { resolveAttachmentStoragePath } from '../attachments/resourceResolver.js';

import { createAttachmentRecord, createNodeAttachmentLink } from './attachments.js';
import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { initializeDatabase } from './migrate.js';
import { deleteNodesPermanently, softDeleteNodes, upsertNodeSnapshot } from './nodeMutations.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-node-attachment-cleanup-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

function seedNode(nodeId: string, content: string) {
  upsertNodeSnapshot({
    nodeId,
    parentNodeId: null,
    kind: 'topic',
    title: nodeId,
    isTitleManual: true,
    content,
    reveal: null,
    anchorLink: null,
    position: null,
    createdAt: '2026-04-18T08:00:00.000Z',
    updatedAt: '2026-04-18T08:00:00.000Z'
  });
}

async function seedAttachment(args: { attachmentId: string; mimeType: string; nodeIds: string[]; originalName: string; role: string }) {
  createAttachmentRecord({
    id: args.attachmentId,
    originalName: args.originalName,
    mimeType: args.mimeType,
    sizeBytes: 32,
    createdAt: '2026-04-18T08:00:00.000Z'
  });
  for (const nodeId of args.nodeIds) {
    createNodeAttachmentLink({
      nodeId,
      attachmentId: args.attachmentId,
      role: args.role
    });
  }
  const storagePath = resolveAttachmentStoragePath(args.attachmentId, undefined, args.originalName);
  await fs.mkdir(path.dirname(storagePath), { recursive: true });
  await fs.writeFile(storagePath, `${args.mimeType}:${args.attachmentId}`);
  return storagePath;
}

function readAttachmentCounts(attachmentId: string) {
  const database = openDatabaseConnection().sqlite;
  return {
    attachmentRows: (database.prepare('SELECT COUNT(*) AS count FROM attachments WHERE id = ?').get(attachmentId) as { count: number })
      .count,
    linkRows: (
      database.prepare('SELECT COUNT(*) AS count FROM node_attachments WHERE attachment_id = ?').get(attachmentId) as { count: number }
    ).count,
    pdfIndexRows: (
      database.prepare('SELECT COUNT(*) AS count FROM pdf_page_text WHERE attachment_id = ?').get(attachmentId) as { count: number }
    ).count
  };
}

it('keeps attachments intact after soft delete even when the deleted node was the last visible use', async () => {
  seedNode('node-image', '![Cover](asset://hash-image.png)');
  const filePath = await seedAttachment({
    attachmentId: 'hash-image',
    mimeType: 'image/png',
    nodeIds: ['node-image'],
    originalName: 'cover.png',
    role: 'image'
  });

  softDeleteNodes({
    nodeIds: ['node-image'],
    deletedAt: '2026-04-18T08:05:00.000Z'
  });

  expect(readAttachmentCounts('hash-image')).toEqual({
    attachmentRows: 1,
    linkRows: 1,
    pdfIndexRows: 0
  });
  await expect(fs.stat(filePath)).resolves.toBeDefined();
});

it('keeps shared inline images until the last body reference is permanently deleted', async () => {
  seedNode('node-a', '![Cover](asset://hash-image.png)');
  seedNode('node-b', 'Text\n\n![Cover](asset://hash-image.png)');
  const filePath = await seedAttachment({
    attachmentId: 'hash-image',
    mimeType: 'image/png',
    nodeIds: ['node-a', 'node-b'],
    originalName: 'cover.png',
    role: 'image'
  });

  deleteNodesPermanently({
    nodeIds: ['node-a'],
    nodeOrder: ['node-b']
  });

  expect(readAttachmentCounts('hash-image')).toEqual({
    attachmentRows: 1,
    linkRows: 1,
    pdfIndexRows: 0
  });
  await expect(fs.stat(filePath)).resolves.toBeDefined();

  deleteNodesPermanently({
    nodeIds: ['node-b'],
    nodeOrder: []
  });

  expect(readAttachmentCounts('hash-image')).toEqual({
    attachmentRows: 0,
    linkRows: 0,
    pdfIndexRows: 0
  });
  await expect(fs.stat(filePath)).rejects.toMatchObject({ code: 'ENOENT' });
});

it('keeps shared pdf attachments until the last mounted node is permanently deleted, then clears index rows too', async () => {
  seedNode('node-pdf-a', '# PDF A');
  seedNode('node-pdf-b', '# PDF B');
  const filePath = await seedAttachment({
    attachmentId: 'hash-pdf',
    mimeType: 'application/pdf',
    nodeIds: ['node-pdf-a', 'node-pdf-b'],
    originalName: 'book.pdf',
    role: 'reference'
  });
  openDatabaseConnection().sqlite
    .prepare('INSERT INTO pdf_page_text (attachment_id, page, text, page_width, page_height) VALUES (?, ?, ?, ?, ?)')
    .run('hash-pdf', 1, 'Page 1', 800, 1200);

  deleteNodesPermanently({
    nodeIds: ['node-pdf-a'],
    nodeOrder: ['node-pdf-b']
  });

  expect(readAttachmentCounts('hash-pdf')).toEqual({
    attachmentRows: 1,
    linkRows: 1,
    pdfIndexRows: 1
  });
  await expect(fs.stat(filePath)).resolves.toBeDefined();

  deleteNodesPermanently({
    nodeIds: ['node-pdf-b'],
    nodeOrder: []
  });

  expect(readAttachmentCounts('hash-pdf')).toEqual({
    attachmentRows: 0,
    linkRows: 0,
    pdfIndexRows: 0
  });
  await expect(fs.stat(filePath)).rejects.toMatchObject({ code: 'ENOENT' });
});
