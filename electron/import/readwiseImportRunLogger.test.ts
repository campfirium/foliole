// @vitest-environment node

import fs from 'node:fs/promises';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const { resolveAppPaths } = vi.hoisted(() => ({
  resolveAppPaths: vi.fn()
}));

vi.mock('../ipc/paths.js', () => ({ resolveAppPaths }));

import {
  logReadwiseScanCompleted,
  logReadwiseScanStarted,
  logReadwiseSourceCompleted,
  logReadwiseSourceStarted
} from './readwiseImportRunLogger.js';

const tempRoots: string[] = [];

async function createTempRoot(prefix: string) {
  const parentDir = path.join(process.cwd(), '.tmp-tests');
  await fs.mkdir(parentDir, { recursive: true });
  const root = await fs.mkdtemp(path.join(parentDir, `${prefix}-`));
  tempRoots.push(root);
  return root;
}

function buildReadwiseCompletedPayload() {
  return {
    blockedCount: 1,
    directoryPath: '/tmp/readwise/Full Document Contents/Articles',
    discoveredCount: 3,
    entries: [
      {
        action: 'import_attempted' as const,
        detail: 'Imported successfully.',
        failureReason: null,
        importStatus: 'imported' as const,
        previewStatus: 'new' as const,
        sourcePath: 'article-a.md'
      },
      {
        action: 'skipped' as const,
        detail: 'No file changes detected since the last keep scan.',
        failureReason: null,
        importStatus: null,
        previewStatus: 'unchanged' as const,
        sourcePath: 'article-b.md'
      },
      {
        action: 'skipped' as const,
        detail: 'This source was deleted in Foliole and will stay blocked until you import it again manually.',
        failureReason: 'blocked_deleted',
        importStatus: 'blocked_deleted' as const,
        previewStatus: 'blocked_deleted' as const,
        sourcePath: 'article-c.md'
      }
    ],
    failedCount: 0,
    importedCount: 1,
    ruleId: 'draft-import-source-1',
    skippedCount: 2
  };
}

beforeEach(async () => {
  vi.clearAllMocks();
  const appDataDir = await createTempRoot('readwise-import-run-logger');
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

function expectReadwiseProgressLines(lines: unknown[]) {
  expect(lines).toEqual([
    buildScanStartedLogLine(),
    buildSourceStartedLogLine(),
    buildSourceCompletedLogLine(),
    buildScanCompletedLogLine()
  ]);
}

function buildScanStartedLogLine() {
  return {
    event: 'readwise_scan_started',
    payload: {
      directory_path: '/tmp/readwise/Full Document Contents/Articles',
      rule_id: 'draft-import-source-1'
    },
    timestamp: '2026-03-25T09:00:00.000Z'
  };
}

function buildSourceStartedLogLine() {
  return {
    event: 'readwise_source_started',
    payload: {
      directory_path: '/tmp/readwise/Full Document Contents/Articles',
      rule_id: 'draft-import-source-1',
      source_path: 'article-a.md'
    },
    timestamp: '2026-03-25T09:00:00.000Z'
  };
}

function buildSourceCompletedLogLine() {
  return {
    event: 'readwise_source_completed',
    payload: {
      directory_path: '/tmp/readwise/Full Document Contents/Articles',
      duration_ms: 1234,
      rule_id: 'draft-import-source-1',
      source_path: 'article-a.md'
    },
    timestamp: '2026-03-25T09:00:00.000Z'
  };
}

function buildScanCompletedLogLine() {
  return {
    event: 'readwise_scan_completed',
    payload: {
      blocked_count: 1,
      directory_path: '/tmp/readwise/Full Document Contents/Articles',
      discovered_count: 3,
      entries: [
        {
          action: 'import_attempted',
          detail: 'Imported successfully.',
          failure_reason: null,
          import_status: 'imported',
          preview_status: 'new',
          source_path: 'article-a.md'
        },
        {
          action: 'skipped',
          detail: 'No file changes detected since the last keep scan.',
          failure_reason: null,
          import_status: null,
          preview_status: 'unchanged',
          source_path: 'article-b.md'
        },
        {
          action: 'skipped',
          detail: 'This source was deleted in Foliole and will stay blocked until you import it again manually.',
          failure_reason: 'blocked_deleted',
          import_status: 'blocked_deleted',
          preview_status: 'blocked_deleted',
          source_path: 'article-c.md'
        }
      ],
      failed_count: 0,
      imported_count: 1,
      rule_id: 'draft-import-source-1',
      skipped_count: 2
    },
    timestamp: '2026-03-25T09:00:00.000Z'
  };
}

it('writes readwise scan and source progress into a dedicated per-day log file', async () => {
  const now = new Date('2026-03-25T09:00:00.000Z');
  await logReadwiseScanStarted(
    { directoryPath: '/tmp/readwise/Full Document Contents/Articles', ruleId: 'draft-import-source-1' },
    now
  );
  await logReadwiseSourceStarted(
    {
      directoryPath: '/tmp/readwise/Full Document Contents/Articles',
      ruleId: 'draft-import-source-1',
      sourcePath: 'article-a.md'
    },
    now
  );
  await logReadwiseSourceCompleted(
    {
      directoryPath: '/tmp/readwise/Full Document Contents/Articles',
      durationMs: 1234,
      ruleId: 'draft-import-source-1',
      sourcePath: 'article-a.md'
    },
    now
  );
  await logReadwiseScanCompleted(buildReadwiseCompletedPayload(), now);

  const logFile = path.join(resolveAppPaths().app_log_dir, 'import', 'readwise-2026-03-25.log');
  const lines = (await fs.readFile(logFile, 'utf8')).trim().split('\n').map((line) => JSON.parse(line));
  expectReadwiseProgressLines(lines);
});

it('removes stale readwise log files when appending', async () => {
  const importLogDir = path.join(resolveAppPaths().app_log_dir, 'import');
  await fs.mkdir(importLogDir, { recursive: true });
  await fs.writeFile(path.join(importLogDir, 'readwise-2026-03-17.log'), 'old\n', 'utf8');
  await fs.writeFile(path.join(importLogDir, 'readwise-2026-03-18.log'), 'keep\n', 'utf8');

  await logReadwiseScanStarted(
    { directoryPath: '/tmp/readwise/Full Document Contents/Articles', ruleId: 'draft-import-source-1' },
    new Date('2026-03-24T00:00:00.000Z')
  );

  await expect(fs.stat(path.join(importLogDir, 'readwise-2026-03-17.log'))).rejects.toThrow();
  await expect(fs.readFile(path.join(importLogDir, 'readwise-2026-03-18.log'), 'utf8')).resolves.toBe('keep\n');
  await expect(fs.stat(path.join(importLogDir, 'readwise-2026-03-24.log'))).resolves.toBeTruthy();
});

it('does not fail the import path when diagnostic logging cannot write', async () => {
  const logRoot = resolveAppPaths().app_log_dir;
  await fs.mkdir(path.dirname(logRoot), { recursive: true });
  await fs.writeFile(logRoot, 'not a directory', 'utf8');

  await expect(
    logReadwiseSourceStarted(
      {
        directoryPath: '/tmp/readwise/Full Document Contents/Articles',
        ruleId: 'draft-import-source-1',
        sourcePath: 'article-a.md'
      },
      new Date('2026-03-25T09:00:00.000Z')
    )
  ).resolves.toBeUndefined();
});
