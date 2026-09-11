import {
  stableReadwiseAnnotationNodeId,
  type PreparedReadwiseApiAnnotation
} from '../../lib/core/readwise/readwiseApiImport.js';
import type { ReadwiseApiAnnotationState } from '../../lib/core/readwise/readwiseApiImportState.js';
import { openDatabaseConnection } from '../database/connection.js';
import type { loadReadwiseApiImportSource } from '../database/readwiseApiImportState.js';

export function resolveReadwiseApiAnnotationStates(
  existing: ReturnType<typeof loadReadwiseApiImportSource>,
  now: string,
  input?: {
    annotations: PreparedReadwiseApiAnnotation[];
    connectionRef: string;
    resetTracked?: boolean;
  }
) {
  const tracked = input?.resetTracked ? [] : resolveTrackedStates(existing, now);
  if (!input) return tracked;
  const trackedIds = new Set(tracked.map((state) => state.remoteId));
  const tombstones = input.annotations.flatMap((annotation) => {
    if (trackedIds.has(annotation.remoteId)) return [];
    const nodeId = stableReadwiseAnnotationNodeId(input.connectionRef, annotation.remoteId);
    const row = openDatabaseConnection().driver.queryOne<{ deleted_at: string | null }>(
      'SELECT deleted_at FROM nodes WHERE id = ?', [nodeId]
    );
    if (!row?.deleted_at) return [];
    return [{
      blockedAt: row.deleted_at,
      contentHash: annotation.contentHash,
      kind: annotation.kind,
      nodeId,
      parentRemoteId: annotation.parentRemoteId,
      remoteId: annotation.remoteId,
      remoteStatus: 'present' as const,
      sourceUpdatedAt: annotation.updatedAt
    }];
  });
  return [...tracked, ...tombstones];
}

function resolveTrackedStates(
  existing: ReturnType<typeof loadReadwiseApiImportSource>,
  now: string
) {
  if (!existing) return [];
  const stateById = new Map(existing.state.annotations.map((annotation) => [annotation.remoteId, annotation]));
  return existing.annotations.map((binding) => {
    const current = stateById.get(binding.remoteId);
    const active = isNodeActive(binding.nodeId);
    const fallback: ReadwiseApiAnnotationState = {
      blockedAt: active ? null : now,
      contentHash: 'legacy-binding',
      kind: binding.kind,
      nodeId: binding.nodeId,
      parentRemoteId: null,
      remoteId: binding.remoteId,
      remoteStatus: 'unconfirmed',
      sourceUpdatedAt: null
    };
    return current ?? fallback;
  }).map((state) => isNodeActive(state.nodeId) || state.blockedAt
    ? state : { ...state, blockedAt: now });
}

function isNodeActive(nodeId: string) {
  return Boolean(openDatabaseConnection().driver.queryOne(
    'SELECT id FROM nodes WHERE id = ? AND deleted_at IS NULL', [nodeId]
  ));
}
