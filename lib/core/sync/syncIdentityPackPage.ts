import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

import { syncIdentityFactTransferSchema, type SyncIdentityFactTransfer } from './syncIdentityFactTransfer.js';
import { compareSyncIdentityKey } from './syncIdentityKeyOrder.js';
import { isSyncPackStateObjectType } from './syncPackManifest.js';

export interface SyncIdentityPackObject {
  object_type: string;
  object_id: string;
  fingerprint: string;
}

export interface SyncIdentityPackPage {
  contract: 'global-id-v1';
  group_id: string;
  source_peer_id: string;
  target_peer_id: string;
  source_view_id: string;
  page_index: number;
  previous_page_id: string | null;
  restore_id?: string;
  restore_set_id?: string;
  objects: SyncIdentityPackObject[];
  facts?: SyncIdentityFactTransfer;
  page_id: string;
}

type PageInput = Omit<SyncIdentityPackPage, 'contract' | 'page_id'>;
const hex = /^[a-f0-9]{64}$/u;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u;

function validInput(input: PageInput) {
  if (![input.group_id, input.source_peer_id, input.target_peer_id].every((id) =>
    typeof id === 'string' && id.length > 0 && id.length <= 256) ||
      !uuid.test(input.source_view_id) || !Number.isSafeInteger(input.page_index) ||
      input.page_index < 0 || (input.page_index === 0) !== (input.previous_page_id === null) ||
      input.previous_page_id !== null && !hex.test(input.previous_page_id) ||
      !Array.isArray(input.objects) || input.objects.length > 128) {
    throw new Error('sync_identity_pack_page_invalid');
  }
  if ((input.restore_id === undefined) !== (input.restore_set_id === undefined) ||
      input.restore_id !== undefined && (typeof input.restore_id !== 'string' ||
        !input.restore_id || input.restore_id.trim() !== input.restore_id ||
        input.restore_id.length > 256 || !hex.test(input.restore_set_id!))) {
    throw new Error('sync_identity_pack_page_invalid');
  }
  if (input.facts !== undefined) {
    syncIdentityFactTransferSchema.parse(input.facts);
    if (input.objects.length !== 1 || input.objects[0]?.object_type !== 'node') {
      throw new Error('sync_identity_pack_fact_scope_invalid');
    }
  }
  let previous: SyncIdentityPackObject | null = null;
  for (const object of input.objects) {
    if (!object || !isSyncPackStateObjectType(object.object_type) ||
        typeof object.object_id !== 'string' || !object.object_id ||
        object.object_id.length > 2048 || !hex.test(object.fingerprint) ||
        previous && compareSyncIdentityKey(previous, object) >= 0) {
      throw new Error('sync_identity_pack_page_invalid');
    }
    previous = object;
  }
  if (new TextEncoder().encode(JSON.stringify(input.objects)).length > 65536) {
    throw new Error('sync_identity_pack_page_too_large');
  }
}

export function buildSyncIdentityPackPage(input: PageInput): SyncIdentityPackPage {
  validInput(input);
  const material = [input.group_id, input.source_peer_id, input.target_peer_id,
    input.source_view_id, input.page_index, input.previous_page_id,
    input.objects.map((object) => [object.object_type, object.object_id, object.fingerprint]),
    ...(input.restore_id ? [input.restore_id, input.restore_set_id] : []),
    ...(input.facts ? [syncIdentityFactTransferSchema.parse(input.facts)] : [])];
  const page_id = bytesToHex(sha256(new TextEncoder().encode(JSON.stringify(material))));
  return { contract: 'global-id-v1', ...input,
    objects: input.objects.map((object) => ({ object_type: object.object_type,
      object_id: object.object_id, fingerprint: object.fingerprint })), page_id };
}

export function parseSyncIdentityPackPage(value: unknown): SyncIdentityPackPage {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('sync_identity_pack_page_invalid');
  }
  const page = value as SyncIdentityPackPage;
  if (page.contract !== 'global-id-v1') throw new Error('sync_identity_pack_contract_unsupported');
  const expected = buildSyncIdentityPackPage({
    group_id: page.group_id, source_peer_id: page.source_peer_id,
    target_peer_id: page.target_peer_id, source_view_id: page.source_view_id,
    page_index: page.page_index, previous_page_id: page.previous_page_id,
    ...(page.restore_id === undefined ? {} : { restore_id: page.restore_id }),
    ...(page.restore_set_id === undefined ? {} : { restore_set_id: page.restore_set_id }),
    objects: page.objects,
    ...(page.facts === undefined ? {} : { facts: syncIdentityFactTransferSchema.parse(page.facts) })
  });
  if (page.page_id !== expected.page_id) throw new Error('sync_identity_pack_page_id_mismatch');
  if (Object.keys(page).length !== Object.keys(expected).length ||
      page.objects.some((object) => Object.keys(object).length !== 3)) {
    throw new Error('sync_identity_pack_page_invalid');
  }
  return expected;
}
