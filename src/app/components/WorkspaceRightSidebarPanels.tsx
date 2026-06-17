import { Suspense, lazy, memo } from 'react';

import type { Node, NodeAnchorLink } from '../../features/nodes/model/nodeTypes';
import type { ReviewSchedulerSettings } from '../../features/settings/model/reviewSchedulerSettings';
import type { ReviewFlowWindow } from '../../store/workspaceReviewFlowWindow';

import { measureWorkspaceDiagnostic } from './workspaceInputLagRenderDiagnostic';
import {
  isWorkspaceRightPanelAvailable,
  resolveWorkspaceRightPanelContext
} from './workspaceRightPanelAvailability';
import {
  loadWorkspaceRightSidebarBacklinksPanel,
  loadWorkspaceRightSidebarDevPanel,
  loadWorkspaceRightSidebarHighlightsPanel,
  loadWorkspaceRightSidebarOutlinePanel,
  loadWorkspaceRightSidebarPerformancePanel,
  loadWorkspaceRightSidebarReviewQueuePanel
} from './workspaceRightSidebarPanelLoaders';
import type { WorkspaceRightPanelId } from './WorkspaceTopToolbar';

const WorkspaceRightSidebarBacklinksPanel = lazy(() =>
  loadWorkspaceRightSidebarBacklinksPanel().then((module) => ({ default: module.WorkspaceRightSidebarBacklinksPanel }))
);
const WorkspaceRightSidebarDevPanel = lazy(() =>
  loadWorkspaceRightSidebarDevPanel().then((module) => ({ default: module.WorkspaceRightSidebarDevPanel }))
);
const WorkspaceRightSidebarHighlightsPanel = lazy(() =>
  loadWorkspaceRightSidebarHighlightsPanel().then((module) => ({ default: module.WorkspaceRightSidebarHighlightsPanel }))
);
const WorkspaceRightSidebarOutlinePanel = lazy(() =>
  loadWorkspaceRightSidebarOutlinePanel().then((module) => ({ default: module.WorkspaceRightSidebarOutlinePanel }))
);
const WorkspaceRightSidebarPerformancePanel = lazy(() =>
  loadWorkspaceRightSidebarPerformancePanel().then((module) => ({ default: module.WorkspaceRightSidebarPerformancePanel }))
);
const WorkspaceRightSidebarReviewQueuePanel = lazy(() =>
  loadWorkspaceRightSidebarReviewQueuePanel().then((module) => ({ default: module.WorkspaceRightSidebarReviewQueuePanel }))
);

type WorkspaceRightSidebarNodesById = Record<string, Node>;

interface WorkspaceRightSidebarOutlineDocument {
  activePosition: number;
  content: string;
  onRevealPosition: (position: number) => void;
}

export interface WorkspaceRightSidebarPanelProps {
  activeNodeId: string | null;
  activePanelId: WorkspaceRightPanelId;
  isWorkspaceHydrated?: boolean;
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
  reviewFlowWindow?: ReviewFlowWindow;
  reviewQueueNodeIds: string[];
  reviewSchedulerSettings: ReviewSchedulerSettings;
  trashedNodeIds: string[];
}

export function renderWorkspaceRightSidebarPanel(props: WorkspaceRightSidebarPanelProps) {
  return (
    <Suspense fallback={null}>
      {measureWorkspaceDiagnostic(
        'workspace-right-sidebar-panel-select',
        {
          activeNodeId: props.activeNodeId,
          activePanelId: props.activePanelId,
          nodeCount: Object.keys(props.nodesById).length
        },
        () => {
          if (props.isWorkspaceHydrated === false) {
            return null;
          }
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
          if (props.activePanelId === 'highlights') return renderHighlightsPanel(props);
          if (props.activePanelId === 'outline') return renderOutlinePanel(props);
          if (props.activePanelId === 'backlinks') return renderBacklinksPanel(props);
          return renderReviewQueuePanel(props);
        }
      )}
    </Suspense>
  );
}

const ReviewQueueSidebarPanel = memo(function ReviewQueueSidebarPanel(props: {
  currentNodeId: string | null;
  flowWindow: ReviewFlowWindow;
  nodesById: WorkspaceRightSidebarNodesById;
  onSelectNode: (nodeId: string) => void;
}) {
  return <WorkspaceRightSidebarReviewQueuePanel {...props} />;
}, (previousProps, nextProps) => {
  if (previousProps.currentNodeId !== nextProps.currentNodeId) return false;
  if (previousProps.onSelectNode !== nextProps.onSelectNode) return false;
  const previousFlowNodeIds = collectFlowWindowNodeIds(previousProps.flowWindow);
  const nextFlowNodeIds = collectFlowWindowNodeIds(nextProps.flowWindow);
  if (previousFlowNodeIds.length !== nextFlowNodeIds.length) return false;
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
});

function collectFlowWindowNodeIds(flowWindow: ReviewFlowWindow) {
  return [...flowWindow.queueNodeIds, ...flowWindow.readyNodeIds, ...flowWindow.upcomingNodeIds];
}

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
  props: Pick<WorkspaceRightSidebarPanelProps, 'reviewActiveQueueNodeIds' | 'reviewCurrentNodeId' | 'nodesById' | 'onSelectNode' | 'reviewFlowWindow' | 'reviewQueueNodeIds'>
) {
  return (
    <ReviewQueueSidebarPanel
      currentNodeId={props.reviewCurrentNodeId}
      flowWindow={props.reviewFlowWindow ?? {
        queueNodeIds: props.reviewActiveQueueNodeIds ?? props.reviewQueueNodeIds,
        readyNodeIds: [],
        upcomingNodeIds: []
      }}
      nodesById={props.nodesById}
      onSelectNode={props.onSelectNode}
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
      {...(outlineDocument ? { emptyDescriptionKind: 'document' as const } : {})}
      onRevealPosition={outlineDocument?.onRevealPosition ?? props.onRevealDocumentPosition ?? (() => undefined)}
    />
  );
}
