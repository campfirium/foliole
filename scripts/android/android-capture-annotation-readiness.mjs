const REQUIRED_TABLES = ['nodes', 'node_order', 'content_blobs', 'companion_meta'];

function tableExists(database, table) {
  return database.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1"
  ).get(table) !== undefined;
}

function countRows(database, table) {
  if (!tableExists(database, table)) return null;
  return database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count;
}

function companionMetaPresent(database, key) {
  if (!tableExists(database, 'companion_meta')) return false;
  const row = database.prepare(
    'SELECT 1 AS present FROM companion_meta WHERE key = ? LIMIT 1'
  ).get(key);
  return row?.present === 1;
}

export function inspectCaptureAnnotationWorkspace(database) {
  const tables = Object.fromEntries(REQUIRED_TABLES.map((table) => [table, tableExists(database, table)]));
  const inbox = tables.nodes ? database.prepare(
    "SELECT kind FROM nodes WHERE id = 'special-inbox' AND deleted_at IS NULL LIMIT 1"
  ).get() : undefined;
  return {
    canonicalInbox: { active: Boolean(inbox), kind: inbox?.kind ?? null },
    counts: {
      content_blobs: countRows(database, 'content_blobs'),
      node_order: countRows(database, 'node_order'),
      nodes: countRows(database, 'nodes')
    },
    pairingWorkspace: {
      localDeviceIdentityPresent: companionMetaPresent(database, 'device_id'),
      syncEndpointPresent: companionMetaPresent(database, 'workspace_sync_endpoint_url')
    },
    tables
  };
}

function missingPrerequisites(snapshot) {
  const inspection = snapshot.database?.inspection;
  const missing = [];
  if (!snapshot.database?.exists) missing.push('database_missing');
  else if (snapshot.database.unreadable || !inspection) missing.push('database_unreadable');
  if (inspection && (inspection.counts.nodes <= 1 || inspection.counts.node_order <= 0
      || inspection.counts.content_blobs <= 0)) missing.push('acceptance_workspace_empty');
  if (inspection && (!inspection.canonicalInbox.active
      || inspection.canonicalInbox.kind !== 'folder')) missing.push('canonical_inbox_missing');
  if (inspection && (!inspection.pairingWorkspace.localDeviceIdentityPresent
      || !inspection.pairingWorkspace.syncEndpointPresent)) missing.push('pairing_workspace_unproven');
  return missing;
}

export function captureAnnotationReadiness(snapshot) {
  const inspection = snapshot.database?.inspection;
  const missing = missingPrerequisites(snapshot);
  return {
    canonicalInbox: inspection?.canonicalInbox ?? { active: false, kind: null },
    counts: inspection?.counts ?? { content_blobs: null, node_order: null, nodes: null },
    missingPrerequisites: missing,
    pairingWorkspace: inspection?.pairingWorkspace ?? {
      localDeviceIdentityPresent: false, syncEndpointPresent: false
    },
    resultStatus: missing.length === 0 ? 'ready' : 'approval_required',
    schemaVersion: 1
  };
}
