import type { ReadwiseApiAnnotationState } from '../../lib/core/readwise/readwiseApiImportState.js';
import { openDatabaseConnection } from '../database/connection.js';
import type { loadReadwiseApiImportSource } from '../database/readwiseApiImportState.js';

export function resolveReadwiseApiAnnotationStates(
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
