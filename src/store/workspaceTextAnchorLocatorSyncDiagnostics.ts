import {
  isEditorInputDiagnosticEnabled,
  logEditorInputDiagnostic,
  readEditorInputDiagnosticTime
} from './workspaceEditorInputDiagnostics';

export type TextAnchorLocatorSyncDiagnostics = {
  buildMs: number;
  candidateNodes: number;
  imageRegionMs: number;
  objectValuesMs: number;
  remapMs: number;
  scannedNodes: number;
  totalMs: number;
  updatedNodes: number;
};

export type TextAnchorLocatorSyncDiagnosticStats = {
  buildMs: number;
  candidateNodes: number;
  imageRegionMs: number;
  objectValuesMs: number;
  remapMs: number;
  scannedNodes: number;
  startedAt: number;
  updatedNodes: number;
};

export function createTextAnchorLocatorSyncDiagnosticStats() {
  return isEditorInputDiagnosticEnabled()
    ? {
      buildMs: 0,
      candidateNodes: 0,
      imageRegionMs: 0,
      objectValuesMs: 0,
      remapMs: 0,
      scannedNodes: 0,
      startedAt: readEditorInputDiagnosticTime(),
      updatedNodes: 0
    } satisfies TextAnchorLocatorSyncDiagnosticStats
    : null;
}

export function finishTextAnchorLocatorSyncDiagnostics(diagnostics: TextAnchorLocatorSyncDiagnosticStats | null) {
  if (!diagnostics) {
    return undefined;
  }
  const syncDiagnostics = {
    buildMs: diagnostics.buildMs,
    candidateNodes: diagnostics.candidateNodes,
    imageRegionMs: diagnostics.imageRegionMs,
    objectValuesMs: diagnostics.objectValuesMs,
    remapMs: diagnostics.remapMs,
    scannedNodes: diagnostics.scannedNodes,
    totalMs: readEditorInputDiagnosticTime() - diagnostics.startedAt,
    updatedNodes: diagnostics.updatedNodes
  } satisfies TextAnchorLocatorSyncDiagnostics;
  logEditorInputDiagnostic('anchor-locator-sync', syncDiagnostics);
  return syncDiagnostics;
}
