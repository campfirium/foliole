// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it } from 'vitest';

import { copyDiagnosticReport } from './diagnosticBundle.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.map((root) => fs.rm(root, { force: true, recursive: true })));
  roots.length = 0;
});

it('copies a small diagnostic report without embedding full logs or crash dumps', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-diagnostic-bundle-'));
  roots.push(root);
  const logsDir = path.join(root, 'logs');
  const windowsLogsDir = path.join(logsDir, 'windows');
  const crashDir = path.join(root, 'crashDumps');
  await fs.mkdir(windowsLogsDir, { recursive: true });
  await fs.mkdir(crashDir, { recursive: true });
  await fs.writeFile(
    path.join(logsDir, 'runtime-2026-04-27.ndjson'),
    [
      JSON.stringify({ event: 'startup', level: 'info', occurred_at: '2026-04-27T00:00:00.000Z', source: 'test' }),
      JSON.stringify({ event: 'renderer_error', level: 'error', occurred_at: '2026-04-27T00:00:01.000Z', source: 'renderer' })
    ].join('\n'),
    'utf8'
  );
  await fs.writeFile(
    path.join(windowsLogsDir, 'native-boot-events.ndjson'),
    [
      JSON.stringify({ stage: 'app_responsive', timestamp: '2026-04-27T00:00:02.000Z' }),
      JSON.stringify({ stage: 'bridge_ready', timestamp: '2026-04-27T00:00:03.000Z', source: 'renderer' })
    ].join('\n'),
    'utf8'
  );
  await fs.writeFile(path.join(crashDir, 'dump.dmp'), 'minidump', 'utf8');

  const result = await copyDiagnosticReport({
    app: {
      getPath: (name: string) => ({ crashDumps: crashDir, logs: logsDir })[name] as string,
      getVersion: () => '0.1.0'
    }
  });

  expect(result).toMatchObject({
    status: 'generated'
  });
  expect(result.report_text).toContain('# Foliole Diagnostic Report');
  expect(result.report_text).toContain('renderer_error');
  expect(result.report_text).toContain('bridge_ready');
  expect(result.report_text).toContain('dump.dmp');
  expect(result.report_text).toContain('This report does not include library content');
  expect(result.report_text).not.toContain('minidump');
});

it('shows safe operation failure details without embedding sensitive payload fields', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-diagnostic-operation-'));
  roots.push(root);
  const logsDir = path.join(root, 'logs');
  const crashDir = path.join(root, 'crashDumps');
  await fs.mkdir(logsDir, { recursive: true });
  await fs.mkdir(crashDir, { recursive: true });
  await fs.writeFile(
    path.join(logsDir, 'runtime-2026-06-06.ndjson'),
    `${JSON.stringify({
      event: 'operation_failed',
      level: 'error',
      occurred_at: '2026-06-06T10:00:00.000Z',
      payload: {
        action: 'import_file',
        error: {
          message: 'Cannot import /Users/alice/private/book.md',
          name: 'Error',
          stack: 'Error: Cannot import /Users/alice/private/book.md\n    at importFile'
        },
        message: 'Import failed',
        name: 'Error',
        operation: 'import_file',
        source_kind: 'markdown',
        stack: 'Error: private stack',
        status: 'failed'
      },
      source: 'electron.main'
    })}\n`,
    'utf8'
  );

  const result = await copyDiagnosticReport({
    app: {
      getPath: (name: string) => ({ crashDumps: crashDir, logs: logsDir })[name] as string,
      getVersion: () => '0.1.0'
    }
  });

  expect(result.report_text).toContain('operation_failed');
  expect(result.report_text).toContain('"action":"import_file"');
  expect(result.report_text).toContain('"operation":"import_file"');
  expect(result.report_text).toContain('"source_kind":"markdown"');
  expect(result.report_text).toContain('"message":"Import failed"');
  expect(result.report_text).not.toContain('/Users/alice/private/book.md');
  expect(result.report_text).not.toContain('private stack');
});

it('redacts paths and URLs from whitelisted details and record sources', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-diagnostic-redaction-'));
  roots.push(root);
  const logsDir = path.join(root, 'logs');
  const crashDir = path.join(root, 'crashDumps');
  const privatePath = '/Users/alice/private/book.md';
  const privateUrl = 'https://private.example.test/report?token=secret';
  await fs.mkdir(logsDir, { recursive: true });
  await fs.mkdir(crashDir, { recursive: true });
  await fs.writeFile(
    path.join(logsDir, 'runtime-2026-06-06.ndjson'),
    `${JSON.stringify({
      event: 'operation_failed',
      level: 'error',
      occurred_at: '2026-06-06T10:00:00.000Z',
      payload: {
        message: `Cannot open ${privatePath}`,
        reason: privateUrl
      },
      source: `${privatePath}?next=${encodeURIComponent(privateUrl)}`
    })}\n`,
    'utf8'
  );

  const result = await copyDiagnosticReport({
    app: {
      getPath: (name: string) => ({ crashDumps: crashDir, logs: logsDir })[name] as string,
      getVersion: () => '0.1.0'
    }
  });

  expect(result.report_text).toContain('operation_failed');
  expect(result.report_text).toContain('[redacted-path]');
  expect(result.report_text).toContain('[redacted-url]');
  expect(result.report_text).not.toContain(privatePath);
  expect(result.report_text).not.toContain(privateUrl);
  expect(result.report_text).not.toContain(encodeURIComponent(privateUrl));
});

it('keeps errors from the newest runtime file when older files exceed the report limit', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-diagnostic-recency-'));
  roots.push(root);
  const logsDir = path.join(root, 'logs');
  const crashDir = path.join(root, 'crashDumps');
  await fs.mkdir(logsDir, { recursive: true });
  await fs.mkdir(crashDir, { recursive: true });
  const olderRecords = Array.from({ length: 8 }, (_, index) => JSON.stringify({
    event: `older_error_${index}`,
    level: 'error',
    occurred_at: `2026-06-05T10:00:0${index}.000Z`
  }));
  await fs.writeFile(
    path.join(logsDir, 'runtime-2026-06-05.ndjson'),
    `${olderRecords.join('\n')}\n`,
    'utf8'
  );
  await fs.writeFile(
    path.join(logsDir, 'runtime-2026-06-06.ndjson'),
    `${JSON.stringify({
      event: 'newest_error',
      level: 'error',
      occurred_at: '2026-06-06T10:00:00.000Z'
    })}\n`,
    'utf8'
  );

  const result = await copyDiagnosticReport({
    app: {
      getPath: (name: string) => ({ crashDumps: crashDir, logs: logsDir })[name] as string,
      getVersion: () => '0.1.0'
    }
  });

  expect(result.report_text).toContain('newest_error');
  expect(result.report_text).not.toContain('older_error_0');
});
