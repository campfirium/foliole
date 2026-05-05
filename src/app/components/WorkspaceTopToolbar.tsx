import { Bug, FileSearch, FileText, Gauge, Highlighter, Link2, ListOrdered, PanelLeft, Trash2 } from 'lucide-react';

import { AppIconButton, AppToolbar, ToolbarActionGroup } from '../../shared/ui';

export type WorkspaceRightPanelId = 'review-queue' | 'source-info' | 'highlights' | 'backlinks' | 'performance' | 'dev';

const toolbarButtonClassName = 'size-8 text-foreground/70 hover:bg-foreground/[0.04] hover:text-foreground';
const activeToolbarButtonClassName = `${toolbarButtonClassName} data-[active=true]:bg-foreground/[0.06] data-[active=true]:text-foreground`;

interface WorkspaceTopToolbarProps {
  isTrashViewOpen: boolean;
  activeRightPanelId: WorkspaceRightPanelId;
  isRightSidebarCollapsed: boolean;
  onOpenNotesView: () => void;
  onOpenTrashView: () => void;
  onSelectRightPanel: (panelId: WorkspaceRightPanelId) => void;
  onToggleListVisibility: () => void;
}

function InspectorActionButton({
  active,
  icon,
  label,
  onClick
}: {
  active: boolean;
  icon: JSX.Element;
  label: string;
  onClick: () => void;
}) {
  return (
    <AppIconButton
      aria-pressed={active}
      className={activeToolbarButtonClassName}
      data-active={active}
      icon={icon}
      label={label}
      onClick={onClick}
    />
  );
}

function renderInspectorActions(activeRightPanelId: WorkspaceRightPanelId, isRightSidebarCollapsed: boolean, onSelectRightPanel: (panelId: WorkspaceRightPanelId) => void) {
  return (
    <>
      <InspectorActionButton
        active={!isRightSidebarCollapsed && activeRightPanelId === 'review-queue'}
        icon={<ListOrdered aria-hidden="true" size={16} strokeWidth={1.75} />}
        label="Review queue panel"
        onClick={() => onSelectRightPanel('review-queue')}
      />
      <InspectorActionButton
        active={!isRightSidebarCollapsed && activeRightPanelId === 'source-info'}
        icon={<FileSearch aria-hidden="true" size={16} strokeWidth={1.75} />}
        label="Source info panel"
        onClick={() => onSelectRightPanel('source-info')}
      />
      <InspectorActionButton
        active={!isRightSidebarCollapsed && activeRightPanelId === 'highlights'}
        icon={<Highlighter aria-hidden="true" size={16} strokeWidth={1.75} />}
        label="Highlights panel"
        onClick={() => onSelectRightPanel('highlights')}
      />
      <InspectorActionButton
        active={!isRightSidebarCollapsed && activeRightPanelId === 'backlinks'}
        icon={<Link2 aria-hidden="true" size={16} strokeWidth={1.75} />}
        label="Backlinks panel"
        onClick={() => onSelectRightPanel('backlinks')}
      />
      <InspectorActionButton
        active={!isRightSidebarCollapsed && activeRightPanelId === 'performance'}
        icon={<Gauge aria-hidden="true" size={16} strokeWidth={1.75} />}
        label="Performance panel"
        onClick={() => onSelectRightPanel('performance')}
      />
      <InspectorActionButton
        active={!isRightSidebarCollapsed && activeRightPanelId === 'dev'}
        icon={<Bug aria-hidden="true" size={16} strokeWidth={1.75} />}
        label="Dev panel"
        onClick={() => onSelectRightPanel('dev')}
      />
    </>
  );
}

export function WorkspaceTopToolbar({
  activeRightPanelId,
  isTrashViewOpen,
  isRightSidebarCollapsed,
  onOpenNotesView,
  onOpenTrashView,
  onSelectRightPanel,
  onToggleListVisibility
}: WorkspaceTopToolbarProps) {
  return (
    <AppToolbar aria-label="Workspace top toolbar" className="workspace-toolbar-surface min-h-[40px] border-b border-divider bg-bg-subtle px-3">
      <ToolbarActionGroup ariaLabel="Workspace primary navigation actions">
        <AppIconButton
          className={toolbarButtonClassName}
          icon={<PanelLeft aria-hidden="true" size={16} strokeWidth={1.75} />}
          label="Toggle topic list"
          onClick={onToggleListVisibility}
        />
        <AppIconButton
          className={activeToolbarButtonClassName}
          data-active={!isTrashViewOpen}
          icon={<FileText aria-hidden="true" size={16} strokeWidth={1.75} />}
          label="Open notes view"
          onClick={onOpenNotesView}
        />
        <AppIconButton
          className={activeToolbarButtonClassName}
          data-active={isTrashViewOpen}
          icon={<Trash2 aria-hidden="true" size={16} strokeWidth={1.75} />}
          label="Open trash view"
          onClick={onOpenTrashView}
        />
      </ToolbarActionGroup>
      <div className="flex-1" />
      <ToolbarActionGroup ariaLabel="Workspace inspector actions">
        {renderInspectorActions(activeRightPanelId, isRightSidebarCollapsed, onSelectRightPanel)}
      </ToolbarActionGroup>
    </AppToolbar>
  );
}
