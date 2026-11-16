import type { DbPort } from './dbPort.js';
import { GraphNodeVersionAncestry } from './nodeVersionAncestry.js';
import { CHAIN_EDGES_SQL } from './nodeVersionChainSql.js';
import { NodeVersionGraph } from './nodeVersionGraph.js';
import type { SyncNodeRecordMetadata, SyncNodeRecordSource } from './syncNodeRecordSource.js';
import { hasCompleteTombstoneVersion } from './syncNodeTombstoneVersion.js';

type VersionRow = { version_id: string; parent_version_id: string | null };
type EdgeRow = { version_id: string; parent_version_id: string };

type StoredGraphRows = { versions: Map<string, VersionRow[]>; edges: Map<string, EdgeRow[]> };

/** The stored version rows and parent edges of several nodes, read once before any of them is written. */
async function loadStoredGraphRows(db: DbPort, nodeIds: readonly string[]): Promise<StoredGraphRows> {
  if (!nodeIds.length) return { versions: new Map(), edges: new Map() };
  const ids = JSON.stringify(nodeIds);
  const group = <T extends { object_id: string }>(rows: T[]) => {
    const byNode = new Map<string, T[]>();
    for (const row of rows) byNode.set(row.object_id, [...byNode.get(row.object_id) ?? [], row]);
    return byNode;
  };
  return {
    versions: group(await db.query<VersionRow & { object_id: string }>(`SELECT object_id, version_id, parent_version_id
      FROM node_sync_versions WHERE object_id IN (SELECT value FROM json_each(?))`, [ids])),
    edges: group(await db.query<EdgeRow & { object_id: string }>(`SELECT version.object_id, edge.*
      FROM node_sync_version_parents edge JOIN node_sync_versions version ON version.version_id = edge.version_id
      WHERE version.object_id IN (SELECT value FROM json_each(?)) ORDER BY edge.version_id, edge.ordinal`, [ids]))
  };
}

async function storedParents(db: DbPort, nodeId: string, preloaded?: StoredGraphRows) {
  const rows = preloaded ? preloaded.versions.get(nodeId) ?? [] : await db.query<VersionRow>(
    'SELECT version_id, parent_version_id FROM node_sync_versions WHERE object_id = ?', [nodeId]);
  const parents = new Map(rows.map(row => [row.version_id, row.parent_version_id ? [row.parent_version_id] : []]));
  const edges = preloaded ? preloaded.edges.get(nodeId) ?? [] : await db.query<EdgeRow>(CHAIN_EDGES_SQL, [nodeId]);
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

async function objectGraph(db: DbPort, nodeId: string, records: readonly SyncNodeRecordMetadata[],
  preloaded: StoredGraphRows, incomingOwners: ReadonlyMap<string, ReadonlySet<string>>) {
  const parents = await storedParents(db, nodeId, preloaded);
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
  await assertNoForeignParents(db, graph, nodeId, incomingOwners);
  return graph;
}

/** A reclaimed parent is simply absent; a parent stored under another object is a broken identity. */
async function assertNoForeignParents(db: DbPort, graph: NodeVersionGraph, nodeId: string,
  incomingOwners: ReadonlyMap<string, ReadonlySet<string>>) {
  const absent = [...new Set([...graph.parents.values()].flat())].filter(id => !graph.parents.has(id));
  const incomingForeign = absent.find(id => {
    const owners = incomingOwners.get(id);
    return owners && !owners.has(nodeId);
  });
  if (incomingForeign) throw new Error(`node_version_cross_object_parent:${incomingForeign}`);
  for (let offset = 0; offset < absent.length; offset += 400) {
    const ids = absent.slice(offset, offset + 400);
    const [foreign] = await db.query<{ version_id: string }>(`SELECT version_id FROM node_sync_versions
      WHERE version_id IN (${ids.map(() => '?').join(', ')}) LIMIT 1`, ids);
    if (foreign) throw new Error(`node_version_cross_object_parent:${foreign.version_id}`);
  }
}

/** Validate before any object writes and bind ancestry queries to this transaction's object graph. */
export async function requestSyncNodeSource(db: DbPort, source: SyncNodeRecordSource,
  rejected?: Map<string, string>): Promise<SyncNodeRecordSource> {
  const prepared = await prepareRequestSyncNodeGraphs(db, source);
  const originals = new Map<SyncNodeRecordMetadata, SyncNodeRecordMetadata>();
  for (const nodeId of prepared.nodeIds) {
    try {
      for (const [validated, original] of await prepared.validate(nodeId)) originals.set(validated, original);
    } catch (error) {
      if (!rejected || !(error instanceof Error) || !isRejectedNodeGraph(error.message)) throw error;
      rejected.set(nodeId, error.message);
    }
  }
  return withValidatedAncestry(source, originals);
}

function isRejectedNodeGraph(message: string) {
  return message === 'node_version_graph_cycle' || message.startsWith('node_version_parent_identity_mismatch:') ||
    message.startsWith('node_version_cross_object_parent:');
}

/** Preload committed ancestry for the whole batch, then validate each object's incoming versions. */
export async function prepareRequestSyncNodeGraphs(db: DbPort, source: SyncNodeRecordSource) {
  const groups = new Map<string, SyncNodeRecordMetadata[]>();
  const incomingOwners = new Map<string, Set<string>>();
  for (const record of source.records) {
    const group = groups.get(record.object_id) ?? [];
    group.push(record);
    groups.set(record.object_id, group);
    if (record.version_id) {
      const owners = incomingOwners.get(record.version_id) ?? new Set<string>();
      owners.add(record.object_id);
      incomingOwners.set(record.version_id, owners);
    }
  }
  const preloaded = await loadStoredGraphRows(db, [...groups.keys()]);
  return {
    nodeIds: groups.keys(),
    async validate(nodeId: string) {
      const records = groups.get(nodeId)!;
      // A standalone deletion preserves metadata without claiming a complete original version.
      const versions = [];
      for (const record of records) {
        if (!record.is_tombstone || source.isIdentityOnly(record) ||
            hasCompleteTombstoneVersion(await source.load(db, record))) versions.push(record);
      }
      const graph = await objectGraph(db, nodeId, versions, preloaded, incomingOwners);
      return records.map(record => {
        if (!record.version_id) throw new Error('node_version_identity_missing');
        return [{ ...record, ancestor_version_ids: new GraphNodeVersionAncestry(graph, record.version_id) }, record] as const;
      });
    }
  };
}

function withValidatedAncestry(source: SyncNodeRecordSource,
  originals: ReadonlyMap<SyncNodeRecordMetadata, SyncNodeRecordMetadata>): SyncNodeRecordSource {
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
