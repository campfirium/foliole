import { preserveLiveForkBodies } from './nodeVersionLiveForkBodies.js';

// An unbounded cache of historical ancestor sets can consume quadratic memory.
const MAX_CACHED_ANCESTOR_SETS = 16;

export interface ManagedBodyVersion {
  versionId: string;
  parentVersionIds: readonly string[];
  bodyAvailable: boolean;
  bodyReleasable?: boolean;
}

/** Shared body policy for article content and complete parent arrangements. */
export function planVersionBodyRetention(versions: readonly ManagedBodyVersion[],
  protectedIds: ReadonlySet<string>, frozenIds: ReadonlySet<string>, limit: number,
  localHeads: ReadonlySet<string> = protectedIds) {
  const rows = new Map(versions.map((row) => [row.versionId, row]));
  const ancestors = lineageAncestors(rows);
  if (!ancestors) return { skipped: 'lineage_unproven' as const };
  const keep = new Set(protectedIds);
  for (const id of frozenIds) for (const ancestor of ancestors.get(id) ?? []) keep.add(ancestor);
  if (versions.every((row) => keep.has(row.versionId))) {
    return [...keep].every((id) => rows.get(id)?.bodyAvailable)
      ? { removed: [], requiredBodyIds: [...keep].sort(), skipped: null }
      : { skipped: 'protected_body_unavailable' as const };
  }
  preserveLiveForkBodies(keep, ancestors, localHeads,
    (id) => rows.get(id)?.parentVersionIds ?? []);
  preserveCommonBases(keep, ancestors, rows);
  if ([...keep].some((id) => !rows.get(id)?.bodyAvailable)) {
    return { skipped: 'protected_body_unavailable' as const };
  }
  return { removed: versions.filter((row) => !keep.has(row.versionId) && (row.bodyAvailable || row.bodyReleasable))
    .slice(0, limit).map((row) => row.versionId), requiredBodyIds: [...keep].sort(), skipped: null };
}

function lineageAncestors(rows: ReadonlyMap<string, ManagedBodyVersion>) {
  const complete = new Set<string>();
  const visiting = new Set<string>();
  for (const start of rows.keys()) {
    const stack = [{ id: start, index: 0 }];
    while (stack.length) {
      const frame = stack.at(-1)!;
      if (complete.has(frame.id)) { stack.pop(); continue; }
      const row = rows.get(frame.id);
      if (!row) return null;
      visiting.add(frame.id);
      const parent = row.parentVersionIds[frame.index++];
      if (parent !== undefined) {
        if (visiting.has(parent)) return null;
        if (!complete.has(parent)) stack.push({ id: parent, index: 0 });
      } else {
        visiting.delete(frame.id);
        complete.add(frame.id);
        stack.pop();
      }
    }
  }
  return new LazyAncestors(rows);
}

class LazyAncestors extends Map<string, Set<string>> {
  constructor(private readonly rows: ReadonlyMap<string, ManagedBodyVersion>) { super(); }
  override get(id: string) {
    const cached = super.get(id);
    if (cached || !this.rows.has(id)) return cached;
    const found = new Set<string>();
    const pending = [id];
    while (pending.length) {
      const current = pending.pop()!;
      if (found.has(current)) continue;
      found.add(current);
      pending.push(...this.rows.get(current)!.parentVersionIds);
    }
    if (this.size >= MAX_CACHED_ANCESTOR_SETS) this.delete(this.keys().next().value!);
    this.set(id, found);
    return found;
  }
}

function preserveCommonBases(keep: Set<string>, ancestors: Map<string, Set<string>>,
  rows: ReadonlyMap<string, ManagedBodyVersion>) {
  let previous = -1;
  while (previous !== keep.size) {
    previous = keep.size;
    const ids = [...keep];
    for (let index = 0; index < ids.length; index++) for (const right of ids.slice(index + 1)) {
      const rightAncestors = ancestors.get(right);
      const common = new Set([...(ancestors.get(ids[index]!) ?? [])]
        .filter((id) => rightAncestors?.has(id)));
      for (const id of [...common]) {
        for (const parent of rows.get(id)?.parentVersionIds ?? []) common.delete(parent);
      }
      for (const id of common) keep.add(id);
    }
  }
}
