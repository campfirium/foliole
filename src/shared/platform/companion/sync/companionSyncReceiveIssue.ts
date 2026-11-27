import type { RequestSyncObjectFailureStage } from '../../../../../lib/core/sync/requestSyncBatchContract';

const visibleCodes = new Set([
  'request_sync_body_too_large',
  'request_sync_current_version_unavailable',
  'node_version_graph_cycle',
  'framed_sync_node_parent_cycle',
  'node_version_cross_object_parent',
  'node_version_parent_identity_mismatch',
  'sync_node_apply_blocked',
  'sync_round_busy',
  'sync_round_expired',
  'sync_round_wait_expired',
  'sync_group_local_adoption_source_unavailable',
  'sync_group_local_adoption_source_mismatch'
]);

// Native transports attach these codes; their messages differ by platform and device language.
const unreachableCodes = new Set<unknown>(['E_PEER_UNREACHABLE', 'ETIMEDOUT']);

export function isCompanionSyncPeerUnreachable(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  if ('code' in error && unreachableCodes.has(error.code)) return true;
  return 'cause' in error && isCompanionSyncPeerUnreachable(error.cause);
}

export type CompanionSyncReceiveIssue = {
  code: string;
  device: 'local' | 'peer' | 'unknown';
  stage: RequestSyncObjectFailureStage | 'unknown';
};

/** The underlying message for a screenshot, with addresses and file paths removed. */
export function redactedCompanionSyncErrorDetail(error: unknown) {
  return (error instanceof Error ? error.message : String(error))
    .replace(/[a-z][a-z0-9+.-]*:\/\/[^\s"']+/giu, '[url]')
    .replace(/(?:\/[\w.-]+){2,}\/?/gu, '[path]')
    .slice(0, 300);
}

export function describeCompanionSyncReceiveIssue(error: unknown, stage?: RequestSyncObjectFailureStage,
  device: CompanionSyncReceiveIssue['device'] = 'unknown'): CompanionSyncReceiveIssue {
  const detail = (error instanceof Error ? error.message : String(error)).replace(/^framed_sync_http_\d{3}:/u, '');
  const code = detail.split(':', 1)[0]!;
  const shown = isCompanionSyncPeerUnreachable(error) ? 'sync_peer_unreachable'
    : visibleCodes.has(code) ? code : 'sync_receive_failed';
  return { code: shown, device, stage: stage ?? 'unknown' };
}
