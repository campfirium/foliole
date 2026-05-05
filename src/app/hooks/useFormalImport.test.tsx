import { act, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { RuntimeImportOverview } from '../../shared/platform/importBridge';
import { useWorkspaceStore } from '../../store/workspaceStore';

const { loadRuntimeImportOverview, onManagedInboxUpdated, runtimeInvoke } = vi.hoisted(() => ({
  loadRuntimeImportOverview: vi.fn(),
  onManagedInboxUpdated: vi.fn(),
  runtimeInvoke: vi.fn(() => Promise.resolve(null))
}));

vi.mock('../../shared/platform/bridge', () => ({
  getRuntimeInvoke: () => runtimeInvoke,
  onManagedInboxUpdated
}));

vi.mock('../../shared/platform/importBridge', () => ({
  loadRuntimeImportOverview,
  runRuntimeClipboardImport: vi.fn(),
  runRuntimeDirectoryImport: vi.fn(),
  runRuntimeTextFileImport: vi.fn()
}));

import { resetFormalImportState, useFormalImport } from './useFormalImport';

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

function createOverview(importId: string): RuntimeImportOverview {
  return {
    latestFailure: null,
    latestResult: {
      contentFingerprint: 'content-fingerprint',
      degradedReason: null,
      duplicateSemantic: 'duplicate',
      failureReason: 'Import monitor noticed a later duplicate.',
      importId,
      importedAt: '2026-03-22T10:05:00.000Z',
      nodeId: null,
      provider: 'desktop_text_file',
      resultStatus: 'failed',
      sourceFingerprint: 'source-fingerprint',
      sourceKind: 'markdown',
      sourceLocator: '/tmp/imported-note.md',
      sourceName: 'imported-note.md'
    },
    recentRuns: []
  };
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
  const overview = createOverview('import-1');
  const managedInboxUpdatedHandlers: Array<(importId: string) => void> = [];

  loadRuntimeImportOverview.mockImplementationOnce(() => firstOverview.promise).mockResolvedValueOnce(overview);
  onManagedInboxUpdated.mockImplementation(async (handler: (importId: string) => void) => {
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
  emitManagedInboxUpdate('import-1');
  firstOverview.resolve(overview);

  await waitFor(() => {
    expect(loadRuntimeImportOverview).toHaveBeenCalledTimes(2);
  });
  await waitFor(() => {
    expect(rehydrateSpy).toHaveBeenCalledTimes(1);
  });
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
