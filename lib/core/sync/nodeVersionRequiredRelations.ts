import type { ChainEdge } from './nodeVersionChainPlan.js';

/** Keep original paths connecting live positions and their required common bases. */
export function requiredNodeVersionRelations(relations: Array<{ id: string; parents: string[] }>,
  requiredBodies: ReadonlySet<string>, edges: ChainEdge[]) {
  const parents = new Map(relations.map((row) => [row.id, row.parents]));
  const reachable = new Set<string>();
  const visit = (id: string) => {
    if (reachable.has(id)) return;
    reachable.add(id);
    for (const parent of parents.get(id) ?? []) visit(parent);
  };
  for (const id of requiredBodies) visit(id);
  const leadsToBody = new Map<string, boolean>();
  const needed = (id: string): boolean => {
    const known = leadsToBody.get(id);
    if (known !== undefined) return known;
    const value = requiredBodies.has(id) || (parents.get(id) ?? []).some(needed);
    leadsToBody.set(id, value);
    return value;
  };
  return edges.filter((edge) => reachable.has(edge.version_id) && needed(edge.parent_version_id));
}
