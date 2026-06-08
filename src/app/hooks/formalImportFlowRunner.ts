import {
  type RuntimeDirectoryImportResult,
  type RuntimeTextImportResult
} from '../../shared/platform/importExecutionRuntimeRepository';
import { refreshWorkspaceState } from '../../store/workspaceRefreshScheduler';

import {
  applyCancelledImportStatus,
  applyImportFailureStatus,
  useFormalImportState
} from './formalImportState';

export function shouldRehydrateWorkspace(result: RuntimeTextImportResult) {
  return result.resultStatus === 'imported' && result.duplicateSemantic !== 'duplicate';
}

export function shouldRehydrateDirectoryImport(result: RuntimeDirectoryImportResult) {
  return result.entries.some((entry) => shouldRehydrateWorkspace(entry));
}

export async function runImportFlow<Result extends RuntimeTextImportResult | RuntimeDirectoryImportResult>(
  runner: () => Promise<Result | null>,
  shouldRehydrate: (result: Result) => boolean,
  refreshOverview: () => Promise<void>,
  applyResultStatus?: (result: Result) => void
) {
  if (useFormalImportState.getState().isImporting) {
    return false;
  }
  useFormalImportState.setState({ isImporting: true });
  try {
    const importResult = await runner();
    if (!importResult) {
      applyCancelledImportStatus();
      return false;
    }
    if (shouldRehydrate(importResult) || applyResultStatus) {
      await refreshWorkspaceState('formal-import');
    }
    if (applyResultStatus) {
      applyResultStatus(importResult);
    }
    await refreshOverview();
    useFormalImportState.setState({ isImporting: false });
    return true;
  } catch (error) {
    applyImportFailureStatus(error instanceof Error ? error.message : 'Unknown import failure');
    return false;
  }
}
