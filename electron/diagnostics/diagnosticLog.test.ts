// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it, vi } from 'vitest';

const { resolveAppPaths } = vi.hoisted(() => ({
  resolveAppPaths: vi.fn()
}));

vi.mock('../ipc/paths.js', () => ({ resolveAppPaths }));

import { appendDiagnosticLog, parseDiagnosticLogPayload } from './diagnosticLog.js';

afterEach(() => {
  resolveAppPaths.mockReset();
});

it('parses renderer diagnostic payloads into normalized NDJSON records', () => {
  expect(
    parseDiagnosticLogPayload({
      event: 'bridge_unavailable',
      level: 'warn',
      occurredAt: '2026-04-22T08:00:00.000Z',
      payload: {
        action: 'resolve_runtime_app_paths',
        fallback: 'return_null',
        ignored: undefined,
        token: 'secret-token',
        url: 'https://example.test/private?token=secret'
      },
      source: 'renderer.bridge'
    })
  ).toEqual({
    event: 'bridge_unavailable',
    level: 'warn',
    occurred_at: '2026-04-22T08:00:00.000Z',
    payload: {
      action: 'resolve_runtime_app_paths',
      fallback: 'return_null',
      token: '[redacted-secret]',
      url: '[redacted-url]'
    },
    source: 'renderer.bridge'
  });
});

it('writes runtime diagnostics into the standard app log directory and prunes old files', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-runtime-log-'));
  const logDir = path.join(tempRoot, 'logs');
  resolveAppPaths.mockReturnValue({
    app_log_dir: logDir
  });

  fs.mkdirSync(logDir, { recursive: true });
  fs.writeFileSync(path.join(logDir, 'runtime-2026-04-14.ndjson'), 'old\n', 'utf8');
  fs.writeFileSync(path.join(logDir, 'runtime-2026-04-16.ndjson'), 'keep\n', 'utf8');

  await appendDiagnosticLog(
    {
      event: 'bridge_unavailable',
      level: 'warn',
      occurred_at: '2026-04-22T08:00:00.000Z',
      payload: {
        action: 'resolve_runtime_app_paths',
        fallback: 'return_null',
        filePath: '/Users/alice/private.md',
        token: 'secret-token',
        url: 'https://example.test/private?token=secret'
      },
      source: 'renderer.bridge'
    },
    new Date('2026-04-22T08:00:00.000Z')
  );

  await expect(fs.promises.stat(path.join(logDir, 'runtime-2026-04-14.ndjson'))).rejects.toThrow();
  await expect(fs.promises.readFile(path.join(logDir, 'runtime-2026-04-16.ndjson'), 'utf8')).resolves.toBe('keep\n');
  const lines = fs.readFileSync(path.join(logDir, 'runtime-2026-04-22.ndjson'), 'utf8').trim().split('\n');
  expect(lines).toHaveLength(1);
  expect(JSON.parse(lines[0] ?? '{}')).toMatchObject({
    event: 'bridge_unavailable',
    level: 'warn',
    occurred_at: '2026-04-22T08:00:00.000Z',
    payload: {
      action: 'resolve_runtime_app_paths',
      fallback: 'return_null',
      filePath: '[redacted-path]',
      token: '[redacted-secret]',
      url: '[redacted-url]'
    },
    source: 'renderer.bridge'
  });
});
