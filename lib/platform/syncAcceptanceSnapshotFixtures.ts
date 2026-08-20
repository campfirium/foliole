import type { SyncAcceptanceProjectionFacts } from './syncAcceptanceSnapshotContract.js';

const DEVICE_DIGEST = `sha256:${'a'.repeat(64)}`;
const GROUP_DIGEST = `sha256:${'b'.repeat(64)}`;
const TIMELINE_DIGEST = `sha256:${'c'.repeat(64)}`;

const BASE_FACTS = {
  device_id_digest: DEVICE_DIGEST,
  local_dirty_count: 0,
  pack_cursor: null,
  pending_ack_count: 0,
  resources: 'complete'
} as const;

export type SyncAcceptanceFixtureName = 'existing_sync' | 'fresh_join' | 'rejoin' | 'unknown';

export function syncAcceptanceFactsFixture(
  name: SyncAcceptanceFixtureName,
  host: SyncAcceptanceProjectionFacts['host']
): SyncAcceptanceProjectionFacts {
  const fixture = FIXTURES[name];
  return { ...BASE_FACTS, ...fixture, host };
}

const FIXTURES: Record<
  SyncAcceptanceFixtureName,
  Omit<SyncAcceptanceProjectionFacts, keyof typeof BASE_FACTS | 'host'>
> = {
  existing_sync: {
    authorization: 'active',
    credential_signability: 'signable',
    group_id_digest: GROUP_DIGEST,
    membership: 'active',
    route: 'ready',
    timeline_id_digest: TIMELINE_DIGEST
  },
  fresh_join: {
    authorization: 'none',
    credential_signability: 'absent',
    group_id_digest: null,
    membership: 'absent',
    route: 'absent',
    timeline_id_digest: null
  },
  rejoin: {
    authorization: 'none',
    credential_signability: 'absent',
    group_id_digest: GROUP_DIGEST,
    membership: 'left',
    route: 'ready',
    timeline_id_digest: TIMELINE_DIGEST
  },
  unknown: {
    authorization: 'pending',
    credential_signability: 'invalid',
    group_id_digest: GROUP_DIGEST,
    membership: 'active',
    route: 'unavailable',
    timeline_id_digest: TIMELINE_DIGEST
  }
};
