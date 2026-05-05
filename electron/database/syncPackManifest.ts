export type SyncPackTableName = 'content_blobs' | 'external_documents' | 'nodes' | 'sync_object_state';

export const SYNC_PACK_TABLE_NAMES: SyncPackTableName[] = [
  'sync_object_state',
  'nodes',
  'external_documents',
  'content_blobs'
];

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

