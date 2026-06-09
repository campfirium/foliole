import { act, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { RuntimeImportOverview } from '../../shared/platform/importOverviewRuntimeRepository';
import { useWorkspaceStore } from '../../store/workspaceStore';

const { loadRuntimeImportOverview, onManagedInboxUpdated, runtimeInvoke } = vi.hoisted(() => ({
  loadRuntimeImportOverview: vi.fn(),
  onManagedInboxUpdated: vi.fn(),
  runtimeInvoke: vi.fn(() => Promise.resolve(null))
}));

vi.mock('../../shared/platform/runtimeInvoke', () => ({
  getRuntimeInvoke: () => runtimeInvoke
}));

vi.mock('../../shared/platform/runtimeShellEvents', () => ({
  onManagedInboxUpdated
}));

vi.mock('../../shared/platform/importOverviewRuntimeRepository', () => ({
  loadRuntimeImportOverview
}));

vi.mock('../../shared/platform/importExecutionRuntimeRepository', () => ({
  runRuntimeClipboardImport: vi.fn(),
  runRuntimeDirectoryImport: vi.fn(),
  runRuntimeTextFileImport: vi.fn()
}));

import { resetFormalImportState, useFormalImport } from './useFormalImport';
import {
  createImportNodeMutationPatch,
  createImportedOverview,
  createOverview
} from './useFormalImport.testSupport';

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

function Probe() {
  useFormalImport();
  return null;
}

beforeEach(() => {
  resetFormalImportState();
  vi.clearAllMocks();
  runtimeInvoke.mockResolvedValue(null);
});

afterEach(() => {
  vi.restoreAllMocks();
});

it('queues a managed inbox refresh that arrives while the overview bootstrap is still in flight', async () => {
  const firstOverview = createDeferred<RuntimeImportOverview | null>();
  const overview = createImportedOverview('import-1');
  const managedInboxUpdatedHandlers: Array<(payload: { importId: string; nodeMutationPatch?: unknown }) => void> = [];

  loadRuntimeImportOverview.mockImplementationOnce(() => firstOverview.promise).mockResolvedValueOnce(overview);
  onManagedInboxUpdated.mockImplementation(async (handler: (payload: { importId: string; nodeMutationPatch?: unknown }) => void) => {
    managedInboxUpdatedHandlers.push(handler);
    return () => {
      const index = managedInboxUpdatedHandlers.indexOf(handler);
      if (index >= 0) {
        managedInboxUpdatedHandlers.splice(index, 1);
      }
    };
  });
  const rehydrateSpy = vi.spyOn(useWorkspaceStore.persist, 'rehydrate').mockResolvedValue();

  render(<Probe />);

  await waitFor(() => {
    expect(onManagedInboxUpdated).toHaveBeenCalledTimes(1);
  });

  const emitManagedInboxUpdate = managedInboxUpdatedHandlers[0];
  if (!emitManagedInboxUpdate) {
    throw new Error('managed inbox update handler was not registered');
  }
  emitManagedInboxUpdate({ importId: 'import-1' });
  firstOverview.resolve(overview);

  await waitFor(() => {
    expect(loadRuntimeImportOverview).toHaveBeenCalledTimes(2);
  });
  await waitFor(() => {
    expect(rehydrateSpy).toHaveBeenCalledTimes(1);
  });
});

it('does not rehydrate the workspace again for a repeated managed inbox import id', async () => {
  const firstOverview = createOverview('import-0');
  const nextOverview = createImportedOverview('import-1');
  const managedInboxUpdatedHandlers: Array<(payload: { importId: string; nodeMutationPatch?: unknown }) => void> = [];

  loadRuntimeImportOverview.mockResolvedValueOnce(firstOverview).mockResolvedValue(nextOverview);
  onManagedInboxUpdated.mockImplementation(async (handler: (payload: { importId: string; nodeMutationPatch?: unknown }) => void) => {
    managedInboxUpdatedHandlers.push(handler);
    return () => undefined;
  });
  const rehydrateSpy = vi.spyOn(useWorkspaceStore.persist, 'rehydrate').mockResolvedValue();

  render(<Probe />);

  await waitFor(() => {
    expect(onManagedInboxUpdated).toHaveBeenCalledTimes(1);
  });

  const emitManagedInboxUpdate = managedInboxUpdatedHandlers[0];
  if (!emitManagedInboxUpdate) {
    throw new Error('managed inbox update handler was not registered');
  }
  emitManagedInboxUpdate({ importId: 'import-1' });
  emitManagedInboxUpdate({ importId: 'import-1' });

  await waitFor(() => {
    expect(loadRuntimeImportOverview).toHaveBeenCalledTimes(3);
  });
  expect(rehydrateSpy).toHaveBeenCalledTimes(1);
});

it('loads the import overview on bootstrap without rehydrating a historical latest import', async () => {
  loadRuntimeImportOverview.mockResolvedValue(createImportedOverview('import-1'));
  onManagedInboxUpdated.mockResolvedValue(() => undefined);
  const rehydrateSpy = vi.spyOn(useWorkspaceStore.persist, 'rehydrate').mockResolvedValue();

  render(<Probe />);

  await waitFor(() => {
    expect(loadRuntimeImportOverview).toHaveBeenCalledTimes(1);
  });
  expect(rehydrateSpy).not.toHaveBeenCalled();
});

it('does not rehydrate the workspace for a keep import source-update notification', async () => {
  const managedInboxUpdatedHandlers: Array<(payload: { importId: string; nodeMutationPatch?: unknown }) => void> = [];

  loadRuntimeImportOverview.mockResolvedValue(createImportedOverview('import-1'));
  onManagedInboxUpdated.mockImplementation(async (handler: (payload: { importId: string; nodeMutationPatch?: unknown }) => void) => {
    managedInboxUpdatedHandlers.push(handler);
    return () => undefined;
  });
  const rehydrateSpy = vi.spyOn(useWorkspaceStore.persist, 'rehydrate').mockResolvedValue();

  render(<Probe />);

  await waitFor(() => {
    expect(onManagedInboxUpdated).toHaveBeenCalledTimes(1);
  });

  managedInboxUpdatedHandlers[0]?.({ importId: '' });

  await waitFor(() => {
    expect(loadRuntimeImportOverview).toHaveBeenCalledTimes(2);
  });
  expect(rehydrateSpy).not.toHaveBeenCalled();
});

it('applies a managed inbox patch without rehydrating the workspace for that import id', async () => {
  const managedInboxUpdatedHandlers: Array<(payload: { importId: string; nodeMutationPatch?: unknown }) => void> = [];

  loadRuntimeImportOverview.mockResolvedValue(createImportedOverview('import-1'));
  onManagedInboxUpdated.mockImplementation(async (handler: (payload: { importId: string; nodeMutationPatch?: unknown }) => void) => {
    managedInboxUpdatedHandlers.push(handler);
    return () => undefined;
  });
  const rehydrateSpy = vi.spyOn(useWorkspaceStore.persist, 'rehydrate').mockResolvedValue();

  render(<Probe />);

  await waitFor(() => {
    expect(onManagedInboxUpdated).toHaveBeenCalledTimes(1);
  });

  managedInboxUpdatedHandlers[0]?.({
    importId: 'import-1',
    nodeMutationPatch: createImportNodeMutationPatch()
  });

  await waitFor(() => {
    expect(loadRuntimeImportOverview).toHaveBeenCalledTimes(2);
  });
  expect(useWorkspaceStore.getState().nodesById['node-1']?.title).toBe('Imported note');
  expect(rehydrateSpy).not.toHaveBeenCalled();
});

it('refreshes the workspace when the window regains focus after a missed import update', async () => {
  loadRuntimeImportOverview
    .mockResolvedValueOnce(createOverview('import-0'))
    .mockResolvedValueOnce({
      latestFailure: null,
      latestResult: {
        contentFingerprint: 'content-fingerprint-next',
        degradedReason: null,
        duplicateSemantic: 'new',
        failureReason: null,
        importId: 'import-1',
        importedAt: '2026-03-22T10:10:00.000Z',
        nodeId: 'node-1',
        provider: 'desktop_text_file',
        resultStatus: 'imported',
        sourceFingerprint: 'source-fingerprint-next',
        sourceKind: 'markdown',
        sourceLocator: '/tmp/imported-note-2.md',
        sourceName: 'imported-note-2.md'
      },
      recentRuns: []
    });
  onManagedInboxUpdated.mockResolvedValue(() => undefined);
  const rehydrateSpy = vi.spyOn(useWorkspaceStore.persist, 'rehydrate').mockResolvedValue();

  render(<Probe />);

  await waitFor(() => {
    expect(loadRuntimeImportOverview).toHaveBeenCalledTimes(1);
  });

  await act(async () => {
    window.dispatchEvent(new Event('focus'));
  });

  await waitFor(() => {
    expect(loadRuntimeImportOverview).toHaveBeenCalledTimes(2);
  });
  await waitFor(() => {
    expect(rehydrateSpy).toHaveBeenCalledTimes(1);
  });
});
