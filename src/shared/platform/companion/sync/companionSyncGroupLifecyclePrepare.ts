import type { DbPort } from '../../../../../lib/core/sync/dbPort';
import { SyncGroupLifecycleAuthority } from '../../../../../lib/core/sync/syncGroupLifecycleAuthority';
import { SyncGroupLifecycleStore } from '../../../../../lib/core/sync/syncGroupLifecycleStore';
import type {
  SyncGroupJoinApplication,
  SyncGroupRosterSnapshot,
  SyncGroupRouteGrant
} from '../../../../../lib/platform/syncGroupLifecycleContract';

import {
  consumePreparedSyncGroupRouteGrant,
  createPreparedSyncGroupJoinIntentKey,
  discardPreparedSyncGroupJoinIntentKey
} from './companionSyncGroupAuthorizationPrepare';

export interface SyncGroupLifecycleSecureRoutePort {
  consume(grant: SyncGroupRouteGrant): Promise<unknown>;
  create(requestId: string): Promise<{ public_key: string }>;
  discard(requestId: string): Promise<unknown>;
}

const nativeSecureRoutePort: SyncGroupLifecycleSecureRoutePort = {
  consume: (grant) => consumePreparedSyncGroupRouteGrant({
    authorization_epoch: grant.authorization_epoch,
    authorization_id: grant.authorization_id,
    encrypted_route_secret: grant.encrypted_route_secret,
    group_id: grant.group_id,
    local_member_id: grant.local_member_id,
    peer_member_id: grant.peer_member_id,
    protocol_version: 4,
    request_id: grant.request_id,
    route_id: grant.route_id
  }),
  create: createPreparedSyncGroupJoinIntentKey,
  discard: discardPreparedSyncGroupJoinIntentKey
};

export async function persistPreparedJoinIntent(
  db: DbPort,
  draft: Omit<SyncGroupJoinApplication, 'application_public_key'>,
  secureRoute: SyncGroupLifecycleSecureRoutePort = nativeSecureRoutePort
) {
  const key = await secureRoute.create(draft.request_id);
  try {
    return await new SyncGroupLifecycleStore(db).saveJoinApplication({
      ...draft, application_public_key: key.public_key
    });
  } catch (error) {
    await secureRoute.discard(draft.request_id);
    throw error;
  }
}

export async function consumePreparedRouteGrant(
  db: DbPort,
  grant: SyncGroupRouteGrant,
  roster: SyncGroupRosterSnapshot,
  verifiedManagerMemberId: string,
  now: string,
  secureRoute: SyncGroupLifecycleSecureRoutePort = nativeSecureRoutePort
) {
  const store = new SyncGroupLifecycleStore(db);
  await store.saveRouteGrant({ ...grant, state: 'pending', updated_at: now });
  await store.applyManagerRoster(roster, verifiedManagerMemberId);
  const localMember = roster.members.find((member) =>
    member.member_id === grant.local_member_id && member.state === 'active');
  if (!localMember) throw new Error('route_grant_local_member_missing');
  await secureRoute.consume(grant);
  const consumed = await store.markRouteGrantConsumed(grant.grant_id, localMember.installation_id, now);
  return { grant: consumed, roster: await store.loadRoster(grant.group_id) };
}

export function persistPreparedLocalDeparture(
  db: DbPort, localMemberId: string, departureId: string, now: string
) {
  return new SyncGroupLifecycleAuthority(db).leaveMember(localMemberId, departureId, now);
}
