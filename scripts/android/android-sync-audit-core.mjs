import Database from 'better-sqlite3';

const STRUCTURAL_TABLES = [
  { name: 'nodes', pk: 'id', sql: "SELECT id, title FROM nodes WHERE deleted_at IS NULL" },
  {
    name: 'node_order',
    pk: 'node_id',
    sql: 'SELECT no.node_id, no.position FROM node_order no INNER JOIN nodes n ON n.id = no.node_id WHERE n.deleted_at IS NULL'
  },
  { name: 'external_documents', pk: 'document_id', sql: 'SELECT document_id FROM external_documents WHERE is_present = 1' }
];

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

function metaValue(db, key) {
  if (!tableExists(db, 'companion_meta')) return null;
  return db.prepare('SELECT value FROM companion_meta WHERE key = ?').get(key)?.value ?? null;
}

function objectTypeStats(db, desktopCursor = null) {
  if (!tableExists(db, 'sync_object_state')) return [];
  const where = typeof desktopCursor === 'number' ? 'WHERE state_seq <= ?' : '';
  return db.prepare(
    `SELECT object_type, COUNT(*) AS count, MAX(state_seq) AS max_state_seq FROM sync_object_state ${where} GROUP BY object_type ORDER BY object_type`
  ).all(...(typeof desktopCursor === 'number' ? [desktopCursor] : []));
}

function keyRows(db, definition) {
  if (!tableExists(db, definition.name)) return [];
  return all(db, definition.sql);
}

function diffKeys(leftRows, rightRows, key) {
  const right = new Set(rightRows.map((row) => row[key]));
  return leftRows.map((row) => row[key]).filter((value) => !right.has(value));
}

function positionMismatches(leftRows, rightRows) {
  const right = new Map(rightRows.map((row) => [row.node_id, row.position]));
  return leftRows.filter((row) => right.has(row.node_id) && right.get(row.node_id) !== row.position);
}

function compareStructures(desktop, android) {
  return STRUCTURAL_TABLES.map((definition) => {
    const desktopRows = keyRows(desktop, definition);
    const androidRows = keyRows(android, definition);
    return {
      androidCount: androidRows.length,
      desktopCount: desktopRows.length,
      missingOnAndroid: diffKeys(desktopRows, androidRows, definition.pk).slice(0, 20),
      name: definition.name,
      positionMismatches: definition.name === 'node_order' ? positionMismatches(desktopRows, androidRows).slice(0, 20) : []
    };
  });
}

function readReferencedContentHashes(db) {
  return new Set([
    ...all(db, "SELECT body_blob_hash AS hash FROM nodes WHERE deleted_at IS NULL AND body_blob_hash IS NOT NULL").map((row) => row.hash),
    ...all(db, "SELECT body_blob_hash AS hash FROM external_documents WHERE is_present = 1 AND body_blob_hash IS NOT NULL").map((row) => row.hash)
  ]);
}

function compareContentMetadata(desktop, android) {
  const expectedHashes = [...readReferencedContentHashes(desktop)];
  const androidHashes = new Set(all(android, 'SELECT hash FROM content_blobs').map((row) => row.hash));
  return {
    expectedCount: expectedHashes.length,
    missingMetadata: expectedHashes.filter((hash) => !androidHashes.has(hash)).slice(0, 20)
  };
}

function resourceBacklog(android) {
  return {
    availableWithoutData: all(android,
      "SELECT b.hash FROM content_blobs b LEFT JOIN content_blob_data d ON d.hash = b.hash WHERE b.availability <> 'missing' AND d.hash IS NULL LIMIT 20"
    ).map((row) => row.hash),
    missingAvailabilityCount: scalar(android, "SELECT COUNT(*) FROM content_blobs WHERE availability = 'missing'", 0),
    missingExternalDocumentBodies: scalar(android,
      'SELECT COUNT(*) FROM external_documents e LEFT JOIN content_blob_data d ON d.hash = e.body_blob_hash WHERE e.is_present = 1 AND e.body_blob_hash IS NOT NULL AND d.hash IS NULL',
      0
    ),
    missingNodeBodies: scalar(android,
      'SELECT COUNT(*) FROM nodes n LEFT JOIN content_blob_data d ON d.hash = n.body_blob_hash WHERE n.deleted_at IS NULL AND n.body_blob_hash IS NOT NULL AND d.hash IS NULL',
      0
    )
  };
}

function mergeObjectTypeStats(desktopRows, androidRows) {
  const android = new Map(androidRows.map((row) => [row.object_type, row]));
  return desktopRows.map((row) => ({
    androidCount: android.get(row.object_type)?.count ?? 0,
    androidLocalMaxSeq: android.get(row.object_type)?.max_state_seq ?? null,
    desktopCountToCursor: row.count,
    desktopMaxSeqToCursor: row.max_state_seq,
    objectType: row.object_type
  }));
}

function suspectLayer(report) {
  if (!report.identity.androidEndpoint) return 'pairing/source mismatch: Android workspace endpoint is missing';
  if (report.cursors.androidCursor > report.cursors.desktopMaxSeq) return 'cursor advancement: Android cursor is ahead of desktop';
  const nodeOrder = report.structural.find((item) => item.name === 'node_order');
  if (nodeOrder?.missingOnAndroid.length || nodeOrder?.positionMismatches.length) return 'node_order apply';
  if (report.structural.some((item) => item.missingOnAndroid.length)) return 'pack apply or pack builder';
  if (report.content.missingMetadata.length) return 'content_blobs metadata sync';
  if (report.resources.availableWithoutData.length) return 'resource pull wrote availability without bytes';
  if (report.resources.missingAvailabilityCount > 0) return 'resource pull backlog';
  if (report.cursors.desktopMaxSeq > report.cursors.androidCursor) return 'structure pack not fully pulled';
  return 'no obvious structural break';
}

function auditDatabases(desktopPath, androidPath, metadata = {}) {
  const desktop = new Database(desktopPath, { readonly: true, fileMustExist: true });
  const android = new Database(androidPath, { readonly: true, fileMustExist: true });
  try {
    const androidCursor = Number(metaValue(android, 'sync_pack_cursor') ?? 0);
    const report = {
      capturedAt: new Date().toISOString(),
      content: compareContentMetadata(desktop, android),
      cursors: {
        androidCursor,
        desktopMaxSeq: scalar(desktop, 'SELECT COALESCE(MAX(state_seq), 0) FROM sync_object_state', 0),
        gap: null
      },
      identity: {
        androidEndpoint: metaValue(android, 'workspace_sync_endpoint_url'),
        androidSerial: metadata.serial ?? null
      },
      objectTypes: mergeObjectTypeStats(objectTypeStats(desktop, androidCursor), objectTypeStats(android)),
      resources: resourceBacklog(android),
      structural: compareStructures(desktop, android)
    };
    report.cursors.gap = report.cursors.desktopMaxSeq - report.cursors.androidCursor;
    report.suspectedBrokenLayer = suspectLayer(report);
    return report;
  } finally {
    desktop.close();
    android.close();
  }
}

function formatAuditReport(report) {
  const lines = [
    '=== Identity ===',
    `android_serial   : ${report.identity.androidSerial ?? 'local-db'}`,
    `android_endpoint : ${report.identity.androidEndpoint ?? 'missing'}`,
    '',
    '=== Cursors ===',
    `desktop_max_state_seq : ${report.cursors.desktopMaxSeq}`,
    `android_sync_cursor   : ${report.cursors.androidCursor}`,
    `desktop_minus_android : ${report.cursors.gap}`,
    '',
    '=== Per object_type ===',
    '| object_type | desktop_count_to_cursor | android_count | desktop_max_seq_to_cursor | android_local_max_seq |'
  ];
  for (const row of report.objectTypes) {
    lines.push(`| ${row.objectType} | ${row.desktopCountToCursor} | ${row.androidCount} | ${row.desktopMaxSeqToCursor} | ${row.androidLocalMaxSeq ?? 'n/a'} |`);
  }
  lines.push('', '=== Structural Diffs ===');
  for (const item of report.structural) {
    lines.push(`${item.name}: desktop=${item.desktopCount} android=${item.androidCount} missing=${item.missingOnAndroid.length}`);
    if (item.missingOnAndroid.length) lines.push(`  missing sample: ${item.missingOnAndroid.join(', ')}`);
    if (item.positionMismatches.length) lines.push(`  position mismatches: ${item.positionMismatches.length}`);
  }
  lines.push(
    '',
    '=== Resource Backlog ===',
    `content_blob metadata missing from android: ${report.content.missingMetadata.length}`,
    `content_blob bytes missing but availability != missing: ${report.resources.availableWithoutData.length}`,
    `content_blob availability=missing: ${report.resources.missingAvailabilityCount}`,
    `active node bodies missing bytes: ${report.resources.missingNodeBodies}`,
    `external document bodies missing bytes: ${report.resources.missingExternalDocumentBodies}`,
    '',
    '=== Suspected Broken Layer ===',
    report.suspectedBrokenLayer
  );
  return lines.join('\n');
}

export { auditDatabases, formatAuditReport };
