import { useContext } from 'react';

import { AppearanceSettingsContext } from '../../features/settings/context/appearanceSettingsContext';
import {
  getWorkspaceSurfaceAssignments,
  getWorkspaceSurfacePalette
} from '../../features/settings/model/appearanceSettings';

type WorkspaceSurfaceRow = 'titlebar' | 'main' | 'footer';
type WorkspaceSurfaceOverlayRow = Exclude<WorkspaceSurfaceRow, 'main'>;

const WORKSPACE_SURFACE_ROW_TEMPLATE = [
  'var(--workspace-rail-width)',
  'var(--workspace-folder-column-width)',
  'minmax(0, max(0px, calc(var(--workspace-list-current-width, 300px) - var(--workspace-folder-column-width))))',
  'minmax(0, 1fr)',
  'minmax(0, var(--workspace-right-sidebar-current-width, 320px))'
].join(' ');

const TITLEBAR_SURFACE_ROW_TEMPLATE = [
  'var(--workspace-rail-width)',
  'var(--workspace-titlebar-folder-column-width, var(--workspace-folder-column-width))',
  'minmax(0, max(0px, calc(var(--workspace-titlebar-list-current-width, var(--workspace-list-current-width, 300px)) - var(--workspace-titlebar-folder-column-width, var(--workspace-folder-column-width)))))',
  'minmax(0, 1fr)',
  'minmax(0, var(--workspace-right-sidebar-current-width, 320px))'
].join(' ');

const WORKSPACE_SURFACE_COLUMNS = ['rail', 'folder', 'topic', 'document', 'sidebar'] as const;
export const WORKSPACE_RAIL_DIVIDER_LEFT = 'var(--workspace-rail-width)';
export const WORKSPACE_LIST_DIVIDER_LEFT =
  'calc(var(--workspace-rail-width) + var(--workspace-list-current-width, 300px) + (var(--workspace-list-splitter-width, 1px) / 2))';
export const WORKSPACE_FOLDER_TOPIC_DIVIDER_LEFT =
  'calc(var(--workspace-rail-width) + var(--workspace-folder-column-width))';
export const WORKSPACE_RIGHT_SIDEBAR_DIVIDER_LEFT =
  'calc(100% - var(--workspace-right-sidebar-current-width, 320px) - (var(--workspace-right-sidebar-splitter-width, 1px) / 2))';

function getSurfaceColor(row: WorkspaceSurfaceRow, column: (typeof WORKSPACE_SURFACE_COLUMNS)[number]) {
  return `var(--workspace-region-${row}-${column}-bg)`;
}

export function getWorkspaceSurfaceDividerColor(
  row: WorkspaceSurfaceRow,
  column: (typeof WORKSPACE_SURFACE_COLUMNS)[number]
) {
  const surface = getSurfaceColor(row, column);
  const mixTarget = `var(--workspace-region-${row}-${column}-divider-mix-target, var(--workspace-divider-mix-target))`;
  return `color-mix(in oklab, ${surface} var(--workspace-divider-subtle-surface-weight), ${mixTarget})`;
}

export function WorkspaceSurfaceRowOverlay({ row }: { row: WorkspaceSurfaceOverlayRow }) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-0 grid overflow-hidden"
      style={{
        gridTemplateColumns: row === 'titlebar'
          ? TITLEBAR_SURFACE_ROW_TEMPLATE
          : WORKSPACE_SURFACE_ROW_TEMPLATE
      }}
    >
      {WORKSPACE_SURFACE_COLUMNS.map((column) => (
        <div
          key={`${row}-${column}`}
          style={{ backgroundColor: getSurfaceColor(row, column) }}
        />
      ))}
    </div>
  );
}

function WorkspaceSurfaceRowDivider({
  className,
  column,
  left,
  row
}: {
  className?: string;
  column: (typeof WORKSPACE_SURFACE_COLUMNS)[number];
  left: string;
  row: WorkspaceSurfaceOverlayRow;
}) {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute inset-y-0 z-[2] w-px -translate-x-1/2 ${className ?? ''}`}
      style={{ backgroundColor: getWorkspaceSurfaceDividerColor(row, column), left }}
    />
  );
}

function useHasFolderTopicDivider(row: WorkspaceSurfaceRow) {
  const appearance = useContext(AppearanceSettingsContext);
  const workspaceSurfaceAssignments = appearance?.workspaceSurfaceAssignments ?? getWorkspaceSurfaceAssignments();
  const workspaceSurfacePalette = appearance?.workspaceSurfacePalette ?? getWorkspaceSurfacePalette();
  const folderIndex = workspaceSurfaceAssignments[`${row}-folder`];
  const topicIndex = workspaceSurfaceAssignments[`${row}-topic`];
  const folderColor = workspaceSurfacePalette[folderIndex] ?? workspaceSurfacePalette[0];
  const topicColor = workspaceSurfacePalette[topicIndex] ?? workspaceSurfacePalette[0];
  return folderColor !== topicColor;
}

export function WorkspaceTitlebarDividers({
  isListCollapsed,
  isRightSidebarCollapsed
}: {
  isListCollapsed: boolean;
  isRightSidebarCollapsed: boolean;
}) {
  const hasFolderTopicDivider = useHasFolderTopicDivider('titlebar');

  return (
    <>
      <WorkspaceSurfaceRowDivider
        column="rail"
        left={WORKSPACE_RAIL_DIVIDER_LEFT}
        row="titlebar"
      />
      {isListCollapsed || !hasFolderTopicDivider ? null : (
        <WorkspaceSurfaceRowDivider
          column="folder"
          left={WORKSPACE_FOLDER_TOPIC_DIVIDER_LEFT}
          row="titlebar"
        />
      )}
      {isListCollapsed ? null : (
        <WorkspaceSurfaceRowDivider
          column="topic"
          left={WORKSPACE_LIST_DIVIDER_LEFT}
          row="titlebar"
        />
      )}
      {isRightSidebarCollapsed ? null : (
        <WorkspaceSurfaceRowDivider
          column="sidebar"
          left={WORKSPACE_RIGHT_SIDEBAR_DIVIDER_LEFT}
          row="titlebar"
        />
      )}
    </>
  );
}

export function WorkspaceFooterRowDividers() {
  const hasFolderTopicDivider = useHasFolderTopicDivider('footer');
  if (!hasFolderTopicDivider) {
    return null;
  }
  return (
    <WorkspaceSurfaceRowDivider
      className="max-[1080px]:hidden"
      column="folder"
      left={WORKSPACE_FOLDER_TOPIC_DIVIDER_LEFT}
      row="footer"
    />
  );
}
