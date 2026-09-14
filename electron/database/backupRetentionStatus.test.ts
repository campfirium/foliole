// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it } from 'vitest';

import type { NativeBackupSettings } from '../../lib/platform/nativeUtilityContract.js';

import { loadBackupRetentionStatus, recordBackupCleanup } from './backupRetentionStatus.js';

let tempRoot = '';

afterEach(async () => {
  if (tempRoot) await fs.rm(tempRoot, { force: true, recursive: true });
  tempRoot = '';
});

it('reports the restore points selected by the active policy and the latest cleanup', async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-retention-status-'));
  await createBackup('foliole-auto-backup-260913-090000.db.gz', '2026-09-13T09:00:00.000Z', 5);
  await createBackup('foliole-2026-09-13_09-30-00-000.db.gz', '2026-09-13T09:30:00.000Z', 7);
  await createBackup('foliole-auto-backup-260913-100000.db.gz', '2026-09-13T10:00:00.000Z', 11);
  await createBackup('pre-restore-2026-09-13_10-15-00-000.db.gz', '2026-09-13T10:15:00.000Z', 13);
  recordBackupCleanup(tempRoot, {
    capacityDeletedCount: 1,
    deletedCount: 2,
    failedCount: 1,
    policyDeletedCount: 1,
    releasedBytes: 17,
    remainingBytesOverLimit: 3
  });

  await expect(loadBackupRetentionStatus(settings())).resolves.toEqual({
    counts: { hourly: 2, daily: 0, weekly: 0, monthly: 0 },
    lastCleanup: { failedCount: 1, movedToTrashCount: 2, remainingBytesOverLimit: 3 },
    safetyCount: 1,
    totalSizeBytes: 36
  });
});

async function createBackup(fileName: string, timestamp: string, size: number) {
  const filePath = path.join(tempRoot, fileName);
  await fs.writeFile(filePath, Buffer.alloc(size));
  const date = new Date(timestamp);
  await fs.utimes(filePath, date, date);
}

function settings(): NativeBackupSettings {
  return {
    schema_version: 3,
    defaults_version: 1,
    overridden_fields: [],
    backup_dir: tempRoot,
    daily_max_count: 0,
    extra_backup_dir: '',
    extra_backup_max_count: 10,
    hourly_max_count: 2,
    monthly_max_count: 0,
    retention_priority: ['hourly', 'daily', 'weekly', 'monthly'],
    safety_max_count: 2,
    total_size_limit_bytes: 1024,
    updated_at: '2026-09-13T10:16:00.000Z',
    weekly_max_count: 0
  };
}
