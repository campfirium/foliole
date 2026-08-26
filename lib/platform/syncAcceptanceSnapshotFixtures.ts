import type { SyncAcceptanceProjectionFacts } from './syncAcceptanceSnapshotContract.js';

const DEVICE_DIGEST = `sha256:${'a'.repeat(64)}`;
const GROUP_DIGEST = `sha256:${'b'.repeat(64)}`;
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
  return { ...BASE_FACTS, ...FIXTURES[name], host };
}

const FIXTURES: Record<SyncAcceptanceFixtureName,
  Omit<SyncAcceptanceProjectionFacts, keyof typeof BASE_FACTS | 'host'>> = {
  existing_sync: {
    device_state: 'active', group_id_digest: GROUP_DIGEST,
    group_key_signability: 'signable', route: 'ready'
  },
  fresh_join: {
    device_state: 'absent', group_id_digest: null,
    group_key_signability: 'absent', route: 'absent'
  },
  rejoin: {
    device_state: 'left', group_id_digest: GROUP_DIGEST,
    group_key_signability: 'absent', route: 'ready'
  },
  unknown: {
    device_state: 'active', group_id_digest: GROUP_DIGEST,
    group_key_signability: 'invalid', route: 'unavailable'
  }
};
