import type { DbPort } from './dbPort.js';
import { isStoredAncestorVersion } from './syncNodeGraph.js';
import type { SyncPackNodeVersionParentRow } from './syncPackNodeVersions.js';

/** Verified immutable duplicates may retain different local projections of history.
 * Do not import those projections as new ancestry. Require a complete incoming path
 * back to retained local history; equal text or a matching head ID is insufficient.
 */
export async function loadConvergedSyncPackReplays(port: DbPort, alias: string,
  verifiedIds: readonly string[], parents: SyncPackNodeVersionParentRow[]) {
  const heads = await port.query<{ version_id: string; object_id: string }>(
    `SELECT local.current_version_id AS version_id, local.id AS object_id
     FROM main.nodes local JOIN ${alias}.nodes incoming ON incoming.id = local.id
     WHERE local.current_version_id = incoming.current_version_id
       AND local.current_version_id IN (SELECT value FROM json_each(?))`, [JSON.stringify(verifiedIds)]);
  const replays = new Set<string>();
  for (const head of heads) {
    const edges = parents.filter(edge => edge.version_id === head.version_id);
    if (!edges.length) continue;
    let complete = true;
    for (const edge of edges) {
      if (!await reachesRetainedHistory(port, alias, head, edge.parent_version_id, parents, new Set())) {
        complete = false;
        break;
      }
    }
    if (complete) replays.add(head.version_id);
  }
  return replays;
}

async function reachesRetainedHistory(port: DbPort, alias: string,
  head: { version_id: string; object_id: string }, versionId: string,
  parents: SyncPackNodeVersionParentRow[], visiting: Set<string>): Promise<boolean> {
  if (versionId === head.version_id || visiting.has(versionId)) return false;
  const [record] = await port.query<{ object_id: string; complete: number }>(
    `SELECT object_id, CASE WHEN body_text IS NOT NULL OR json_type(snapshot_json, '$.content') = 'text'
       OR json_type(snapshot_json, '$.content') IS NULL THEN 1 ELSE 0 END AS complete
     FROM (SELECT * FROM ${alias}.node_sync_versions WHERE version_id = ?
       UNION ALL SELECT * FROM main.node_sync_versions WHERE version_id = ?) LIMIT 1`, [versionId, versionId]);
  if (!record?.complete || record.object_id !== head.object_id) return false;
  if (await isStoredAncestorVersion(port, versionId, head.version_id)) return true;
  const next = parents.filter(edge => edge.version_id === versionId);
  if (!next.length) return false;
  visiting.add(versionId);
  for (const edge of next) {
    if (!await reachesRetainedHistory(port, alias, head, edge.parent_version_id, parents, visiting)) return false;
  }
  visiting.delete(versionId);
  return true;
}
