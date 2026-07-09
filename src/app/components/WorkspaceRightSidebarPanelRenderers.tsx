import { memo } from 'react';

import type { Node } from '../../features/nodes/model/nodeTypes';
import type { ReviewFlowWindow } from '../../store/workspaceReviewFlowWindow';

import {
  areFlowDayBucketsEqual,
  areFlowDayOffsetsEqual,
  collectFlowWindowNodeIds
} from './workspaceRightSidebarFlowWindow';
import {
  WorkspaceRightSidebarAssistantPanel,
  WorkspaceRightSidebarBacklinksPanel,
  WorkspaceRightSidebarDevPanel,
  WorkspaceRightSidebarHighlightsPanel,
  WorkspaceRightSidebarOutlinePanel,
  WorkspaceRightSidebarPerformancePanel,
  WorkspaceRightSidebarReviewQueuePanel
} from './WorkspaceRightSidebarLazyPanels';
import type { WorkspaceRightSidebarPanelProps } from './WorkspaceRightSidebarPanels';

type WorkspaceRightSidebarNodesById = Record<string, Node>;

export function renderWorkspaceRightSidebarPanelContent(props: WorkspaceRightSidebarPanelProps) {
  if (props.activePanelId === 'dev') return renderDevPanel(props);
  if (props.activePanelId === 'performance') return renderPerformancePanel(props);
  if (props.activePanelId === 'assistant') return renderAssistantPanel(props);
  if (props.activePanelId === 'highlights') return renderHighlightsPanel(props);
  if (props.activePanelId === 'outline') return renderOutlinePanel(props);
  if (props.activePanelId === 'backlinks') return renderBacklinksPanel(props);
  return renderReviewQueuePanel(props);
}

const ReviewQueueSidebarPanel = memo(function ReviewQueueSidebarPanel(props: {
  currentNodeId: string | null;
  flowWindow: ReviewFlowWindow;
  nodesById: WorkspaceRightSidebarNodesById;
  onSelectNode: (nodeId: string) => void;
}) {
  return <WorkspaceRightSidebarReviewQueuePanel {...props} />;
}, areReviewQueueSidebarPropsEqual);

function areReviewQueueSidebarPropsEqual(
  previousProps: ReviewQueueSidebarProps,
  nextProps: ReviewQueueSidebarProps
) {
  if (previousProps.currentNodeId !== nextProps.currentNodeId) return false;
  if (previousProps.onSelectNode !== nextProps.onSelectNode) return false;
  const previousFlowNodeIds = collectFlowWindowNodeIds(previousProps.flowWindow);
  const nextFlowNodeIds = collectFlowWindowNodeIds(nextProps.flowWindow);
  if (previousFlowNodeIds.length !== nextFlowNodeIds.length) return false;
  if (!areFlowDayBucketsEqual(previousProps.flowWindow, nextProps.flowWindow)) return false;
  if (!areFlowDayOffsetsEqual(previousProps.flowWindow, nextProps.flowWindow)) return false;
  return previousFlowNodeIds.every((nodeId, index) => {
    if (nodeId !== nextFlowNodeIds[index]) return false;
    const previousNode = previousProps.nodesById[nodeId];
    const nextNode = nextProps.nodesById[nodeId];
    return (
      previousNode?.title === nextNode?.title &&
      previousNode?.createdAt === nextNode?.createdAt &&
      previousNode?.review?.due === nextNode?.review?.due &&
      previousNode?.review?.state === nextNode?.review?.state &&
      previousNode?.reading?.nextAt === nextNode?.reading?.nextAt
    );
  });
}

type ReviewQueueSidebarProps = {
  currentNodeId: string | null;
  flowWindow: ReviewFlowWindow;
  nodesById: WorkspaceRightSidebarNodesById;
  onSelectNode: (nodeId: string) => void;
};

function renderDevPanel(
  props: Pick<
    WorkspaceRightSidebarPanelProps,
    'activeNodeId' | 'nodesById' | 'reviewSchedulerSettings'
  >
) {
  return (
    <WorkspaceRightSidebarDevPanel
      activeNodeId={props.activeNodeId}
      nodesById={props.nodesById}
      reviewSchedulerSettings={props.reviewSchedulerSettings}
    />
  );
}

function renderPerformancePanel(
  props: Pick<WorkspaceRightSidebarPanelProps, 'activeNodeId' | 'nodesById'>
) {
  return (
    <WorkspaceRightSidebarPerformancePanel
      activeNodeId={props.activeNodeId}
      nodesById={props.nodesById}
    />
  );
}

function renderAssistantPanel(
  props: Pick<
    WorkspaceRightSidebarPanelProps,
    | 'activeNodeId'
    | 'assistantActiveNodeId'
    | 'assistantWorkspaceContext'
    | 'editorAdapterRef'
    | 'nodesById'
    | 'onSelectNode'
  >
) {
  return (
    <WorkspaceRightSidebarAssistantPanel
      activeNodeId={props.assistantActiveNodeId ?? props.activeNodeId}
      workspaceContextOverride={props.assistantWorkspaceContext}
      editorAdapterRef={props.editorAdapterRef}
      nodesById={props.nodesById}
      onSelectNode={props.onSelectNode}
    />
  );
}

function renderBacklinksPanel(
  props: Pick<
    WorkspaceRightSidebarPanelProps,
    'activeNodeId' | 'nodeOrder' | 'nodesById' | 'onSelectNode' | 'trashedNodeIds'
  >
) {
  return (
    <WorkspaceRightSidebarBacklinksPanel
      activeNodeId={props.activeNodeId}
      nodeOrder={props.nodeOrder}
      nodesById={props.nodesById}
      onSelectNode={props.onSelectNode}
      trashedNodeIds={props.trashedNodeIds}
    />
  );
}

function renderReviewQueuePanel(
  props: Pick<
    WorkspaceRightSidebarPanelProps,
    | 'reviewActiveQueueNodeIds'
    | 'reviewCurrentNodeId'
    | 'nodesById'
    | 'onSelectNode'
    | 'reviewFlowWindow'
    | 'reviewQueueNodeIds'
  >
) {
  return (
    <ReviewQueueSidebarPanel
      currentNodeId={props.reviewCurrentNodeId}
      flowWindow={props.reviewFlowWindow ?? createFallbackFlowWindow(props)}
      nodesById={props.nodesById}
      onSelectNode={props.onSelectNode}
    />
  );
}

function createFallbackFlowWindow(
  props: Pick<WorkspaceRightSidebarPanelProps, 'reviewActiveQueueNodeIds' | 'reviewQueueNodeIds'>
): ReviewFlowWindow {
  return {
    dayBuckets: [],
    dayOffsetByNodeId: {},
    queueNodeIds: props.reviewActiveQueueNodeIds ?? props.reviewQueueNodeIds,
    readyNodeIds: [],
    upcomingNodeIds: []
  };
}

function renderHighlightsPanel(
  props: Pick<
    WorkspaceRightSidebarPanelProps,
    'activeNodeId' | 'nodeOrder' | 'trashedNodeIds' | 'nodesById' | 'onSelectNode'
  >
) {
  return (
    <WorkspaceRightSidebarHighlightsPanel
      activeNodeId={props.activeNodeId}
      nodeOrder={props.nodeOrder}
      trashedNodeIds={props.trashedNodeIds}
      nodesById={props.nodesById}
      onRevealHighlight={(nodeId) => revealHighlight(props, nodeId)}
    />
  );
}

function revealHighlight(
  props: Pick<WorkspaceRightSidebarPanelProps, 'nodesById' | 'onSelectNode'>,
  nodeId: string
) {
  const highlightNode = props.nodesById[nodeId];
  if (
    (highlightNode?.anchorLink?.kind === 'highlight' ||
      highlightNode?.anchorLink?.kind === 'cloze') &&
    highlightNode.parentNodeId
  ) {
    props.onSelectNode(highlightNode.parentNodeId, highlightNode.anchorLink);
    return;
  }
  props.onSelectNode(nodeId);
}

function renderOutlinePanel(
  props: Pick<
    WorkspaceRightSidebarPanelProps,
    | 'activeNodeId'
    | 'nodesById'
    | 'onRevealDocumentPosition'
    | 'outlineActivePosition'
    | 'outlineDocument'
  >
) {
  const activeNode = props.activeNodeId ? props.nodesById[props.activeNodeId] : null;
  const outlineDocument = props.outlineDocument;
  return (
    <WorkspaceRightSidebarOutlinePanel
      activePosition={outlineDocument?.activePosition ?? props.outlineActivePosition}
      content={outlineDocument?.content ?? activeNode?.content ?? ''}
      {...(outlineDocument ? { emptyDescriptionKind: 'document' as const } : {})}
      onRevealPosition={
        outlineDocument?.onRevealPosition ?? props.onRevealDocumentPosition ?? (() => undefined)
      }
    />
  );
}
