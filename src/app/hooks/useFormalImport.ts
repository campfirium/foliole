import { useCallback } from 'react';
import { create } from 'zustand';

import { getRuntimeInvoke } from '../../shared/platform/bridge';
import { runRuntimeTextFileImport, type RuntimeTextImportResult } from '../../shared/platform/importBridge';
import { useWorkspaceStore } from '../../store/workspaceStore';

export interface FormalImportStatus {
  failures: string;
  inboxLanding: string;
  lastRun: string;
}

const DEFAULT_FORMAL_IMPORT_STATUS: FormalImportStatus = {
  failures: 'Nothing recorded',
  inboxLanding: 'Imported files land as child nodes under Inbox',
  lastRun: 'No imports yet'
};

interface FormalImportUiState {
  isImporting: boolean;
  status: FormalImportStatus;
}

const useFormalImportState = create<FormalImportUiState>(() => ({
  isImporting: false,
  status: DEFAULT_FORMAL_IMPORT_STATUS
}));

function formatImportTimestamp(timestamp: string) {
  return timestamp.replace('T', ' ').slice(0, 16);
}

function buildSuccessStatus(result: RuntimeTextImportResult, timestamp: string): FormalImportStatus {
  if (result.resultStatus === 'degraded') {
    return {
      failures: result.degradedReason ?? 'Import degraded',
      inboxLanding: `Degraded import recorded for ${result.sourceName}`,
      lastRun: `Import degraded ${result.sourceName} · ${timestamp}`
    };
  }
  if (result.resultStatus === 'failed') {
    return {
      ...useFormalImportState.getState().status,
      failures: result.failureReason ?? 'Unknown import failure',
      lastRun: `Import failed ${result.sourceName} · ${timestamp}`
    };
  }
  return {
    failures: 'Nothing recorded',
    inboxLanding:
      result.duplicateSemantic === 'duplicate'
        ? `Existing Inbox import reused for ${result.sourceName}`
        : result.duplicateSemantic === 'updated'
          ? `Inbox import updated from ${result.sourceName}`
          : `Inbox child created from ${result.sourceName}`,
    lastRun:
      result.duplicateSemantic === 'duplicate'
        ? `Reused ${result.sourceName} · ${timestamp}`
        : result.duplicateSemantic === 'updated'
          ? `Updated ${result.sourceName} · ${timestamp}`
          : `Imported ${result.sourceName} · ${timestamp}`
  };
}

function applyImportResultStatus(result: RuntimeTextImportResult) {
  useFormalImportState.setState({
    isImporting: false,
    status: buildSuccessStatus(result, formatImportTimestamp(result.importedAt))
  });
}

function applyCancelledImportStatus() {
  useFormalImportState.setState((current) => ({
    isImporting: false,
    status: {
      ...current.status,
      lastRun: 'Import cancelled'
    }
  }));
}

function applyImportFailureStatus(message: string) {
  useFormalImportState.setState({
    isImporting: false,
    status: {
      ...useFormalImportState.getState().status,
      failures: message,
      lastRun: 'Import failed'
    }
  });
}

function shouldRehydrateWorkspace(result: RuntimeTextImportResult) {
  return result.resultStatus === 'imported' && result.duplicateSemantic !== 'duplicate';
}

export function resetFormalImportState() {
  useFormalImportState.setState({
    isImporting: false,
    status: DEFAULT_FORMAL_IMPORT_STATUS
  });
}

export function useFormalImport() {
  const isImporting = useFormalImportState((state) => state.isImporting);
  const status = useFormalImportState((state) => state.status);
  const isAvailable = Boolean(getRuntimeInvoke());

  const startImport = useCallback(async () => {
    if (useFormalImportState.getState().isImporting) {
      return false;
    }

    useFormalImportState.setState({ isImporting: true });
    try {
      const importResult = await runRuntimeTextFileImport();
      if (!importResult) {
        applyCancelledImportStatus();
        return false;
      }

      if (shouldRehydrateWorkspace(importResult)) {
        await useWorkspaceStore.persist.rehydrate();
      }
      applyImportResultStatus(importResult);
      return true;
    } catch (error) {
      applyImportFailureStatus(error instanceof Error ? error.message : 'Unknown import failure');
      return false;
    }
  }, []);

  return {
    isAvailable,
    isImporting,
    startImport,
    status
  };
}
