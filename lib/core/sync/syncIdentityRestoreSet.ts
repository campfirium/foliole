import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

import { SYNC_IDENTITY_FACT_PROOF_REVISION } from './syncIdentityNodeFactIndex.js';
import type { SyncIdentityInventory } from './syncIdentityPagedDiff.js';
import { isSyncIdentitySourceEpoch } from './syncIdentitySourceEpoch.js';

export interface SyncIdentityRestoreSet {
  contract: 'global-id-restore-v2';
  restore_id: string;
  group_id: string;
  source_peer_id: string;
  target_peer_id: string;
  source_view_id: string;
  source_epoch: string;
  fact_proof_revision: string;
  fact_proof_root: string;
  fact_data_root: string;
  inventory: SyncIdentityInventory;
  object_count: number;
  set_id: string;
}

type RestoreSetInput = Omit<SyncIdentityRestoreSet,
  'contract' | 'fact_proof_revision' | 'object_count' | 'set_id'>;
const hex = /^[a-f0-9]{64}$/u;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u;

function required(value: unknown) {
  return typeof value === 'string' && value.length > 0 && value.length <= 256 &&
    value.trim() === value;
}

function validateInput(input: RestoreSetInput) {
  if (![input.restore_id, input.group_id, input.source_peer_id,
    input.target_peer_id].every(required) ||
    input.source_peer_id === input.target_peer_id ||
    !uuid.test(input.source_view_id) || !isSyncIdentitySourceEpoch(input.source_epoch) ||
    !hex.test(input.fact_proof_root) || !hex.test(input.fact_data_root) ||
    !input.inventory || Object.keys(input.inventory).length !== 2 ||
    !Number.isSafeInteger(input.inventory.row_count) || input.inventory.row_count < 0 ||
    !hex.test(input.inventory.digest)) {
    throw new Error('sync_identity_restore_set_invalid');
  }
  return input.inventory.row_count;
}

/** A signed transport binds every restore page to one complete fixed-view collection. */
export function buildSyncIdentityRestoreSet(input: RestoreSetInput): SyncIdentityRestoreSet {
  const object_count = validateInput(input);
  const inventory = { row_count: input.inventory.row_count, digest: input.inventory.digest };
  const material = [input.restore_id, input.group_id, input.source_peer_id,
    input.target_peer_id, input.source_view_id, input.source_epoch,
    SYNC_IDENTITY_FACT_PROOF_REVISION, input.fact_proof_root,
    input.fact_data_root,
    [inventory.row_count, inventory.digest]];
  const set_id = bytesToHex(sha256(new TextEncoder().encode(JSON.stringify(material))));
  return { contract: 'global-id-restore-v2', restore_id: input.restore_id,
    group_id: input.group_id, source_peer_id: input.source_peer_id,
    target_peer_id: input.target_peer_id, source_view_id: input.source_view_id,
    source_epoch: input.source_epoch, fact_proof_root: input.fact_proof_root,
    fact_data_root: input.fact_data_root,
    fact_proof_revision: SYNC_IDENTITY_FACT_PROOF_REVISION,
    inventory, object_count, set_id };
}

export function parseSyncIdentityRestoreSet(value: unknown): SyncIdentityRestoreSet {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('sync_identity_restore_set_invalid');
  }
  const row = value as SyncIdentityRestoreSet;
  const expected = buildSyncIdentityRestoreSet(row);
  if (Object.keys(row).length !== Object.keys(expected).length ||
      row.contract !== expected.contract ||
      row.fact_proof_revision !== expected.fact_proof_revision ||
      row.object_count !== expected.object_count || row.set_id !== expected.set_id) {
    throw new Error('sync_identity_restore_set_invalid');
  }
  return expected;
}
