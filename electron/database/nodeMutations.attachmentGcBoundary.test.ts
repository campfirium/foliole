// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-node-attachment-gc-boundary-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { resolveAttachmentStoragePath } from '../attachments/resourceResolver.js';

import { upsertAttachmentBlobManifest } from './attachmentBlobs.js';
import { createAttachmentRecord, createNodeAttachmentLink } from './attachments.js';
import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { initializeDatabase } from './migrate.js';
import { deleteNodesPermanently, restoreNodes, softDeleteNodes, upsertNodeSnapshot } from './nodeMutations.js';
import {
  cleanupOrphanAttachments,
  createAttachmentCleanupPlan,
  deleteAttachmentFiles
} from './orphanAttachmentCleanup.js';
import { withTransaction } from './transaction.js';

let tempRoot = '';
const SOFT_IMAGE_ID = 'a'.repeat(64);
const SOFT_PDF_ID = 'b'.repeat(64);
const DB_ONLY_IMAGE_ID = 'c'.repeat(64);
const BLOB_SHARED_IMAGE_ID = 'd'.repeat(64);
const UNAVAILABLE_IMAGE_ID = 'e'.repeat(64);

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-node-attachment-gc-boundary-'));
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
  const extension = args.mimeType === 'application/pdf' ? '.pdf' : '.png';
  upsertAttachmentBlobManifest({
    attachmentId: args.attachmentId,
    availability: 'local',
    contentHash: args.attachmentId,
    createdAt: '2026-04-18T08:00:00.000Z',
    mimeType: args.mimeType,
    sizeBytes: 32,
    sourceHostName: null,
    storageKey: `${args.attachmentId}${extension}`
  });
  for (const nodeId of args.nodeIds) {
    createNodeAttachmentLink({ nodeId, attachmentId: args.attachmentId, role: args.role });
  }
  const storagePath = resolveAttachmentStoragePath(args.attachmentId, undefined, args.mimeType);
  await fs.mkdir(path.dirname(storagePath), { recursive: true });
  await fs.writeFile(storagePath, `${args.mimeType}:${args.attachmentId}`);
  return storagePath;
}

function readCounts(attachmentId: string) {
  const database = openDatabaseConnection().sqlite;
  return {
    attachmentRows: (database.prepare('SELECT COUNT(*) AS count FROM attachments WHERE id = ?').get(attachmentId) as { count: number })
      .count,
    linkRows: (
      database.prepare('SELECT COUNT(*) AS count FROM node_attachments WHERE attachment_id = ?').get(attachmentId) as { count: number }
    ).count,
    pdfRows: (
      database.prepare('SELECT COUNT(*) AS count FROM pdf_page_text WHERE attachment_id = ?').get(attachmentId) as { count: number }
    ).count
  };
}

it('keeps inline image attachments held only by a restorable trashed node', async () => {
  const markdown = `![Cover](asset://${SOFT_IMAGE_ID}.png)`;
  seedNode('node-delete', markdown);
  seedNode('node-trash', `Text\n\n${markdown}`);
  const filePath = await seedAttachment({
    attachmentId: SOFT_IMAGE_ID,
    mimeType: 'image/png',
    nodeIds: ['node-delete', 'node-trash'],
    originalName: 'cover.png',
    role: 'image'
  });

  softDeleteNodes({ nodeIds: ['node-trash'], deletedAt: '2026-04-18T08:05:00.000Z' });
  deleteNodesPermanently({ nodeIds: ['node-delete'], nodeOrder: ['node-trash'] });

  expect(readCounts(SOFT_IMAGE_ID)).toEqual({ attachmentRows: 1, linkRows: 1, pdfRows: 0 });
  await expect(fs.stat(filePath)).resolves.toBeDefined();

  restoreNodes({ nodeIds: ['node-trash'] });
  expect(openDatabaseConnection().driver.queryOne<{ content: string; deleted_at: string | null }>(
    'SELECT content, deleted_at FROM nodes WHERE id = ?',
    ['node-trash']
  )).toEqual({ content: `Text\n\n${markdown}`, deleted_at: null });

  deleteNodesPermanently({ nodeIds: ['node-trash'], nodeOrder: [] });
  expect(readCounts(SOFT_IMAGE_ID)).toEqual({ attachmentRows: 0, linkRows: 0, pdfRows: 0 });
  await expect(fs.stat(filePath)).rejects.toMatchObject({ code: 'ENOENT' });
});

it('keeps mounted pdf attachments held only by a restorable trashed node', async () => {
  seedNode('node-pdf-delete', '# PDF delete');
  seedNode('node-pdf-trash', '# PDF trash');
  const filePath = await seedAttachment({
    attachmentId: SOFT_PDF_ID,
    mimeType: 'application/pdf',
    nodeIds: ['node-pdf-delete', 'node-pdf-trash'],
    originalName: 'book.pdf',
    role: 'reference'
  });
  openDatabaseConnection().sqlite
    .prepare('INSERT INTO pdf_page_text (attachment_id, page, text, page_width, page_height) VALUES (?, ?, ?, ?, ?)')
    .run(SOFT_PDF_ID, 1, 'Page 1', 800, 1200);

  softDeleteNodes({ nodeIds: ['node-pdf-trash'], deletedAt: '2026-04-18T08:05:00.000Z' });
  deleteNodesPermanently({ nodeIds: ['node-pdf-delete'], nodeOrder: ['node-pdf-trash'] });

  expect(readCounts(SOFT_PDF_ID)).toEqual({ attachmentRows: 1, linkRows: 1, pdfRows: 1 });
  await expect(fs.stat(filePath)).resolves.toBeDefined();

  restoreNodes({ nodeIds: ['node-pdf-trash'] });
  deleteNodesPermanently({ nodeIds: ['node-pdf-trash'], nodeOrder: [] });

  expect(readCounts(SOFT_PDF_ID)).toEqual({ attachmentRows: 0, linkRows: 0, pdfRows: 0 });
  await expect(fs.stat(filePath)).rejects.toMatchObject({ code: 'ENOENT' });
});

it('keeps file deletion outside rollbackable orphan cleanup transactions', async () => {
  seedNode('node-cleanup', `![Cover](asset://${DB_ONLY_IMAGE_ID}.png)`);
  const filePath = await seedAttachment({
    attachmentId: DB_ONLY_IMAGE_ID,
    mimeType: 'image/png',
    nodeIds: ['node-cleanup'],
    originalName: 'cover.png',
    role: 'image'
  });
  const connection = openDatabaseConnection();
  const plan = createAttachmentCleanupPlan(['node-cleanup']);

  expect(() =>
    withTransaction(connection.driver, () => {
      connection.driver.execute('DELETE FROM nodes WHERE id = ?', ['node-cleanup']);
      cleanupOrphanAttachments(connection.driver, plan);
      throw new Error('rollback cleanup');
    })
  ).toThrow('rollback cleanup');

  expect(readCounts(DB_ONLY_IMAGE_ID)).toEqual({ attachmentRows: 1, linkRows: 1, pdfRows: 0 });
  await expect(fs.stat(filePath)).resolves.toBeDefined();

  const filesToDelete = withTransaction(connection.driver, () => {
    connection.driver.execute('DELETE FROM nodes WHERE id = ?', ['node-cleanup']);
    return cleanupOrphanAttachments(connection.driver, plan);
  });

  expect(readCounts(DB_ONLY_IMAGE_ID)).toEqual({ attachmentRows: 0, linkRows: 0, pdfRows: 0 });
  await expect(fs.stat(filePath)).resolves.toBeDefined();
  deleteAttachmentFiles(filesToDelete);
  await expect(fs.stat(filePath)).rejects.toMatchObject({ code: 'ENOENT' });
});

it('keeps an inline attachment referenced by a Blob-only active node', async () => {
  const markdown = `![Shared](asset://${BLOB_SHARED_IMAGE_ID}.png)`;
  seedNode('node-delete', markdown);
  seedNode('node-keep', markdown);
  const filePath = await seedAttachment({
    attachmentId: BLOB_SHARED_IMAGE_ID, mimeType: 'image/png', nodeIds: ['node-delete'], originalName: 'shared.png', role: 'image'
  });
  openDatabaseConnection().driver.execute('UPDATE nodes SET content = ? WHERE id = ?', ['', 'node-keep']);

  deleteNodesPermanently({ nodeIds: ['node-delete'], nodeOrder: ['node-keep'] });

  expect(readCounts(BLOB_SHARED_IMAGE_ID).attachmentRows).toBe(1);
  await expect(fs.stat(filePath)).resolves.toBeDefined();
});

it('aborts permanent deletion before mutation when any retained Blob body is unavailable', async () => {
  seedNode('node-delete', `![Shared](asset://${UNAVAILABLE_IMAGE_ID}.png)`);
  seedNode('node-missing', 'Other body');
  const filePath = await seedAttachment({
    attachmentId: UNAVAILABLE_IMAGE_ID, mimeType: 'image/png', nodeIds: ['node-delete'], originalName: 'missing.png', role: 'image'
  });
  const connection = openDatabaseConnection();
  const hash = connection.driver.queryOne<{ body_blob_hash: string }>(
    'SELECT body_blob_hash FROM nodes WHERE id = ?', ['node-missing']
  )?.body_blob_hash ?? '';
  connection.driver.execute('DELETE FROM content_blob_data WHERE hash = ?', [hash]);

  expect(() => deleteNodesPermanently({ nodeIds: ['node-delete'], nodeOrder: ['node-missing'] }))
    .toThrow('node_body_unavailable:node-missing');
  expect(connection.driver.queryOne<{ id: string }>('SELECT id FROM nodes WHERE id = ?', ['node-delete']))
    .toEqual({ id: 'node-delete' });
  expect(readCounts(UNAVAILABLE_IMAGE_ID).attachmentRows).toBe(1);
  await expect(fs.stat(filePath)).resolves.toBeDefined();
});
