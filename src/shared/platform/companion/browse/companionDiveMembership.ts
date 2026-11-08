import { VIRTUAL_ROOT_NODE_ID } from '../../../../../lib/core/database/specialNodeIds';
import type { WorkspaceSnapshot } from '../../../../../lib/core/database/workspaceSnapshot';
import { resolveDiveTopicIds, type Dive } from '../../../../../lib/core/nodes/dive';
import { selectCanonicalVisibleNodeIds } from '../../../workspaceCanonicalSelectors';

export function resolveCompanionDiveMembership(snapshot: WorkspaceSnapshot, dive: Dive) {
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
