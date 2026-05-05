import { Bug, FileText, ListOrdered, PanelLeft, Trash2 } from 'lucide-react';

import { AppIconButton, AppToolbar, ToolbarActionGroup } from '../../shared/ui';

export type WorkspaceRightPanelId = 'review-queue' | 'dev';

interface WorkspaceTopToolbarProps {
  isTrashViewOpen: boolean;
  activeRightPanelId: WorkspaceRightPanelId;
  isRightSidebarCollapsed: boolean;
  onOpenNotesView: () => void;
  onOpenTrashView: () => void;
  onSelectRightPanel: (panelId: WorkspaceRightPanelId) => void;
  onToggleListVisibility: () => void;
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
    <AppToolbar aria-label="Workspace top toolbar" className="min-h-[40px] border-b border-border bg-[#f6f6f6] px-3">
      <ToolbarActionGroup ariaLabel="Workspace primary navigation actions">
        <AppIconButton
          className="size-8 text-foreground/70 hover:bg-foreground/[0.04] hover:text-foreground"
          icon={<PanelLeft aria-hidden="true" size={16} strokeWidth={1.75} />}
          label="Toggle node list"
          onClick={onToggleListVisibility}
        />
        <AppIconButton
          className="size-8 text-foreground/70 hover:bg-foreground/[0.04] hover:text-foreground data-[active=true]:bg-foreground/[0.06] data-[active=true]:text-foreground"
          data-active={!isTrashViewOpen}
          icon={<FileText aria-hidden="true" size={16} strokeWidth={1.75} />}
          label="Open notes view"
          onClick={onOpenNotesView}
        />
        <AppIconButton
          className="size-8 text-foreground/70 hover:bg-foreground/[0.04] hover:text-foreground data-[active=true]:bg-foreground/[0.06] data-[active=true]:text-foreground"
          data-active={isTrashViewOpen}
          icon={<Trash2 aria-hidden="true" size={16} strokeWidth={1.75} />}
          label="Open trash view"
          onClick={onOpenTrashView}
        />
      </ToolbarActionGroup>
      <div className="flex-1" />
      <ToolbarActionGroup ariaLabel="Workspace inspector actions">
        <AppIconButton
          aria-pressed={!isRightSidebarCollapsed && activeRightPanelId === 'review-queue'}
          className="size-8 text-foreground/70 hover:bg-foreground/[0.04] hover:text-foreground data-[active=true]:bg-foreground/[0.06] data-[active=true]:text-foreground"
          data-active={!isRightSidebarCollapsed && activeRightPanelId === 'review-queue'}
          icon={<ListOrdered aria-hidden="true" size={16} strokeWidth={1.75} />}
          label="Review queue panel"
          onClick={() => onSelectRightPanel('review-queue')}
        />
        <AppIconButton
          aria-pressed={!isRightSidebarCollapsed && activeRightPanelId === 'dev'}
          className="size-8 text-foreground/70 hover:bg-foreground/[0.04] hover:text-foreground data-[active=true]:bg-foreground/[0.06] data-[active=true]:text-foreground"
          data-active={!isRightSidebarCollapsed && activeRightPanelId === 'dev'}
          icon={<Bug aria-hidden="true" size={16} strokeWidth={1.75} />}
          label="Dev panel"
          onClick={() => onSelectRightPanel('dev')}
        />
      </ToolbarActionGroup>
    </AppToolbar>
  );
}
