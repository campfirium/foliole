import type { DbPort } from '../../../../../../lib/core/sync/dbPort';

const NODE_REFERENCES: Array<readonly [string, string]> = [
  ['nodes', 'parent_id'],
  ['node_review', 'node_id'],
  ['node_reading', 'node_id'],
  ['node_open_state', 'node_id'],
  ['node_reading_host_state', 'node_id'],
  ['review_log', 'node_id'],
  ['node_sync_tombstones', 'node_id'],
  ['node_sync_conflicts', 'object_id'],
  ['node_text_alternatives', 'node_id'],
  ['node_order', 'node_id'],
  ['node_view_state', 'node_id'],
  ['node_attachments', 'node_id']
];

export async function rekeyNodeObject(
  port: DbPort,
  sourceId: string,
  canonicalId: string,
  sourceVersionId: string,
  canonicalVersionId: string
) {
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
  await createCanonicalVersion(port, {
    canonicalId, canonicalVersionId, sourceVersionId
  });
  await port.run(
    'UPDATE nodes SET current_version_id = ? WHERE id = ?',
    [canonicalVersionId, canonicalId]
  );
  await port.run(
    `UPDATE sync_object_state SET object_id = ? WHERE object_id = ?
     AND object_type IN ('node', 'node_open_state', 'node_reading', 'node_review')`,
    [canonicalId, sourceId]
  );
  await port.run(
    `UPDATE sync_object_state SET current_version_id = ?
     WHERE object_type = 'node' AND object_id = ?`,
    [canonicalVersionId, canonicalId]
  );
  await port.run(
    `UPDATE sync_delivery_receipts SET object_id = ? WHERE object_id = ? AND object_type = 'node'`,
    [canonicalId, sourceId]
  );
  await port.run('DELETE FROM nodes WHERE id = ?', [sourceId]);
}

async function createCanonicalVersion(port: DbPort, input: {
  canonicalId: string;
  canonicalVersionId: string;
  sourceVersionId: string;
}) {
  const [source] = await port.query<{
    body_text: string | null;
    content_hash: string;
    created_at: string;
    host_name: string;
    snapshot_json: string | null;
  }>(`SELECT host_name, created_at, content_hash, body_text, snapshot_json
      FROM node_sync_versions WHERE version_id = ? LIMIT 1`, [input.sourceVersionId]);
  if (!source?.snapshot_json) throw new Error('canonical_node_source_version_missing');
  await port.run(
    `INSERT INTO node_sync_versions (
       version_id, object_id, parent_version_id, host_name, created_at,
       content_hash, body_text, snapshot_json
     ) VALUES (?, ?, NULL, ?, ?, ?, ?, ?)
     ON CONFLICT(version_id) DO NOTHING`,
    [input.canonicalVersionId, input.canonicalId, source.host_name, source.created_at,
      source.content_hash, source.body_text,
      withCanonicalSnapshotId(source.snapshot_json, input.canonicalId)]
  );
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
