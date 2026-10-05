import Database from 'better-sqlite3';

export function readDesktopFramedSyncLibraryEvidence(databasePath: string) {
  const sqlite = new Database(databasePath, { fileMustExist: true, readonly: true });
  try {
    const tableExists = (table: string) => Boolean(sqlite.prepare(
      `SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?`
    ).get(table));
    const count = (table: string) => tableExists(table) ? Number((sqlite.prepare(
      `SELECT COUNT(*) AS count FROM ${table}`
    ).get() as { count: number }).count) : 0;
    const states = (table: string) => tableExists(table)
      ? sqlite.prepare(`SELECT state FROM ${table} ORDER BY rowid`).all()
      : [];
    return {
      framedSync: {
        availableBlobs: count('framed_sync_available_blobs'),
        availableResources: count('framed_sync_available_resources'),
        inboundFacts: count('framed_sync_inbound_facts'),
        inboundFrames: count('framed_sync_inbound_frames'),
        inboundStates: states('framed_sync_inbound_transfers'),
        outboundFrames: count('framed_sync_outbound_frames'),
        outboundHolds: count('framed_sync_outbound_holds'),
        outboundStates: states('framed_sync_outbound_publications'),
        receipts: count('framed_sync_receipts'),
        resourceChunks: count('framed_sync_resource_blob_chunks')
      },
      journalMode: sqlite.pragma('journal_mode', { simple: true }),
      nodes: sqlite.prepare(
        `SELECT id, title, content, current_version_id, resource_references
         FROM nodes WHERE id LIKE ? ORDER BY id`
      ).all('t326-%'),
      parents: sqlite.prepare(`SELECT parent.version_id, parent.parent_version_id, parent.ordinal
        FROM node_sync_version_parents parent
        JOIN node_sync_versions version ON version.version_id = parent.version_id
        WHERE version.object_id LIKE 't326-%' ORDER BY parent.version_id, parent.ordinal`).all(),
      reviews: sqlite.prepare(`SELECT op_id, node_id, grade FROM review_log
        WHERE node_id LIKE 't326-%' ORDER BY op_id`).all(),
      versions: sqlite.prepare(
        `SELECT version_id, object_id, body_text FROM node_sync_versions
         WHERE object_id LIKE ? ORDER BY object_id, version_id`
      ).all('t326-%')
    };
  } finally {
    sqlite.close();
  }
}
