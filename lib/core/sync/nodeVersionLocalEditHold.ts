import type { DbPort } from './dbPort.js';

/** The editor may use a version after a later sync has moved the node head. */
export async function retainLocalEditBase(port: DbPort, args: {
  holdId: string;
  nodeId: string;
  versionId: string;
}) {
  if (!args.holdId || !args.nodeId || !args.versionId) throw new Error('content_edit_hold_invalid');
  const [version] = await port.query<{ version_id: string }>(
    `SELECT version_id FROM node_sync_versions WHERE object_id = ? AND version_id = ?
       AND (body_text IS NOT NULL OR json_type(snapshot_json, '$.content') = 'text'
         OR json_type(snapshot_json, '$.content') IS NULL)`,
    [args.nodeId, args.versionId]
  );
  if (!version) throw new Error('content_edit_base_unavailable');
  const [held] = await port.query<{ object_id: string }>(
    'SELECT object_id FROM node_version_local_holds WHERE hold_id = ?', [args.holdId]
  );
  if (held && held.object_id !== args.nodeId) throw new Error('content_edit_hold_node_mismatch');
  await port.run(
    `INSERT INTO node_version_local_holds (hold_id, object_id, version_id, created_at)
     VALUES (?, ?, ?, ?) ON CONFLICT(hold_id) DO UPDATE SET version_id = excluded.version_id`,
    [args.holdId, args.nodeId, args.versionId, new Date().toISOString()]
  );
}

export async function releaseLocalEditBase(port: DbPort, holdId: string, nodeId: string) {
  await port.run(
    'DELETE FROM node_version_local_holds WHERE hold_id = ? AND object_id = ?', [holdId, nodeId]
  );
}
