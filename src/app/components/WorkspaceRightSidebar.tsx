import { memo } from 'react';

import { toRightPanelScaleId } from '../../features/settings/model/displayScaleSettings';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { recordComponentRender } from '../../shared/platform/performanceDiagnosticsProbe';
import { AppPanel, ScalablePanel } from '../../shared/ui';
import {
  isEditorInputDiagnosticEnabled,
  logEditorInputDiagnostic
} from '../../store/workspaceEditorInputDiagnostics';

import { useWorkspaceRenderDiagnostic } from './workspaceInputLagRenderDiagnostic';
import { getWorkspaceRightPanelDefinition } from './workspaceRightPanelDefinitions';
import { areFlowDayBucketsEqual, areFlowDayOffsetsEqual, areStringArraysEqual } from './workspaceRightSidebarFlowWindow';
import {
  renderWorkspaceRightSidebarPanel,
  type WorkspaceRightSidebarPanelProps
} from './WorkspaceRightSidebarPanels';

export interface WorkspaceRightSidebarProps extends Omit<WorkspaceRightSidebarPanelProps, 'outlineActivePosition'> {
  outlineActivePosition?: number;
}

function areReviewQueueSidebarPropsEqual(previous: WorkspaceRightSidebarProps, next: WorkspaceRightSidebarProps) {
  const changed = {
    activeNodeId: previous.activeNodeId !== next.activeNodeId,
    activePanelId: previous.activePanelId !== next.activePanelId,
    isWorkspaceHydrated: previous.isWorkspaceHydrated !== next.isWorkspaceHydrated,
    reviewActiveQueueNodeIds: !areStringArraysEqual(previous.reviewActiveQueueNodeIds ?? [], next.reviewActiveQueueNodeIds ?? []),
    reviewCurrentNodeId: previous.reviewCurrentNodeId !== next.reviewCurrentNodeId,
    reviewFlowWindow: !areReviewFlowWindowsEqual(previous.reviewFlowWindow, next.reviewFlowWindow),
    reviewQueueNodeIds: !areStringArraysEqual(previous.reviewQueueNodeIds, next.reviewQueueNodeIds)
  };
  if (isEditorInputDiagnosticEnabled()) {
    logEditorInputDiagnostic('workspace-right-sidebar-memo-compare', changed);
  }
  return !Object.values(changed).some(Boolean);
}

function areReviewFlowWindowsEqual(
  previous: WorkspaceRightSidebarProps['reviewFlowWindow'],
  next: WorkspaceRightSidebarProps['reviewFlowWindow']
) {
  if (!previous || !next) {
    return previous === next;
  }
  return (
    areStringArraysEqual(previous.queueNodeIds, next.queueNodeIds) &&
    areStringArraysEqual(previous.readyNodeIds, next.readyNodeIds) &&
    areStringArraysEqual(previous.upcomingNodeIds, next.upcomingNodeIds) &&
    areFlowDayBucketsEqual(previous, next) &&
    areFlowDayOffsetsEqual(previous, next)
  );
}

function areWorkspaceRightSidebarPropsEqual(previous: WorkspaceRightSidebarProps, next: WorkspaceRightSidebarProps) {
  if (previous.activePanelId === 'review-queue' && next.activePanelId === 'review-queue') {
    return areReviewQueueSidebarPropsEqual(previous, next);
  }
  return false;
}

export const WorkspaceRightSidebar = memo(function WorkspaceRightSidebar(props: WorkspaceRightSidebarProps) {
  const t = useTranslation();
  recordComponentRender('rightSidebar');
  useWorkspaceRenderDiagnostic('workspace-right-sidebar-render', {
    activeNodeId: props.activeNodeId,
    activePanelId: props.activePanelId,
    nodeOrder: props.nodeOrder,
    nodesById: props.nodesById,
    outlineActivePosition: props.outlineActivePosition ?? 0
  });
  const panelProps = {
    ...props,
    outlineActivePosition: props.outlineActivePosition ?? 0
  };
  return (
    <ScalablePanel
      className="workspace-region-main-sidebar hidden min-h-0 h-full flex-col xl:flex"
      label={getWorkspaceRightPanelDefinition(props.activePanelId).menuLabel}
      panelId={toRightPanelScaleId(props.activePanelId)}
    >
      <AppPanel
        aria-label={t('desktop.workspace.inspector')}
        as="aside"
        bodyClassName={props.activePanelId === 'assistant'
          ? 'min-h-0 overflow-hidden'
          : 'app-scrollbar overflow-y-auto px-3 py-3'}
        className="flex h-full min-h-0 min-w-0 w-full flex-col overflow-hidden text-foreground [--app-inspector-section-bg:transparent] [--app-inspector-section-border-color:transparent] [--app-inspector-section-border-width:0] [--app-inspector-section-padding:0] [--app-inspector-section-radius:0] [--app-inspector-section-shadow-color:transparent]"
        headerClassName="hidden"
        title={null}
      >
        {renderWorkspaceRightSidebarPanel(panelProps)}
      </AppPanel>
    </ScalablePanel>
  );
}, areWorkspaceRightSidebarPropsEqual);
