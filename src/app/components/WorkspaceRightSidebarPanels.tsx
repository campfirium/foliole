import { Suspense } from 'react';

import type { Node, NodeAnchorLink } from '../../features/nodes/model/nodeTypes';
import type { ReviewSchedulerSettings } from '../../features/settings/model/reviewSchedulerSettings';
import type { ReviewFlowWindow } from '../../store/workspaceReviewFlowWindow';

import { measureWorkspaceDiagnostic } from './workspaceInputLagRenderDiagnostic';
import {
  isWorkspaceRightPanelAvailable,
  resolveWorkspaceRightPanelContext
} from './workspaceRightPanelAvailability';
import { renderWorkspaceRightSidebarPanelContent } from './WorkspaceRightSidebarPanelRenderers';
import type { WorkspaceRightPanelId } from './WorkspaceTopToolbar';

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
          if (props.isWorkspaceHydrated === false) return null;
          const context = resolveWorkspaceRightPanelContext({
            activeNodeId: props.activeNodeId,
            hasExternalDocument: Boolean(props.outlineDocument),
            nodesById: props.nodesById
          });
          return isWorkspaceRightPanelAvailable(props.activePanelId, context)
            ? renderWorkspaceRightSidebarPanelContent(props)
            : null;
        }
      )}
    </Suspense>
  );
}
