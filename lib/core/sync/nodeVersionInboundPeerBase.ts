import type { DbPort, DbRow } from './dbPort.js';
import { isStoredAncestorVersion } from './syncNodeGraph.js';

interface PeerBase extends DbRow {
  group_id: string;
  version_id: string;
}

export async function advanceInboundNodePeerBases(port: DbPort, peerId: string,
  heads: Array<{ objectId: string; versionId: string }>) {
  for (const head of heads) {
    const [base] = await port.query<PeerBase>(
      `SELECT base.group_id, base.version_id FROM node_version_device_bases base
       JOIN sync_group_local_state local ON local.group_id = base.group_id AND local.state = 'active'
       JOIN sync_group_devices peer ON peer.group_id = base.group_id
         AND peer.device_identity_key = base.device_identity_key AND peer.state = 'active'
       LEFT JOIN node_version_device_revisions revision ON revision.group_id = base.group_id
         AND revision.device_identity_key = base.device_identity_key
       JOIN node_sync_versions version ON version.object_id = base.object_id AND version.version_id = ?
       WHERE base.device_identity_key = ? AND base.object_id = ?
         AND local.local_device_identity_key <> peer.device_identity_key
         AND revision.blocked_reason IS NULL`, [head.versionId, peerId, head.objectId]);
    if (!base || base.version_id === head.versionId ||
        !await isStoredAncestorVersion(port, base.version_id, head.versionId)) continue;
    await port.run(`UPDATE node_version_device_bases SET version_id = ?, updated_at = ?
      WHERE group_id = ? AND device_identity_key = ? AND object_id = ?`,
    [head.versionId, new Date().toISOString(), base.group_id, peerId, head.objectId]);
  }
}
