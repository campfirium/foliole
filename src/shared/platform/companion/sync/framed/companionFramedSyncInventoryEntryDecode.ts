import { hexToBytes } from '@noble/hashes/utils.js';

import type { FramedSyncInventoryEntry } from '../../../../../../lib/core/sync/framedSyncInventory.js';
import type { NativeCompanionFramedSyncInventoryEntry } from '../../../../../../lib/platform/nativeCompanionSyncContract.js';

const HEX_DIGEST = /^[a-f0-9]{64}$/u;

function strings(value: unknown, name: string) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || !item)) {
    throw new Error(`framed_sync_inventory_${name}_invalid`);
  }
  return value as string[];
}

function digest(value: unknown, name: string) {
  if (typeof value !== 'string' || !HEX_DIGEST.test(value)) {
    throw new Error(`framed_sync_inventory_${name}_invalid`);
  }
  return hexToBytes(value);
}

export function decodeCompanionInventoryEntry(value: NativeCompanionFramedSyncInventoryEntry): FramedSyncInventoryEntry {
  if (!value || typeof value !== 'object' || typeof value.object_type !== 'string' || !value.global_id ||
      (value.object_type !== 'node' && (value.frontier_fact_ids.length > 0 || value.required_relation_ids.length > 0 || value.review_fact_ids.length > 0))) {
    throw new Error('framed_sync_inventory_identity_invalid');
  }
  return {
    frontierFactIds: strings(value.frontier_fact_ids, 'frontier_fact_ids'),
    globalId: value.global_id,
    objectType: value.object_type,
    requiredRelationIds: strings(value.required_relation_ids, 'required_relation_ids'),
    resourceHashes: strings(value.resource_hashes, 'resource_hashes')
      .map((hash) => digest(hash, 'resource_hash')),
    reviewFactIds: strings(value.review_fact_ids, 'review_fact_ids'),
    stateFactIds: strings(value.state_fact_ids, 'state_fact_ids'),
    sharedStateHash: digest(value.shared_state_hash, 'shared_state_hash'),
    ...(value.version_states ? { versionStates: strings(value.version_states, 'version_states'),
      currentVersionId: value.current_version_id ?? '', unready: value.unready ?? false } : value.unready ? { unready: true } : {})
  };
}
