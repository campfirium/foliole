// @vitest-environment node

import fs from 'node:fs/promises';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const { resolveAppPaths } = vi.hoisted(() => ({
  resolveAppPaths: vi.fn()
}));

vi.mock('../ipc/paths.js', () => ({ resolveAppPaths }));

import { logDirectoryImportCompleted } from './importRunLogger.js';

const tempRoots: string[] = [];
const completedImportResult = {
  archive_root_path: null,
  consume_policy: 'clear' as const,
  consumed_count: 1,
  discovered_count: 2,
  entries: [
    {
      adapter: 'markdown_directory' as const,
      content_fingerprint: 'content-1',
      degraded_reason: null,
      duplicate_semantic: 'new' as const,
      failure_reason: null,
      import_id: 'import-a',
      imported_at: '2026-03-25T08:00:00.000Z',
      node_id: 'node-a',
      provider: 'desktop_text_file' as const,
      result_status: 'imported' as const,
      source_fingerprint: 'source-1',
      source_kind: 'markdown' as const,
      source_locator: '/tmp/a.md',
      source_name: 'a.md'
    },
    {
      adapter: 'markdown_directory' as const,
      content_fingerprint: 'content-2',
      degraded_reason: null,
      duplicate_semantic: 'new' as const,
      failure_reason: 'boom',
      import_id: 'import-b',
      imported_at: '2026-03-25T08:00:01.000Z',
      node_id: null,
      provider: 'desktop_text_file' as const,
      result_status: 'failed' as const,
      source_fingerprint: 'source-2',
      source_kind: 'markdown' as const,
      source_locator: '/tmp/b.md',
      source_name: 'b.md'
    }
  ],
  failed_count: 1,
  imported_count: 1,
  root_path: '/tmp/inbox',
  source_adapter: 'foliole_managed_inbox_folder' as const
};

function expectCompletedImportLogLine(line: string) {
  expect(JSON.parse(line)).toEqual({
    event: 'directory_import_completed',
    payload: {
      archive_root_path: null,
      consume_policy: 'clear',
      consumed_count: 1,
      discovered_count: 2,
      entries: [
        {
          failure_reason: null,
          imported_at: '2026-03-25T08:00:00.000Z',
          result_status: 'imported',
          source_name: 'a.md'
        },
        {
          failure_reason: 'boom',
          imported_at: '2026-03-25T08:00:01.000Z',
          result_status: 'failed',
          source_name: 'b.md'
        }
      ],
      failed_count: 1,
      imported_count: 1,
      source_adapter: 'foliole_managed_inbox_folder'
    },
    timestamp: '2026-03-25T09:00:00.000Z'
  });
}

async function createTempRoot(prefix: string) {
  const parentDir = path.join(process.cwd(), '.tmp-tests');
  await fs.mkdir(parentDir, { recursive: true });
  const root = await fs.mkdtemp(path.join(parentDir, `${prefix}-`));
  tempRoots.push(root);
  return root;
}

beforeEach(async () => {
  vi.clearAllMocks();
  const appDataDir = await createTempRoot('import-run-logger');
  resolveAppPaths.mockReturnValue({
    app_cache_dir: path.join(appDataDir, 'cache'),
    app_config_dir: path.join(appDataDir, 'config'),
    app_data_dir: appDataDir,
    app_log_dir: path.join(appDataDir, 'logs')
  });
});

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => fs.rm(root, { force: true, recursive: true })));
});

it('writes completed imports into a per-day import log file', async () => {
  await logDirectoryImportCompleted(completedImportResult, new Date('2026-03-25T09:00:00.000Z'));

  const logFile = path.join(resolveAppPaths().app_log_dir, 'import', 'import-2026-03-25.log');
  const lines = (await fs.readFile(logFile, 'utf8')).trim().split('\n');

  expect(lines).toHaveLength(1);
  expectCompletedImportLogLine(lines[0] ?? '');
});

it('removes import log files older than the last seven days when appending', async () => {
  const importLogDir = path.join(resolveAppPaths().app_log_dir, 'import');
  await fs.mkdir(importLogDir, { recursive: true });
  await fs.writeFile(path.join(importLogDir, 'import-2026-03-17.log'), 'old\n', 'utf8');
  await fs.writeFile(path.join(importLogDir, 'import-2026-03-18.log'), 'keep\n', 'utf8');

  await logDirectoryImportCompleted(
    {
      archive_root_path: null,
      consume_policy: 'keep',
      consumed_count: 0,
      discovered_count: 0,
      entries: [],
      failed_count: 0,
      imported_count: 0,
      root_path: '/tmp/external',
      source_adapter: 'external_directory'
    },
    new Date('2026-03-24T00:00:00.000Z')
  );

  await expect(fs.stat(path.join(importLogDir, 'import-2026-03-17.log'))).rejects.toThrow();
  await expect(fs.readFile(path.join(importLogDir, 'import-2026-03-18.log'), 'utf8')).resolves.toBe('keep\n');
  await expect(fs.stat(path.join(importLogDir, 'import-2026-03-24.log'))).resolves.toBeTruthy();
});
