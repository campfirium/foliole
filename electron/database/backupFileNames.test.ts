// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it } from 'vitest';

import {
  automaticBackupFileName,
  buildManagedBackupPath,
  buildRollbackBackupPath
} from './backupFileNames.js';

let tempRoot = '';
const now = new Date(2026, 8, 14, 7, 56, 51);

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-backup-names-'));
});

afterEach(async () => {
  await fs.rm(tempRoot, { force: true, recursive: true });
});

it('uses one compact timestamp shape for automatic, manual, and rollback backups', () => {
  expect(automaticBackupFileName(now)).toBe('foliole-auto-260914-075651.db.gz');
  expect(path.basename(buildManagedBackupPath(now, tempRoot)))
    .toBe('foliole-manual-260914-075651.db.gz');
  expect(path.basename(buildRollbackBackupPath(now, tempRoot)))
    .toBe('foliole-rollback-260914-075651.db');
});

it('adds a short sequence only when manual or rollback backups collide in one second', async () => {
  await fs.writeFile(path.join(tempRoot, 'foliole-manual-260914-075651.db.gz'), 'existing');
  await fs.writeFile(path.join(tempRoot, 'foliole-rollback-260914-075651.db'), 'existing');

  expect(path.basename(buildManagedBackupPath(now, tempRoot)))
    .toBe('foliole-manual-260914-075651-2.db.gz');
  expect(path.basename(buildRollbackBackupPath(now, tempRoot)))
    .toBe('foliole-rollback-260914-075651-2.db');
});
