
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
    missingAttachmentResources: null, // File evidence is required after manifest retirement.
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

function localPushBlockers(db) {
  if (!tableExists(db, 'sync_object_state')) return emptyLocalPushBlockers();
  const dirtyRows = db.prepare(
    `SELECT object_type, COUNT(*) AS count FROM sync_object_state
     WHERE sync_dirty = 1 AND object_type <> 'view_state' GROUP BY object_type ORDER BY object_type`
  ).all();
  return {
    dirtyCount: dirtyRows.reduce((sum, row) => sum + row.count, 0),
    dirtyTypes: dirtyRows.map((row) => ({ count: row.count, objectType: row.object_type }))
  };
}

function emptyLocalPushBlockers() {
  return { dirtyCount: 0, dirtyTypes: [] };
}

function suspectLayer(report) {
  if (!report.identity.androidEndpoint) return 'pairing/source mismatch: Android workspace endpoint is missing';
  const nodeOrder = report.structural.find((item) => item.name === 'parent_child_order');
  if (nodeOrder?.missingOnAndroid.length || nodeOrder?.positionMismatches.length) return 'parent_child_order apply';
  if (report.structural.some((item) => item.missingOnAndroid.length)) return 'structural differences observed';
  if (report.content.missingMetadata.length) return 'content_blobs metadata sync';
  if (report.resources.availableWithoutData.length) return 'resource pull wrote availability without bytes';
  if (report.resources.missingReferencedContentBlobs > 0 || report.resources.missingAttachmentResources > 0) return 'resource pull backlog';
  return 'no obvious structural break';
}

export { localPushBlockers, resourceBacklog, suspectLayer };
