import type {
  NativeAssistantThreadOpeningLocation,
  NativeAssistantWorkspaceContext
} from '../../../lib/platform/nativeAssistantContract';
import type { Node } from '../../features/nodes/model/nodeTypes';

type ReferenceContextArgs = {
  followCurrentMaterial: boolean;
  location: NativeAssistantThreadOpeningLocation;
  nodesById: Record<string, Node>;
  workspaceContextOverride?: NativeAssistantWorkspaceContext | undefined;
};

export function resolveAssistantTurnReferenceContext(
  args: ReferenceContextArgs
): NativeAssistantWorkspaceContext {
  if (!args.followCurrentMaterial) return createWorkspaceToolContext();
  if (args.workspaceContextOverride) return toReferenceContext(args.workspaceContextOverride);
  return resolveLocationReferenceContext(args.location, args.nodesById);
}

function createWorkspaceToolContext(): NativeAssistantWorkspaceContext {
  return { schemaVersion: 1, scope: 'workspace' };
}

function resolveLocationReferenceContext(
  location: NativeAssistantThreadOpeningLocation,
  nodesById: Record<string, Node>
): NativeAssistantWorkspaceContext {
  if (location.type === 'workspace') return createWorkspaceToolContext();
  const node = nodesById[location.nodeId];
  if (!node) {
    return {
      activeNodeId: location.nodeId,
      document: { bodyStatus: 'missing' },
      schemaVersion: 1,
      scope: 'node'
    };
  }
  return toReferenceContext({
    activeKind: node.kind,
    activeNodeId: node.id,
    ...(node.parentNodeId ? { activeParentNodeId: node.parentNodeId } : {}),
    ...(node.specialKind ? { activeSpecialKind: node.specialKind } : {}),
    activeTitle: node.title,
    ...(node.anchorLink ? { anchor: resolveAnchorReference(node, nodesById) } : {}),
    path: resolveNodePath(node, nodesById),
    schemaVersion: 1,
    scope: 'node'
  });
}

function toReferenceContext(context: NativeAssistantWorkspaceContext): NativeAssistantWorkspaceContext {
  return {
    ...(context.activeKind ? { activeKind: context.activeKind } : {}),
    ...(context.activeNodeId ? { activeNodeId: context.activeNodeId } : {}),
    ...(context.activeParentNodeId ? { activeParentNodeId: context.activeParentNodeId } : {}),
    ...(context.activeSpecialKind ? { activeSpecialKind: context.activeSpecialKind } : {}),
    ...(context.activeTitle ? { activeTitle: context.activeTitle } : {}),
    ...(context.anchor ? { anchor: omitAnchorText(context.anchor) } : {}),
    ...(context.document?.bodyStatus === 'missing' ? { document: { bodyStatus: 'missing' as const } } : {}),
    ...(context.path?.length ? { path: context.path } : {}),
    schemaVersion: 1,
    scope: context.scope
  };
}

function resolveAnchorReference(
  node: Node,
  nodesById: Record<string, Node>
): NonNullable<NativeAssistantWorkspaceContext['anchor']> {
  const parent = node.parentNodeId ? nodesById[node.parentNodeId] : null;
  return {
    id: node.anchorLink?.id ?? node.id,
    kind: node.anchorLink?.kind ?? 'highlight',
    ...(parent ? { parentNodeId: parent.id, parentTitle: parent.title } : {})
  };
}

function omitAnchorText(
  anchor: NonNullable<NativeAssistantWorkspaceContext['anchor']>
): NonNullable<NativeAssistantWorkspaceContext['anchor']> {
  return {
    id: anchor.id,
    kind: anchor.kind,
    ...(anchor.page ? { page: anchor.page } : {}),
    ...(anchor.parentNodeId ? { parentNodeId: anchor.parentNodeId } : {}),
    ...(anchor.parentTitle ? { parentTitle: anchor.parentTitle } : {})
  };
}

function resolveNodePath(activeNode: Node, nodesById: Record<string, Node>) {
  const path: string[] = [];
  let node: Node | null | undefined = activeNode;
  const seen = new Set<string>();
  while (node && !seen.has(node.id)) {
    seen.add(node.id);
    if (node.title.trim()) path.unshift(node.title.trim());
    node = node.parentNodeId ? nodesById[node.parentNodeId] : null;
  }
  return path;
}
