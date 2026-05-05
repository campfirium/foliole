// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it, vi } from 'vitest';

const { resolveAppPaths } = vi.hoisted(() => ({
  resolveAppPaths: vi.fn()
}));

vi.mock('../ipc/paths.js', () => ({ resolveAppPaths }));

import { logMainProcessException, startLocalCrashReporter } from './mainProcessDiagnostics.js';

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

  logMainProcessException('main_uncaught_exception', new Error('sqlite exploded'));

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
        message: 'sqlite exploded',
        name: 'Error'
      }
    },
    source: 'electron.main'
  });
});
