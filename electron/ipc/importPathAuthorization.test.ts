// @vitest-environment node

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const { loadExternalSearchFolders } = vi.hoisted(() => ({
  loadExternalSearchFolders: vi.fn()
}));

vi.mock('../database/externalSearchFolders.js', () => ({
  loadExternalSearchFolders
}));

import {
  assertAuthorizedImportFilePath,
  assertExternalSearchImportPath,
  authorizeSelectedImportFilePath,
  resetImportPathAuthorizationForTests
} from './importPathAuthorization.js';

let tempRoot = '';

beforeEach(async () => {
  resetImportPathAuthorizationForTests();
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-import-path-auth-'));
  loadExternalSearchFolders.mockReturnValue([]);
});

afterEach(async () => {
  resetImportPathAuthorizationForTests();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

it('rejects renderer-provided file paths until the main process authorizes them', async () => {
  const filePath = path.join(tempRoot, 'note.md');
  await fs.writeFile(filePath, '# Note', 'utf8');

  await expect(assertAuthorizedImportFilePath(filePath)).rejects.toThrow('Import file path is not authorized.');

  await authorizeSelectedImportFilePath(filePath);

  await expect(assertAuthorizedImportFilePath(filePath)).resolves.toBe(filePath);
});

it('rejects special filesystem roots before import authorization succeeds', async () => {
  await expect(authorizeSelectedImportFilePath('/proc/self/environ')).rejects.toThrow('Import path is not authorized.');
});

it('allows external search imports only when the file resolves inside a configured root', async () => {
  const libraryRoot = path.join(tempRoot, 'library');
  const filePath = path.join(libraryRoot, 'doc.md');
  const outsidePath = path.join(tempRoot, 'outside.md');
  await fs.mkdir(libraryRoot, { recursive: true });
  await fs.writeFile(filePath, '# Library', 'utf8');
  await fs.writeFile(outsidePath, '# Outside', 'utf8');
  loadExternalSearchFolders.mockReturnValue([{ folder_path: libraryRoot }]);

  await expect(assertExternalSearchImportPath(filePath)).resolves.toBe(filePath);
  await expect(assertExternalSearchImportPath(outsidePath)).rejects.toThrow('External search import path is not authorized.');
});
