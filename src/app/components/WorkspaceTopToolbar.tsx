import { FileText, PanelLeft, Trash2 } from 'lucide-react';

import { AppIconButton, AppToolbar } from '../../shared/ui';

interface WorkspaceTopToolbarProps {
  isTrashViewOpen: boolean;
  onOpenNotesView: () => void;
  onOpenTrashView: () => void;
  onToggleListVisibility: () => void;
}

export function WorkspaceTopToolbar({
  isTrashViewOpen,
  onOpenNotesView,
  onOpenTrashView,
  onToggleListVisibility
}: WorkspaceTopToolbarProps) {
  return (
    <AppToolbar aria-label="Workspace top toolbar" className="min-h-[40px] border-b border-border bg-[#f6f6f6] px-3">
      <div className="flex items-center gap-1.5">
        <AppIconButton
          className="size-8 text-foreground/70 hover:bg-foreground/[0.04] hover:text-foreground"
          icon={<PanelLeft aria-hidden="true" size={16} strokeWidth={1.75} />}
          label="Toggle left panel"
          onClick={onToggleListVisibility}
        />
        <AppIconButton
          className="size-8 text-foreground/70 hover:bg-foreground/[0.04] hover:text-foreground data-[active=true]:bg-foreground/[0.06] data-[active=true]:text-foreground"
          data-active={!isTrashViewOpen}
          icon={<FileText aria-hidden="true" size={16} strokeWidth={1.75} />}
          label="Notes"
          onClick={onOpenNotesView}
        />
        <AppIconButton
          className="size-8 text-foreground/70 hover:bg-foreground/[0.04] hover:text-foreground data-[active=true]:bg-foreground/[0.06] data-[active=true]:text-foreground"
          data-active={isTrashViewOpen}
          icon={<Trash2 aria-hidden="true" size={16} strokeWidth={1.75} />}
          label="Trash"
          onClick={onOpenTrashView}
        />
      </div>
      <div className="flex-1" />
    </AppToolbar>
  );
}
