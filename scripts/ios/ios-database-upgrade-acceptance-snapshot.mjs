const SCENARIO = 'database-upgrade-runtime';
const PROVENANCE_COLUMNS = ['import_content_fingerprint', 'import_source_fingerprint'];

export function parseUpgradeSnapshot(output) {
  const [row] = JSON.parse(output || '[]');
  return {
    attachment_count: number(row?.attachment_count),
    attachment_mime_type: row?.attachment_mime_type ?? null,
    attachment_name: row?.attachment_name ?? null,
    attachment_role: row?.attachment_role ?? null,
    blob_availability: row?.blob_availability ?? null,
    blob_content_hash: row?.blob_content_hash ?? null,
    cursor: row?.cursor ?? null,
    device_id: row?.device_id ?? null,
    node_count: number(row?.node_count),
    open_state_table_exists: number(row?.open_state_table_exists),
    node_review_count: number(row?.node_review_count),
    node_review_due: row?.node_review_due ?? null,
    node_title: row?.node_title ?? null,
    provenance_columns: String(row?.provenance_columns ?? '').split(',').filter(Boolean).sort(),
    resource_count: number(row?.resource_count),
    review_log_count: number(row?.review_log_count),
    review_log_grade: number(row?.review_log_grade),
    review_log_op_id: row?.review_log_op_id ?? null,
    setting_count: number(row?.setting_count),
    setting_value: row?.setting_value ?? null,
    user_version: number(row?.user_version),
    view_count: number(row?.view_count),
    view_scroll_top: number(row?.view_scroll_top),
    view_source: row?.view_source ?? null
  };
}

export function readUpgradeSnapshot(capture, databasePath) {
  return parseUpgradeSnapshot(capture('sqlite3', ['-json', databasePath, SNAPSHOT_SQL]));
}

export function verifyIosDatabaseUpgradeAcceptance(stages, verifyBridgeResult) {
  const successful = [stages.first, stages.second, stages.recovered];
  for (const stage of successful) verifyBridgeResult(stage, SCENARIO);
  if (!successful.every((stage) => stage.bootstrap?.database_ready === true)) {
    throw new Error('iOS database upgrade ready evidence is incomplete.');
  }
  if (stages.failed?.status !== 'failed' || stages.failed?.scenario !== SCENARIO ||
      'bootstrap' in stages.failed ||
      !String(stages.failed?.error ?? '').includes('Injected iOS database upgrade acceptance fault')) {
    throw new Error('iOS database upgrade failure evidence is incomplete.');
  }
  const current = expectedSnapshot(20, PROVENANCE_COLUMNS, 1);
  const legacy = expectedSnapshot(19, PROVENANCE_COLUMNS, 0);
  if (![stages.firstSnapshot, stages.secondSnapshot, stages.recoveredSnapshot]
    .every((snapshot) => equal(snapshot, current)) || !equal(stages.failedSnapshot, legacy)) {
    throw new Error('iOS database upgrade SQLite evidence is incomplete.');
  }
  return stages;
}

export function expectedUpgradeSnapshot(userVersion, provenanceColumns, openStateTableExists = 1) {
  return expectedSnapshot(userVersion, provenanceColumns, openStateTableExists);
}

function expectedSnapshot(userVersion, provenanceColumns, openStateTableExists) {
  return {
    attachment_count: 1, attachment_mime_type: 'image/png', attachment_name: 'sample.png',
    attachment_role: 'inline', blob_availability: 'cached', blob_content_hash: 'resource-hash',
    cursor: '41', device_id: 'ios-upgrade-device', node_count: 1, open_state_table_exists: openStateTableExists,
    node_review_count: 1,
    node_review_due: '2026-07-21T00:00:00.000Z', node_title: 'Upgrade',
    provenance_columns: [...provenanceColumns].sort(), resource_count: 1, review_log_count: 1,
    review_log_grade: 3, review_log_op_id: 'op-1', setting_count: 1, setting_value: '"dark"',
    user_version: userVersion, view_count: 1, view_scroll_top: 42, view_source: 'user-scroll'
  };
}

function number(value) { return Number(value ?? -1); }
function equal(left, right) { return JSON.stringify(left) === JSON.stringify(right); }

const SNAPSHOT_SQL = `SELECT
  (SELECT count(*) FROM attachments) attachment_count,
  (SELECT mime_type FROM attachments WHERE id='attachment-1') attachment_mime_type,
  (SELECT original_name FROM attachments WHERE id='attachment-1') attachment_name,
  (SELECT role FROM node_attachments WHERE node_id='upgrade-node') attachment_role,
  (SELECT availability FROM attachment_blobs WHERE attachment_id='attachment-1') blob_availability,
  (SELECT content_hash FROM attachment_blobs WHERE attachment_id='attachment-1') blob_content_hash,
  (SELECT value FROM companion_meta WHERE key='sync_pack_cursor') cursor,
  (SELECT value FROM companion_meta WHERE key='device_id') device_id,
  (SELECT count(*) FROM nodes) node_count,
  (SELECT count(*) FROM sqlite_master WHERE type='table' AND name='node_open_state') open_state_table_exists,
  (SELECT count(*) FROM node_review) node_review_count,
  (SELECT due FROM node_review WHERE node_id='upgrade-node') node_review_due,
  (SELECT title FROM nodes WHERE id='upgrade-node') node_title,
  (SELECT group_concat(name, ',') FROM pragma_table_info('nodes') WHERE name LIKE 'import_%_fingerprint') provenance_columns,
  (SELECT count(*) FROM attachment_blobs) resource_count,
  (SELECT count(*) FROM review_log) review_log_count,
  (SELECT grade FROM review_log WHERE id='review-1') review_log_grade,
  (SELECT op_id FROM review_log WHERE id='review-1') review_log_op_id,
  (SELECT count(*) FROM setting_records) setting_count,
  (SELECT value_json FROM setting_records WHERE key='theme') setting_value,
  (SELECT user_version FROM pragma_user_version) user_version,
  (SELECT count(*) FROM node_view_state) view_count,
  (SELECT scroll_top FROM node_view_state WHERE node_id='upgrade-node') view_scroll_top,
  (SELECT source FROM node_view_state WHERE node_id='upgrade-node') view_source;`;
