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

it('shows each recent failure once with its redacted error text and repeat count', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-diagnostic-summary-'));
  roots.push(root);
  const logsDir = path.join(root, 'logs');
  const crashDir = path.join(root, 'crashDumps');
  await fs.mkdir(logsDir, { recursive: true });
  await fs.mkdir(crashDir, { recursive: true });
  const noisy = Array.from({ length: 6 }, (_, index) => JSON.stringify({
    event: 'native_node_source_update_payload_invalid',
    level: 'warn',
    occurred_at: `2026-11-21T05:37:${String(index).padStart(2, '0')}.000Z`,
    payload: { action: 'load_runtime_node_source_update_preview' },
    source: 'renderer.bridge'
  }));
  const importFailure = JSON.stringify({
    event: 'native_import_file_selection_failed',
    level: 'warn',
    occurred_at: '2026-11-21T05:38:32.595Z',
    payload: {
      action: 'select_runtime_import_text_file',
      error: {
        message: "Error invoking remote method 'foliole:invoke': Error: EPERM: operation not permitted, open '/Volumes/Books/某本书.epub'",
        name: 'Error'
      }
    },
    source: 'renderer.bridge'
  });
  const commandFailure = JSON.stringify({
    event: 'native_command_failed',
    level: 'warn',
    occurred_at: '2026-11-21T05:38:32.590Z',
    payload: {
      command: 'select_import_text_file',
      error: { code: 'EPERM', message: 'EPERM: operation not permitted, open /Volumes/Books/某本书.epub', name: 'Error' },
      message: 'EPERM: operation not permitted, open /Volumes/Books/某本书.epub'
    },
    source: 'electron.main'
  });
  await fs.writeFile(
    path.join(logsDir, 'runtime-2026-11-21.ndjson'),
    `${[...noisy, commandFailure, importFailure].join('\n')}\n`,
    'utf8'
  );

  const result = await copyDiagnosticReport({
    app: {
      getPath: (name: string) => ({ crashDumps: crashDir, logs: logsDir })[name] as string,
      getVersion: () => '0.1.0'
    }
  });

  const lines = result.report_text.split('\n');
  expect(lines.filter((line) => line.includes('native_node_source_update_payload_invalid'))).toHaveLength(1);
  expect(result.report_text).toContain('×6');
  expect(result.report_text).toContain('EPERM: operation not permitted');
  expect(result.report_text).toContain('"command":"select_import_text_file"');
  expect(result.report_text).toContain('Error EPERM');
  expect(result.report_text).not.toContain('某本书');
  expect(result.report_text).not.toContain('/Volumes/Books');
});

it('returns only the platform and redacted error lines for the feedback scope, or nothing when clean', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-diagnostic-errors-scope-'));
  roots.push(root);
  const logsDir = path.join(root, 'logs');
  await fs.mkdir(logsDir, { recursive: true });
  const app = { getPath: (name: string) => ({ crashDumps: path.join(root, 'crash'), logs: logsDir })[name] as string, getVersion: () => '0.1.0' };

  await expect(copyDiagnosticReport({ app, scope: 'errors' })).resolves.toEqual({ report_text: '', status: 'generated' });

  await fs.writeFile(path.join(logsDir, 'runtime-2026-11-21.ndjson'), `${JSON.stringify({
    event: 'native_command_failed',
    level: 'warn',
    occurred_at: '2026-11-21T05:38:32.590Z',
    payload: { command: 'select_import_text_file', error: { message: 'EPERM: operation not permitted, open /Volumes/B/某本书.epub', name: 'Error' } },
    source: 'electron.main'
  })}\n`, 'utf8');
  const result = await copyDiagnosticReport({ app, scope: 'errors' });

  expect(result.report_text.split('\n')[0]).toMatch(/^Platform: /u);
  expect(result.report_text).toContain('select_import_text_file');
  expect(result.report_text).not.toContain('# Foliole Diagnostic Report');
  expect(result.report_text).not.toContain('某本书');
});
