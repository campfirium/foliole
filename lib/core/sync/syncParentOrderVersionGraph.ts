import { createParentOrderGraph } from './syncParentOrderGraph.js';
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
  const users = [...graph.reachable].map((id) => graph.rows.get(id)!)
    .filter((version) => version.kind === 'user');
  return users.map((version) => ({ versionId: version.versionId, order: version.order,
    supersedes: [...graph.ancestors(version.versionId)]
      .filter((id) => id !== version.versionId && graph.rows.get(id)?.kind === 'user').sort() }))
    .sort((a, b) => a.versionId < b.versionId ? -1 : a.versionId > b.versionId ? 1 : 0);
}
