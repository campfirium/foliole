// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-mirror-rebuild-app-data';
let mockedDocumentsDir = '/tmp/foliole-mirror-rebuild-documents';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    documents_dir: mockedDocumentsDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { closeDatabaseConnection } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';
import { updateLibraryPathSetting } from '../ipc/libraryPaths.js';

import { rebuildMirrorAttachmentLinks } from './rebuildAttachmentLinks.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-mirror-rebuild-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  mockedDocumentsDir = path.join(tempRoot, 'Documents');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

it('rewrites broken mirror attachment links to the current assets location in batch', async () => {
  const oldLibraryHome = path.join(tempRoot, 'Library-Old');
  const nextLibraryHome = path.join(tempRoot, 'Library-New');
  const oldAssetsDir = path.join(oldLibraryHome, 'Assets');
  const nextAssetsDir = path.join(nextLibraryHome, 'Assets');
  const nextMirrorDir = path.join(nextLibraryHome, 'Mirror');
  const staleAttachmentPath = path.join(oldAssetsDir, 'hash-1.png');
  const nextAttachmentPath = path.join(nextAssetsDir, 'hash-1.png');

  await updateLibraryPathSetting({ location: 'library_home', path: nextLibraryHome });
  await fs.mkdir(nextAssetsDir, { recursive: true });
  await fs.mkdir(path.join(nextMirrorDir, 'nested'), { recursive: true });
  await fs.writeFile(nextAttachmentPath, 'image-bytes', 'utf8');
  await fs.writeFile(
    path.join(nextMirrorDir, 'entry.md'),
    `# Entry\n![Cover](${staleAttachmentPath})\n`,
    'utf8'
  );
  await fs.writeFile(
    path.join(nextMirrorDir, 'nested', 'second.md'),
    `# Another\n![Cover](${staleAttachmentPath})\nAgain: ![Cover](${staleAttachmentPath})\n`,
    'utf8'
  );

  await expect(fs.access(staleAttachmentPath)).rejects.toThrow();

  await expect(rebuildMirrorAttachmentLinks()).resolves.toMatchObject({
    scanned_document_count: 2,
    rewritten_document_count: 2,
    rewritten_link_count: 3
  });

  await expect(fs.readFile(path.join(nextMirrorDir, 'entry.md'), 'utf8')).resolves.toContain(nextAttachmentPath);
  await expect(fs.readFile(path.join(nextMirrorDir, 'nested', 'second.md'), 'utf8')).resolves.toContain(nextAttachmentPath);
});
