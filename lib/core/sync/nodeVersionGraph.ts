export type VersionParents = ReadonlyMap<string, readonly string[]>;

/** One object's immutable identities and original parent edges. */
export class NodeVersionGraph {
  readonly parents: VersionParents;

  constructor(entries: Iterable<readonly [string, readonly string[]]>) {
    const parents = new Map<string, readonly string[]>();
    for (const [id, edges] of entries) {
      if (parents.has(id)) throw new Error(`node_version_duplicate_identity:${id}`);
      parents.set(id, [...new Set(edges)]);
    }
    this.parents = parents;
  }

  assertComplete() {
    const missing = new Set<string>();
    const remaining = new Map<string, number>();
    const children = new Map<string, string[]>();
    for (const [id, parents] of this.parents) {
      remaining.set(id, parents.length);
      for (const parent of parents) {
        if (!this.parents.has(parent)) missing.add(parent);
        const siblings = children.get(parent) ?? [];
        siblings.push(id);
        children.set(parent, siblings);
      }
    }
    if (missing.size) throw new Error(`node_version_missing_parents:${[...missing].sort().join(',')}`);
    const ready = [...remaining].filter(([, count]) => count === 0).map(([id]) => id);
    for (const id of ready) {
      for (const child of children.get(id) ?? []) {
        const count = remaining.get(child);
        if (count === undefined) throw new Error('node_version_graph_inconsistent');
        remaining.set(child, count - 1);
        if (count === 1) ready.push(child);
      }
    }
    if (ready.length !== this.parents.size) throw new Error('node_version_graph_cycle');
  }

  *ancestors(versionId: string): IterableIterator<string> {
    yield* this.ancestorsOf([versionId]);
  }

  *ancestorsOf(versionIds: Iterable<string>): IterableIterator<string> {
    const seen = new Set<string>();
    const pending: string[] = [];
    const enqueue = (id: string) => {
      if (seen.has(id)) return;
      seen.add(id);
      pending.push(id);
    };
    for (const id of versionIds) for (const parent of this.parents.get(id) ?? []) enqueue(parent);
    for (const id of pending) {
      yield id;
      for (const parent of this.parents.get(id) ?? []) enqueue(parent);
    }
  }

  hasAncestor(versionId: string, ancestorId: string) {
    for (const id of this.ancestors(versionId)) if (id === ancestorId) return true;
    return false;
  }

  heads(versionIds: readonly string[]) {
    const ancestors = new Set(this.ancestorsOf(versionIds));
    return [...new Set(versionIds)].filter(id => !ancestors.has(id));
  }
}
