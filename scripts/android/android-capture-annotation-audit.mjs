// Match the shared inline/blob body contract; a missing referenced blob is not inline content.
const BODY_CONTENT_SQL = `CASE
  WHEN NULLIF(TRIM(n.body_blob_hash), '') IS NULL THEN n.content
  WHEN cbd.hash IS NOT NULL THEN CAST(cbd.data AS TEXT)
  ELSE ''
END`;

function requiredRow(db, sql, params, label) {
  const row = db.prepare(sql).get(...params);
  if (!row) throw new Error(`${label} was not found in the Android database`);
  return row;
}

function persistedNodeSummary(row) {
  return {
    currentVersionId: row.current_version_id,
    hostName: row.last_modified_by_host_name,
    nodeId: row.id,
    parentNodeId: row.parent_id,
    versionHostName: row.version_host_name,
    updatedAt: row.updated_at
  };
}

function anchorSource(row, kind, expectedText, label) {
  let anchor;
  try { anchor = JSON.parse(row.anchor_link); }
  catch { throw new Error(`${label} source anchor is invalid`); }
  const locators = Array.isArray(anchor?.locator?.ranges) ? anchor.locator.ranges : [anchor?.locator];
  const sourceText = locators.map((locator) => locator?.originalText).filter(Boolean).join(' ');
  if (anchor?.kind !== kind || !sourceText.includes(expectedText)) {
    throw new Error(`${label} source anchor does not preserve the selected text`);
  }
  return sourceText;
}

export function auditCaptureAnnotationDatabase(db, token) {
  const capture = requiredRow(db, `
    SELECT ${BODY_CONTENT_SQL} AS content, n.id, n.current_version_id, n.last_modified_by_host_name,
      n.parent_id, n.updated_at, v.host_name AS version_host_name
    FROM nodes n
    LEFT JOIN content_blob_data cbd ON cbd.hash = n.body_blob_hash
    INNER JOIN node_sync_versions v ON v.version_id = n.current_version_id AND v.object_id = n.id
    WHERE n.parent_id = 'special-inbox' AND ${BODY_CONTENT_SQL} LIKE ? AND n.deleted_at IS NULL
    ORDER BY n.updated_at DESC LIMIT 1
  `, [`%A5 capture ${token}%`], 'Capture Topic');
  const cloze = requiredRow(db, `
    SELECT n.id, n.anchor_link, ${BODY_CONTENT_SQL} AS content, n.current_version_id, n.kind,
      n.last_modified_by_host_name, n.parent_id, n.reveal, n.updated_at,
      v.host_name AS version_host_name
    FROM nodes n
    LEFT JOIN content_blob_data cbd ON cbd.hash = n.body_blob_hash
    INNER JOIN node_sync_versions v ON v.version_id = n.current_version_id AND v.object_id = n.id
    WHERE n.parent_id = ? AND n.kind = 'item' AND n.reveal = ? AND n.deleted_at IS NULL
    ORDER BY n.updated_at DESC LIMIT 1
  `, [capture.id, 'Cloze target alpha'], 'Cloze Item');
  const note = requiredRow(db, `
    SELECT n.id, n.anchor_link, ${BODY_CONTENT_SQL} AS content, n.current_version_id, n.kind,
      n.last_modified_by_host_name, n.parent_id, n.updated_at,
      v.host_name AS version_host_name
    FROM nodes n
    LEFT JOIN content_blob_data cbd ON cbd.hash = n.body_blob_hash
    INNER JOIN node_sync_versions v ON v.version_id = n.current_version_id AND v.object_id = n.id
    WHERE n.parent_id = ? AND n.kind = 'topic' AND ${BODY_CONTENT_SQL} LIKE ? AND n.deleted_at IS NULL
    ORDER BY n.updated_at DESC LIMIT 1
  `, [capture.id, `%A5 note ${token}%`], 'selection Note');
  const review = requiredRow(
    db,
    'SELECT due, state FROM node_review WHERE node_id = ?',
    [cloze.id],
    'Cloze review profile'
  );
  const rows = { capture, cloze, note };
  for (const [name, row] of Object.entries(rows)) {
    if (!row.current_version_id || !row.last_modified_by_host_name
        || row.version_host_name !== row.last_modified_by_host_name) {
      throw new Error(`${name} is missing persisted version or host identity`);
    }
  }
  if (!cloze.anchor_link || !note.anchor_link) throw new Error('Cloze or Note source anchor is missing');
  const hostNames = new Set(Object.values(rows).map((row) => row.last_modified_by_host_name));
  if (hostNames.size !== 1) throw new Error('Capture annotation nodes do not share one host identity');
  if (!capture.content.includes(`A5 capture ${token}`) || capture.parent_id !== 'special-inbox') {
    throw new Error('Capture Topic does not preserve the Inbox content contract');
  }
  if (cloze.kind !== 'item' || !cloze.content.includes('[...]')) {
    throw new Error('Cloze node does not preserve the Item prompt contract');
  }
  if (note.kind !== 'topic' || !note.content.includes('Note target beta')
      || !note.content.includes(`A5 note ${token}`)) {
    throw new Error('selection Note does not preserve original and annotation text');
  }
  const clozeSourceText = anchorSource(cloze, 'cloze', 'Cloze target alpha', 'Cloze');
  const noteSourceText = anchorSource(note, 'highlight', 'Note target beta', 'Note');
  return {
    capture: persistedNodeSummary(capture),
    cloze: { ...persistedNodeSummary(cloze), hasAnchor: true, hasReview: true,
      reveal: cloze.reveal, sourceText: clozeSourceText },
    note: { ...persistedNodeSummary(note), annotationText: `A5 note ${token}`,
      hasAnchor: true, sourceText: noteSourceText },
    review: { due: review.due, state: review.state },
    resultStatus: 'success',
    schemaVersion: 1,
    token
  };
}
