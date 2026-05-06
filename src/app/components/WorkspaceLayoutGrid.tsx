import type { ReactNode } from 'react';

import { recordComponentRender } from '../../shared/platform/performanceDiagnosticsProbe';

import {
  selectWorkspaceBottomReviewToolbarProps,
  WorkspaceBottomReviewToolbar
} from './WorkspaceBottomReviewToolbar';
import { WorkspaceGridContent, type WorkspaceGridContentSource } from './WorkspaceGridContent';
import { WorkspaceGridDividerOverlay } from './WorkspaceGridDividerOverlay';
import type { WorkspaceLayoutProps } from './workspaceLayoutGroupedProps';
import {
  selectWorkspaceLeftRailProps,
  WorkspaceLeftRail
} from './WorkspaceLeftRail';
import type { WorkspaceRightPanelId } from './WorkspaceTopToolbar';

export type WorkspaceLayoutGridSource = WorkspaceLayoutProps;

export function WorkspaceLayoutGrid({
  activeRightPanelId,
  documentNodeId,
  onEnterImmersiveEdit,
  onShouldSuppressSelectionRestore,
  onSelectNode,
  isImmersiveEditing,
  props
}: {
  activeRightPanelId: WorkspaceRightPanelId;
  documentNodeId: string | null;
  onEnterImmersiveEdit: () => void;
  onShouldSuppressSelectionRestore: () => boolean;
  onSelectNode: WorkspaceGridContentSource['navigation']['onSelectNode'];
  isImmersiveEditing: boolean;
  props: WorkspaceLayoutGridSource;
}) {
  recordComponentRender('workspaceGrid');
  const gridTemplateColumns = props.layoutChrome.isImmersiveMode
    ? 'minmax(0, 1fr)'
    : 'var(--workspace-rail-width) minmax(0, 1fr)';

  return (
    <WorkspaceLayoutGridShell gridTemplateColumns={gridTemplateColumns}>
      {renderWorkspaceGridDividerOverlay(props)}
      {props.layoutChrome.isImmersiveMode ? null : (
        <WorkspaceLeftRail
          {...selectWorkspaceLeftRailProps({
            props,
            showStudyDock: !props.review.isStudyMode
          })}
        />
      )}
      <WorkspaceGridContent
        activeRightPanelId={activeRightPanelId}
        documentNodeId={documentNodeId}
        isImmersiveEditing={isImmersiveEditing}
        onEnterImmersiveEdit={onEnterImmersiveEdit}
        onShouldSuppressSelectionRestore={onShouldSuppressSelectionRestore}
        onSelectNode={onSelectNode}
        props={props}
      />
      <WorkspaceBottomReviewToolbar {...selectWorkspaceBottomReviewToolbarProps(props)} />
    </WorkspaceLayoutGridShell>
  );
}

function WorkspaceLayoutGridShell({
  children,
  gridTemplateColumns
}: {
  children: ReactNode;
  gridTemplateColumns: string;
}) {
  return (
    <div
      className="relative grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_auto] overflow-hidden max-[1080px]:[grid-template-columns:minmax(0,1fr)]"
      style={{ gridTemplateColumns }}
    >
      {children}
    </div>
  );
}

function renderWorkspaceGridDividerOverlay(
  props: Pick<WorkspaceLayoutProps, 'layoutChrome' | 'review'>
) {
  if (props.layoutChrome.isImmersiveMode) {
    return null;
  }
  return (
    <WorkspaceGridDividerOverlay
      isStudyMode={props.review.isStudyMode}
      isListCollapsed={props.layoutChrome.isListCollapsed}
      isRightSidebarCollapsed={props.layoutChrome.isRightSidebarCollapsed}
    />
  );
}
