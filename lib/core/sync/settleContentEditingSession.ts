import { beginContentEditingSession, hasContentEditingSession, releaseContentEditingSession } from './contentEditingSession.js';
import type { DbPort } from './dbPort.js';
import { applyConvergentSyncNodesWithDbPort } from './syncNodeConvergence.js';
import { loadStoredSyncNodeVersionRecords } from './syncNodeGraph.js';

/** Called only after the renderer has delivered input and drained durable writes. */
export async function settleContentEditingSession(port: DbPort, nodeId: string, sessionId: string) {
  let released = false;
  try {
    return await port.transaction(async tx => {
      released = releaseContentEditingSession(tx, nodeId, sessionId);
      if (!released) return false;
      const heads = await tx.query<{ version_id: string }>(`SELECT v.version_id FROM node_sync_versions v
        WHERE v.object_id = ? AND NOT EXISTS (
          SELECT 1 FROM node_sync_version_parents p WHERE p.parent_version_id = v.version_id)
        AND NOT EXISTS (SELECT 1 FROM node_sync_versions c WHERE c.parent_version_id = v.version_id)`, [nodeId]);
      const records = await loadStoredSyncNodeVersionRecords(tx, heads.map(head => head.version_id));
      await applyConvergentSyncNodesWithDbPort(tx, [...records.values()]);
      return true;
    });
  } catch (error) {
    if (released && !hasContentEditingSession(port, nodeId)) beginContentEditingSession(port, nodeId, sessionId);
    throw error;
  }
}
