import { beforeEach, expect, it, vi } from 'vitest';

import type { CompanionFolderBackupPort } from '../../../../../lib/platform/companionFolderBackupContract';

function port(open: CompanionFolderBackupPort['openSource'] = async () => undefined) {
  return { openSource: vi.fn(open), closeSource: vi.fn(async () => undefined) } as unknown as CompanionFolderBackupPort
    & { openSource: ReturnType<typeof vi.fn> };
}

beforeEach(() => { vi.resetModules(); });

it('lets the first owner of a newly loaded page reclaim what an earlier page left registered, and only that owner', async () => {
  const { CompanionFolderBackupSource } = await import('./companionFolderBackupSource');
  const native = port();
  const first = new CompanionFolderBackupSource();
  await first.acquire('/db', native);
  await first.close();
  await new CompanionFolderBackupSource().acquire('/db', native);
  expect(native.openSource.mock.calls.map(([input]) => input.reclaim)).toEqual([true, false]);
});

it('keeps reclaiming until this page has registered an owner', async () => {
  const { CompanionFolderBackupSource } = await import('./companionFolderBackupSource');
  const native = port();
  native.openSource.mockRejectedValueOnce(new Error('Invalid active database path.'));
  const failed = new CompanionFolderBackupSource();
  await expect(failed.acquire('/db', native)).rejects.toThrow('Invalid active database path.');
  await failed.close();
  await new CompanionFolderBackupSource().acquire('/db', native);
  expect(native.openSource.mock.calls.map(([input]) => input.reclaim)).toEqual([true, true]);
});
