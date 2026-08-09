import type { DbPort } from '../../../../../../lib/core/sync/dbPort';

const NODE_REFERENCES: Array<readonly [string, string]> = [
  ['nodes', 'parent_id'],
  ['node_review', 'node_id'],
  ['node_reading', 'node_id'],
  ['node_open_state', 'node_id'],
  ['node_reading_device_state', 'node_id'],
  ['review_log', 'node_id'],
  ['node_sync_versions', 'object_id'],
  ['node_sync_tombstones', 'node_id'],
  ['node_sync_conflicts', 'object_id'],
  ['node_text_alternatives', 'node_id'],
  ['node_order', 'node_id'],
  ['node_view_state', 'node_id'],
  ['node_attachments', 'node_id']
];

export async function rekeyNodeObject(port: DbPort, sourceId: string, canonicalId: string) {
  const columns = await port.query<{ name: string }>('PRAGMA table_info(nodes)');
  const names = columns.map((row) => row.name).filter(Boolean);
  const projection = names.map((name) => name === 'id' ? '? AS "id"' : quote(name)).join(', ');
  const quoted = names.map(quote).join(', ');
  await port.run(
    `INSERT OR IGNORE INTO nodes (${quoted}) SELECT ${projection} FROM nodes WHERE id = ?`,
    [canonicalId, sourceId]
  );
  for (const [table, column] of NODE_REFERENCES) {
    await port.run(`UPDATE ${table} SET ${column} = ? WHERE ${column} = ?`, [canonicalId, sourceId]);
  }
  await rekeyVersionSnapshots(port, canonicalId);
  await port.run(
    `UPDATE sync_object_state SET object_id = ? WHERE object_id = ?
     AND object_type IN ('node', 'node_open_state', 'node_reading', 'node_review')`,
    [canonicalId, sourceId]
  );
  await port.run(
    `UPDATE sync_delivery_receipts SET object_id = ? WHERE object_id = ? AND object_type = 'node'`,
    [canonicalId, sourceId]
  );
  await port.run('DELETE FROM nodes WHERE id = ?', [sourceId]);
}

async function rekeyVersionSnapshots(port: DbPort, canonicalId: string) {
  const rows = await port.query<{ snapshot_json: string | null; version_id: string }>(
    'SELECT version_id, snapshot_json FROM node_sync_versions WHERE object_id = ?',
    [canonicalId]
  );
  for (const row of rows) {
    await port.run(
      'UPDATE node_sync_versions SET snapshot_json = ? WHERE version_id = ?',
      [withCanonicalSnapshotId(row.snapshot_json, canonicalId), row.version_id]
    );
  }
}

function withCanonicalSnapshotId(value: string | null, canonicalId: string) {
  if (value === null) return null;
  try {
    return JSON.stringify({ ...JSON.parse(value), id: canonicalId });
  } catch {
    return value;
  }
}

function quote(name: string) {
  return `"${name.replaceAll('"', '""')}"`;
}
