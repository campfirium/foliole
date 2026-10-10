import type { DbPort } from './dbPort.js';
import { collectNodeVersionPayloads } from './nodeVersionPayloadCollector.js';

/** The editor may use a version after a later sync has moved the node head. */
export async function retainLocalEditBase(port: DbPort, args: {
  holdId: string;
  nodeId: string;
  versionId: string;
}) {
  if (!args.holdId || !args.nodeId || !args.versionId) throw new Error('content_edit_hold_invalid');
  const [version] = await port.query<{ version_id: string }>(
    'SELECT version_id FROM node_sync_versions WHERE object_id = ? AND version_id = ?',
    [args.nodeId, args.versionId]
  );
  if (!version) throw new Error('content_edit_base_unavailable');
  const [held] = await port.query<{ object_id: string }>(
    'SELECT object_id FROM node_version_local_holds WHERE hold_id = ?', [args.holdId]
  );
  if (held && held.object_id !== args.nodeId) throw new Error('content_edit_hold_node_mismatch');
  await port.run('DELETE FROM node_version_local_holds WHERE object_id = ? AND substr(hold_id, 1, ?) = ?',
    [args.nodeId, args.holdId.length + 6, args.holdId + ':edit:']);
  await port.run(
    `INSERT INTO node_version_local_holds (hold_id, object_id, version_id, created_at)
     VALUES (?, ?, ?, ?) ON CONFLICT(hold_id) DO UPDATE SET version_id = excluded.version_id`,
    [args.holdId, args.nodeId, args.versionId, new Date().toISOString()]
  );
}

export async function releaseLocalEditBase(port: DbPort, holdId: string, nodeId: string) {
  await port.transaction(async (tx) => {
    await tx.run(`DELETE FROM node_version_local_holds WHERE object_id = ?
      AND (hold_id = ? OR substr(hold_id, 1, ?) = ?)`, [nodeId, holdId, holdId.length + 6, holdId + ':edit:']);
    await collectNodeVersionPayloads(tx, nodeId, Number.MAX_SAFE_INTEGER, false);
  });
}

/** Keep a submitted operation until its editor acknowledges the saved result. */
export async function retainSubmittedLocalEdit(port: DbPort, nodeId: string, baseId: string, versionId: string) {
  await port.run(`INSERT OR IGNORE INTO node_version_local_holds (hold_id, object_id, version_id, created_at)
    SELECT hold_id || ':edit:' || ?, object_id, ?, created_at FROM node_version_local_holds
    WHERE object_id = ? AND version_id = ? AND instr(hold_id, ':edit:') = 0 AND substr(hold_id, 1, 14) <> 'sync-exchange:'`,
  [versionId, versionId, nodeId, baseId]);
}
