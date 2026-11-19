// @vitest-environment node

import fs from 'node:fs/promises';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const { resolveAppPaths } = vi.hoisted(() => ({
  resolveAppPaths: vi.fn()
}));

vi.mock('../ipc/paths.js', () => ({ resolveAppPaths }));

import { logDirectoryImportCompleted, logDirectoryImportFailed } from './importRunLogger.js';

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

async function createTempRoot(prefix: string) {
  const parentDir = path.join(process.cwd(), '.tmp', 'tests');
  await fs.mkdir(parentDir, { recursive: true });
  const root = await fs.mkdtemp(path.join(parentDir, `${prefix}-`));
  tempRoots.push(root);
  return root;
}

beforeEach(async () => {
  vi.clearAllMocks();
  vi.stubEnv('FOLIOLE_ENABLE_DESKTOP_DEBUG_PROBE', undefined);
  vi.stubEnv('ELECTRON_RENDERER_URL', undefined);
  const appDataDir = await createTempRoot('import-run-logger');
  resolveAppPaths.mockReturnValue({
    app_cache_dir: path.join(appDataDir, 'cache'),
    app_config_dir: path.join(appDataDir, 'config'),
    app_data_dir: appDataDir,
    app_log_dir: path.join(appDataDir, 'logs')
  });
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(tempRoots.splice(0).map((root) => fs.rm(root, { force: true, recursive: true })));
});

it('adds only a safe summary of a partial import to the daily runtime log', async () => {
  await logDirectoryImportCompleted(completedImportResult, new Date('2026-03-25T09:00:00.000Z'));

  const logs = resolveAppPaths().app_log_dir;
  const text = await fs.readFile(path.join(logs, 'runtime-2026-03-25.ndjson'), 'utf8');
  expect(JSON.parse(text)).toMatchObject({
    event: 'directory_import_completed',
    level: 'warn',
    payload: {
      operation: 'directory_import',
      source_kind: 'foliole_managed_inbox_folder',
      status: 'incomplete',
      discovered_count: 2,
      imported_count: 1,
      failed_count: 1
    }
  });
  for (const value of ['a.md', 'b.md', '/tmp/inbox', 'node-a', 'boom', 'source_locator']) {
    expect(text).not.toContain(value);
  }
  expect(await fs.readdir(logs)).toEqual(['runtime-2026-03-25.ndjson']);
});

it('keeps routine successful imports off the daily file and safely records total failures', async () => {
  const logs = resolveAppPaths().app_log_dir;
  await logDirectoryImportCompleted({ ...completedImportResult, failed_count: 0 });
  await expect(fs.stat(logs)).rejects.toMatchObject({ code: 'ENOENT' });

  await logDirectoryImportFailed('external_directory', new Error('private document content'));
  const [fileName] = await fs.readdir(logs);
  const text = await fs.readFile(path.join(logs, fileName!), 'utf8');
  expect(JSON.parse(text)).toMatchObject({ event: 'directory_import_failed', level: 'error' });
  expect(text).not.toContain('private document content');
});
