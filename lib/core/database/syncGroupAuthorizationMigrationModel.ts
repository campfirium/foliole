import type { SyncGroupSecureRouteMetadata } from '../../platform/syncGroupAuthorizationContract.js';

export interface LegacyPairingRouteMetadata {
  authorization_id: string;
  candidate_id: string;
  credential_fingerprint: string;
  group_id: string;
  legacy_local_member_key: string;
  legacy_peer_member_key: string;
}

export type SyncGroupAuthorizationMigrationDecision =
  | { candidate_id: string; route: SyncGroupSecureRouteMetadata; status: 'ready' }
  | { reason: 'credential_conflict' | 'route_reauthorization_required'; status: 'repair' };

export function createSyncGroupAuthorizationMigrationDecision(args: {
  candidates: LegacyPairingRouteMetadata[];
  legacy_authorization_id: string;
  legacy_local_member_key: string;
  legacy_peer_member_key: string;
  route: SyncGroupSecureRouteMetadata;
}): SyncGroupAuthorizationMigrationDecision {
  const matches = args.candidates.filter((candidate) =>
    candidate.group_id === args.route.group_id &&
    candidate.authorization_id === args.legacy_authorization_id &&
    candidate.legacy_local_member_key === args.legacy_local_member_key &&
    candidate.legacy_peer_member_key === args.legacy_peer_member_key);
  if (matches.length === 0) return { reason: 'route_reauthorization_required', status: 'repair' };
  const fingerprints = new Set(matches.map((candidate) => candidate.credential_fingerprint));
  if (matches.length !== 1 || fingerprints.size !== 1) {
    return { reason: 'credential_conflict', status: 'repair' };
  }
  return { candidate_id: matches[0]!.candidate_id, route: args.route, status: 'ready' };
}
