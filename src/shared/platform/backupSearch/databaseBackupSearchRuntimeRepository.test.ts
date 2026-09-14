import { beforeEach, expect, it, vi } from 'vitest';

import { getRuntimeInvoke } from '../runtimeInvoke';

import { nextDatabaseBackupSearch } from './databaseBackupSearchRuntimeRepository';

vi.mock('../runtimeInvoke', () => ({ getRuntimeInvoke: vi.fn() }));

beforeEach(() => vi.mocked(getRuntimeInvoke).mockReset());

it('keeps the managed backup file name and accepts a root-level match without a parent path', async () => {
  vi.mocked(getRuntimeInvoke).mockReturnValue(vi.fn().mockResolvedValue({
    match: {
      backup_name: 'manual-2026-09-10.db.gz',
      backup_updated_at: '2026-09-10T00:00:00.000Z',
      content: 'body',
      deleted: false,
      node_id: 'node-1',
      path: '',
      title: 'Topic'
    },
    skipped_backup_count: 0,
    status: 'match'
  }));

  await expect(nextDatabaseBackupSearch('session-1')).resolves.toMatchObject({
    match: { backup_name: 'manual-2026-09-10.db.gz', path: '' },
    status: 'match'
  });
});

it('rejects a match that does not identify its backup file', async () => {
  vi.mocked(getRuntimeInvoke).mockReturnValue(vi.fn().mockResolvedValue({
    match: {
      backup_updated_at: '2026-09-10T00:00:00.000Z',
      content: 'body',
      deleted: false,
      node_id: 'node-1',
      path: 'Topic',
      title: 'Topic'
    },
    skipped_backup_count: 0,
    status: 'match'
  }));

  await expect(nextDatabaseBackupSearch('session-1')).rejects.toThrow('invalid match');
});
