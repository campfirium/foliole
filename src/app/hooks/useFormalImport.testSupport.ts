import type { RuntimeImportOverview } from '../../shared/platform/importOverviewRuntimeRepository';
import type { WorkspaceNodeMutationPatchResult } from '../../shared/platform/workspaceRuntimeTypes';

export function createOverview(importId: string): RuntimeImportOverview {
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

export function createImportedOverview(importId: string): RuntimeImportOverview {
  return {
    latestFailure: null,
    latestResult: {
      contentFingerprint: 'content-fingerprint',
      degradedReason: null,
      duplicateSemantic: 'new',
      failureReason: null,
      importId,
      importedAt: '2026-03-22T10:05:00.000Z',
      nodeId: 'node-1',
      provider: 'desktop_text_file',
      resultStatus: 'imported',
      sourceFingerprint: 'source-fingerprint',
      sourceKind: 'markdown',
      sourceLocator: '/tmp/imported-note.md',
      sourceName: 'imported-note.md'
    },
    recentRuns: []
  };
}

export function createImportNodeMutationPatch(): WorkspaceNodeMutationPatchResult {
  return {
    createdNodeIds: ['node-1'],
    nodeOrder: ['node-1'],
    nodes: [
      {
        anchorLink: null,
        content: 'Imported body',
        createdAt: '2026-03-22T10:05:00.000Z',
        desiredRetention: null,
        enableShortTerm: null,
        hideTitleHeading: false,
        imageRegions: null,
        isTitleManual: true,
        kind: 'topic',
        manualChildOrder: null,
        nodeId: 'node-1',
        parentNodeId: null,
        position: 0,
        priority: null,
        reading: null,
        reveal: null,
        review: null,
        sequentialReadingEnabled: null,
        shelvedAt: null,
        title: 'Imported note',
        updatedAt: '2026-03-22T10:05:00.000Z',
        virtualFilter: null
      }
    ]
  };
}
