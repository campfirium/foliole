import { createParentOrderGraph, type createParentOrderLineageGraph } from './syncParentOrderGraph.js';
import type { ParentOrderUserFact } from './syncVersionedParentOrderMerge.js';

export interface ParentOrderVersion {
  kind: 'baseline' | 'membership' | 'merge' | 'user';
  order: readonly string[];
  parentVersionIds: readonly string[];
  versionId: string;
}

/** Keep original user edits until a causally later user edit replaces them. */
export function projectParentOrderUserFacts(versions: readonly ParentOrderVersion[],
  headIds: readonly string[]): ParentOrderUserFact[] {
  const graph = createParentOrderGraph(versions, headIds);
  return projectParentOrderUserLineage(graph).map((fact) => ({ ...fact,
    order: graph.rows.get(fact.versionId)!.order }));
}

export function projectParentOrderUserLineage(graph: ReturnType<typeof createParentOrderLineageGraph>) {
  const users = [...graph.reachable].map((id) => graph.rows.get(id)!)
    .filter((version) => version.kind === 'user');
  return users.map((version) => ({ versionId: version.versionId,
    supersedes: [...graph.ancestors(version.versionId)]
      .filter((id) => id !== version.versionId && graph.rows.get(id)?.kind === 'user').sort() }))
    .sort((a, b) => a.versionId < b.versionId ? -1 : a.versionId > b.versionId ? 1 : 0);
}
