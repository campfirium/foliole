// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const getPath = vi.hoisted(() => vi.fn());
const startAccessing = vi.hoisted(() => vi.fn());

vi.mock('electron', () => ({
  app: {
    getPath,
    startAccessingSecurityScopedResource: startAccessing
  }
}));

import {
  persistSecurityScopedBookmark,
  restoreSecurityScopedBookmarks,
  stopSecurityScopedBookmarks
} from './securityScopedBookmarks.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-security-bookmarks-'));
  getPath.mockReturnValue(tempRoot);
  startAccessing.mockReset();
  Object.defineProperty(process, 'mas', { configurable: true, value: true });
});

afterEach(async () => {
  stopSecurityScopedBookmarks();
  Object.defineProperty(process, 'mas', { configurable: true, value: false });
  await fs.rm(tempRoot, { force: true, recursive: true });
});

it('persists and restores a selected directory bookmark in MAS builds', async () => {
  const stopFirst = vi.fn();
  const stopRestored = vi.fn();
  startAccessing.mockReturnValueOnce(stopFirst).mockReturnValueOnce(stopRestored);

  persistSecurityScopedBookmark('/library', 'bookmark-data');
  expect(startAccessing).toHaveBeenCalledWith('bookmark-data');
  await expect(fs.readFile(path.join(tempRoot, 'security-scoped-bookmarks.json'), 'utf8'))
    .resolves.toBe(`${JSON.stringify([{ bookmark: 'bookmark-data', path: '/library' }])}\n`);

  stopSecurityScopedBookmarks();
  expect(stopFirst).toHaveBeenCalledOnce();
  restoreSecurityScopedBookmarks();
  expect(startAccessing).toHaveBeenLastCalledWith('bookmark-data');
  stopSecurityScopedBookmarks();
  expect(stopRestored).toHaveBeenCalledOnce();
});

it('does not persist bookmarks outside MAS builds', async () => {
  Object.defineProperty(process, 'mas', { configurable: true, value: false });
  persistSecurityScopedBookmark('/library', 'bookmark-data');
  expect(startAccessing).not.toHaveBeenCalled();
  await expect(fs.stat(path.join(tempRoot, 'security-scoped-bookmarks.json'))).rejects.toThrow();
});
