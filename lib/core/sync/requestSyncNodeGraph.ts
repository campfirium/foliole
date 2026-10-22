import type { DbPort } from './dbPort.js';
import { GraphNodeVersionAncestry } from './nodeVersionAncestry.js';
import { CHAIN_EDGES_SQL } from './nodeVersionChainSql.js';
import { NodeVersionGraph } from './nodeVersionGraph.js';
import type { SyncNodeRecordMetadata, SyncNodeRecordSource } from './syncNodeRecordSource.js';
import { hasCompleteTombstoneVersion } from './syncNodeTombstoneVersion.js';

type VersionRow = { version_id: string; parent_version_id: string | null };
type EdgeRow = { version_id: string; parent_version_id: string };

async function storedParents(db: DbPort, nodeId: string) {
  const rows = await db.query<VersionRow>(
    'SELECT version_id, parent_version_id FROM node_sync_versions WHERE object_id = ?', [nodeId]);
  const parents = new Map(rows.map(row => [row.version_id, row.parent_version_id ? [row.parent_version_id] : []]));
  const edges = await db.query<EdgeRow>(CHAIN_EDGES_SQL, [nodeId]);
  const replaced = new Set<string>();
  for (const edge of edges) {
    if (!replaced.has(edge.version_id)) { parents.set(edge.version_id, []); replaced.add(edge.version_id); }
    parents.get(edge.version_id)?.push(edge.parent_version_id);
  }
  return parents;
}

export async function readRequestSyncNodeGraph(db: DbPort, nodeId: string) {
  const graph = new NodeVersionGraph(await storedParents(db, nodeId));
  graph.assertAcyclic();
  return graph;
}

async function objectGraph(db: DbPort, nodeId: string, records: readonly SyncNodeRecordMetadata[]) {
  const parents = await storedParents(db, nodeId);
  for (const record of records) {
    if (!record.version_id) throw new Error('node_version_identity_missing');
    const incoming = record.parent_version_ids?.length ? record.parent_version_ids :
      record.parent_version_id ? [record.parent_version_id] : [];
    const known = parents.get(record.version_id);
    if (known && JSON.stringify([...known].sort()) !== JSON.stringify([...incoming].sort())) {
      throw new Error(`node_version_parent_identity_mismatch:${record.version_id}`);
    }
    parents.set(record.version_id, incoming);
  }
  const graph = new NodeVersionGraph(parents);
  graph.assertAcyclic();
  await assertNoForeignParents(db, graph);
  return graph;
}

/** A reclaimed parent is simply absent; a parent stored under another object is a broken identity. */
async function assertNoForeignParents(db: DbPort, graph: NodeVersionGraph) {
  const absent = [...new Set([...graph.parents.values()].flat())].filter(id => !graph.parents.has(id));
  for (let offset = 0; offset < absent.length; offset += 400) {
    const ids = absent.slice(offset, offset + 400);
    const [foreign] = await db.query<{ version_id: string }>(`SELECT version_id FROM node_sync_versions
      WHERE version_id IN (${ids.map(() => '?').join(', ')}) LIMIT 1`, ids);
    if (foreign) throw new Error(`node_version_cross_object_parent:${foreign.version_id}`);
  }
}

/** Validate before any object writes and bind ancestry queries to this transaction's object graph. */
export async function requestSyncNodeSource(db: DbPort, source: SyncNodeRecordSource): Promise<SyncNodeRecordSource> {
  const groups = new Map<string, SyncNodeRecordMetadata[]>();
  for (const record of source.records) {
    const group = groups.get(record.object_id) ?? [];
    group.push(record);
    groups.set(record.object_id, group);
  }
  const originals = new Map<SyncNodeRecordMetadata, SyncNodeRecordMetadata>();
  for (const [nodeId, records] of groups) {
    // A standalone deletion preserves metadata without claiming a complete original version.
    const versions = [];
    for (const record of records) {
      if (!record.is_tombstone || source.isIdentityOnly(record) ||
          hasCompleteTombstoneVersion(await source.load(db, record))) versions.push(record);
    }
    const graph = await objectGraph(db, nodeId, versions);
    for (const record of records) {
      if (!record.version_id) throw new Error('node_version_identity_missing');
      originals.set({ ...record,
        ancestor_version_ids: new GraphNodeVersionAncestry(graph, record.version_id) }, record);
    }
  }
  const original = (record: SyncNodeRecordMetadata) => {
    const value = originals.get(record);
    if (!value) throw new Error('node_version_source_changed');
    return value;
  };
  return {
    records: [...originals.keys()],
    isIdentityOnly: record => source.isIdentityOnly(original(record)),
    load: async (tx, record) => ({ ...await source.load(tx, original(record)),
      ancestor_version_ids: record.ancestor_version_ids })
  };
}
