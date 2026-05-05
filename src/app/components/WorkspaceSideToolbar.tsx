import { AppIconButton, AppToolbar } from '../../shared/ui';

interface WorkspaceSideToolbarProps {
  canStartStudyMode: boolean;
  isStudyMode: boolean;
  isTrashViewOpen: boolean;
  onOpenNotesView: () => void;
  onOpenTrashView: () => void;
  onStartStudyMode: () => void;
}

export function WorkspaceSideToolbar({
  canStartStudyMode,
  isStudyMode,
  isTrashViewOpen,
  onOpenNotesView,
  onOpenTrashView,
  onStartStudyMode
}: WorkspaceSideToolbarProps) {
  return (
    <AppToolbar
      aria-label="Workspace side toolbar"
      className="flex w-[50px] flex-col items-center gap-2 border-r border-border bg-bg-subtle px-1 py-2"
    >
      <AppIconButton
        className="size-7 text-foreground/70 hover:bg-foreground/[0.04] hover:text-foreground data-[active=true]:bg-foreground/[0.06] data-[active=true]:text-foreground"
        data-active={!isTrashViewOpen}
        icon={<NotesIcon />}
        label="Notes"
        onClick={onOpenNotesView}
      />
      <AppIconButton
        className="size-7 text-foreground/70 hover:bg-foreground/[0.04] hover:text-foreground data-[active=true]:bg-foreground/[0.06] data-[active=true]:text-foreground"
        data-active={isTrashViewOpen}
        icon={<TrashIcon />}
        label="Trash"
        onClick={onOpenTrashView}
      />
      <span aria-hidden="true" className="my-1 h-px w-6 bg-border" />
      <AppIconButton
        className="size-7 text-foreground/70 hover:bg-foreground/[0.04] hover:text-foreground data-[active=true]:bg-foreground/[0.06] data-[active=true]:text-foreground"
        data-active={isStudyMode}
        disabled={!canStartStudyMode || isStudyMode}
        icon={<StudyIcon />}
        label="Study"
        onClick={onStartStudyMode}
      />
    </AppToolbar>
  );
}

function NotesIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 16 16">
      <path d="M3 2.5h10v11H3z" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path d="M5 5h6M5 8h6M5 11h4" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.2" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 16 16">
      <path d="M3.5 4.5h9" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.2" />
      <path d="M6 2.8h4" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.2" />
      <path d="M5 4.5v8h6v-8" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path d="M7 6.5v4M9 6.5v4" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.2" />
    </svg>
  );
}

function StudyIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 16 16">
      <path d="M2.5 5.2 8 2.5l5.5 2.7L8 7.9z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.2" />
      <path d="M4.8 6.6v2.7c0 .9 1.5 1.9 3.2 1.9s3.2-1 3.2-1.9V6.6" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.2" />
    </svg>
  );
}
