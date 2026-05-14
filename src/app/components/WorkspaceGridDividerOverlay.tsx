import {
  WORKSPACE_FOLDER_TOPIC_DIVIDER_LEFT,
  WORKSPACE_LIST_DIVIDER_LEFT,
  WORKSPACE_RAIL_DIVIDER_LEFT,
  WORKSPACE_RIGHT_SIDEBAR_DIVIDER_LEFT,
  getWorkspaceSurfaceDividerColor
} from './WorkspaceSurfaceRowOverlay';

function WorkspaceGridDivider({
  bottom = '0',
  column,
  left,
  top = '0'
}: {
  bottom?: string;
  column: 'rail' | 'folder' | 'topic' | 'sidebar';
  left: string;
  top?: string;
}) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute z-local-overlay w-px -translate-x-1/2 max-[1080px]:hidden"
      style={{ backgroundColor: getWorkspaceSurfaceDividerColor('main', column), bottom, left, top }}
    />
  );
}

export interface WorkspaceGridDividerOverlayProps {
  isListCollapsed: boolean;
  isRightSidebarCollapsed: boolean;
  isStudyMode: boolean;
}

export function WorkspaceGridDividerOverlay({
  isStudyMode,
  isListCollapsed,
  isRightSidebarCollapsed
}: WorkspaceGridDividerOverlayProps) {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-local-overlay">
      <WorkspaceGridDivider column="rail" left={WORKSPACE_RAIL_DIVIDER_LEFT} />
      {isListCollapsed ? null : (
        <>
          <WorkspaceGridDivider
            bottom={isStudyMode ? 'var(--workspace-bottom-toolbar-height)' : '0'}
            column="folder"
            left={WORKSPACE_FOLDER_TOPIC_DIVIDER_LEFT}
          />
          <WorkspaceGridDivider column="topic" left={WORKSPACE_LIST_DIVIDER_LEFT} />
        </>
      )}
      {isRightSidebarCollapsed ? null : (
        <WorkspaceGridDivider column="sidebar" left={WORKSPACE_RIGHT_SIDEBAR_DIVIDER_LEFT} />
      )}
    </div>
  );
}
