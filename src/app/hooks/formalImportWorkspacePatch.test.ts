import { beforeEach, expect, it, vi } from 'vitest';

import { useWorkspaceStore } from '../../store/workspaceStore';

import {
  applyImportWorkspacePatch,
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

it('applies different completion IDs and allows the same ID after a library reset', () => {
  const patch = { nodes: [], nodeOrder: ['imported'] };
  expect(applyImportWorkspacePatch('import-1', patch)).toBe(true);
  useWorkspaceStore.setState({ nodeOrder: ['later'] });
  const laterOrder = useWorkspaceStore.getState().nodeOrder;
  expect(applyImportWorkspacePatch('import-1', patch)).toBe(true);
  expect(useWorkspaceStore.getState().nodeOrder).toBe(laterOrder);
  expect(applyImportWorkspacePatch('import-2', patch)).toBe(true);
  expect(useWorkspaceStore.getState().nodeOrder).toContain('imported');
  useWorkspaceStore.setState({ nodeOrder: ['new-library'] });
  resetAppliedImportWorkspacePatches();
  expect(applyImportWorkspacePatch('import-1', patch)).toBe(true);
  expect(useWorkspaceStore.getState().nodeOrder).toContain('imported');
});

it('does not mark an absent patch as applied', () => {
  expect(applyImportWorkspacePatch('import-1', null)).toBe(false);
  expect(applyImportWorkspacePatch('import-1', { nodes: [], nodeOrder: ['imported'] })).toBe(true);
  expect(useWorkspaceStore.getState().nodeOrder).toContain('imported');
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
