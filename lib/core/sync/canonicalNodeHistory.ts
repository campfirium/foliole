import type { DbPort } from './dbPort.js';

export async function moveCanonicalNodeHistory(port: DbPort, input: {
  sourceId: string; canonicalId: string; versionIds?: string[];
}) {
  const rows = await port.query<{ version_id: string; snapshot_json: string | null }>(
    'SELECT version_id, snapshot_json FROM node_sync_versions WHERE object_id = ?', [input.sourceId]
  );
  const selected = input.versionIds ? new Set(input.versionIds) : null;
  for (const row of rows) {
    if (selected && !selected.has(String(row.version_id))) continue;
    const snapshot = typeof row.snapshot_json === 'string'
      ? JSON.stringify({ ...JSON.parse(row.snapshot_json), id: input.canonicalId }) : row.snapshot_json;
    await port.run('UPDATE node_sync_versions SET object_id = ?, snapshot_json = ? WHERE version_id = ?',
      [input.canonicalId, snapshot, row.version_id]);
  }
}

export async function linkCanonicalNodeVersion(port: DbPort, canonicalVersionId: string, sourceVersionId: string) {
  if (canonicalVersionId === sourceVersionId) return;
  await port.run('UPDATE node_sync_versions SET parent_version_id = ? WHERE version_id = ?',
    [sourceVersionId, canonicalVersionId]);
  await port.run('INSERT OR IGNORE INTO node_sync_version_parents (version_id, parent_version_id, ordinal) VALUES (?, ?, 0)',
    [canonicalVersionId, sourceVersionId]);
}
