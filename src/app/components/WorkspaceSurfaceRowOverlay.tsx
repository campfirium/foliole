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

function getSurfaceColor(row: 'titlebar' | 'footer', column: (typeof WORKSPACE_SURFACE_COLUMNS)[number]) {
  return `var(--workspace-region-${row}-${column}-bg)`;
}

export function WorkspaceSurfaceRowOverlay({ row }: { row: 'titlebar' | 'footer' }) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-0 grid overflow-hidden"
      style={{ gridTemplateColumns: row === 'titlebar' ? TITLEBAR_SURFACE_ROW_TEMPLATE : WORKSPACE_SURFACE_ROW_TEMPLATE }}
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

function WorkspaceSurfaceRowDivider({ className, left }: { className?: string; left: string }) {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute inset-y-0 z-[2] w-px -translate-x-1/2 bg-border ${className ?? ''}`}
      style={{ left }}
    />
  );
}

export function WorkspaceTitlebarDividers({
  isListCollapsed,
  isRightSidebarCollapsed
}: {
  isListCollapsed: boolean;
  isRightSidebarCollapsed: boolean;
}) {
  return (
    <>
      <WorkspaceSurfaceRowDivider left={WORKSPACE_RAIL_DIVIDER_LEFT} />
      {isListCollapsed ? null : <WorkspaceSurfaceRowDivider left={WORKSPACE_LIST_DIVIDER_LEFT} />}
      {isRightSidebarCollapsed ? null : <WorkspaceSurfaceRowDivider left={WORKSPACE_RIGHT_SIDEBAR_DIVIDER_LEFT} />}
    </>
  );
}
