import {
  deriveNodeTitleForCloze
} from '../features/nodes/model/deriveNodeTitle';
import type { NodeAnchorLink } from '../features/nodes/model/nodeTypes';

import { createNewItemReviewProfiles } from './newItemReviewSlots';
import type { WorkspaceState } from './workspaceStore';
import { resolveCreatedNodeTitleState } from './workspaceUntitledNodeTitle';

type WorkspaceNode = WorkspaceState['nodesById'][string];

function resolveClozeAnchorLink(anchorId?: string, anchorLink?: NodeAnchorLink): NodeAnchorLink | null {
  if (anchorLink && anchorLink.kind === 'cloze' && typeof anchorLink.id === 'string' && anchorLink.id.trim().length > 0) {
    return anchorLink;
  }
  return null;
}

export function createQANodeFromSelectionRecord(args: {
  anchorId?: string;
  anchorLink?: NodeAnchorLink;
  answerContent: string;
  nodeId: string;
  parentNodeId: string;
  promptContent: string;
  state: WorkspaceState;
  timestamp: string;
}): { node: WorkspaceNode; untitledSequenceByParent: Record<string, number> } {
  const untitledState = resolveCreatedNodeTitleState(
    deriveNodeTitleForCloze(args.promptContent, args.answerContent),
    args.parentNodeId,
    args.state
  );
  const reviewProfiles = createNewItemReviewProfiles({
    batchSize: 1,
    nodesById: args.state.nodesById,
    now: args.timestamp
  });
  return {
    node: {
      id: args.nodeId,
      parentNodeId: args.parentNodeId,
      kind: 'item',
      title: untitledState.title,
      hasContent: args.promptContent.length > 0,
      content: args.promptContent,
      anchorLink: resolveClozeAnchorLink(args.anchorId, args.anchorLink),
      hasReveal: true,
      reveal: args.answerContent,
      review: reviewProfiles[0] ?? null,
      createdAt: args.timestamp,
      updatedAt: args.timestamp
    },
    untitledSequenceByParent: untitledState.untitledSequenceByParent
  };
}
