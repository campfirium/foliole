import { beforeEach, expect, it, vi } from 'vitest';

import {
  refreshImportWorkspaceOnce,
  resetAppliedImportWorkspacePatches
} from './formalImportWorkspacePatch';

function createDeferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

beforeEach(() => {
  resetAppliedImportWorkspacePatches();
});

it('shares one authoritative refresh between concurrent paths for the same import completion', async () => {
  const deferred = createDeferred();
  const refreshWorkspace = vi.fn(() => deferred.promise);

  const directResultRefresh = refreshImportWorkspaceOnce('import-1', refreshWorkspace);
  const managedEventRefresh = refreshImportWorkspaceOnce('import-1', refreshWorkspace);
  deferred.resolve();

  await expect(Promise.all([directResultRefresh, managedEventRefresh])).resolves.toEqual([true, false]);
  await expect(refreshImportWorkspaceOnce('import-1', refreshWorkspace)).resolves.toBe(false);
  expect(refreshWorkspace).toHaveBeenCalledTimes(1);
});

it('allows a failed authoritative refresh to be retried', async () => {
  const refreshWorkspace = vi.fn().mockRejectedValueOnce(new Error('refresh failed')).mockResolvedValueOnce(undefined);

  await expect(refreshImportWorkspaceOnce('import-1', refreshWorkspace)).rejects.toThrow('refresh failed');
  await expect(refreshImportWorkspaceOnce('import-1', refreshWorkspace)).resolves.toBe(true);
  expect(refreshWorkspace).toHaveBeenCalledTimes(2);
});
