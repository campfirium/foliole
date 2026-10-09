import Database from 'better-sqlite3';

export type FramedSyncStagingTable =
  | 'framed_sync_available_blobs'
  | 'framed_sync_blob_chunks'
  | 'framed_sync_blob_offers'
  | 'framed_sync_blob_pins'
  | 'framed_sync_inbound_attempts'
  | 'framed_sync_inbound_facts'
  | 'framed_sync_inbound_frames'
  | 'framed_sync_inbound_transfers'
  | 'framed_sync_outbound_attempts'
  | 'framed_sync_outbound_blob_refs'
  | 'framed_sync_outbound_fact_refs'
  | 'framed_sync_outbound_frames'
  | 'framed_sync_outbound_holds'
  | 'framed_sync_outbound_publications'
  | 'framed_sync_receipts'
  | 'framed_sync_termination_acks'
  | 'framed_sync_termination_requests';

export type ProductionBenchmarkDatabaseSnapshot = Readonly<{
  appliedItems: number;
  readableItems: number;
  stagingRows: Readonly<Record<FramedSyncStagingTable, number>>;
  pendingTransferIds: readonly string[];
  publicationIds: readonly string[];
  receiptIds: readonly string[];
  readyTransferIds: readonly string[];
}>;

export function readProductionBenchmarkDatabase(
  databasePath: string
): ProductionBenchmarkDatabaseSnapshot {
  const sqlite = new Database(databasePath, { fileMustExist: true, readonly: true });
  try {
    const present = new Set(sqlite.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table'"
    ).pluck().all().map(String));
    const count = (table: FramedSyncStagingTable) => present.has(table)
      ? Number(sqlite.prepare(`SELECT COUNT(*) FROM ${table}`).pluck().get())
      : 0;
    const stagingRows = {
      framed_sync_available_blobs: count('framed_sync_available_blobs'),
      framed_sync_blob_chunks: count('framed_sync_blob_chunks'),
      framed_sync_blob_offers: count('framed_sync_blob_offers'),
      framed_sync_blob_pins: count('framed_sync_blob_pins'),
      framed_sync_inbound_attempts: count('framed_sync_inbound_attempts'),
      framed_sync_inbound_facts: count('framed_sync_inbound_facts'),
      framed_sync_inbound_frames: count('framed_sync_inbound_frames'),
      framed_sync_inbound_transfers: count('framed_sync_inbound_transfers'),
      framed_sync_outbound_attempts: count('framed_sync_outbound_attempts'),
      framed_sync_outbound_blob_refs: count('framed_sync_outbound_blob_refs'),
      framed_sync_outbound_fact_refs: count('framed_sync_outbound_fact_refs'),
      framed_sync_outbound_frames: count('framed_sync_outbound_frames'),
      framed_sync_outbound_holds: count('framed_sync_outbound_holds'),
      framed_sync_outbound_publications: count('framed_sync_outbound_publications'),
      framed_sync_receipts: count('framed_sync_receipts'),
      framed_sync_termination_acks: count('framed_sync_termination_acks'),
      framed_sync_termination_requests: count('framed_sync_termination_requests')
    } satisfies Record<FramedSyncStagingTable, number>;
    const appliedItems = present.has('node_sync_versions') ? Number(sqlite.prepare(
      "SELECT COUNT(DISTINCT object_id) FROM node_sync_versions WHERE object_id LIKE 't326-benchmark-%'"
    ).pluck().get()) : 0;
    return {
      appliedItems,
      readableItems: Number(sqlite.prepare(`SELECT COUNT(*) FROM nodes n
        JOIN node_sync_versions v ON v.version_id = n.current_version_id
        WHERE n.id LIKE 't326-benchmark-%' AND v.body_text = n.content
          AND length(CAST(v.body_text AS BLOB)) > 0`).pluck().get()),
      stagingRows,
      pendingTransferIds: sqlite.prepare("SELECT lower(hex(transfer_id)) FROM framed_sync_outbound_publications WHERE state = 'published'").pluck().all().map(String),
      publicationIds: sqlite.prepare('SELECT lower(hex(transfer_id)) FROM framed_sync_outbound_publications').pluck().all().map(String),
      receiptIds: sqlite.prepare('SELECT lower(hex(transfer_id)) FROM framed_sync_receipts').pluck().all().map(String),
      readyTransferIds: sqlite.prepare("SELECT lower(hex(transfer_id)) FROM framed_sync_inbound_transfers WHERE state = 'ready_to_apply'").pluck().all().map(String)
    };
  } finally {
    sqlite.close();
  }
}

export function productionBenchmarkStageCounts(input: Readonly<{
  receiver: ProductionBenchmarkDatabaseSnapshot;
  sender: ProductionBenchmarkDatabaseSnapshot;
}>) {
  return {
    appliedItems: input.receiver.appliedItems,
    authenticatedFrames: input.receiver.stagingRows.framed_sync_inbound_frames,
    availableBlobs: input.receiver.stagingRows.framed_sync_available_blobs,
    outboundFrames: input.sender.stagingRows.framed_sync_outbound_frames,
    publishedFacts: input.sender.stagingRows.framed_sync_outbound_fact_refs,
    receipts: input.sender.stagingRows.framed_sync_receipts,
    stagedFacts: input.receiver.stagingRows.framed_sync_inbound_facts
  };
}
