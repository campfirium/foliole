export type SyncPackTableName =
  | 'content_blobs'
  | 'external_documents'
  | 'nodes'
  | 'sync_object_state'
  | 'sync_objects';

export const SYNC_PACK_TABLE_NAMES: SyncPackTableName[] = [
  'sync_object_state',
  'sync_objects',
  'nodes',
  'external_documents',
  'content_blobs'
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
  'node_reading',
  'node_review',
  'setting'
]);

export function isSyncPackObjectType(value: string): value is SyncPackObjectType {
  return SYNC_PACK_OBJECT_TYPES.has(value as SyncPackObjectType);
}

export function isSyncPackStateObjectType(value: string) {
  return isSyncPackObjectType(value) || SYNC_PACK_PAYLOAD_OBJECT_TYPES.has(value);
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
