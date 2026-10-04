import type { SyncIdentityEligibility } from './syncIdentityIndexMaintenance.js';
import { SYNC_OBJECT_PAYLOAD_SQL_BY_TYPE } from './syncObjectPayloadSql.js';
import { isSyncPackStateObjectType } from './syncPackManifest.js';

export const isEligibleSyncIdentityState: SyncIdentityEligibility = async (port, state) => {
  const type = state.object_type;
  const id = state.object_id;
  if (!isSyncPackStateObjectType(type)) return false;
  if (type === 'node' && (id === 'special-inbox' || id === 'special-virtual-root')) return false;
  if (state.deleted_at !== null) return true;
  if (type === 'node') return (await port.query('SELECT 1 FROM nodes WHERE id = ? LIMIT 1', [id])).length > 0;
  if (type === 'external_document') return (await port.query(
    'SELECT 1 FROM external_documents WHERE document_id = ? LIMIT 1', [id])).length > 0;
  if (type === 'node_reading' || type === 'node_review') {
    const nodes = await port.query(`SELECT 1 FROM nodes WHERE id = ? LIMIT 1`, [id]);
    if (nodes.length === 0) return false;
    if (type === 'node_reading') {
      const reading = await port.query(`SELECT 1 FROM node_reading reading
        JOIN nodes node ON node.id = reading.node_id
        WHERE reading.node_id = ? AND node.deleted_at IS NULL LIMIT 1`, [id]);
      return reading.length > 0;
    }
  }
  if (type === 'view_state') return hasViewState(port, id);
  const sql = SYNC_OBJECT_PAYLOAD_SQL_BY_TYPE[type as keyof typeof SYNC_OBJECT_PAYLOAD_SQL_BY_TYPE];
  if (!sql) return false;
  return (await port.query(`SELECT 1 FROM (${sql}) LIMIT 1`, [id])).length > 0;
};

async function hasViewState(port: Parameters<SyncIdentityEligibility>[0], id: string) {
  const parts = id.split(':');
  const hostName = parts[3];
  const key = parts.slice(4).join(':');
  if (!hostName) return false;
  if (key === 'active_node') return (await port.query(
    "SELECT 1 FROM workspace_meta WHERE key = 'active_node_id' LIMIT 1")).length > 0;
  if (key.startsWith('node:')) return (await port.query(
    'SELECT 1 FROM node_view_state WHERE node_id = ? AND host_name = ? LIMIT 1',
    [key.slice(5), hostName])).length > 0;
  return false;
}
