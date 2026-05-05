import { Bug, FileText, PanelLeft, Trash2 } from 'lucide-react';

import { AppIconButton, AppToolbar } from '../../shared/ui';

export type WorkspaceRightPanelId = 'dev';

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
      <div className="flex items-center gap-1.5">
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
      </div>
      <div className="flex-1" />
      <div className="flex items-center gap-1.5">
        <AppIconButton
          aria-pressed={!isRightSidebarCollapsed && activeRightPanelId === 'dev'}
          className="size-8 text-foreground/70 hover:bg-foreground/[0.04] hover:text-foreground data-[active=true]:bg-foreground/[0.06] data-[active=true]:text-foreground"
          data-active={!isRightSidebarCollapsed && activeRightPanelId === 'dev'}
          icon={<Bug aria-hidden="true" size={16} strokeWidth={1.75} />}
          label="Dev panel"
          onClick={() => onSelectRightPanel('dev')}
        />
      </div>
    </AppToolbar>
  );
}
