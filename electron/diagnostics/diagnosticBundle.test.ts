// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it, vi } from 'vitest';

import { exportDiagnosticBundle } from './diagnosticBundle.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.map((root) => fs.rm(root, { force: true, recursive: true })));
  roots.length = 0;
});

it('exports logs and crash dumps into a local diagnostic zip', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-diagnostic-bundle-'));
  roots.push(root);
  const logsDir = path.join(root, 'logs');
  const crashDir = path.join(root, 'crashDumps');
  const desktopDir = path.join(root, 'Desktop');
  await fs.mkdir(logsDir, { recursive: true });
  await fs.mkdir(crashDir, { recursive: true });
  await fs.mkdir(desktopDir, { recursive: true });
  await fs.writeFile(path.join(logsDir, 'runtime-2026-04-27.ndjson'), '{"event":"x"}\n', 'utf8');
  await fs.writeFile(path.join(crashDir, 'dump.dmp'), 'minidump', 'utf8');
  const showItemInFolder = vi.fn();

  const result = await exportDiagnosticBundle({
    app: {
      getPath: (name: string) => ({ crashDumps: crashDir, desktop: desktopDir, logs: logsDir })[name] as string,
      getVersion: () => '0.1.0'
    },
    shell: { showItemInFolder }
  });

  expect(result).toMatchObject({
    included_file_count: 2,
    status: 'exported'
  });
  expect(path.dirname(result.file_path)).toBe(desktopDir);
  await expect(fs.stat(result.file_path)).resolves.toBeTruthy();
  expect(showItemInFolder).toHaveBeenCalledWith(result.file_path);
});
