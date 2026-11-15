import {
  WORKSPACE_CURRENT_FOLDER_TOPIC_DIVIDER_LEFT,
  WORKSPACE_LIST_DIVIDER_LEFT,
  WORKSPACE_RAIL_DIVIDER_LEFT,
  WORKSPACE_RIGHT_SIDEBAR_DIVIDER_LEFT,
  getWorkspaceSurfaceDividerColor
} from './WorkspaceSurfaceRowOverlay';

function WorkspaceGridDivider({
  column,
  hideBelowWorkspaceBreakpoint = true,
  left,
}: {
  column: 'rail' | 'folder' | 'topic' | 'sidebar';
  hideBelowWorkspaceBreakpoint?: boolean;
  left: string;
}) {
  return (
    <div
      aria-hidden="true"
      data-workspace-tier-divider
      className={`pointer-events-none absolute inset-y-0 z-local-overlay w-px -translate-x-1/2 ${
        column === 'sidebar' ? 'max-[1279px]:hidden' : hideBelowWorkspaceBreakpoint ? 'max-[1080px]:hidden' : ''
      }`}
      style={{ backgroundColor: getWorkspaceSurfaceDividerColor('main', column), left, opacity: 'var(--role-column-line-opacity)' }}
    />
  );
}

export interface WorkspaceGridDividerOverlayProps {
  isListCollapsed: boolean;
  isRightSidebarCollapsed: boolean;
}

export function WorkspaceGridDividerOverlay({
  isListCollapsed,
  isRightSidebarCollapsed
}: WorkspaceGridDividerOverlayProps) {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-local-overlay col-span-2 col-start-1 row-span-1 row-start-1">
      <WorkspaceGridDivider column="rail" hideBelowWorkspaceBreakpoint={false} left={WORKSPACE_RAIL_DIVIDER_LEFT} />
      {isListCollapsed ? null : (
        <>
          <WorkspaceGridDivider column="folder" left={WORKSPACE_CURRENT_FOLDER_TOPIC_DIVIDER_LEFT} />
          <WorkspaceGridDivider column="topic" left={WORKSPACE_LIST_DIVIDER_LEFT} />
        </>
      )}
      {isRightSidebarCollapsed ? null : (
        <WorkspaceGridDivider column="sidebar" left={WORKSPACE_RIGHT_SIDEBAR_DIVIDER_LEFT} />
      )}
    </div>
  );
}
