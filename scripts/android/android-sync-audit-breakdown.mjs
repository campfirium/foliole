function tableExists(db, table) {
  return db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table) !== undefined;
}

function all(db, sql, fallback = []) {
  try {
    return db.prepare(sql).all();
  } catch {
    return fallback;
  }
}

function scalar(db, sql, fallback = null) {
  try {
    return Object.values(db.prepare(sql).get() ?? {})[0] ?? fallback;
  } catch {
    return fallback;
  }
}

function resourceBacklog(android) {
  return {
    availableWithoutData: all(android,
      "SELECT b.hash FROM content_blobs b LEFT JOIN content_blob_data d ON d.hash = b.hash WHERE b.availability <> 'missing' AND d.hash IS NULL LIMIT 20"
    ).map((row) => row.hash),
    missingAttachmentResources: scalar(android,
      "SELECT COUNT(*) FROM attachment_blobs WHERE content_hash IS NOT NULL AND TRIM(content_hash) <> '' AND availability IN ('missing', 'failed')",
      0
    ),
    missingAvailabilityCount: scalar(android, "SELECT COUNT(*) FROM content_blobs WHERE availability = 'missing'", 0),
    missingExternalDocumentBodies: scalar(android,
      'SELECT COUNT(*) FROM external_documents e LEFT JOIN content_blob_data d ON d.hash = e.body_blob_hash WHERE e.is_present = 1 AND e.body_blob_hash IS NOT NULL AND d.hash IS NULL',
      0
    ),
    missingNodeBodies: scalar(android,
      'SELECT COUNT(*) FROM nodes n LEFT JOIN content_blob_data d ON d.hash = n.body_blob_hash WHERE n.deleted_at IS NULL AND n.body_blob_hash IS NOT NULL AND d.hash IS NULL',
      0
    ),
    missingReferencedContentBlobs: scalar(android, referencedMissingSql(), 0),
    missingUnreferencedContentBlobs: scalar(android, unreferencedMissingSql(), 0)
  };
}

function referencedMissingSql() {
  return `WITH referenced AS (
    SELECT body_blob_hash AS hash FROM nodes WHERE deleted_at IS NULL AND body_blob_hash IS NOT NULL
    UNION
    SELECT body_blob_hash AS hash FROM external_documents WHERE is_present = 1 AND body_blob_hash IS NOT NULL
  )
  SELECT COUNT(*) FROM referenced r
  JOIN content_blobs b ON b.hash = r.hash
  LEFT JOIN content_blob_data d ON d.hash = r.hash
  WHERE b.availability = 'missing' OR d.hash IS NULL`;
}

function unreferencedMissingSql() {
  return `WITH referenced AS (
    SELECT body_blob_hash AS hash FROM nodes WHERE deleted_at IS NULL AND body_blob_hash IS NOT NULL
    UNION
    SELECT body_blob_hash AS hash FROM external_documents WHERE is_present = 1 AND body_blob_hash IS NOT NULL
  )
  SELECT COUNT(*) FROM content_blobs b
  LEFT JOIN referenced r ON r.hash = b.hash
  WHERE b.availability = 'missing' AND r.hash IS NULL`;
}

function pendingDesktopChanges(db, cursor) {
  if (!tableExists(db, 'sync_object_state')) return { liveCount: 0, tombstoneCount: 0, types: [] };
  const rows = db.prepare(
    `SELECT object_type,
      SUM(CASE WHEN deleted_at IS NULL THEN 1 ELSE 0 END) AS live_count,
      SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) AS tombstone_count
     FROM sync_object_state
     WHERE state_seq > ?
     GROUP BY object_type
     ORDER BY object_type`
  ).all(cursor);
  return {
    liveCount: rows.reduce((sum, row) => sum + row.live_count, 0),
    tombstoneCount: rows.reduce((sum, row) => sum + row.tombstone_count, 0),
    types: rows.map((row) => ({
      liveCount: row.live_count,
      objectType: row.object_type,
      tombstoneCount: row.tombstone_count
    }))
  };
}

function localPushBlockers(db) {
  if (!tableExists(db, 'sync_object_state')) return emptyLocalPushBlockers();
  const dirtyRows = db.prepare(
    `SELECT object_type, COUNT(*) AS count FROM sync_object_state
     WHERE sync_dirty = 1 GROUP BY object_type ORDER BY object_type`
  ).all();
  const pushIssueRows = tableExists(db, 'sync_push_ack')
    ? db.prepare(
        `SELECT status, object_type, COUNT(*) AS count FROM sync_push_ack
         WHERE status IN ('conflict', 'rejected') GROUP BY status, object_type ORDER BY status, object_type`
      ).all()
    : [];
  return {
    dirtyCount: dirtyRows.reduce((sum, row) => sum + row.count, 0),
    dirtyTypes: dirtyRows.map((row) => ({ count: row.count, objectType: row.object_type })),
    issueCount: pushIssueRows.reduce((sum, row) => sum + row.count, 0),
    issueTypes: pushIssueRows.map((row) => ({
      count: row.count,
      objectType: row.object_type,
      status: row.status
    }))
  };
}

function emptyLocalPushBlockers() {
  return { dirtyCount: 0, dirtyTypes: [], issueCount: 0, issueTypes: [] };
}

function suspectLayer(report) {
  if (!report.identity.androidEndpoint) return 'pairing/source mismatch: Android workspace endpoint is missing';
  if (report.cursors.androidCursor > report.cursors.desktopMaxSeq) return 'cursor advancement: Android cursor is ahead of desktop';
  if (report.localPush.issueCount > 0) return 'local push conflict or rejection blocks a clean sync finish';
  const nodeOrder = report.structural.find((item) => item.name === 'node_order');
  if (nodeOrder?.missingOnAndroid.length || nodeOrder?.positionMismatches.length) return 'node_order apply';
  if (report.structural.some((item) => item.missingOnAndroid.length)) return 'pack apply or pack builder';
  if (report.content.missingMetadata.length) return 'content_blobs metadata sync';
  if (report.resources.availableWithoutData.length) return 'resource pull wrote availability without bytes';
  if (report.resources.missingReferencedContentBlobs > 0 || report.resources.missingAttachmentResources > 0) return 'resource pull backlog';
  if (report.cursors.pending.liveCount === 0 && report.cursors.pending.tombstoneCount > 0) {
    return 'pending tombstone-only changes; visible structure is converged';
  }
  if (report.cursors.desktopMaxSeq > report.cursors.androidCursor) return 'structure pack not fully pulled';
  return 'no obvious structural break';
}

export { localPushBlockers, pendingDesktopChanges, resourceBacklog, suspectLayer };
