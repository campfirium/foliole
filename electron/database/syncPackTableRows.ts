import type { WritableDesktopSyncPackRows } from './syncPackLoadedRows.js';

export function syncPackTableRows(rows: WritableDesktopSyncPackRows) {
  return {
    node_version_peer_heads: rows.nodeVersionDependencies ?? [],
    content_blobs: rows.contentBlobs,
    external_documents: rows.externalDocuments,
    node_sync_versions: rows.nodeVersions,
    node_sync_tombstones: rows.nodeTombstones,
    node_sync_version_parents: rows.nodeVersionParents,
    nodes: rows.nodes,
    review_log: rows.reviewLog,
    sync_group_devices: rows.groupDevices,
    sync_groups: rows.groups,
    sync_object_state: rows.stateRows,
    sync_objects: rows.syncObjects
  };
}
