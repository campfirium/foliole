import { AppIconButton, AppToolbar } from '../../shared/ui';

interface WorkspaceSideToolbarProps {
  canStartStudyMode: boolean;
  isStudyMode: boolean;
  isSettingsOpen: boolean;
  onOpenSettings: () => void;
  onStartStudyMode: () => void;
}

export function WorkspaceSideToolbar({
  canStartStudyMode,
  isStudyMode,
  isSettingsOpen,
  onOpenSettings,
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
      <div className="flex-1" />
      <AppIconButton
        className="size-8 text-foreground/70 hover:bg-foreground/[0.04] hover:text-foreground data-[active=true]:bg-foreground/[0.06] data-[active=true]:text-foreground"
        data-active={isSettingsOpen}
        icon={<SettingsIcon />}
        label="Settings"
        onClick={onOpenSettings}
      />
    </AppToolbar>
  );
}

function StudyIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 16 16">
      <path d="M2.5 5.2 8 2.5l5.5 2.7L8 7.9z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.05" />
      <path d="M4.8 6.6v2.7c0 .9 1.5 1.9 3.2 1.9s3.2-1 3.2-1.9V6.6" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.05" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 16 16">
      <path
        d="M8 2.3 9 2.6l.4 1.2c.3.1.6.2.9.4l1.2-.5.7.8-.6 1.1c.2.3.3.6.4.9l1.2.4v1.1l-1.2.4c-.1.3-.2.6-.4.9l.6 1.1-.7.8-1.2-.5c-.3.2-.6.3-.9.4L9 13.4l-1 .3-1-.3-.4-1.2a3 3 0 0 1-.9-.4l-1.2.5-.7-.8.6-1.1a3 3 0 0 1-.4-.9L2.8 8V6.9l1.2-.4c.1-.3.2-.6.4-.9l-.6-1.1.7-.8 1.2.5c.3-.2.6-.3.9-.4L7 2.6z"
        fill="none"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.05"
      />
      <circle cx="8" cy="8" fill="none" r="2.2" stroke="currentColor" strokeWidth="1.05" />
    </svg>
  );
}
