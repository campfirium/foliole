import Database from 'better-sqlite3';

import {
  localPushBlockers,
  pendingDesktopChanges,
  resourceBacklog,
  suspectLayer
} from './android-sync-audit-breakdown.mjs';
import { syncEventSummary } from './android-sync-audit-events.mjs';
import { policyBreakdown } from './android-sync-audit-state-policy.mjs';

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
        gap: null,
        pending: pendingDesktopChanges(desktop, androidCursor)
      },
      identity: {
        androidEndpoint: metaValue(android, 'workspace_sync_endpoint_url'),
        androidSerial: metadata.serial ?? null
      },
      localPush: localPushBlockers(android),
      objectTypes: mergeObjectTypeStats(objectTypeStats(desktop, androidCursor), objectTypeStats(android)),
      statePolicy: policyBreakdown(android, metaValue(android, 'host_name')),
      resources: resourceBacklog(android),
      syncEvents: syncEventSummary(android),
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
    `pending_live_changes  : ${report.cursors.pending.liveCount}`,
    `pending_tombstones    : ${report.cursors.pending.tombstoneCount}`,
    `pending_types         : ${formatPendingTypes(report.cursors.pending.types)}`,
    `local_dirty_changes   : ${report.localPush.dirtyCount}`,
    `local_push_issues     : ${report.localPush.issueCount}`,
    `local_push_types      : ${formatLocalPushTypes(report.localPush)}`,
    `sync_event_count      : ${report.syncEvents.count}`,
    `latest_run            : ${formatLatestRun(report.syncEvents.latestRun)}`,
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
    '=== State Policy ===',
    `Host-private view_state rows: ${report.statePolicy.hostPrivate.viewStateSyncRows}`,
    `node_view_state rows: ${formatHostPrivateRows(report.statePolicy.hostPrivate.nodeViewStateRows, report.statePolicy.hostPrivate.nonLocalNodeViewStateRows)}`,
    `node_reading_host_state rows: ${formatHostPrivateRows(report.statePolicy.hostPrivate.nodeReadingHostStateRows, report.statePolicy.hostPrivate.nonLocalNodeReadingHostStateRows)}`,
    `Host-private cleanup: node scripts/electron-sqlite-runner.mjs scripts/android/android-sync-cleanup-host-private.mjs --db <android.db>`,
    '',
    '=== Resource Backlog ===',
    `content_blob metadata missing from android: ${report.content.missingMetadata.length}`,
    `content_blob bytes missing but availability != missing: ${report.resources.availableWithoutData.length}`,
    `referenced content blobs missing bytes: ${report.resources.missingReferencedContentBlobs}`,
    `unreferenced content_blob availability=missing: ${report.resources.missingUnreferencedContentBlobs}`,
    `active node bodies missing bytes: ${report.resources.missingNodeBodies}`,
    `external document bodies missing bytes: ${report.resources.missingExternalDocumentBodies}`,
    `attachment resources missing bytes: ${report.resources.missingAttachmentResources}`,
    '',
    '=== Suspected Broken Layer ===',
    report.suspectedBrokenLayer
  );
  return lines.join('\n');
}

function formatPendingTypes(types) {
  if (types.length === 0) return 'none';
  return types.map((row) => `${row.objectType}(live=${row.liveCount}, tombstone=${row.tombstoneCount})`).join(', ');
}

function formatLocalPushTypes(localPush) {
  const dirty = localPush.dirtyTypes.map((row) => `${row.objectType}(dirty=${row.count})`);
  const issues = localPush.issueTypes.map((row) => `${row.objectType}(${row.status}=${row.count})`);
  return [...dirty, ...issues].join(', ') || 'none';
}

function formatLatestRun(run) {
  if (!run) return 'none';
  return `${run.result ?? 'unknown'} ${run.message}`.trim();
}

function formatHostPrivateRows(total, nonLocal) {
  return nonLocal === null ? `${total} non_local=unknown` : `${total} non_local=${nonLocal}`;
}

export { auditDatabases, formatAuditReport };
