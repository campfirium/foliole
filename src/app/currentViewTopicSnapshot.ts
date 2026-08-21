import type { Node, NodeAnchorLink } from '../features/nodes/model/nodeTypes';

export interface CurrentViewTopicSnapshot {
  anchorLink?: NodeAnchorLink | null;
  id: string;
  kind: Node['kind'];
  parentNodeId: string | null;
}

export type CurrentViewTopicSnapshotNode = Pick<Node, 'anchorLink' | 'id' | 'parentNodeId' | 'specialKind'> & {
  kind?: Node['kind'];
};

export function isCurrentViewTopicSnapshotStillCurrent(
  snapshot: CurrentViewTopicSnapshot,
  node: CurrentViewTopicSnapshotNode | null | undefined,
  trashedNodeIds: ReadonlySet<string>
) {
  return Boolean(
    node &&
      !trashedNodeIds.has(snapshot.id) &&
      node.kind === 'topic' &&
      node.parentNodeId === snapshot.parentNodeId
  );
}
