import { useMemo, type ReactNode } from 'react';

import { recordComponentRender } from '../../shared/platform/performanceDiagnosticsProbe';

import {
  selectWorkspaceBottomReviewToolbarProps,
  WorkspaceBottomReviewToolbar,
  type WorkspaceBottomReviewToolbarSource
} from './WorkspaceBottomReviewToolbar';
import { WorkspaceGridContent, type WorkspaceGridContentSource } from './WorkspaceGridContent';
import {
  WorkspaceGridDividerOverlay,
  type WorkspaceGridDividerOverlayProps
} from './WorkspaceGridDividerOverlay';
import { flattenWorkspaceLayoutProps, type WorkspaceLayoutProps } from './workspaceLayoutGroupedProps';
import {
  selectWorkspaceLeftRailProps,
  WorkspaceLeftRail,
  type WorkspaceLeftRailSource
} from './WorkspaceLeftRail';
import type { WorkspaceRightPanelId } from './WorkspaceTopToolbar';

type WorkspaceLayoutGridFlatSource = WorkspaceGridContentSource &
  WorkspaceBottomReviewToolbarSource &
  WorkspaceLeftRailSource &
  WorkspaceGridDividerOverlayProps;

export type WorkspaceLayoutGridSource = WorkspaceLayoutProps;

export function WorkspaceLayoutGrid({
  activeRightPanelId,
  documentNodeId,
  isImportManagementOpen,
  onEnterImmersiveEdit,
  onOpenImportManagement,
  onShouldSuppressSelectionRestore,
  onStartClipboardImport,
  onStartImport,
  onSelectNode,
  isImmersiveEditing,
  props
}: {
  activeRightPanelId: WorkspaceRightPanelId;
  documentNodeId: string | null;
  isImportManagementOpen: boolean;
  onEnterImmersiveEdit: () => void;
  onOpenImportManagement: () => void;
  onShouldSuppressSelectionRestore: () => boolean;
  onStartClipboardImport: () => void;
  onStartImport: () => void;
  onSelectNode: WorkspaceGridContentSource['onSelectNode'];
  isImmersiveEditing: boolean;
  props: WorkspaceLayoutGridSource;
}) {
  const flatProps = useMemo(() => flattenWorkspaceLayoutProps(props), [props]);
  recordComponentRender('workspaceGrid');
  const gridTemplateColumns = flatProps.isImmersiveMode
    ? 'minmax(0, 1fr)'
    : 'var(--workspace-rail-width) minmax(0, 1fr)';

  return (
    <WorkspaceLayoutGridShell gridTemplateColumns={gridTemplateColumns}>
      {renderWorkspaceGridDividerOverlay(flatProps)}
      {flatProps.isImmersiveMode ? null : (
        <WorkspaceLeftRail
          {...selectWorkspaceLeftRailProps({
            isImportManagementOpen,
            onOpenImportManagement,
            onStartClipboardImport,
            onStartImport,
            props: flatProps,
            showStudyDock: !flatProps.isStudyMode
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
        props={flatProps}
      />
      <WorkspaceBottomReviewToolbar {...selectWorkspaceBottomReviewToolbarProps(flatProps)} />
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
  props: WorkspaceLayoutGridFlatSource & { isImmersiveMode: boolean }
) {
  if (props.isImmersiveMode) {
    return null;
  }
  return (
    <WorkspaceGridDividerOverlay
      isStudyMode={props.isStudyMode}
      isListCollapsed={props.isListCollapsed}
      isRightSidebarCollapsed={props.isRightSidebarCollapsed}
    />
  );
}
