import type { DbRow } from './dbPort.js';

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

/** Contracting a DAG must preserve the ancestor order and every maximal common base. */
export function planNodeVersionChain(versions: ChainVersion[], edges: ChainEdge[],
  protectedIds: Set<string>, frozenIds: Set<string>, limit: number, retireLegacyHistory = false) {
  const rows = new Map(versions.map((row) => [row.version_id, row]));
  if (retireLegacyHistory && protectedIds.size === 1 && frozenIds.size === 0) {
    const current = rows.get([...protectedIds][0]!);
    if (current && hasBody(current)) return {
      removed: versions.filter(row => row.version_id !== current.version_id).map(row => row.version_id),
      relations: [{ id: current.version_id, parents: [] as string[] }], skipped: null
    };
  }
  const parents = new Map(versions.map((row) => [row.version_id, [] as string[]]));
  for (const edge of edges) parents.get(edge.version_id)?.push(edge.parent_version_id);
  for (const row of versions) {
    if (!parents.get(row.version_id)!.length && row.parent_version_id) {
      parents.get(row.version_id)!.push(row.parent_version_id);
    }
  }
  const ancestors = ancestorClosure(parents);
  if (!ancestors) return { skipped: 'lineage_unproven' as const };
  const keep = new Set(protectedIds);
  for (const id of frozenIds) for (const ancestor of ancestors.get(id) ?? []) keep.add(ancestor);
  preserveCommonBases(keep, ancestors);
  if ([...keep].some((id) => !rows.has(id) || !hasBody(rows.get(id)!))) {
    return { skipped: 'protected_body_unavailable' as const };
  }
  const removed = versions.filter((row) => !keep.has(row.version_id)).slice(0, limit);
  const retired = new Set(removed.map((row) => row.version_id));
  const retained = versions.filter((row) => !retired.has(row.version_id));
  const relations = retained.map((row) => {
    const original = parents.get(row.version_id)!;
    if (original.every((id) => !retired.has(id))) return { id: row.version_id, parents: original };
    const candidates = new Set([...ancestors.get(row.version_id)!].filter((id) =>
      id !== row.version_id && !retired.has(id)));
    for (const id of candidates) {
      for (const older of ancestors.get(id)!) if (older !== id) candidates.delete(older);
    }
    return { id: row.version_id, parents: [...candidates].sort() };
  });
  return { removed: removed.map((row) => row.version_id), relations, skipped: null };
}

function ancestorClosure(parents: Map<string, string[]>) {
  const result = new Map<string, Set<string>>();
  const visiting = new Set<string>();
  function visit(id: string): Set<string> | null {
    if (result.has(id)) return result.get(id)!;
    if (visiting.has(id) || !parents.has(id)) return null;
    visiting.add(id);
    const closure = new Set([id]);
    for (const parent of parents.get(id)!) {
      const prior = visit(parent);
      if (!prior) return null;
      for (const ancestor of prior) closure.add(ancestor);
    }
    visiting.delete(id);
    result.set(id, closure);
    return closure;
  }
  for (const id of parents.keys()) if (!visit(id)) return null;
  return result;
}

function preserveCommonBases(keep: Set<string>, ancestors: Map<string, Set<string>>) {
  let previous = -1;
  while (previous !== keep.size) {
    previous = keep.size;
    const ids = [...keep];
    for (let i = 0; i < ids.length; i++) for (const right of ids.slice(i + 1)) {
      const common = new Set([...(ancestors.get(ids[i]!) ?? [])].filter((id) => ancestors.get(right)?.has(id)));
      for (const id of common) {
        for (const older of ancestors.get(id) ?? []) if (older !== id) common.delete(older);
      }
      for (const id of common) keep.add(id);
    }
  }
}

function hasBody(row: ChainVersion) {
  if (row.body_text !== null) return true;
  const content = (JSON.parse(row.snapshot_json) as { content?: unknown }).content;
  return content === undefined || typeof content === 'string';
}
