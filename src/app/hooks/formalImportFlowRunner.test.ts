import { beforeEach, expect, it, vi } from 'vitest';

import type { RuntimeTextImportResult } from '../../shared/platform/importExecutionRuntimeRepository';

const { refreshWorkspaceState } = vi.hoisted(() => ({
  refreshWorkspaceState: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('../../store/workspaceRefreshScheduler', () => ({
  refreshWorkspaceState
}));

import {
  runImportFlow,
  shouldRehydrateWorkspace
} from './formalImportFlowRunner';
import { useFormalImportState } from './formalImportState';
import { resetAppliedImportWorkspacePatches } from './formalImportWorkspacePatch';

function createResult(overrides: Partial<RuntimeTextImportResult> = {}): RuntimeTextImportResult {
  return {
    contentFingerprint: 'content-fingerprint',
    degradedReason: null,
    duplicateSemantic: 'new',
    failureReason: null,
    importId: 'import-1',
    importedAt: '2026-08-16T10:00:00.000Z',
    nodeId: 'node-1',
    provider: 'desktop_text_file',
    resultStatus: 'imported',
    sourceFingerprint: 'source-fingerprint',
    sourceKind: 'epub',
    sourceLocator: '/tmp/book.epub',
    sourceName: 'book.epub',
    ...overrides
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  resetAppliedImportWorkspacePatches();
  useFormalImportState.setState({ isImporting: false });
});

it('rehydrates any persisted result when no complete patch is available', () => {
  expect(shouldRehydrateWorkspace(createResult({ resultStatus: 'degraded' }))).toBe(true);
  expect(shouldRehydrateWorkspace(createResult({ duplicateSemantic: 'duplicate' }))).toBe(true);
  expect(shouldRehydrateWorkspace(createResult({ nodeId: null, resultStatus: 'failed' }))).toBe(false);
});

it('refreshes a patchless import completion only once across repeated delivery', async () => {
  const result = createResult({ resultStatus: 'degraded' });
  const refreshOverview = vi.fn().mockResolvedValue(undefined);

  await runImportFlow(() => Promise.resolve(result), shouldRehydrateWorkspace, refreshOverview);
  await runImportFlow(() => Promise.resolve(result), shouldRehydrateWorkspace, refreshOverview);

  expect(refreshWorkspaceState).toHaveBeenCalledTimes(1);
  expect(refreshOverview).toHaveBeenCalledTimes(2);
});

it('does not refresh for cancellation or an import failure and releases the importing state', async () => {
  const refreshOverview = vi.fn();
  expect(await runImportFlow(() => Promise.resolve(null), shouldRehydrateWorkspace, refreshOverview)).toBe(false);
  expect(useFormalImportState.getState().isImporting).toBe(false);
  expect(await runImportFlow(() => Promise.reject(new Error('Import rejected')), shouldRehydrateWorkspace, refreshOverview)).toBe(false);
  expect(useFormalImportState.getState()).toMatchObject({
    isImporting: false, status: { failures: 'Import rejected' }
  });
  expect(refreshWorkspaceState).not.toHaveBeenCalled();
  expect(refreshOverview).not.toHaveBeenCalled();
});

it('retries a failed completion refresh before publishing successful status', async () => {
  const result = createResult();
  const overview = vi.fn().mockResolvedValue(undefined);
  const applyStatus = vi.fn();
  refreshWorkspaceState.mockRejectedValueOnce(new Error('Load failed'));
  expect(await runImportFlow(() => Promise.resolve(result), shouldRehydrateWorkspace, overview, applyStatus)).toBe(false);
  expect(applyStatus).not.toHaveBeenCalled();
  expect(await runImportFlow(() => Promise.resolve(result), shouldRehydrateWorkspace, overview, applyStatus)).toBe(true);
  expect(refreshWorkspaceState).toHaveBeenCalledTimes(2);
  expect(applyStatus).toHaveBeenCalledOnce();
  expect(overview).toHaveBeenCalledOnce();
});
