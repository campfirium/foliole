import type { NodeVersionGraph } from './nodeVersionGraph.js';

export interface NodeVersionAncestry extends Iterable<string> {
  includes(versionId: string): boolean;
}

/** A view keeps one graph reference, not a complete ancestor array per version. */
export class GraphNodeVersionAncestry implements NodeVersionAncestry {
  readonly graph: NodeVersionGraph;
  readonly versionId: string;

  constructor(graph: NodeVersionGraph, versionId: string) {
    this.graph = graph;
    this.versionId = versionId;
  }

  includes(versionId: string) { return this.graph.hasAncestor(this.versionId, versionId); }
  [Symbol.iterator]() { return this.graph.ancestors(this.versionId); }
}

export function unionNodeVersionAncestors(values: Iterable<NodeVersionAncestry>) {
  const result = new Set<string>();
  const graphs = new Map<NodeVersionGraph, string[]>();
  for (const value of values) {
    if (value instanceof GraphNodeVersionAncestry) {
      const starts = graphs.get(value.graph) ?? [];
      starts.push(value.versionId);
      graphs.set(value.graph, starts);
    } else for (const id of value) result.add(id);
  }
  for (const [graph, starts] of graphs) for (const id of graph.ancestorsOf(starts)) result.add(id);
  return result;
}
