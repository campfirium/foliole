import type { NodeAnchorLink, NodeImageRegionGroup } from '../features/nodes/model/nodeTypes';

import type { WorkspaceState } from './workspaceStore';

type WorkspaceNode = WorkspaceState['nodesById'][string];

function normalizeImageRegions(imageRegions: NodeImageRegionGroup[] | null | undefined) {
  return imageRegions && imageRegions.length > 0 ? imageRegions : null;
}

function resolveHighlightAnchorLink(anchorId?: string, anchorLink?: NodeAnchorLink): NodeAnchorLink | null {
  if (anchorLink && anchorLink.kind === 'highlight' && typeof anchorLink.id === 'string' && anchorLink.id.trim().length > 0) {
    return anchorLink;
  }
  return null;
}

export function createHighlightNodeRecord(args: {
  anchorId?: string;
  anchorLink?: NodeAnchorLink;
  content: string;
  imageRegions?: NodeImageRegionGroup[] | null;
  nodeId: string;
  parentNodeId: string;
  timestamp: string;
  title: string;
}): WorkspaceNode {
  return {
    id: args.nodeId,
    parentNodeId: args.parentNodeId,
    kind: 'topic',
    title: args.title,
    hasContent: args.content.length > 0,
    content: args.content,
    anchorLink: resolveHighlightAnchorLink(args.anchorId, args.anchorLink),
    imageRegions: normalizeImageRegions(args.imageRegions),
    hasReveal: false,
    reveal: null,
    review: null,
    createdAt: args.timestamp,
    updatedAt: args.timestamp
  };
}
