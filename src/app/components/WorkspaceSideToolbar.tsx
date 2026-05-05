import { AppIconButton, AppToolbar } from '../../shared/ui';

interface WorkspaceSideToolbarProps {
  canStartStudyMode: boolean;
  isStudyMode: boolean;
  onStartStudyMode: () => void;
}

export function WorkspaceSideToolbar({
  canStartStudyMode,
  isStudyMode,
  onStartStudyMode
}: WorkspaceSideToolbarProps) {
  return (
    <AppToolbar
      aria-label="Workspace side toolbar"
      className="flex h-full w-[40px] flex-col items-center gap-2 border-r border-[#d9d9d6] bg-[#f6f6f6] px-1 py-2"
    >
      <AppIconButton
        className="size-8 text-foreground/70 hover:bg-foreground/[0.04] hover:text-foreground data-[active=true]:bg-foreground/[0.06] data-[active=true]:text-foreground"
        data-active={isStudyMode}
        disabled={!canStartStudyMode || isStudyMode}
        icon={<StudyIcon />}
        label="Study"
        onClick={onStartStudyMode}
      />
    </AppToolbar>
  );
}

function StudyIcon() {
  return (
    <svg aria-hidden="true" className="h-[18px] w-[18px]" viewBox="0 0 16 16">
      <path d="M2.5 5.2 8 2.5l5.5 2.7L8 7.9z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.2" />
      <path d="M4.8 6.6v2.7c0 .9 1.5 1.9 3.2 1.9s3.2-1 3.2-1.9V6.6" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.2" />
    </svg>
  );
}
