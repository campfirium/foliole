export const SYNC_PACK_CONTRACT_IMPORT_SOURCES = [{
  remote_annotations_json: '[{"kind":"highlight","nodeId":"highlight-1","remoteId":"reader-highlight"}]',
  remote_import_state_json: '{"version":1,"bodyState":"materialized"}',
  remote_connection_ref: 'readwise-connection',
  remote_document_id: 'reader-document',
  remote_provider: 'readwise',
  source_fingerprint: 'source-contract',
  source_location: 'Source.md',
  source_locator: '/history/Source.md'
}];

export const SYNC_PACK_CONTRACT_TABLES = [
  { name: 'sync_groups', row_count: 0 },
  { name: 'sync_group_devices', row_count: 0 },
        { name: 'node_version_peer_heads', row_count: 0 },
  { name: 'sync_object_state', row_count: 5 },
  { name: 'sync_objects', row_count: 3 },
  { name: 'nodes', row_count: 1 },
  { name: 'node_sync_versions', row_count: 1 },
  { name: 'node_sync_tombstones', row_count: 0 },
  { name: 'node_sync_version_parents', row_count: 0 },
  { name: 'external_documents', row_count: 1 },
  { name: 'content_blobs', row_count: 2 },
  { name: 'review_log', row_count: 0 }
];
