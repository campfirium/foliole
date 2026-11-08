import { VIRTUAL_ROOT_NODE_ID } from '../../lib/core/database/specialNodeIds';
import { readDiveNode, resolveDiveTopicIds, type Dive } from '../../lib/core/nodes/dive';

import { selectCanonicalVisibleNodeIds, type WorkspaceCanonicalSource } from './workspaceCanonicalSelectors';

type DiveCatalog = WorkspaceCanonicalSource<NonNullable<Parameters<typeof readDiveNode>[0]> & {
  deletedAt?: string | null;
  anchorLink?: unknown;
}>;

export function listVisibleDives(snapshot: DiveCatalog) {
  return selectCanonicalVisibleNodeIds(snapshot).flatMap(id => {
    const dive = readDiveNode(snapshot.nodesById[id]);
    return dive ? [dive] : [];
  });
}

export function resolveDiveMembership(snapshot: DiveCatalog, dive: Dive) {
  const visible = new Set(selectCanonicalVisibleNodeIds(snapshot));
  const children = new Map<string, string[]>();
  for (const id of visible) {
    const parent = snapshot.nodesById[id]?.parentNodeId;
    if (!parent) continue;
    const siblings = children.get(parent);
    if (siblings) siblings.push(id);
    else children.set(parent, [id]);
  }

  const kindOf = (id: string) => {
    const node = snapshot.nodesById[id];
    if (visible.has(id) && !node?.anchorLink && !node?.virtualFilter && id !== VIRTUAL_ROOT_NODE_ID) return node?.kind;
  };
  return {
    sources: dive.directSourceIds.filter(id => Boolean(kindOf(id))),
    topics: resolveDiveTopicIds(dive, { kindOf, childrenOf: id => children.get(id) ?? [] })
  };
}
