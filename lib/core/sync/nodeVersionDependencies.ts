import type { DbPort, DbRow } from './dbPort.js';
import { isStoredAncestorVersion } from './syncNodeGraph.js';

export interface NodeVersionDependency extends DbRow {
  group_id: string;
  device_identity_key: string;
  object_id: string;
  version_id: string;
  library_epoch: string;
  proof_revision: number;
  pack_id: string;
  updated_at: string;
}

export const NODE_VERSION_PEER_HEAD_COLUMNS = ['group_id', 'device_identity_key', 'object_id', 'version_id',
  'library_epoch', 'proof_revision', 'pack_id', 'updated_at'];

/** Direct peer heads only. A device never relays another device's base proof. */
export function nodeVersionDependenciesSql(source = 'main', selected = 'nodes') {
  return `SELECT local.group_id, local.local_device_identity_key AS device_identity_key, node.id AS object_id,
      node.current_version_id AS version_id, proof.library_epoch, proof.proof_revision,
      'local-head' AS pack_id, node.updated_at
    FROM (SELECT id, current_version_id, updated_at FROM ${source}.nodes
      UNION ALL SELECT tomb.node_id, tomb.version_id, tomb.deleted_at FROM ${source}.node_sync_tombstones tomb
        JOIN ${source}.node_sync_versions version ON version.version_id = tomb.version_id AND version.object_id = tomb.node_id
        WHERE NOT EXISTS (SELECT 1 FROM ${source}.nodes held WHERE held.id = tomb.node_id)) node
    JOIN ${source}.sync_group_local_state local ON local.singleton_id = 1 AND local.state = 'active'
    JOIN ${source}.node_version_local_proof_state proof ON proof.singleton_id = 1
    WHERE node.id IN (SELECT id FROM ${selected}) AND node.current_version_id IS NOT NULL
      AND node.id NOT IN ('special-inbox', 'special-virtual-root')`;

}

export function nodeVersionDependenciesCopySql() {
  return `INSERT INTO node_version_peer_heads (${NODE_VERSION_PEER_HEAD_COLUMNS.join(', ')})
    ${nodeVersionDependenciesSql('source', `(SELECT id FROM nodes UNION SELECT node_id AS id FROM node_sync_tombstones)`)}`;
}

export async function applyNodeVersionDependencies(port: DbPort, dependencies: NodeVersionDependency[]) {
  const [local] = await port.query<{ group_id: string; local_device_identity_key: string }>(
    "SELECT group_id, local_device_identity_key FROM sync_group_local_state WHERE singleton_id = 1 AND state = 'active'");
  if (!local && dependencies.length) throw new Error('node_version_dependency_group_missing');
  for (const incoming of dependencies) {
    validateDependency(incoming);
    if (incoming.group_id !== local!.group_id) throw new Error('node_version_dependency_group_mismatch');
    if (incoming.device_identity_key === local!.local_device_identity_key) continue;
    const [member] = await port.query<{ state: string }>(
      'SELECT state FROM sync_group_devices WHERE group_id = ? AND device_identity_key = ?',
      [incoming.group_id, incoming.device_identity_key]);
    if (member?.state !== 'active') continue;
    const [known] = await port.query<NodeVersionDependency>(
      'SELECT * FROM node_version_device_bases WHERE group_id = ? AND device_identity_key = ? AND object_id = ?',
      [incoming.group_id, incoming.device_identity_key, incoming.object_id]);
    if (known && (known.library_epoch !== incoming.library_epoch || known.proof_revision > incoming.proof_revision)) continue;
    if (known && known.proof_revision === incoming.proof_revision) {
      if (known.version_id === incoming.version_id) continue;
      if (await isStoredAncestorVersion(port, incoming.version_id, known.version_id)) continue;
      if (!await isStoredAncestorVersion(port, known.version_id, incoming.version_id)) {
        throw new Error('node_version_dependency_revision_conflict');
      }
    }
    const [body] = await port.query('SELECT 1 FROM node_sync_versions WHERE object_id = ? AND version_id = ?',
      [incoming.object_id, incoming.version_id]);
    if (!body) throw new Error('node_version_dependency_base_missing');
    await port.run(`INSERT INTO node_version_device_bases
      (group_id, device_identity_key, object_id, version_id, library_epoch, proof_revision, pack_id, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(group_id, device_identity_key, object_id) DO UPDATE SET
      version_id = excluded.version_id, library_epoch = excluded.library_epoch, proof_revision = excluded.proof_revision,
      pack_id = excluded.pack_id, updated_at = excluded.updated_at`,
    [incoming.group_id, incoming.device_identity_key, incoming.object_id, incoming.version_id,
      incoming.library_epoch, incoming.proof_revision, incoming.pack_id, incoming.updated_at]);
  }
}

export async function applyPackNodeVersionDependencies(port: DbPort, alias: string, sourcePeerId?: string) {
  const values = await port.query<NodeVersionDependency>(
    `SELECT * FROM "${alias.replaceAll('"', '""')}".node_version_peer_heads`);
  if (sourcePeerId && values.some((value) => (value as NodeVersionDependency)?.device_identity_key !== sourcePeerId)) {
    throw new Error('node_version_peer_head_source_mismatch');
  }
  await applyNodeVersionDependencies(port, values as NodeVersionDependency[]);
}

function validateDependency(row: NodeVersionDependency) {
  if (!row || ['group_id', 'device_identity_key', 'object_id', 'version_id', 'library_epoch', 'pack_id', 'updated_at']
    .some((key) => typeof row[key] !== 'string' || !row[key]) ||
    !Number.isSafeInteger(row.proof_revision) || row.proof_revision < 0) throw new Error('node_version_dependencies_invalid');
}
