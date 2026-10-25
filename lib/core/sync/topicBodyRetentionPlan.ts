import { z } from 'zod';

import type { ChainEdge, ChainVersionMetadata } from './nodeVersionChainPlan.js';
import { lineageAncestors } from './versionBodyRetentionPlan.js';

export interface TopicBodyVersion extends ChainVersionMetadata {
  body_retired: number;
  identity_valid: number;
  effective_alternative_hashes_json: string;
  alternative_hashes_json: string;
  alternative_body_hashes_json: string;
}

const hashes = z.array(z.string());
export const TOPIC_BODY_VERSIONS_SQL = `SELECT version_id, object_id, parent_version_id,
  CASE WHEN body_text IS NOT NULL OR json_type(snapshot_json, '$.content') = 'text'
    THEN 1 ELSE 0 END AS body_available,
  CASE WHEN json_extract(snapshot_json, '$.id') = object_id THEN 1 ELSE 0 END AS identity_valid,
  (SELECT json_group_array(json_extract(value, '$.body_blob_hash'))
    FROM json_each(snapshot_json, '$.text_alternatives')
    WHERE json_extract(value, '$.expires_at') > strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) AS effective_alternative_hashes_json,
  1 AS body_releasable, COALESCE(json_extract(snapshot_json, '$.body_deleted'), 0) AS body_retired,
  (SELECT json_group_array(json_extract(value, '$.body_blob_hash'))
    FROM json_each(snapshot_json, '$.text_alternatives')) AS alternative_hashes_json,
  (SELECT json_group_array(json_extract(value, '$.hash'))
    FROM json_each(snapshot_json, '$.text_alternative_bodies')) AS alternative_body_hashes_json
  FROM node_sync_versions WHERE object_id = ?`;

export const TOPIC_EDIT_BASES_SQL = `SELECT version_id,
  CASE WHEN instr(hold_id, 'editor_history_body:') = 1 THEN 1 ELSE 0 END AS keep_body
  FROM node_version_local_holds WHERE object_id = ?`;

/** Topic history needs its graph and metadata, but only live payloads need full text. */
export function planTopicBodyRetention(versions: TopicBodyVersion[], edges: ChainEdge[],
  currentId: string, editBases: readonly { version_id: string; keep_body?: number }[], limit: number) {
  const parents = new Map(versions.map(row => [row.version_id, [] as string[]]));
  const invalid = () => ({ removed: new Array<string>(), requiredBodyIds: new Array<string>(), skipped: 'lineage_unproven' as const });
  if (versions.some(row => row.identity_valid !== 1) ||
    new Set(versions.map(row => row.object_id)).size !== 1 || !parents.has(currentId)) return invalid();
  for (const edge of edges) {
    if (!parents.has(edge.version_id)) return invalid();
    parents.get(edge.version_id)!.push(edge.parent_version_id);
  }
  for (const row of versions) {
    if (row.parent_version_id && parents.get(row.version_id)![0] !== row.parent_version_id) return invalid();
  }
  // Reclaimed ancestors leave retained versions pointing at parents that are no longer stored.
  const graph = new Map(versions.map(row => [row.version_id, { versionId: row.version_id,
    parentVersionIds: parents.get(row.version_id)!.filter(parent => parents.has(parent)),
    bodyAvailable: row.body_available !== 0 }]));
  if (!lineageAncestors(graph)) return invalid();
  const ancestors = new Set(edges.map(edge => edge.parent_version_id));
  const keep = new Set([currentId, ...versions.filter(row => !ancestors.has(row.version_id)).map(row => row.version_id)]);
  preserveBaselineAlternatives(versions, keep, editBases);
  const unavailable = versions.some(row => keep.has(row.version_id) && (row.body_available === 0 ||
    hashes.parse(JSON.parse(row.alternative_hashes_json)).some(hash =>
      !hashes.parse(JSON.parse(row.alternative_body_hashes_json)).includes(hash))));
  return { removed: versions.filter(row => !keep.has(row.version_id) && row.body_retired !== 1)
    .slice(0, limit).map(row => row.version_id), requiredBodyIds: [...keep].sort(),
  skipped: unavailable ? 'protected_body_unavailable' as const : null };
}

function preserveBaselineAlternatives(versions: TopicBodyVersion[], keep: Set<string>,
  editBases: readonly { version_id: string; keep_body?: number }[]) {
  const carried = new Set(versions.filter(row => keep.has(row.version_id)).flatMap(row =>
    hashes.parse(JSON.parse(row.alternative_body_hashes_json))));
  for (const base of editBases) {
    const row = versions.find(row => row.version_id === base.version_id);
    if (row && base.keep_body === 1) keep.add(row.version_id);
    if (row && hashes.parse(JSON.parse(row.effective_alternative_hashes_json)).some(hash => !carried.has(hash))) {
      keep.add(row.version_id);
    }
  }
}
