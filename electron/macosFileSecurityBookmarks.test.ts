// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  adapter: {
    createAndStart: vi.fn(),
    resolveAndStart: vi.fn(),
    stop: vi.fn(() => true)
  },
  appendMainProcessDiagnosticLog: vi.fn(),
  getPath: vi.fn()
}));

vi.mock('electron', () => ({
  app: { getPath: mocks.getPath }
}));

vi.mock('./diagnostics/mainProcessDiagnostics.js', () => ({
  appendMainProcessDiagnosticLog: mocks.appendMainProcessDiagnosticLog
}));

vi.mock('./macosSecurityScopedBookmarksNative.js', () => ({
  loadMacosSecurityScopedBookmarkAdapter: () => ({ adapter: mocks.adapter, status: 'ready' })
}));

import {
  ensureMacosFileSecurityScopedAccess,
  restoreMacosFileSecurityScopedBookmarks,
  stopMacosFileSecurityScopedBookmarks
} from './macosFileSecurityBookmarks.js';

let originalPlatform: PropertyDescriptor | undefined;
let tempRoot = '';

beforeEach(async () => {
  originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
  Object.defineProperty(process, 'platform', { configurable: true, value: 'darwin' });
  process.env.APP_SANDBOX_CONTAINER_ID = 'com.campfirium.foliole';
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-file-bookmarks-'));
  mocks.getPath.mockReturnValue(tempRoot);
  mocks.adapter.createAndStart.mockReset();
  mocks.adapter.resolveAndStart.mockReset();
  mocks.adapter.stop.mockClear();
  mocks.appendMainProcessDiagnosticLog.mockClear();
});

afterEach(async () => {
  stopMacosFileSecurityScopedBookmarks();
  delete process.env.APP_SANDBOX_CONTAINER_ID;
  if (originalPlatform) Object.defineProperty(process, 'platform', originalPlatform);
  await fs.rm(tempRoot, { force: true, recursive: true });
});

it('persists a new file bookmark and reuses its active handle during startup restore', async () => {
  mocks.adapter.createAndStart.mockReturnValue({
    bookmark: 'new-bookmark',
    handle: 11,
    ok: true,
    resolvedPath: '/docs/read.md',
    stale: false
  });

  expect(ensureMacosFileSecurityScopedAccess('/docs/read.md')).toEqual({ status: 'active' });
  restoreMacosFileSecurityScopedBookmarks();

  expect(mocks.adapter.createAndStart).toHaveBeenCalledOnce();
  expect(mocks.adapter.resolveAndStart).not.toHaveBeenCalled();
  await expect(fs.readFile(path.join(tempRoot, 'macos-file-security-bookmarks.json'), 'utf8'))
    .resolves.toBe(`${JSON.stringify([{ bookmark: 'new-bookmark', path: '/docs/read.md' }])}\n`);

  stopMacosFileSecurityScopedBookmarks();
  expect(mocks.adapter.stop).toHaveBeenCalledOnce();
  expect(mocks.adapter.stop).toHaveBeenCalledWith(11);
});

it('rejects a bookmark that resolves to a different path without rewriting the stored path', async () => {
  await writeStore([{ bookmark: 'old-bookmark', path: '/docs/read.md' }]);
  mocks.adapter.resolveAndStart.mockReturnValue({
    bookmark: 'old-bookmark',
    handle: 21,
    ok: true,
    resolvedPath: '/moved/read.md',
    stale: false
  });

  restoreMacosFileSecurityScopedBookmarks();

  expect(mocks.adapter.stop).toHaveBeenCalledWith(21);
  await expect(fs.readFile(path.join(tempRoot, 'macos-file-security-bookmarks.json'), 'utf8'))
    .resolves.toContain('/docs/read.md');
});

it('refreshes a stale bookmark for the same path and keeps only the refreshed handle active', async () => {
  await writeStore([{ bookmark: 'old-bookmark', path: '/docs/read.md' }]);
  mocks.adapter.resolveAndStart.mockReturnValue({
    bookmark: 'old-bookmark',
    handle: 31,
    ok: true,
    resolvedPath: '/docs/read.md',
    stale: true
  });
  mocks.adapter.createAndStart.mockReturnValue({
    bookmark: 'fresh-bookmark',
    handle: 32,
    ok: true,
    resolvedPath: '/docs/read.md',
    stale: false
  });

  restoreMacosFileSecurityScopedBookmarks();
  expect(mocks.adapter.stop).toHaveBeenCalledWith(31);

  stopMacosFileSecurityScopedBookmarks();
  expect(mocks.adapter.stop).toHaveBeenCalledWith(32);
  await expect(fs.readFile(path.join(tempRoot, 'macos-file-security-bookmarks.json'), 'utf8'))
    .resolves.toContain('fresh-bookmark');
});

it('logs invalid bookmark JSON without treating a missing store as corruption', async () => {
  restoreMacosFileSecurityScopedBookmarks();
  expect(mocks.appendMainProcessDiagnosticLog).not.toHaveBeenCalledWith(
    'macos_file_bookmark_store_invalid',
    expect.anything()
  );

  await fs.writeFile(path.join(tempRoot, 'macos-file-security-bookmarks.json'), '{broken');
  restoreMacosFileSecurityScopedBookmarks();

  expect(mocks.appendMainProcessDiagnosticLog).toHaveBeenCalledWith(
    'macos_file_bookmark_store_invalid',
    expect.objectContaining({ errorCode: 'invalid_json' })
  );
});

async function writeStore(entries: Array<{ bookmark: string; path: string }>) {
  await fs.writeFile(
    path.join(tempRoot, 'macos-file-security-bookmarks.json'),
    `${JSON.stringify(entries)}\n`,
    { mode: 0o600 }
  );
}
