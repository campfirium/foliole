import type { PreparedReadwiseApiAnnotation } from '../../lib/core/readwise/readwiseApiImport.js';
import { stableReadwiseAnnotationNodeId } from '../../lib/core/readwise/readwiseApiImport.js';
import type { ReadwiseApiAnnotationState } from '../../lib/core/readwise/readwiseApiImportState.js';

export function resolveRelocationNodeId(
  connectionRef: string,
  states: ReadwiseApiAnnotationState[],
  remoteId: string
) {
  return states.find((state) => state.remoteId === remoteId)?.nodeId
    ?? stableReadwiseAnnotationNodeId(connectionRef, remoteId);
}

export function filterRelocatableAnnotations(
  annotations: PreparedReadwiseApiAnnotation[],
  states: ReadwiseApiAnnotationState[]
) {
  const blockedIds = new Set(states.filter((state) => state.blockedAt).map((state) => state.remoteId));
  return annotations.filter((annotation) => !blockedIds.has(annotation.remoteId));
}

export function mergeRelocatedAnnotationStates(input: {
  annotations: PreparedReadwiseApiAnnotation[];
  connectionRef: string;
  states: ReadwiseApiAnnotationState[];
}) {
  const byRemoteId = new Map(input.states.map((state) => [state.remoteId, state]));
  for (const annotation of input.annotations) {
    const current = byRemoteId.get(annotation.remoteId);
    if (current?.blockedAt) continue;
    byRemoteId.set(annotation.remoteId, current ?? {
      blockedAt: null,
      contentHash: annotation.contentHash,
      kind: annotation.kind,
      nodeId: stableReadwiseAnnotationNodeId(input.connectionRef, annotation.remoteId),
      parentRemoteId: annotation.parentRemoteId,
      remoteId: annotation.remoteId,
      remoteStatus: 'present',
      sourceUpdatedAt: annotation.updatedAt
    });
  }
  return [...byRemoteId.values()].sort((left, right) => left.remoteId.localeCompare(right.remoteId));
}
