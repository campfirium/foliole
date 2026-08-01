// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it, vi } from 'vitest';

const { resolveAppPaths } = vi.hoisted(() => ({
  resolveAppPaths: vi.fn()
}));

vi.mock('../ipc/paths.js', () => ({ resolveAppPaths }));

import {
  logMainProcessException,
  logMainProcessOperationFailure,
  startLocalCrashReporter
} from './mainProcessDiagnostics.js';

afterEach(() => {
  resolveAppPaths.mockReset();
});

it('starts the Electron crash reporter in local minidump mode', () => {
  const crashReporter = {
    start: vi.fn()
  };

  startLocalCrashReporter(crashReporter as never, 'Foliole Test');

  expect(crashReporter.start).toHaveBeenCalledWith({
    compress: true,
    productName: 'Foliole Test',
    uploadToServer: false
  });
});

it('writes main process exceptions into the runtime NDJSON log', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-main-diagnostics-'));
  const logDir = path.join(tempRoot, 'logs');
  resolveAppPaths.mockReturnValue({
    app_log_dir: logDir
  });

  logMainProcessException(
    'main_uncaught_exception',
    new Error('sqlite exploded at /Users/alice/private/foliole.db token=secret')
  );

  await vi.waitFor(() => {
    const files = fs.readdirSync(logDir);
    expect(files.some((file) => /^runtime-\d{4}-\d{2}-\d{2}\.ndjson$/.test(file))).toBe(true);
  });

  const fileName = fs.readdirSync(logDir).find((file) => file.startsWith('runtime-')) as string;
  const records = fs.readFileSync(path.join(logDir, fileName), 'utf8').trim().split('\n');

  expect(JSON.parse(records[0] ?? '{}')).toMatchObject({
    event: 'main_uncaught_exception',
    level: 'error',
    payload: {
      error: {
        message: 'sqlite exploded at [redacted-path] token=[redacted-secret]',
        name: 'Error',
        stack: '[redacted-stack]'
      },
      message: 'sqlite exploded at [redacted-path] token=[redacted-secret]',
      name: 'Error'
    },
    source: 'electron.main'
  });
  expect(records[0]).not.toContain('/Users/alice/private/foliole.db');
  expect(records[0]).not.toContain('token=secret');
});

it('writes operation failures without embedding the raw error stack', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-operation-diagnostics-'));
  const logDir = path.join(tempRoot, 'logs');
  resolveAppPaths.mockReturnValue({
    app_log_dir: logDir
  });

  logMainProcessOperationFailure(
    'import_file',
    { source_kind: 'markdown' },
    new Error('Cannot import /Users/alice/private/book.md'),
    'Import failed'
  );

  await vi.waitFor(() => {
    const files = fs.readdirSync(logDir);
    expect(files.some((file) => /^runtime-\d{4}-\d{2}-\d{2}\.ndjson$/.test(file))).toBe(true);
  });

  const fileName = fs.readdirSync(logDir).find((file) => file.startsWith('runtime-')) as string;
  const recordText = fs.readFileSync(path.join(logDir, fileName), 'utf8').trim();

  expect(JSON.parse(recordText)).toMatchObject({
    event: 'operation_failed',
    level: 'error',
    payload: {
      action: 'import_file',
      message: 'Import failed',
      name: 'Error',
      operation: 'import_file',
      source_kind: 'markdown',
      status: 'failed'
    },
    source: 'electron.main'
  });
  expect(recordText).not.toContain('/Users/alice/private/book.md');
  expect(recordText).not.toContain('stack');
});
