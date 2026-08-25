import {
  createSyncGroupAuthorizationMigrationDecision,
  type LegacyPairingRouteMetadata
} from '../../lib/core/database/syncGroupAuthorizationMigrationModel.js';
import type { SyncGroupSecureRouteMetadata } from '../../lib/platform/syncGroupAuthorizationContract.js';

import type { SyncGroupAuthorizationStore } from './syncGroupAuthorizationStore.js';

export function migrateLegacyPairingToSyncGroupRoute(args: {
  candidates: Array<LegacyPairingRouteMetadata & { credential_secret: string }>;
  legacy_authorization_id: string;
  legacy_local_member_key: string;
  legacy_peer_member_key: string;
  route: SyncGroupSecureRouteMetadata;
  store: SyncGroupAuthorizationStore;
}) {
  const decision = createSyncGroupAuthorizationMigrationDecision(args);
  if (decision.status === 'repair') return decision;
  const candidate = args.candidates.find((item) => item.candidate_id === decision.candidate_id);
  if (!candidate) throw new Error('sync_group_route_migration_candidate_missing');
  const snapshot = args.store.snapshot();
  try {
    const route = args.store.save(decision.route, candidate.credential_secret);
    if (!args.store.load(route.route_id, route.kind)) throw new Error('sync_group_route_migration_verify_failed');
    return { route, status: 'migrated' as const };
  } catch (error) {
    args.store.restore(snapshot);
    throw error;
  }
}
