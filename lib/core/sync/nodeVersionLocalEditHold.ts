import type { DbPort } from './dbPort.js';
import { writeDbStatements } from './dbStatements.js';
import { collectNodeVersionPayloads } from './nodeVersionPayloadCollector.js';

/** The editor may use a version after a later sync has moved the node head. */
export async function retainLocalEditBase(port: DbPort, args: {
  holdId: string;
  nodeId: string;
  versionId: string;
}) {
  if (!args.holdId || !args.nodeId || !args.versionId) throw new Error('content_edit_hold_invalid');
  // One read checks the version and the hold's owner; the two writes go out together.
  const [facts] = await port.query<{ present: number; held: string | null }>(
    `SELECT EXISTS (SELECT 1 FROM node_sync_versions WHERE object_id = ? AND version_id = ?) AS present,
      (SELECT object_id FROM node_version_local_holds WHERE hold_id = ?) AS held`,
    [args.nodeId, args.versionId, args.holdId]
  );
  if (!facts?.present) throw new Error('content_edit_base_unavailable');
  if (facts.held !== null && facts.held !== args.nodeId) throw new Error('content_edit_hold_node_mismatch');
  await port.transaction(tx => writeDbStatements(tx, [
    { sql: 'DELETE FROM node_version_local_holds WHERE object_id = ? AND substr(hold_id, 1, ?) = ?',
      params: [args.nodeId, args.holdId.length + 6, args.holdId + ':edit:'] },
    { sql: `INSERT INTO node_version_local_holds (hold_id, object_id, version_id, created_at)
     VALUES (?, ?, ?, ?) ON CONFLICT(hold_id) DO UPDATE SET version_id = excluded.version_id`,
    params: [args.holdId, args.nodeId, args.versionId, new Date().toISOString()] }
  ]));
}

export async function releaseLocalEditBase(port: DbPort, holdId: string, nodeId: string) {
  await port.transaction(async (tx) => {
    await tx.run(`DELETE FROM node_version_local_holds WHERE object_id = ?
      AND (hold_id = ? OR substr(hold_id, 1, ?) = ?)`, [nodeId, holdId, holdId.length + 6, holdId + ':edit:']);
    await collectNodeVersionPayloads(tx, nodeId, Number.MAX_SAFE_INTEGER);
  });
}

/** Keep a submitted operation until its editor acknowledges the saved result. */
export async function retainSubmittedLocalEdit(port: DbPort, nodeId: string, baseId: string, versionId: string) {
  await port.run(`INSERT OR IGNORE INTO node_version_local_holds (hold_id, object_id, version_id, created_at)
    SELECT (CASE WHEN instr(hold_id, ':edit:') > 0
      THEN substr(hold_id, 1, instr(hold_id, ':edit:') - 1) ELSE hold_id END) || ':edit:' || ?,
      object_id, ?, created_at FROM node_version_local_holds
    WHERE object_id = ? AND version_id = ? AND substr(hold_id, 1, 14) <> 'sync-exchange:'
      AND substr(hold_id, 1, 14) <> 'editor_history'`,
  [versionId, versionId, nodeId, baseId]);
}
