import type { DbPort } from '../../../../../../lib/core/sync/dbPort.js';
import { FRAMED_SYNC_PROTOCOL_VERSION, type FramedSyncContext } from '../../../../../../lib/core/sync/framedSyncContract.js';
import { requiredFramedSyncNodeVersionIds, type FramedSyncInventoryDifference } from '../../../../../../lib/core/sync/framedSyncInventory.js';
import { readFramedSyncInventoryEntry } from '../../../../../../lib/core/sync/framedSyncInventoryRead.js';
import { selectFramedSyncNodeReadingFact } from '../../../../../../lib/core/sync/framedSyncNodeReadingFact.js';
import { selectFramedSyncObjectStateFact } from '../../../../../../lib/core/sync/framedSyncObjectStateFact.js';
import { selectFramedSyncRelationReviewFactsWithDbPort } from '../../../../../../lib/core/sync/framedSyncRelationReviewSelection.js';
import type { NodeVersionBodyStorage } from '../../../../../../lib/core/sync/syncNodeTombstoneVersion.js';

export function requiredText(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('sync_group_data_text_required');
  return value.trim();
}

function requiredStrings(value: unknown, name: string) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || !item)) {
    throw new Error(`sync_group_data_${name}_invalid`);
  }
  return value as string[];
}

function requiredBoolean(value: unknown) {
  if (typeof value !== 'boolean') throw new Error('sync_group_data_boolean_required');
  return value;
}

export function context(payload: Record<string, unknown>): FramedSyncContext {
  return {
    groupId: requiredText(payload.group_id),
    protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION,
    receiverDeviceId: requiredText(payload.receiver_device_id),
    receiverLibraryEpoch: requiredText(payload.receiver_library_epoch),
    senderDeviceId: requiredText(payload.sender_device_id),
    senderLibraryEpoch: requiredText(payload.sender_library_epoch)
  };
}

export function resourceFiles(value: unknown) {
  if (value === undefined) return new Map<string, bigint>();
  if (!Array.isArray(value)) throw new Error('framed_sync_outbound_resource_files_invalid');
  const result = new Map<string, bigint>();
  for (const item of value) {
    if (!item || typeof item !== 'object') throw new Error('framed_sync_outbound_resource_files_invalid');
    const row = item as Record<string, unknown>;
    const storageKey = requiredText(row.storage_key);
    const lengthText = requiredText(row.byte_length);
    if (!/^(0|[1-9][0-9]*)$/u.test(lengthText) || result.has(storageKey)) {
      throw new Error('framed_sync_outbound_resource_files_invalid');
    }
    result.set(storageKey, BigInt(lengthText));
  }
  return result;
}

export async function selectOutboundFacts<T>(db: DbPort, payload: Record<string, unknown>,
  bodyStorage: NodeVersionBodyStorage, loadNodes: (versionIds: string[], objectId: string) => Promise<T[]>) {
  const objectId = requiredText(payload.object_id);
  const objectType = requiredText(payload.object_type);
  const includeCurrentNode = requiredBoolean(payload.include_current_node);
  const requiredRelationIds = requiredStrings(payload.required_relation_ids, 'relation_ids');
  const reviewFactIds = requiredStrings(payload.review_fact_ids, 'review_fact_ids');
  const stateFactIds = requiredStrings(payload.state_fact_ids, 'state_fact_ids');
  const current = await readFramedSyncInventoryEntry(db, { globalId: objectId, objectType }, bodyStorage);
  if (!current) throw new Error('framed_sync_source_empty');
  const difference: FramedSyncInventoryDifference = {
    direction: 'local_to_remote', globalId: objectId, objectType, sourceSnapshot: current,
    need: { frontierFactIds: includeCurrentNode ? current.frontierFactIds : [],
      requiredRelationIds, resourceHashes: includeCurrentNode ? current.resourceHashes : [],
      reviewFactIds, stateFactIds, sharedState: includeCurrentNode }
  };
  if (objectType !== 'node') {
    const ids = stateFactIds.length ? stateFactIds : current.stateFactIds ?? [];
    const stateFacts = await Promise.all(ids.map((id) => selectFramedSyncObjectStateFact(db, difference, id, bodyStorage)));
    return { difference, nodes: [] as T[], selected: { kind: 'selected' as const, facts: [] }, stateFacts };
  }
  const selected = await selectFramedSyncRelationReviewFactsWithDbPort(db, difference);
  if (selected.kind === 'deferred') throw new Error('framed_sync_source_changed');
  const versionIds = requiredFramedSyncNodeVersionIds(difference);
  const nodes = await loadNodes(versionIds, objectId);
  const stateFacts = await Promise.all(stateFactIds.map((factId) =>
    selectFramedSyncNodeReadingFact(db, objectId, factId)));
  return { difference, nodes, selected, stateFacts };
}
