// @vitest-environment node
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { expect, it, vi } from 'vitest';

import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import { bindParentOrderWriter } from '../../lib/core/database/parentOrderWriter.js';
import { loadWorkspaceNodeDocument } from '../../lib/core/database/workspaceNodeDocument.js';
import { publishAttachmentLibraryPathSnapshot, clearAttachmentLibraryPathSnapshot } from '../attachments/attachmentLibraryPathSnapshot.js';
import { resolveAttachmentFileForSync } from '../attachments/resourceResolver.js';
import { createBetterSqlite3Driver } from '../database/betterSqlite3Driver.js';
import { authorizeSelectedImportDirectoryPath, resetImportPathAuthorizationForTests } from '../ipc/importPathAuthorization.js';

import { writeSuperMemoTopic } from './writeSuperMemoTopic.js';

const connection = vi.hoisted(() => ({ driver: null as ReturnType<typeof createBetterSqlite3Driver> | null }));
vi.mock('../database/connection.js', () => ({
  openDatabaseConnection: () => connection,
  runWithDatabaseConnectionOwner: (fn: () => unknown) => fn()
}));

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jY1sAAAAASUVORK5CYII=', 'base64');

it('persists the inline image in a reopened Topic and leaves unresolved source paths in place', async () => {
  const temp = await mkdtemp(path.join(tmpdir(), 'foliole-supermemo-topic-'));
  const source = path.join(temp, 'collection');
  const dbPath = path.join(temp, 'library.sqlite');
  let sqlite = new Database(dbPath);
  try {
    initializeDatabaseSchema(sqlite);
    connection.driver = createBetterSqlite3Driver(sqlite);
    publishAttachmentLibraryPathSnapshot({ assetsDir: path.join(temp, 'assets'), libraryScope: temp });
    await mkdir(source);
    await writeFile(path.join(source, 'map old.png'), png);
    await writeFile(path.join(temp, 'outside.png'), png);
    await symlink(path.join(temp, 'outside.png'), path.join(source, 'outside.png'));
    await authorizeSelectedImportDirectoryPath(source);
    const now = '2026-11-13T00:00:00.000Z';
    sqlite.prepare("INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)").run('host_name', JSON.stringify('desktop'), now);
    bindParentOrderWriter(connection.driver, { deviceAnchor: 'desktop', libraryPath: dbPath });
    const writeTopic = () => writeSuperMemoTopic({
      nodeId: 'topic', parentNodeId: null, title: 'Maps', isTitleManual: true, anchorLink: null,
      position: null, createdAt: now, updatedAt: now
    }, [
      '<p>Before <img alt="Map" src="map%20old.png"> after.</p>',
      '<img src="outside.png"><img src="missing.png"><audio src="voice.mp3"></audio>'
    ], source);
    sqlite.exec(`CREATE TEMP TRIGGER fail_image_owner BEFORE UPDATE OF resource_references ON nodes
      BEGIN SELECT RAISE(ABORT, 'injected_attachment_failure'); END`);
    await expect(writeTopic()).rejects.toThrow('injected_attachment_failure');
    expect(loadWorkspaceNodeDocument(connection.driver, 'topic')).toBeFalsy();
    sqlite.exec('DROP TRIGGER fail_image_owner');
    const result = await writeTopic();
    expect(result.unresolvedImages).toEqual(['outside.png', 'missing.png']);
    sqlite.close();
    sqlite = new Database(dbPath);
    const document = loadWorkspaceNodeDocument(createBetterSqlite3Driver(sqlite), 'topic');
    const stored = sqlite.prepare('SELECT resource_references FROM nodes WHERE id = ?').get('topic') as {
      resource_references: string;
    };
    const references = JSON.parse(stored.resource_references);
    expect(references).toEqual([{ storage_key: expect.any(String), original_name: 'map old.png', role: 'image' }]);
    const key = references[0].storage_key;
    const version = sqlite.prepare('SELECT snapshot_json FROM node_sync_versions WHERE object_id = ?').get('topic') as {
      snapshot_json: string;
    };
    expect(JSON.parse(JSON.parse(version.snapshot_json).resource_references)).toEqual(references);
    expect(document?.content).toContain(`Before ![Map](asset://${key}) after.`);
    expect(document?.content).toContain('missing.png');
    expect(document?.content).not.toContain('voice.mp3');
    const file = resolveAttachmentFileForSync(key);
    expect(file.status).toBe('ready');
    if (file.status === 'ready') expect(await readFile(file.filePath)).toEqual(png);
  } finally {
    sqlite.close();
    clearAttachmentLibraryPathSnapshot();
    resetImportPathAuthorizationForTests();
    await rm(temp, { recursive: true, force: true });
  }
});
