export type SyncPackTableName =
  | 'content_blobs'
  | 'external_documents'
  | 'node_attachments'
  | 'node_order'
  | 'node_sync_versions'
  | 'node_sync_version_parents'
  | 'nodes'
  | 'review_log'
  | 'sync_group_member_departures'
  | 'sync_group_members'
  | 'sync_groups'
  | 'sync_object_state'
  | 'sync_objects';

export const SYNC_PACK_TABLE_NAMES: SyncPackTableName[] = [
  'sync_groups',
  'sync_group_members',
  'sync_group_member_departures',
  'sync_object_state',
  'sync_objects',
  'nodes',
  'node_sync_versions',
  'node_sync_version_parents',
  'node_order',
  'node_attachments',
  'external_documents',
  'content_blobs',
  'review_log'
];

export const SYNC_PACK_OBJECT_TYPE_TABLES = {
  external_document: 'external_documents',
  node: 'nodes'
} as const;

export type SyncPackObjectType = keyof typeof SYNC_PACK_OBJECT_TYPE_TABLES;

export const SYNC_PACK_OBJECT_TYPES = new Set<SyncPackObjectType>(
  Object.keys(SYNC_PACK_OBJECT_TYPE_TABLES) as SyncPackObjectType[]
);

export const SYNC_PACK_PAYLOAD_OBJECT_TYPES = new Set([
  'attachment',
  'external_folder',
  'import_source',
  'node_open_state',
  'node_reading',
  'node_review',
  'node_text_alternative',
  'pdf_page_text',
  'setting',
  'view_state',
  'watched_folder'
]);

export const RETIRED_SYNC_PACK_OBJECT_TYPES = new Set([
  'readwise_authority',
  'readwise_binding',
  'readwise_policy'
]);

export function isSyncPackObjectType(value: string): value is SyncPackObjectType {
  return SYNC_PACK_OBJECT_TYPES.has(value as SyncPackObjectType);
}

export function isSyncPackStateObjectType(value: string) {
  return isSyncPackObjectType(value) || SYNC_PACK_PAYLOAD_OBJECT_TYPES.has(value) ||
    RETIRED_SYNC_PACK_OBJECT_TYPES.has(value);
}

export function isSyncPackPayloadObjectType(value: string) {
  return SYNC_PACK_PAYLOAD_OBJECT_TYPES.has(value);
}

export interface SyncPackTableManifest {
  name: SyncPackTableName;
  row_count: number;
}

export interface SyncPackManifestInput {
  fromStateSeq: number;
  packId: string;
  tableRows: Record<SyncPackTableName, unknown[]>;
  toStateSeq: number;
}

export function buildSyncPackManifest(input: SyncPackManifestInput) {
  const tables = SYNC_PACK_TABLE_NAMES.map((name) => ({
    name,
    row_count: input.tableRows[name].length
  }));
  return {
    pack_id: input.packId,
    from_state_seq: input.fromStateSeq,
    to_state_seq: input.toStateSeq,
    tables
  };
}
