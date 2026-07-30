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
    SELECT content, id, current_version_id, last_modified_by_device_id, parent_id, updated_at
    FROM nodes
    WHERE parent_id = 'special-inbox' AND content LIKE ? AND deleted_at IS NULL
    ORDER BY updated_at DESC LIMIT 1
  `, [`%A5 capture ${token}%`], 'Capture Topic');
  const cloze = requiredRow(db, `
    SELECT id, anchor_link, content, current_version_id, kind, last_modified_by_device_id, reveal, updated_at
    FROM nodes
    WHERE parent_id = ? AND kind = 'item' AND reveal = ? AND deleted_at IS NULL
    ORDER BY updated_at DESC LIMIT 1
  `, [capture.id, 'Cloze target alpha'], 'Cloze Item');
  const note = requiredRow(db, `
    SELECT id, anchor_link, content, current_version_id, kind, last_modified_by_device_id, updated_at
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
  const deviceIds = new Set(Object.values(rows).map((row) => row.last_modified_by_device_id));
  if (deviceIds.size !== 1) throw new Error('Capture annotation nodes do not share one device identity');
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
    capture: { ...persistedNodeSummary(capture), parentNodeId: capture.parent_id },
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
