import { VIRTUAL_NODE_FILTER_VERSION, type VirtualNodeFilter } from './virtualNodeFilter.js';

export const DIVE_NODE_FILTER: VirtualNodeFilter = {
  version: VIRTUAL_NODE_FILTER_VERSION,
  match: 'all',
  conditions: [{ field: 'manual', operator: 'equals', value: 'dive-sources' }]
};

export interface Dive {
  id: string;
  title: string;
  directSourceIds: readonly string[];
}

export function readDiveNode(node: {
  id: string;
  kind?: string;
  parentNodeId: string | null;
  title: string;
  virtualFilter?: VirtualNodeFilter | null;
  manualChildOrder?: readonly string[] | null;
} | undefined): Dive | null {
  const filter = node?.virtualFilter;
  const marker = filter?.conditions?.[0];
  if (node?.kind !== 'folder' || node.parentNodeId !== null ||
      filter?.version !== VIRTUAL_NODE_FILTER_VERSION || filter.match !== 'all' ||
      filter.conditions?.length !== 1 || marker?.field !== 'manual' ||
      marker.operator !== 'equals' || marker.value !== 'dive-sources') return null;
  return { id: node.id, title: node.title, directSourceIds: node.manualChildOrder ?? [] };
}

export function resolveDiveTopicIds(
  dive: Dive,
  tree: {
    kindOf: (id: string) => string | undefined;
    childrenOf: (id: string) => readonly string[];
  }
): string[] {
  const members = new Set<string>();
  const visited = new Set<string>();
  for (const id of dive.directSourceIds) {
    const kind = tree.kindOf(id);
    if (kind === 'topic') members.add(id);
    if (kind !== 'folder') continue;
    const pending = [id];
    while (pending.length) {
      const descendant = pending.pop()!;
      if (visited.has(descendant)) continue;
      visited.add(descendant);
      const descendantKind = tree.kindOf(descendant);
      if (descendantKind === 'topic') members.add(descendant);
      if (descendantKind !== 'folder') continue;
      const children = tree.childrenOf(descendant);
      for (let index = children.length - 1; index >= 0; index -= 1) pending.push(children[index]!);
    }
  }
  return [...members];
}
