function requiredRow(db, sql, params, label) {
  const row = db.prepare(sql).get(...params);
  if (!row) throw new Error(`${label} was not found in the Android database`);
  return row;
}

function persistedNodeSummary(row) {
  return {
    currentVersionId: row.current_version_id,
    deviceId: row.last_modified_by_device_id,
    nodeId: row.id,
    updatedAt: row.updated_at
  };
}

export function auditCaptureAnnotationDatabase(db, token) {
  const capture = requiredRow(db, `
    SELECT id, current_version_id, last_modified_by_device_id, parent_id, updated_at
    FROM nodes
    WHERE parent_id = 'special-inbox' AND content LIKE ? AND deleted_at IS NULL
    ORDER BY updated_at DESC LIMIT 1
  `, [`%A5 capture ${token}%`], 'Capture Topic');
  const cloze = requiredRow(db, `
    SELECT id, anchor_link, current_version_id, last_modified_by_device_id, reveal, updated_at
    FROM nodes
    WHERE parent_id = ? AND kind = 'item' AND reveal = ? AND deleted_at IS NULL
    ORDER BY updated_at DESC LIMIT 1
  `, [capture.id, 'Cloze target alpha'], 'Cloze Item');
  const note = requiredRow(db, `
    SELECT id, anchor_link, current_version_id, last_modified_by_device_id, updated_at
    FROM nodes
    WHERE parent_id = ? AND kind = 'topic' AND content LIKE ? AND deleted_at IS NULL
    ORDER BY updated_at DESC LIMIT 1
  `, [capture.id, `%A5 note ${token}%`], 'selection Note');
  const review = requiredRow(
    db,
    'SELECT due, state FROM node_review WHERE node_id = ?',
    [cloze.id],
    'Cloze review profile'
  );
  const rows = { capture, cloze, note };
  for (const [name, row] of Object.entries(rows)) {
    if (!row.current_version_id || !row.last_modified_by_device_id) {
      throw new Error(`${name} is missing persisted version or device identity`);
    }
  }
  if (!cloze.anchor_link || !note.anchor_link) throw new Error('Cloze or Note source anchor is missing');
  return {
    capture: persistedNodeSummary(capture),
    cloze: { ...persistedNodeSummary(cloze), hasAnchor: true, hasReview: true, reveal: cloze.reveal },
    note: { ...persistedNodeSummary(note), hasAnchor: true },
    review: { due: review.due, state: review.state },
    resultStatus: 'success',
    schemaVersion: 1,
    token
  };
}
