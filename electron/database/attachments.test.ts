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

import { deleteNodeAttachmentLink, listAttachmentNodeLinks, listNodeAttachments } from './attachments.js';
import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { initializeDatabase } from './migrate.js';
import { persistNodeResourceReference } from './nodeResources.js';

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

const hash = 'a'.repeat(64);
it('keeps each original filename on its owner without an independent attachment table', () => {
  seedNode('first');
  seedNode('second');
  persistNodeResourceReference('first', { storage_key: `${hash}.pdf`, role: 'reference', original_name: 'First.pdf' });
  persistNodeResourceReference('second', { storage_key: `${hash}.pdf`, role: 'reference', original_name: 'Second.pdf' });
  expect(listNodeAttachments('first')[0]?.attachment.originalName).toBe('First.pdf');
  expect(listNodeAttachments('second')[0]?.attachment.originalName).toBe('Second.pdf');
  expect(listAttachmentNodeLinks(hash)).toEqual([
    { attachmentId: hash, nodeId: 'first', role: 'reference' },
    { attachmentId: hash, nodeId: 'second', role: 'reference' }
  ]);
  expect(openDatabaseConnection().sqlite.prepare("SELECT name FROM sqlite_master WHERE name IN ('attachments','node_attachments')").all()).toEqual([]);
});
it('removes a mount from only its owner and records a durable node version', () => {
  seedNode('first');
  seedNode('second');
  for (const nodeId of ['first', 'second']) persistNodeResourceReference(nodeId,
    { storage_key: `${hash}.pdf`, role: 'reference', original_name: 'Original.pdf' });
  const db = openDatabaseConnection().sqlite;
  const before = db.prepare('SELECT current_version_id FROM nodes WHERE id = ?').pluck().get('first');
  deleteNodeAttachmentLink({ nodeId: 'first', attachmentId: hash, role: 'reference' });
  expect(listNodeAttachments('first')).toEqual([]);
  expect(listNodeAttachments('second')).toHaveLength(1);
  expect(db.prepare('SELECT current_version_id FROM nodes WHERE id = ?').pluck().get('first')).not.toBe(before);
});
