import { memo } from 'react';

import type { Node, NodeAnchorLink } from '../../features/nodes/model/nodeTypes';
import type { ReviewSchedulerSettings } from '../../features/settings/model/reviewSchedulerSettings';

import {
  isWorkspaceRightPanelAvailable,
  resolveWorkspaceRightPanelContext
} from './workspaceRightPanelAvailability';
import { WorkspaceRightSidebarBacklinksPanel } from './WorkspaceRightSidebarBacklinksPanel';
import { WorkspaceRightSidebarDevPanel } from './WorkspaceRightSidebarDevPanel';
import { WorkspaceRightSidebarHighlightsPanel } from './WorkspaceRightSidebarHighlightsPanel';
import { WorkspaceRightSidebarOutlinePanel } from './WorkspaceRightSidebarOutlinePanel';
import { WorkspaceRightSidebarPerformancePanel } from './WorkspaceRightSidebarPerformancePanel';
import { WorkspaceRightSidebarReviewQueuePanel } from './WorkspaceRightSidebarReviewQueuePanel';
import { WorkspaceRightSidebarSourcePanel } from './WorkspaceRightSidebarSourcePanel';
import type { WorkspaceRightPanelId } from './WorkspaceTopToolbar';

type WorkspaceRightSidebarNodesById = Record<string, Node>;

export interface WorkspaceRightSidebarOutlineDocument {
  activePosition: number;
  content: string;
  onRevealPosition: (position: number) => void;
}

export interface WorkspaceRightSidebarPanelProps {
  activeNodeId: string | null;
  activePanelId: WorkspaceRightPanelId;
  outlineActivePosition: number;
  nodeOrder: string[];
  nodesById: WorkspaceRightSidebarNodesById;
  onRevealAnchorInDocument: (anchor: NodeAnchorLink) => void;
  onRevealDocumentPosition?: (position: number) => void;
  onSelectBreadcrumbNode: (nodeId: string) => void;
  onSelectNode: (nodeId: string, focusAnchor?: NodeAnchorLink | null) => void;
  outlineDocument?: WorkspaceRightSidebarOutlineDocument;
  reviewActiveQueueNodeIds?: string[];
  reviewCurrentNodeId: string | null;
  reviewQueueNodeIds: string[];
  reviewSchedulerSettings: ReviewSchedulerSettings;
  trashedNodeIds: string[];
}

export function renderWorkspaceRightSidebarPanel(props: WorkspaceRightSidebarPanelProps) {
  const context = resolveWorkspaceRightPanelContext({
    activeNodeId: props.activeNodeId,
    hasExternalDocument: Boolean(props.outlineDocument),
    nodesById: props.nodesById
  });
  if (!isWorkspaceRightPanelAvailable(props.activePanelId, context)) {
    return null;
  }
  if (props.activePanelId === 'dev') return renderDevPanel(props);
  if (props.activePanelId === 'performance') return renderPerformancePanel(props);
  if (props.activePanelId === 'source-info') return renderSourceInfoPanel(props);
  if (props.activePanelId === 'highlights') return renderHighlightsPanel(props);
  if (props.activePanelId === 'outline') return renderOutlinePanel(props);
  if (props.activePanelId === 'backlinks') return renderBacklinksPanel(props);
  return renderReviewQueuePanel(props);
}

const SourceInfoSidebarPanel = memo(function SourceInfoSidebarPanel(props: {
  activeNodeId: string | null;
  hasActiveNode: boolean;
}) {
  return <WorkspaceRightSidebarSourcePanel {...props} />;
}, (previousProps, nextProps) =>
  previousProps.activeNodeId === nextProps.activeNodeId &&
  previousProps.hasActiveNode === nextProps.hasActiveNode
);

const ReviewQueueSidebarPanel = memo(function ReviewQueueSidebarPanel(props: {
  currentNodeId: string | null;
  flowNodeIds: string[];
  nodesById: WorkspaceRightSidebarNodesById;
  onSelectNode: (nodeId: string) => void;
  queueNodeIds: string[];
}) {
  return <WorkspaceRightSidebarReviewQueuePanel {...props} />;
}, (previousProps, nextProps) => {
  if (previousProps.currentNodeId !== nextProps.currentNodeId) return false;
  if (previousProps.onSelectNode !== nextProps.onSelectNode) return false;
  if (previousProps.queueNodeIds.length !== nextProps.queueNodeIds.length) return false;
  if (previousProps.flowNodeIds.length !== nextProps.flowNodeIds.length) return false;
  const stableQueue = previousProps.queueNodeIds.every((nodeId, index) => nodeId === nextProps.queueNodeIds[index]);
  if (!stableQueue) return false;
  return previousProps.flowNodeIds.every((nodeId, index) => {
    if (nodeId !== nextProps.flowNodeIds[index]) return false;
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
});

function renderDevPanel(props: Pick<WorkspaceRightSidebarPanelProps, 'activeNodeId' | 'nodesById' | 'reviewSchedulerSettings'>) {
  return (
    <WorkspaceRightSidebarDevPanel
      activeNodeId={props.activeNodeId}
      nodesById={props.nodesById}
      reviewSchedulerSettings={props.reviewSchedulerSettings}
    />
  );
}

function renderPerformancePanel(props: Pick<WorkspaceRightSidebarPanelProps, 'activeNodeId' | 'nodesById'>) {
  return <WorkspaceRightSidebarPerformancePanel activeNodeId={props.activeNodeId} nodesById={props.nodesById} />;
}

function renderSourceInfoPanel(props: Pick<WorkspaceRightSidebarPanelProps, 'activeNodeId' | 'nodesById'>) {
  const activeNode = props.activeNodeId ? props.nodesById[props.activeNodeId] : null;
  return <SourceInfoSidebarPanel activeNodeId={props.activeNodeId} hasActiveNode={Boolean(activeNode)} />;
}

function renderBacklinksPanel(
  props: Pick<WorkspaceRightSidebarPanelProps, 'activeNodeId' | 'nodeOrder' | 'nodesById' | 'onSelectNode' | 'trashedNodeIds'>
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
  props: Pick<WorkspaceRightSidebarPanelProps, 'reviewActiveQueueNodeIds' | 'reviewCurrentNodeId' | 'nodesById' | 'onSelectNode' | 'reviewQueueNodeIds'>
) {
  return (
    <ReviewQueueSidebarPanel
      currentNodeId={props.reviewCurrentNodeId}
      flowNodeIds={props.reviewQueueNodeIds}
      nodesById={props.nodesById}
      onSelectNode={props.onSelectNode}
      queueNodeIds={props.reviewActiveQueueNodeIds ?? props.reviewQueueNodeIds}
    />
  );
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
      onRevealHighlight={(nodeId) => {
        const highlightNode = props.nodesById[nodeId];
        if (
          (highlightNode?.anchorLink?.kind === 'highlight' || highlightNode?.anchorLink?.kind === 'cloze') &&
          highlightNode.parentNodeId
        ) {
          props.onSelectNode(highlightNode.parentNodeId, highlightNode.anchorLink);
          return;
        }
        props.onSelectNode(nodeId);
      }}
    />
  );
}

function renderOutlinePanel(
  props: Pick<
    WorkspaceRightSidebarPanelProps,
    'activeNodeId' | 'nodesById' | 'onRevealDocumentPosition' | 'outlineActivePosition' | 'outlineDocument'
  >
) {
  const activeNode = props.activeNodeId ? props.nodesById[props.activeNodeId] : null;
  const outlineDocument = props.outlineDocument;
  return (
    <WorkspaceRightSidebarOutlinePanel
      activePosition={outlineDocument?.activePosition ?? props.outlineActivePosition}
      content={outlineDocument?.content ?? activeNode?.content ?? ''}
      onRevealPosition={outlineDocument?.onRevealPosition ?? props.onRevealDocumentPosition ?? (() => undefined)}
      {...(outlineDocument ? { emptyDescription: 'This document has no outline headings yet.' } : {})}
    />
  );
}
