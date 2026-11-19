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
  vi.unstubAllEnvs();
});

it('keeps routine details off the daily log while retaining faults and the Agent Control audit', async () => {
  vi.stubEnv('FOLIOLE_ENABLE_DESKTOP_DEBUG_PROBE', undefined);
  vi.stubEnv('ELECTRON_RENDERER_URL', undefined);
  const logDir = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-runtime-level-'));
  resolveAppPaths.mockReturnValue({ app_log_dir: logDir });
  const now = new Date('2026-04-22T08:00:00.000Z');
  const base = { occurred_at: now.toISOString(), payload: {}, source: 'electron.main' };
  try {
    await appendDiagnosticLog({ ...base, event: 'detail', level: 'debug' }, now);
    await appendDiagnosticLog({ ...base, event: 'routine', level: 'info' }, now);
    await appendDiagnosticLog({ ...base, event: 'fault', level: 'warn' }, now);
    await appendDiagnosticLog({ ...base, event: 'failure', level: 'error' }, now);
    await appendDiagnosticLog({ ...base, event: 'agent_control_api_call', level: 'info', source: 'electron.agentControl' }, now);
    const records = fs.readFileSync(path.join(logDir, 'runtime-2026-04-22.ndjson'), 'utf8').trim().split('\n');
    expect(records.map(line => JSON.parse(line).event)).toEqual(['fault', 'failure', 'agent_control_api_call']);
  } finally {
    fs.rmSync(logDir, { recursive: true, force: true });
  }
});

it('keeps the daily file within one MiB across overlapping writes to a large existing log', async () => {
  const logDir = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-runtime-limit-'));
  resolveAppPaths.mockReturnValue({ app_log_dir: logDir });
  const now = new Date('2026-04-22T08:00:00.000Z');
  const file = path.join(logDir, 'runtime-2026-04-22.ndjson');
  const base = { occurred_at: now.toISOString(), level: 'warn' as const, source: 'electron.main' };
  try {
    const older = JSON.stringify({ ...base, event: 'older', payload: { detail: 'x'.repeat(12_000) } });
    fs.writeFileSync(file, `${older}\n`.repeat(100) + '{"event":"recent"}\n{"incomplete":');
    await Promise.all(Array.from({ length: 8 }, (_, index) => appendDiagnosticLog({
      ...base, event: `new-${index}`, payload: { detail: '阅'.repeat(20_000) }
    }, now)));
    expect(fs.statSync(file).size).toBeLessThanOrEqual(1024 * 1024);
    const events = fs.readFileSync(file, 'utf8').trim().split('\n').map(line => JSON.parse(line).event);
    expect(events).toContain('recent');
    expect(events.slice(-8)).toEqual(Array.from({ length: 8 }, (_, index) => `new-${index}`));
  } finally {
    fs.rmSync(logDir, { recursive: true, force: true });
  }
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
