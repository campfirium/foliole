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
      <div className="flex items-center gap-1">
        <AppIconButton
          className="size-8 text-foreground/70 hover:bg-foreground/[0.04] hover:text-foreground"
          icon={<ToggleSidebarIcon />}
          label="Toggle left panel"
          onClick={onToggleListVisibility}
        />
        <AppIconButton
          className="size-8 text-foreground/70 hover:bg-foreground/[0.04] hover:text-foreground data-[active=true]:bg-foreground/[0.06] data-[active=true]:text-foreground"
          data-active={!isTrashViewOpen}
          icon={<NotesIcon />}
          label="Notes"
          onClick={onOpenNotesView}
        />
        <AppIconButton
          className="size-8 text-foreground/70 hover:bg-foreground/[0.04] hover:text-foreground data-[active=true]:bg-foreground/[0.06] data-[active=true]:text-foreground"
          data-active={isTrashViewOpen}
          icon={<TrashIcon />}
          label="Trash"
          onClick={onOpenTrashView}
        />
      </div>
      <div className="flex-1" />
    </AppToolbar>
  );
}

function ToggleSidebarIcon() {
  return (
    <svg aria-hidden="true" className="h-[18px] w-[18px]" viewBox="0 0 16 16">
      <path d="M2.5 3h11v10h-11z" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path d="M5.2 3v10" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path d="M3.9 8h1.6" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.2" />
    </svg>
  );
}

function NotesIcon() {
  return (
    <svg aria-hidden="true" className="h-[18px] w-[18px]" viewBox="0 0 16 16">
      <path d="M3 2.5h10v11H3z" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path d="M5 5h6M5 8h6M5 11h4" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.2" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg aria-hidden="true" className="h-[18px] w-[18px]" viewBox="0 0 16 16">
      <path d="M3.5 4.5h9" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.2" />
      <path d="M6 2.8h4" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.2" />
      <path d="M5 4.5v8h6v-8" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path d="M7 6.5v4M9 6.5v4" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.2" />
    </svg>
  );
}
