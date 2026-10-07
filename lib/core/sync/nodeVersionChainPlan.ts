import type { DbRow } from './dbPort.js';
import { planVersionBodyRetention } from './versionBodyRetentionPlan.js';

export interface ChainVersion extends DbRow {
  version_id: string;
  object_id: string;
  parent_version_id: string | null;
  body_text: string | null;
  snapshot_json: string;
}
export interface ChainEdge extends DbRow {
  version_id: string;
  parent_version_id: string;
  ordinal: number;
}

export interface ChainVersionMetadata extends DbRow {
  version_id: string;
  object_id: string;
  parent_version_id: string | null;
  body_available: number;
  body_releasable: number;
}

/** Release replaceable bodies while preserving every original version identity and parent edge. */
export function planNodeVersionChain(versions: ChainVersion[], edges: ChainEdge[],
  protectedIds: Set<string>, frozenIds: Set<string>, limit: number, localHeads: ReadonlySet<string> = protectedIds) {
  return planNodeVersionMetadataChain(versions.map((row) => ({ version_id: row.version_id,
    object_id: row.object_id, parent_version_id: row.parent_version_id,
    body_available: Number(hasBody(row)), body_releasable: Number(hasBodyBlobReference(row)) })),
  edges, protectedIds, frozenIds, limit, localHeads);
}

export function planNodeVersionMetadataChain(versions: ChainVersionMetadata[], edges: ChainEdge[],
  protectedIds: Set<string>, frozenIds: Set<string>, limit: number, localHeads: ReadonlySet<string> = protectedIds) {
  const parents = new Map(versions.map((row) => [row.version_id, [] as string[]]));
  for (const edge of edges) parents.get(edge.version_id)?.push(edge.parent_version_id);
  for (const row of versions) {
    if (!parents.get(row.version_id)!.length && row.parent_version_id) {
      parents.get(row.version_id)!.push(row.parent_version_id);
    }
  }
  const result = planVersionBodyRetention(versions.map((row) => ({ versionId: row.version_id,
    parentVersionIds: parents.get(row.version_id)!, bodyAvailable: row.body_available !== 0,
    bodyReleasable: row.body_releasable !== 0 })), protectedIds, frozenIds, limit, localHeads);
  if (result.skipped) return { skipped: result.skipped, removed: undefined, relations: undefined, requiredBodyIds: undefined };
  const relations = versions.map((row) => ({ id: row.version_id,
    parents: parents.get(row.version_id)! }));
  return { ...result, relations };
}

function hasBody(row: ChainVersion) {
  if (row.body_text !== null) return true;
  const content = (JSON.parse(row.snapshot_json) as { content?: unknown }).content;
  return content === undefined || typeof content === 'string';
}

function hasBodyBlobReference(row: ChainVersion) {
  const snapshot: { body_blob_hash?: unknown } = JSON.parse(row.snapshot_json);
  return typeof snapshot.body_blob_hash === 'string';
}
