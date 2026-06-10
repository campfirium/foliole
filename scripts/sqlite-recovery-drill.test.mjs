// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it } from 'vitest';

import { runRecoveryDrill } from './sqlite-recovery-drill.ts';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-recovery-drill-test-'));
});

afterEach(async () => {
  await fs.rm(tempRoot, { recursive: true, force: true });
});

it('backs up and restores a fixture database into an isolated target with redacted checks', async () => {
  const report = await runRecoveryDrill({ workDir: tempRoot });

  expect(report.status).toBe('ok');
  expect(report.source.totalNodeCount).toBe(3);
  expect(report.restored.totalNodeCount).toBe(3);
  expect(report.restored.deletedNodeCount).toBe(1);
  expect(report.restored.reviewLogCount).toBe(1);
  expect(report.checks.every((check) => check.status === 'ok')).toBe(true);
  await expect(fs.stat(report.backupPath)).resolves.toBeDefined();
  await expect(fs.stat(report.restorePath)).resolves.toBeDefined();

  const serializedReport = JSON.stringify(report);
  expect(serializedReport).not.toContain('fixture root body');
  expect(serializedReport).not.toContain('fixture prompt body');
  expect(serializedReport).not.toContain('fixture answer body');
  expect(serializedReport).not.toContain('fixture-trash');
});

it('fails before restore when the isolated target database already exists', async () => {
  const backupPath = path.join(tempRoot, 'backup.db');
  const restorePath = path.join(tempRoot, 'restored.db');
  await fs.writeFile(restorePath, 'existing target sentinel');

  await expect(runRecoveryDrill({ backupPath, restorePath, workDir: tempRoot }))
    .rejects.toThrow(`restore target path already exists: ${restorePath}`);
  await expect(fs.access(backupPath)).rejects.toMatchObject({ code: 'ENOENT' });
});
