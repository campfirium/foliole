import { expect, it, vi } from 'vitest';

import { waitForWindowsDatabaseFile } from './windows-sync-group-database-readiness.mjs';

it('waits for the isolated Windows database after renderer readiness', async () => {
  const exists = vi.fn()
    .mockReturnValueOnce(false)
    .mockReturnValueOnce(true);
  const pause = vi.fn(async () => undefined);

  await expect(waitForWindowsDatabaseFile('D:/acceptance/client/library/Data/foliole.db', {
    exists, pause, timeoutMs: 1_000
  })).resolves.toMatch(/foliole\.db$/u);
  expect(exists).toHaveBeenCalledTimes(2);
  expect(pause).toHaveBeenCalledWith(100);
});
